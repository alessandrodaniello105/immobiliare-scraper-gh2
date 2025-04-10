// scraper-backend/server.js
const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');
const url = require('url');
const Datastore = require('nedb');

const app = express();
const PORT = process.env.PORT || 3001;

// --- Database Setup ---
const db = new Datastore({ filename: './listings.db', autoload: true });
db.persistence.compactDatafile();

// --- Configuration ---
const VENDOR_URL = "https://www.immobiliare.it/agenzie-immobiliari/12328/nicoletta-zaggia-padova/";
const TARGET_TAG = "li";
const TARGET_CLASS = "nd-list__item";
const LINK_TAG_SELECTOR = "a.in-listingCardTitle";
const PRICE_SELECTOR = "div.in-listingCardPrice span, div.in-listingCardPrice";

// Define multiple User-Agents
const USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/119.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:109.0) Gecko/20100101 Firefox/119.0',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36 Edg/119.0.0.0'
];

// Base Headers (Using minimal set that worked)
const BASE_HEADERS = {
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.5',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1',
    'Cache-Control': 'max-age=0',
};
// --- End Configuration ---

// --- Helper Functions ---
const parsePrice = (priceStr) => {
    if (!priceStr) return 0;
    const cleanPrice = priceStr.replace(/[^\d.]/g, '');
    const parts = cleanPrice.split('.');
    let finalPrice = '';
    if (parts.length > 1) {
        finalPrice = parts.join('');
    } else {
        finalPrice = cleanPrice;
    }
    const parsedPrice = parseInt(finalPrice, 10);
    return isNaN(parsedPrice) ? 0 : parsedPrice;
};
const getRandomUserAgent = () => {
    return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
};
// --- End Helper Functions ---

app.use(cors({ origin: 'http://localhost:3000' }));
app.use(express.json());

// --- API Endpoints ---

// Endpoint to GET all currently stored listings
app.get('/api/listings', (req, res) => {
    db.find({}, (err, docs) => {
        if (err) {
            console.error("Error fetching listings from DB:", err);
            return res.status(500).json({ message: "Error fetching listings from database.", error: err.message });
        }
        res.json({ listings: docs });
    });
});

// Endpoint to SCRAPE listings page, COMPARE, SAVE, and RETURN NEW listings
app.post('/api/scrape', async (req, res) => {
    const minPrice = req.body.minPrice ? parsePrice(req.body.minPrice) : 0;
    console.log(`Received scrape request. Min Price: ${minPrice}`);

    try {
        // 1. Fetch the HTML - Use MINIMAL headers
        const minimalScrapeHeaders = {
            ...BASE_HEADERS,
            'User-Agent': getRandomUserAgent(),
        };
        console.log("Using MINIMAL headers for scrape:", minimalScrapeHeaders);

        const response = await axios.get(VENDOR_URL, {
            headers: minimalScrapeHeaders,
            timeout: 20000
        });
        const htmlContent = response.data;
        const $ = cheerio.load(htmlContent);
        const baseUrl = new url.URL(VENDOR_URL).origin;

        // 2. Scrape current listings
        let scrapedListings = [];
        $(`${TARGET_TAG}.${TARGET_CLASS.split(' ').join('.')}`).each((i, element) => {
            const linkTag = $(element).find(LINK_TAG_SELECTOR);
            const priceTag = $(element).find(PRICE_SELECTOR);
            if (linkTag.length > 0) {
                const href = linkTag.attr('href');
                const priceText = priceTag.text().trim();
                if (href && href.includes("immobiliare.it/annunci/")) {
                    let absoluteLink = href.startsWith('/') ? baseUrl + href : href;
                    scrapedListings.push({ url: absoluteLink, price: priceText });
                }
            }
        });
        console.log(`Scraped ${scrapedListings.length} listings from website.`);

        // 3. Filter scraped listings if minPrice is provided
        const listingsToSave = minPrice > 0
            ? scrapedListings.filter(l => parsePrice(l.price) >= minPrice)
            : scrapedListings;
        console.log(`${listingsToSave.length} listings after price filter (if any).`);

        // 4. Get previous listings from DB
        db.find({}, (err, previousListingsDocs) => {
            if (err) {
                console.error("Error fetching previous listings from DB:", err);
                return res.status(500).json({ message: "Error accessing database.", error: err.message });
            }
            const previousListingUrls = new Set(previousListingsDocs.map(doc => doc.url));
            console.log(`Found ${previousListingUrls.size} listings in DB.`);

            // 5. Find new listings
            const newListings = listingsToSave.filter(l => !previousListingUrls.has(l.url));
            console.log(`Found ${newListings.length} new listings.`);

            // 6. Update the database
            db.remove({}, { multi: true }, (err, numRemoved) => {
                if (err) {
                    console.error("Error removing old listings from DB:", err);
                    return res.status(500).json({ message: "Error updating database.", error: err.message });
                }
                console.log(`Removed ${numRemoved} old listings from DB.`);
                if (listingsToSave.length > 0) {
                    db.insert(listingsToSave, (err, newDocs) => {
                        if (err) {
                            console.error("Error inserting new listings into DB:", err);
                            return res.status(500).json({ message: "Error saving new listings.", error: err.message });
                        }
                        console.log(`Inserted ${newDocs.length} current listings into DB.`);
                        // 7. Return NEW listings
                        res.json({ newListings: newListings });
                    });
                } else {
                    console.log("No listings to insert into DB.");
                    res.json({ newListings: [] });
                }
            });
        });
    } catch (error) {
       console.error("Error during scraping process:", error.message);
        let status = 500;
        let message = "An internal server error occurred.";
        if (error.response) {
            status = error.response.status || 500;
            message = `Failed to fetch or parse the page. Status: ${status}`;
        } else if (error.request) {
            status = 504;
            message = "No response received from target server.";
        }
        res.status(status).json({ message: message, error: error.message });
    }
});

// --- Endpoint 2: Scrape Property Detail Page (Using OLD logic but with fixes) ---
app.get('/api/details', async (req, res) => {
    const propertyUrl = req.query.url;

    if (!propertyUrl || !propertyUrl.startsWith('https://www.immobiliare.it/annunci/')) {
        return res.status(400).json({ message: "Valid 'url' query parameter starting with 'https://www.immobiliare.it/annunci/' is required." });
    }
    console.log(`Received request to scrape details: ${propertyUrl}`);

    try {
        // Use MINIMAL headers for details request as well
        const minimalDetailHeaders = {
            ...BASE_HEADERS,
            'User-Agent': getRandomUserAgent(),
        };
        console.log("Using MINIMAL headers for details:", minimalDetailHeaders);

        const response = await axios.get(propertyUrl, {
             headers: minimalDetailHeaders, // Use minimal headers
             timeout: 25000 // Keep slightly longer timeout
            });
        console.log(`Detail fetch successful (Status: ${response.status})`);
        const htmlContent = response.data;
        const $ = cheerio.load(htmlContent);

        const details = {};

        // --- Scrape Specific Details (Using the selectors from the OLD version) ---
        details.price = $('[data-testid="price-value"]').first().text().trim() ||
                        $('.in-price__value').first().text().trim() ||
                        $('.im-priceDetail__price').first().text().trim() ||
                        'N/A';
        details.address = $('[data-testid="address"]').first().text().trim() ||
                          $('.in-location span').first().text().trim() ||
                          'N/A';
        let descriptionContainer = $('.in-readAll');
        if (descriptionContainer.length > 0) {
             let descElement = descriptionContainer.children('div').first();
             if (!descElement.text().trim()) {
                 descElement = descriptionContainer.find('div[class*="description"]').first();
             }
             details.description = descElement.text().trim() || 'N/A';
         } else {
             details.description = $('[data-testid="description"]').text().trim() || 'N/A';
         }
        details.features = [];
        $('[data-testid="features"] dl.im-features__list, dl.in-features__list, dl.nd-list--features').children().each((i, el) => {
            const $el = $(el);
            if (el.tagName === 'dt') {
                const key = $el.text().trim();
                const valueElement = $el.next('dd');
                const value = valueElement.text().trim();
                if (key && value) {
                    details.features.push({ key, value });
                }
            }
        });
        if (details.features.length === 0) {
             $('dt.ld-featuresItem__title').each((i, dtElement) => {
                 const key = $(dtElement).text().trim();
                 const value = $(dtElement).next('dd.ld-featuresItem__description').text().trim();
                 if (key && value) {
                     details.features.push({ key, value });
                 }
             });
        }
        details.otherFeatures = [];
         $('[data-testid="features-others"] .im-features__tag').each((i, el) => {
            details.otherFeatures.push($(el).text().trim());
         });
         if (details.otherFeatures.length === 0) {
            $('li.ld-featuresBadges__badge span').each((i, el) => {
                details.otherFeatures.push($(el).text().trim());
            });
         }
        details.surface = details.features.find(f => f.key.toLowerCase().includes('superficie'))?.value || 'N/A';
        if (details.surface === 'N/A') {
             details.surface = $('[data-testid="surface-value"]').text().trim() ||
                               $('.ld-surfaceElement').text().trim() ||
                               'N/A';
        }
        details.costs = [];
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
        if (details.costs.length === 0) {
             $('dl.in-detailFeatures').children().each((i, el) => {
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
        // --- End Scrape Specific Details ---

        console.log(`Extracted details for ${propertyUrl}`);
        res.json(details); // Send the original details object

    } catch (error) {
        console.error(`Error scraping details for ${propertyUrl}:`, error.message);
        let status = 500;
        let message = "An internal server error occurred while scraping details.";
        if (error.response) {
            status = error.response.status || 500;
            message = `Failed to fetch or parse detail page. Status: ${status}`;
        } else if (error.request) {
            status = 504;
            message = "No response received from target server.";
        }
        res.status(status).json({ message: message, error: error.message, url: propertyUrl });
    }
});

// Endpoint to DELETE all listings
app.delete('/api/listings', (req, res) => {
    console.log("Received request to DELETE all listings.");
    db.remove({}, { multi: true }, (err, numRemoved) => {
        if (err) {
            console.error("Error removing listings from DB:", err);
            return res.status(500).json({ message: "Error clearing database.", error: err.message });
        }
        console.log(`Deleted ${numRemoved} listings from DB.`);
        db.persistence.compactDatafile();
        res.status(200).json({ message: `Successfully deleted ${numRemoved} listings.` });
    });
});

app.listen(PORT, () => {
    console.log(`Scraper backend listening on http://localhost:${PORT}`);
    console.log(`Database file: ./listings.db`); // Log DB file location
});