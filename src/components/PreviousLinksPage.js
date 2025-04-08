// src/components/PreviousLinksPage.js
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { STORAGE_KEY } from '../App';
import '../App.css'; // Use shared styles

function PreviousLinksPage() {
  const [previousListings, setPreviousListings] = useState([]);
  const [message, setMessage] = useState('Loading previous scan data...');
  const [minPrice, setMinPrice] = useState('');

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

  useEffect(() => {
    const storedListings = localStorage.getItem(STORAGE_KEY);
    if (storedListings) {
      try {
        const listingsArray = JSON.parse(storedListings);
        setPreviousListings(listingsArray);
        if (listingsArray.length === 0) {
          setMessage('The previous scan found no listings.');
        } else {
          setMessage(`Displaying ${listingsArray.length} listings found in the last scan.`);
        }
      } catch (e) {
        console.error("Failed to parse previous listings", e);
        setMessage('Could not load previous scan data (invalid format). Please run a new scan.');
        localStorage.removeItem(STORAGE_KEY);
      }
    } else {
      setMessage('No previous scan data found. Please run a scan first.');
    }
  }, []);

  const handlePriceChange = (e) => {
    setMinPrice(e.target.value);
  };

  const handleLinkDeleteAll = () => {
    localStorage.removeItem(STORAGE_KEY);
    setPreviousListings([]);
    setMessage('All previous scan data has been deleted.');
  };

  const filteredListings = minPrice
    ? previousListings.filter(listing => parsePrice(listing.price) >= parsePrice(minPrice))
    : previousListings;

  return (
    <div>
      <h2>Previous Scan Results</h2>
      
      <div className="price-filter">
        <label htmlFor="minPrice">Filter by Minimum Price (€): </label>
        <input
          type="text"
          id="minPrice"
          value={minPrice}
          onChange={handlePriceChange}
          placeholder="e.g., 1.300"
        />
      </div>

      <p>{message}</p>
      {filteredListings.length > 0 ? (
        <div className="results">
          <p>Showing {filteredListings.length} listings{minPrice ? ` above €${parsePrice(minPrice).toLocaleString('it-IT')}` : ''}</p>
          <ul>
            {filteredListings.map((listing, index) => (
              <li key={index}>
                <Link to={`/details?url=${encodeURIComponent(listing.url)}`}>
                  {listing.url} - {listing.price}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p>No listings found{minPrice ? ` above €${parsePrice(minPrice).toLocaleString('it-IT')}` : ''}</p>
      )}
      
      <Link to="/" style={{ marginTop: '20px', display: 'inline-block' }}>
        Go to Scanner
      </Link>
      <button onClick={handleLinkDeleteAll} className="delete-all-button">Delete All</button>
    </div>
  );
}

export default PreviousLinksPage;