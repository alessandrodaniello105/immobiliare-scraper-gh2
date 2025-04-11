// src/components/ScannerPage.js
import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom'; // Import Link for navigation
import { API_URL_SCRAPE } from '../App.js'; // Use the new constants for API endpoints
// Import shared CSS or create specific ones
import '../App.css';

// console.log('STORAGE_KEY', STORAGE_KEY);
// console.log('localStorage', localStorage);

function ScannerPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState('Enter minimum price (optional) and click Scan Now.');
  // State now holds the NEW listings found in the current scan
  const [newListingsFound, setNewListingsFound] = useState([]);
  const [error, setError] = useState(null);
  const [minPrice, setMinPrice] = useState('');

  const handlePriceChange = (e) => {
    setMinPrice(e.target.value);
  };

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

  const handleScan = async () => {
    setIsLoading(true);
    setStatusMessage('Scanning vendor page and comparing with database...');
    setError(null);
    setNewListingsFound([]); // Clear previous new listings
    const minPriceValue = minPrice ? parsePrice(minPrice) : 0;

    try {
      // Call the backend scrape endpoint (POST)
      const response = await fetch(API_URL_SCRAPE, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ minPrice: minPrice }), // Send raw minPrice string
      });


      const text = await response.text();

      if (!response.ok) {
        throw new Error(data.message || `HTTP error! Status: ${response.status}`);
      }

      const data = JSON.parse(text);
      
      const newListings = data.newListings || [];

      if (newListings.length > 0) {
        setStatusMessage(`Found ${newListings.length} new listing(s)${minPriceValue > 0 ? ` above €${minPriceValue.toLocaleString('it-IT')}` : ''}! Database updated.`);
        setNewListingsFound(newListings);
      } else {
        setStatusMessage(`No new listings found${minPriceValue > 0 ? ` above €${minPriceValue.toLocaleString('it-IT')}` : ''}. Database updated.`);
        setNewListingsFound([]);
      }

    } catch (fetchError) {
      console.error("Scanning failed:", fetchError);
      setError(`Error during scan: ${fetchError.message}. Check backend connection.`);
      setStatusMessage('Scan failed.');
    } finally {
      setIsLoading(false);
    }
  };

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

      {/* Display only NEW listings found in THIS scan */}
      {newListingsFound.length > 0 && (
        <div className="results">
          <h3>New Listings Found:</h3>
          <ul>
            {newListingsFound.map((listing, index) => (
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