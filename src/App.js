// src/App.js
import React from 'react';
import { Routes, Route } from 'react-router-dom';
import ScannerPage from './components/ScannerPage';
import PreviousLinksPage from './components/PreviousLinksPage';
import PropertyDetailPage from './components/PropertyDetailPage.js';
import Navbar from './components/Navbar'; // Import Navbar
import './App.css';

// Key for storing previous links in localStorage (can be defined here or imported)
export const STORAGE_KEY = 'immobiliarePreviousLinks_nicoletta_zaggia';
// Backend API URL (can be defined here or imported)
export const API_URL_LIST = 'http://localhost:3001/api/scrape';
export const API_URL_DETAILS = 'http://localhost:3001/api/scrape-details';


function App() {
  return (
    <div className="App">
      <Navbar /> {/* Add the Navbar */}
      <header className="App-header"> {/* Keep general header styling if desired */}
        <Routes>
          <Route path="/" element={<ScannerPage />} />
          <Route path="/previous" element={<PreviousLinksPage />} />
          {/* Route for details expects a query param */}
          <Route path="/details" element={<PropertyDetailPage />} />
          {/* Optional: Add a 404 Not Found Route */}
           <Route path="*" element={<div><h2>404 Not Found</h2><p>Page does not exist.</p></div>} />
        </Routes>
      </header>
    </div>
  );
}

export default App;