// src/components/ScannerPage.js
import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom'; // Import Link for navigation
import { STORAGE_KEY, API_URL_LIST } from '../App'; // Import shared constants
// Import shared CSS or create specific ones
import '../App.css';

function ScannerPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState('Ready to scan.');
  const [displayedListings, setDisplayedListings] = useState([]);
  const [error, setError] = useState(null);
  const [minPrice, setMinPrice] = useState('');

  const handlePriceChange = (e) => {
    const value = e.target.value;
    console.log('Price input changed:', value);
    setMinPrice(value);
  };

  const parsePrice = (priceStr) => {
    if (!priceStr) {
      console.log('Empty price string received');
      return 0;
    }
    
    // Remove currency symbol and any other non-numeric characters except dots
    const cleanPrice = priceStr.replace(/[^\d.]/g, '');
    console.log(`Cleaned price string: "${cleanPrice}"`);
    
    // Handle cases where the price might be in format "1.300.000"
    const parts = cleanPrice.split('.');
    let finalPrice = '';
    
    if (parts.length > 1) {
      // If we have multiple parts, it's likely in European format
      finalPrice = parts.join('');
    } else {
      finalPrice = cleanPrice;
    }
    
    const parsedPrice = parseInt(finalPrice, 10);
    console.log(`Final parsed price: ${parsedPrice}`);
    
    if (isNaN(parsedPrice)) {
      console.log('Warning: Could not parse price to number');
      return 0;
    }
    
    return parsedPrice;
  };

  const getPreviousLinks = useCallback(() => {
    const storedListings = localStorage.getItem(STORAGE_KEY);
    try {
      if (storedListings) {
        const listings = JSON.parse(storedListings);
        // Return a Set of URLs for quick lookup
        return new Set(listings.map(l => l.url));
      }
      return new Set();
    } catch (e) {
      console.error("Failed to parse previous listings from localStorage", e);
      localStorage.removeItem(STORAGE_KEY);
      return new Set();
    }
  }, []);

  const saveCurrentLinks = (listings) => {
    try {
      // Store the full listing data instead of just URLs
      localStorage.setItem(STORAGE_KEY, JSON.stringify(listings));
    } catch (e) {
      console.error("Failed to save listings to localStorage", e);
      setError("Could not save current listings state. Comparison might be incorrect on next scan.");
    }
  };

  const handleScan = async () => {
    setIsLoading(true);
    setStatusMessage('Scanning vendor page...');
    setError(null);
    setDisplayedListings([]);

    try {
      const response = await fetch(API_URL_LIST);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || `HTTP error! Status: ${response.status}`);
      }

      const currentListings = data.listings || [];
      const previousLinks = getPreviousLinks();
      const newListings = [];
      
      const minPriceValue = minPrice ? parsePrice(minPrice) : 0;
      console.log(`Minimum price set to: ${minPriceValue}`);

      // First, filter by price if minPrice is set
      const priceFilteredListings = minPriceValue > 0
        ? currentListings.filter(listing => parsePrice(listing.price) >= minPriceValue)
        : currentListings;

      console.log(`Found ${priceFilteredListings.length} listings${minPriceValue > 0 ? ` above minimum price` : ''}`);

      // Then, filter out previously seen listings
      priceFilteredListings.forEach(listing => {
        if (!previousLinks.has(listing.url)) {
          newListings.push(listing);
        }
      });

      console.log(`Found ${newListings.length} new listings`);

      if (previousLinks.size === 0 && priceFilteredListings.length > 0) {
        setStatusMessage(`First scan completed. Found ${priceFilteredListings.length} listing(s)${minPriceValue > 0 ? ` above €${minPriceValue.toLocaleString('it-IT')}` : ''}.`);
        setDisplayedListings(priceFilteredListings);
        // Save all filtered listings for first scan
        saveCurrentLinks(priceFilteredListings);
      } else if (newListings.length > 0) {
        setStatusMessage(`Found ${newListings.length} new listing(s)${minPriceValue > 0 ? ` above €${minPriceValue.toLocaleString('it-IT')}` : ''}:`);
        setDisplayedListings(newListings);
        // Get existing listings and add new ones
        const existingListings = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
        const updatedListings = [...existingListings, ...newListings];
        saveCurrentLinks(updatedListings);
      } else if (priceFilteredListings.length === 0) {
        setStatusMessage(`No listings found${minPriceValue > 0 ? ` above €${minPriceValue.toLocaleString('it-IT')}` : ''}.`);
        setDisplayedListings([]);
      } else {
        setStatusMessage('No new posts added since the last scan.');
        setDisplayedListings([]);
      }

    } catch (fetchError) {
      console.error("Scanning failed:", fetchError);
      setError(`Error scanning vendor: ${fetchError.message}. Check backend connection.`);
      setStatusMessage('Scan failed.');
    } finally {
      setIsLoading(false);
    }
  };

   // Initial status message based on localStorage
   useEffect(() => {
        const previousLinks = getPreviousLinks();
        if (previousLinks.size === 0) {
            setStatusMessage('Click "Scan Now" for the first scan.');
        } else {
            setStatusMessage(`Ready. Previous scan found ${previousLinks.size} listings. Click "Scan Now" to check for updates.`);
        }
    }, [getPreviousLinks]);


  return (
    <div> {/* Changed from App-header maybe */}
      <h1>Immobiliare.it Scanner</h1>
      <p>Vendor: Nicoletta Zaggia - Padova</p>
      
      <div className="price-filter">
        <label htmlFor="minPrice">Minimum Price (€): </label>
        <input
          type="text"
          id="minPrice"
          value={minPrice}
          onChange={handlePriceChange}
          placeholder="e.g., 1.300"
        />
        <button onClick={() => console.log('Current minPrice state:', minPrice)}>
          Debug Price
        </button>
      </div>

      <button onClick={handleScan} disabled={isLoading}>
        {isLoading ? 'Scanning...' : 'Scan Now'}
      </button>
      <div className="status-message">{statusMessage}</div>
      {error && <div className="error-message">{error}</div>}

      {/* Display NEW or ALL (on first scan) links */}
      {displayedListings.length > 0 && (
        <div className="results">
          <h3>Listings Found:</h3>
          <ul>
            {displayedListings.map((listing, index) => (
              <li key={index}>
                <Link to={`/details?url=${encodeURIComponent(listing.url)}`}>
                  {listing.url} - {listing.price}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default ScannerPage;