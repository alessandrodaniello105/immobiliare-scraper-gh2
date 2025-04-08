// scraper-backend/server.js
const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');
const url = require('url'); // To handle potential relative URLs

const app = express();
const PORT = process.env.PORT || 3001;

// --- Configuration ---
const VENDOR_URL = "https://www.immobiliare.it/agenzie-immobiliari/12328/nicoletta-zaggia-padova/";
const TARGET_TAG = "li";
const TARGET_CLASS = "nd-list__item";
const LINK_TAG_SELECTOR = "a.in-listingCardTitle";
const PRICE_SELECTOR = "div.in-listingCardPrice span, div.in-listingCardPrice";

const HEADERS = { /* ... keep your existing headers ... */
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'same-origin', // Important for detail pages if referred from main
    'Sec-Fetch-User': '?1',
    // 'Referer': VENDOR_URL, // Often needed when navigating from listing to detail
};
const REQUEST_TIMEOUT = 25000; // Increased timeout slightly
// --- End Configuration ---

app.use(cors({ origin: 'http://localhost:3000' })); // Adjust if your React app runs elsewhere

// --- Endpoint 1: Scrape Vendor Page for Links ---
app.get('/api/scrape', async (req, res) => {
    console.log(`Received request to scrape: ${VENDOR_URL}`);
    try {
        const response = await axios.get(VENDOR_URL, {
             headers: HEADERS,
             timeout: 20000
        });
        console.log(`Fetch successful (Status: ${response.status})`);
        const htmlContent = response.data;

        const $ = cheerio.load(htmlContent);
        const extractedListings = [];
        const baseUrl = new url.URL(VENDOR_URL).origin;

        // Log the HTML structure of the first listing
        const firstListing = $(`${TARGET_TAG}.${TARGET_CLASS.split(' ').join('.')}`).first();
        console.log('First listing HTML:', firstListing.html());
        console.log('Price element HTML:', firstListing.find(PRICE_SELECTOR).html());

        $(`${TARGET_TAG}.${TARGET_CLASS.split(' ').join('.')}`).each((i, element) => {
            const linkTag = $(element).find(LINK_TAG_SELECTOR);
            const priceTag = $(element).find(PRICE_SELECTOR);
            
            if (linkTag.length > 0) {
                const href = linkTag.attr('href');
                const priceText = priceTag.text().trim();
                
                console.log(`Listing ${i + 1}:`);
                console.log('- URL:', href);
                console.log('- Price text:', priceText);
                console.log('- Price HTML:', priceTag.html());
                
                if (href && href.includes("immobiliare.it/annunci/")) {
                    let absoluteLink = href;
                    if (href.startsWith('/')) {
                        absoluteLink = baseUrl + href;
                    }
                    
                    extractedListings.push({
                        url: absoluteLink,
                        price: priceText
                    });
                }
            }
        });

        console.log(`Found ${extractedListings.length} valid listings.`);
        res.json({ listings: extractedListings });

    } catch (error) {
        console.error("Error during scraping:", error.message);
        if (error.response) {
            console.error("Status Code:", error.response.status);
            console.error("Response Headers:", error.response.headers);
            res.status(error.response.status || 500).json({
                message: `Failed to fetch or parse the page. Status: ${error.response.status}`,
                error: error.message
            });
        } else if (error.request) {
            console.error("No response received:", error.request);
            res.status(504).json({ message: "No response received from target server.", error: error.message });
        } else {
            res.status(500).json({ message: "An internal server error occurred.", error: error.message });
        }
    }
});

// --- Endpoint 2: Scrape Property Detail Page ---
app.get('/api/scrape-details', async (req, res) => {
    const propertyUrl = req.query.url; // Get URL from query parameter

    if (!propertyUrl || !propertyUrl.startsWith('https://www.immobiliare.it/annunci/')) {
        return res.status(400).json({ message: "Valid 'url' query parameter starting with 'https://www.immobiliare.it/annunci/' is required." });
    }

    console.log(`Received request to scrape details: ${propertyUrl}`);

    try {
        // ***** ADD DELAY *****
        const delayMs = Math.floor(Math.random() * 1500) + 1000; // Random delay between 1 and 2.5 seconds
        console.log(`Waiting for ${delayMs}ms before fetching detail page...`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
        // *********************
        
        
        console.log("Attempting to fetch detail page...");
         // Add Referer header for detail page requests
        const detailHeaders = { ...HEADERS,};
        delete detailHeaders.Referer
        detailHeaders['Sec-Fetch-Site'] = 'same-origin';
        const response = await axios.get(propertyUrl, {
             headers: detailHeaders,
             timeout: REQUEST_TIMEOUT
            });
        console.log(`Detail fetch successful (Status: ${response.status})`);
        const htmlContent = response.data;
        const $ = cheerio.load(htmlContent);

        const details = {};

        // --- Scrape Specific Details ---

        // Price (More robust selector if possible)
        details.price = $('[data-testid="price-value"]').first().text().trim() ||
                        $('.in-price__value').first().text().trim() || // Fallback 1
                        $('.im-priceDetail__price').first().text().trim() || // Fallback 2
                        'N/A'; // Default

        // Address (More robust selector if possible)
        details.address = $('[data-testid="address"]').first().text().trim() ||
                          $('.in-location span').first().text().trim() || // Fallback (might need adjustment)
                          'N/A';

        // Description (Child div of in-readAll) - Handle potential structure variations
        let descriptionContainer = $('.in-readAll');
        if (descriptionContainer.length > 0) {
             // Try direct child div first, then look deeper if needed
             let descElement = descriptionContainer.children('div').first();
             if (!descElement.text().trim()) {
                 descElement = descriptionContainer.find('div[class*="description"]').first(); // Look for div with 'description' in class
             }
             details.description = descElement.text().trim() || 'N/A';
         } else {
             // Fallback if in-readAll isn't found (maybe a different structure)
             details.description = $('[data-testid="description"]').text().trim() || 'N/A';
         }

        // Caratteristiche (Key-Value Pairs)
        details.features = [];
        // Try the modern structure first (often within [data-testid="features"])
        $('[data-testid="features"] dl.im-features__list, dl.in-features__list, dl.nd-list--features').children().each((i, el) => {
            const $el = $(el);
            if (el.tagName === 'dt') {
                const key = $el.text().trim();
                // Find the *immediately* following 'dd'
                const valueElement = $el.next('dd');
                const value = valueElement.text().trim();
                if (key && value) {
                    details.features.push({ key, value });
                }
            }
        });

        // Fallback for older/different structures if the above yields nothing
        if (details.features.length === 0) {
             $('dt.ld-featuresItem__title').each((i, dtElement) => {
                 const key = $(dtElement).text().trim();
                 const value = $(dtElement).next('dd.ld-featuresItem__description').text().trim();
                 if (key && value) {
                     details.features.push({ key, value });
                 }
             });
        }


        // Altre Caratteristiche (Badges)
        details.otherFeatures = [];
         // Try modern structure first
         $('[data-testid="features-others"] .im-features__tag').each((i, el) => {
            details.otherFeatures.push($(el).text().trim());
         });
         // Fallback
         if (details.otherFeatures.length === 0) {
            $('li.ld-featuresBadges__badge span').each((i, el) => {
                details.otherFeatures.push($(el).text().trim());
            });
         }

        // Surface Info (Often part of features, let's ensure it's extracted)
        // Check if already in features, otherwise try specific selectors
        details.surface = details.features.find(f => f.key.toLowerCase().includes('superficie'))?.value || 'N/A';
        if (details.surface === 'N/A') {
             // Try a specific data-testid or class if surface wasn't in the main list
             details.surface = $('[data-testid="surface-value"]').text().trim() ||
                               $('.ld-surfaceElement').text().trim() || // Older class
                               'N/A';
        }

        // Dettaglio dei Costi (Key-Value Pairs)
        details.costs = [];
        // Find the heading first, then the list
        $('h2:contains("Costi"), h2:contains("Spese")').first().next('dl').children().each((i, el) => {
             const $el = $(el);
             if (el.tagName === 'dt') {
                 const key = $el.text().trim();
                 const value = $el.next('dd').text().trim();
                 if (key && value) {
                    details.costs.push({ key, value });
                 }
             }
         });
        // Fallback if heading approach fails
        if (details.costs.length === 0) {
             $('dl.in-detailFeatures').children().each((i, el) => { // Example class, adjust if needed
                  const $el = $(el);
                  if (el.tagName === 'dt') {
                      const key = $el.text().trim();
                      const value = $el.next('dd').text().trim();
                      if (key && value) {
                         details.costs.push({ key, value });
                      }
                  }
              });
        }


        console.log(`Extracted details for ${propertyUrl}`);
        res.json(details); // Send all collected details

    } catch (error) {
        console.error(`Error scraping details for ${propertyUrl}:`, error.message);
        if (error.response) {
            console.error("Status Code:", error.response.status);
             res.status(error.response.status || 500).json({
                 message: `Failed to fetch or parse detail page. Status: ${error.response.status}`,
                 error: error.message,
                 url: propertyUrl
             });
        } else if (error.request) {
             console.error("No response received");
             res.status(504).json({ message: "No response received from target server.", error: error.message, url: propertyUrl });
        } else {
            res.status(500).json({ message: "An internal server error occurred while scraping details.", error: error.message, url: propertyUrl });
        }
    }
});


app.listen(PORT, () => {
    console.log(`Scraper backend listening on http://localhost:${PORT}`);
});