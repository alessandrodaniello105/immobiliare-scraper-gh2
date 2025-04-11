// src/components/PropertyDetailPage.js
import React, { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { API_URL_DETAILS } from '../App.js';
import './PropertyDetailPage.css'; // Create specific styles

function PropertyDetailPage() {
  const [searchParams] = useSearchParams();
  const propertyUrl = searchParams.get('url'); // Get URL from query parameter

  const [details, setDetails] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!propertyUrl) {
      setError('No property URL provided.');
      return;
    }

    const fetchDetails = async () => {
      setIsLoading(true);
      setError(null);
      setDetails(null); // Clear previous details

      try {
        // Construct the API URL with the encoded property URL
        const apiUrl = `${API_URL_DETAILS}?url=${encodeURIComponent(propertyUrl)}`;
        const response = await fetch(apiUrl);
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.message || `Failed to fetch details. Status: ${response.status}`);
        }

        setDetails(data);

      } catch (fetchError) {
        console.error("Failed to fetch property details:", fetchError);
        setError(`Error fetching details: ${fetchError.message}`);
      } finally {
        setIsLoading(false);
      }
    };

    fetchDetails();
  }, [propertyUrl]); // Re-fetch if the URL changes

  // Helper to render key-value lists
  const renderKeyValueList = (items, title) => {
    if (!items || items.length === 0) return null;
    return (
      <div className="detail-section">
        <h4>{title}</h4>
        <dl className="detail-list">
          {items.map((item, index) => (
            <React.Fragment key={index}>
              <dt>{item.key}</dt>
              <dd>{item.value}</dd>
            </React.Fragment>
          ))}
        </dl>
      </div>
    );
  };

    // Helper to render simple list (for otherFeatures)
   const renderSimpleList = (items, title) => {
     if (!items || items.length === 0) return null;
     return (
       <div className="detail-section">
         <h4>{title}</h4>
         <ul className="simple-list">
           {items.map((item, index) => (
             <li key={index}>{item}</li>
           ))}
         </ul>
       </div>
     );
   };


  return (
    <div className="property-detail-container">
      <h2>Property Details</h2>
      <p className="property-url">
          <a href={propertyUrl} target="_blank" rel="noopener noreferrer">{propertyUrl}</a>
      </p>
       <div className="navigation-links">
           <Link to="/">Back to Scanner</Link> | <Link to="/previous">Back to Previous List</Link>
       </div>

      {isLoading && <p className="loading-message">Loading details...</p>}
      {error && <p className="error-message">{error}</p>}

      {details && !isLoading && !error && (
        <div className="details-content">
          <div className="detail-section main-info">
              {details.price !== 'N/A' && <p className="price"><strong>Price:</strong> { console.log(details) . details.price}</p>}
              {details.address && details.address !== 'N/A' && <p className="address"><strong>Address:</strong> {details.address}</p>}
              {details.surface && details.surface !== 'N/A' && <p className="surface"><strong>Surface:</strong> {details.surface}</p>}
          </div>

          {details.description && details.description !== 'N/A' && (
            <div className="detail-section">
              <h4>Descrizione</h4>
              <p className="description">{details.description}</p>
            </div>
          )}

          {renderKeyValueList(details.features, 'Caratteristiche Principali')}
          {renderSimpleList(details.otherFeatures, 'Altre Caratteristiche')}
          {renderKeyValueList(details.costs, 'Dettaglio Costi')}

          {/* You might want a section if some expected data wasn't found */}
          {/* {(!details.features || details.features.length === 0) && <p>Main features not found.</p>} */}

        </div>
      )}
    </div>
  );
}

export default PropertyDetailPage;