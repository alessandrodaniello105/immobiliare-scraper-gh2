// scraper-backend/server.js
const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');
const url = require('url'); // To handle potential relative URLs
const Datastore = require('nedb'); // Require nedb

const app = express();
const PORT = process.env.PORT || 3001;

// --- Database Setup ---
const db = new Datastore({ filename: './listings.db', autoload: true });
// Optional: Compact the database file on startup to remove old data
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

// Base Headers (User-Agent will be added per request)
const BASE_HEADERS = {
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
    'Accept-Language': 'en-US,en;q=0.9,it;q=0.8', // Added Italian
    'Accept-Encoding': 'gzip, deflate, br',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1',
    'Cache-Control': 'max-age=0',
};
// --- End Configuration ---

app.use(cors({ origin: 'http://localhost:3000' })); // Adjust if your React app runs elsewhere
app.use(express.json()); // Needed to parse JSON body for minPrice

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

// Function to get random User-Agent
const getRandomUserAgent = () => {
    return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
};
// --- End Helper Functions ---

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
        // 1. Fetch the HTML - Try a MINIMAL set of headers
        const minimalScrapeHeaders = {
            'User-Agent': getRandomUserAgent(), // Keep randomized UA
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
            'Cache-Control': 'max-age=0',
        };
        console.log("Using MINIMAL headers for scrape:", minimalScrapeHeaders);

        const response = await axios.get(VENDOR_URL, {
            headers: minimalScrapeHeaders, // Use the minimal headers
            timeout: 20000
        });
        const htmlContent = response.data;
        const $ = cheerio.load(htmlContent);
        const baseUrl = new url.URL(VENDOR_URL).origin;

        // 2. Scrape current listings from the website
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

            // 5. Find new listings (present in listingsToSave but not in DB)
            const newListings = listingsToSave.filter(l => !previousListingUrls.has(l.url));
            console.log(`Found ${newListings.length} new listings.`);

            // 6. Update the database: Remove old, insert current (filtered) listings
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
                        // 7. Return only the NEW listings found in this scan
                        res.json({ newListings: newListings });
                    });
                } else {
                     // If no listings to save (e.g., all filtered out), just return empty new listings
                    console.log("No listings to insert into DB.");
                    res.json({ newListings: [] });
                }
            });
        });

    } catch (error) {
        console.error("Error during scraping process:", error.message);
        // Consolidated error handling
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

// Endpoint to GET details for a specific property URL
app.get('/api/details', async (req, res) => {
    const propertyUrl = req.query.url;
    if (!propertyUrl) {
        return res.status(400).json({ message: "Property URL is required." });
    }
    console.log(`Fetching details for: ${propertyUrl}`);

    try {
        // Use the SAME minimal headers that worked for /api/scrape
        const minimalDetailHeaders = {
            'User-Agent': getRandomUserAgent(), // Keep randomized UA
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
            'Cache-Control': 'max-age=0',
        };
        console.log("Using MINIMAL headers for details:", minimalDetailHeaders);

        const response = await axios.get(propertyUrl, {
            headers: minimalDetailHeaders, // Use minimal headers
            timeout: 25000
        });

        const htmlContent = response.data;
        const $ = cheerio.load(htmlContent);

        // --- Keep the Selector Definitions and Extraction Logic --- 
        // (As they haven't been tested yet due to the 403)
        const selectors = {
            price: '.ld-overview__price, .in-listingCardPrice',
            address: '.ld-title__title',
            surfaceDt: 'dl.im-features__list dt:contains("superficie"), dl.in-features__list dt:contains("superficie"), dt.ld-featuresItem__title:contains("superficie")',
            descriptionContainer: '.im-description__text, .in-readAll, [data-testid="description"]',
            mainFeaturesDl: 'dl.im-features__list, dl.in-features__list, dl.nd-list--features, dl.ld-featuresList',
            otherFeaturesContainer: '.im-features__list--other, .in-realEstateFeatures__list--other, ul.ld-featuresBadges, [data-testid="features-others"]',
            otherFeaturesItems: '.im-features__tag, li.ld-featuresBadges__badge span',
            costsHeading: 'h3:contains("Costi"), h3:contains("Spese"), h2:contains("Costi"), h2:contains("Spese")',
            costsDl: 'dl.im-costs__list, dl.in-detailFeatures'
        };
        const priceElement = $(selectors.price).first();
        const addressElement = $(selectors.address).first();
        const surfaceDtElement = $(selectors.surfaceDt).first();
        const surfaceDdElement = surfaceDtElement.next('dd, .ld-featuresItem__description');
        const descriptionElement = $(selectors.descriptionContainer).first();
        const mainFeaturesElement = $(selectors.mainFeaturesDl).first();
        const otherFeaturesContainerElement = $(selectors.otherFeaturesContainer).first();
        const costsHeadingElement = $(selectors.costsHeading).first();
        let costsElement = costsHeadingElement.next('dl');
        if (costsElement.length === 0) {
            costsElement = $(selectors.costsDl).first();
        }

        // --- Keep Debug Logging Active --- 
        console.log("--- Detail Scraping Debug --- ");
        console.log(`Price Element Found: ${priceElement.length > 0}, Text: ${priceElement.text().trim()}`);
        console.log(`Address Element Found: ${addressElement.length > 0}, Text: ${addressElement.text().trim()}`);
        console.log(`Surface DT Found: ${surfaceDtElement.length > 0}, DD Found: ${surfaceDdElement.length > 0}, Value: ${surfaceDdElement.text().trim()}`);
        console.log(`Description Container Found: ${descriptionElement.length > 0}, Text Length: ${descriptionElement.text().trim().length}`);
        console.log(`Main Features DL Found: ${mainFeaturesElement.length > 0}, Children DT Count: ${mainFeaturesElement.children('dt, .ld-featuresItem__title').length}`);
        let otherFeaturesItemsFound = otherFeaturesContainerElement.find(selectors.otherFeaturesItems);
        if (otherFeaturesItemsFound.length === 0) otherFeaturesItemsFound = otherFeaturesContainerElement.find('li');
        console.log(`Other Features Items Found: ${otherFeaturesItemsFound.length}`);
        console.log(`Costs Heading Found: ${costsHeadingElement.length > 0}`);
        console.log(`Costs DL Element Found: ${costsElement.length > 0}, Children DT Count: ${costsElement.children('dt').length}`);
        if (priceElement.length === 0 || mainFeaturesElement.length === 0) {
            console.log("\n--- MISSING KEY DETAILS - Logging Relevant HTML Snippets ---");
            const headerHtml = $('.im-detailHeader, .in-detailHeader, header section[class*="detailHeader"], div[class*="Header__container"]').first().html(); 
            console.log("\n--- Header HTML (Price/Address Area?) ---\n", headerHtml?.substring(0, 1500) || "Header Not Found");
            const featuresHtml = $('.im-mainFeatures, .nd-gridFeatures, section:contains("Caratteristiche"), div[class*="Features__container"]').first().html(); 
            console.log("\n--- Features HTML (Main/Other/Costs Area?) ---\n", featuresHtml?.substring(0, 3000) || "Features Section Not Found");
            console.log("-------------------------------------------------------\n");
        }
        console.log("----------------------------- ");

        // --- Keep Extraction Logic --- 
        const details = {
            price: priceElement.text().trim() || 'N/A',
            address: addressElement.text().trim() || 'N/A',
            surface: surfaceDdElement.text().trim() || 'N/A',
            description: descriptionElement.text().trim() || 'N/A',
            features: [],
            otherFeatures: [],
            costs: []
        };
        mainFeaturesElement.children('dt, .ld-featuresItem__title').each((i, el) => {
            const key = $(el).text().trim();
            const value = $(el).next('dd, .ld-featuresItem__description').text().trim();
            if (key && value) {
                if (key.toLowerCase() !== 'superficie') {
                   details.features.push({ key, value });
                }
            }
        });
        otherFeaturesItemsFound.each((i, el) => {
            const feature = $(el).text().trim();
            if (feature) {
                details.otherFeatures.push(feature);
            }
        });
        costsElement.children('dt').each((i, el) => {
             const key = $(el).text().trim();
             const value = $(el).next('dd').text().trim();
             if (key && value) {
                 details.costs.push({ key, value });
             }
         });
         if (details.surface === 'N/A') {
            details.surface = details.features.find(f => f.key.toLowerCase().includes('superficie'))?.value || 'N/A';
         }

        res.json(details);

    } catch (error) {
        console.error(`Error fetching details for ${propertyUrl}:`, error.message);
        let status = 500;
        let message = "An internal server error occurred while fetching details.";
        if (error.response) {
            status = error.response.status || 500;
            message = `Failed to fetch property page. Status: ${status}`;
        } else if (error.request) {
            status = 504;
            message = "No response received from the property page server.";
        }
        res.status(status).json({ message: message, error: error.message });
    }
});

// Endpoint to DELETE all listings from the database
app.delete('/api/listings', (req, res) => {
    console.log("Received request to DELETE all listings.");
    db.remove({}, { multi: true }, (err, numRemoved) => {
        if (err) {
            console.error("Error removing listings from DB:", err);
            return res.status(500).json({ message: "Error clearing database.", error: err.message });
        }
        console.log(`Deleted ${numRemoved} listings from DB.`);
        // Compact datafile after deletion to clean up the file
        db.persistence.compactDatafile();
        res.status(200).json({ message: `Successfully deleted ${numRemoved} listings.` });
    });
});

app.listen(PORT, () => {
    console.log(`Scraper backend listening on http://localhost:${PORT}`);
    console.log(`Database file: ./listings.db`);
});