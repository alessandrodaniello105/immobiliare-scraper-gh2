// src/components/PreviousLinksPage.js
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
// Use the new constant for the listings API endpoint
import { API_URL_LISTINGS } from '../App';
import '../App.css';

function PreviousLinksPage() {
  // State holds ALL listings fetched from the DB
  const [allListings, setAllListings] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState('Loading stored listings...');
  // State for client-side filtering of displayed results
  const [minPrice, setMinPrice] = useState('');

  // Price parsing function remains the same
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

  // Fetch all listings from the DB on component mount
  useEffect(() => {
    const fetchListings = async () => {
      setIsLoading(true);
      try {
        const response = await fetch(API_URL_LISTINGS);
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.message || `HTTP error! Status: ${response.status}`);
        }
        const listings = data.listings || [];
        setAllListings(listings);
        if (listings.length === 0) {
          setMessage('No listings found in the database. Run a scan first.');
        } else {
           setMessage('Showing all listings stored in the database.'); // Initial message
        }
      } catch (fetchError) {
        console.error("Failed to fetch listings", fetchError);
        setMessage(`Error loading listings: ${fetchError.message}`);
      } finally {
        setIsLoading(false);
      }
    };
    fetchListings();
  }, []);

  const handlePriceChange = (e) => {
    setMinPrice(e.target.value);
  };

  // Function to handle deleting all listings
  const handleDeleteAll = async () => {
    // Optional: Add confirmation dialog
    if (!window.confirm("Are you sure you want to delete ALL stored listings? This cannot be undone.")) {
        return;
    }

    setIsLoading(true); // Indicate activity
    setMessage('Deleting all listings...');
    try {
      const response = await fetch(API_URL_LISTINGS, { method: 'DELETE' });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || `Failed to delete. Status: ${response.status}`);
      }

      setAllListings([]); // Clear frontend state
      setMessage('All stored listings have been deleted.');

    } catch (error) {
      console.error("Failed to delete listings:", error);
      setMessage(`Error deleting listings: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Apply client-side filtering based on the input
  const minPriceValue = minPrice ? parsePrice(minPrice) : 0;
  const filteredListings = minPriceValue > 0
    ? allListings.filter(listing => parsePrice(listing.price) >= minPriceValue)
    : allListings;

  return (
    <div>
      <h2>Stored Scan Results</h2>

      {/* Client-side Filter Input */}
      <div className="price-filter">
        <label htmlFor="minPrice">Filter Displayed Results (Min Price €): </label>
        <input
          type="text"
          id="minPrice"
          value={minPrice}
          onChange={handlePriceChange}
          placeholder="e.g., 1.300"
          disabled={isLoading}
        />
      </div>

      {isLoading ? (
        <p>Loading...</p>
      ) : (
        <> {/* Use fragment to group conditional rendering */}
          <p>{message}</p>
          {filteredListings.length > 0 ? (
            <div className="results">
              <p>Showing {filteredListings.length} of {allListings.length} stored listings{minPriceValue > 0 ? ` above €${minPriceValue.toLocaleString('it-IT')}` : ''}</p>
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
            <p>No stored listings found{minPriceValue > 0 ? ` matching the filter` : ''}.</p>
          )}
        </>
      )}

      {/* Add Delete All button back */}
      <button
        onClick={handleDeleteAll}
        disabled={isLoading || allListings.length === 0}
        style={{ backgroundColor: '#dc3545', marginTop: '20px' }} // Red color
       >
         Delete All Stored Listings
       </button>

      <Link to="/" style={{ marginTop: '20px', marginLeft: '20px', display: 'inline-block' }}>
        Go to Scanner
      </Link>
    </div>
  );
}

export default PreviousLinksPage;