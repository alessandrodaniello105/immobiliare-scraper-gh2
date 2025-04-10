// src/App.js
import React from 'react';
import { Routes, Route } from 'react-router-dom';
import Navbar from './components/Navbar';
import ScannerPage from './components/ScannerPage';
import PreviousLinksPage from './components/PreviousLinksPage';
import PropertyDetailPage from './components/PropertyDetailPage';
import './App.css';

// Define API URLs and other constants
export const API_BASE_URL = 'http://localhost:3001'; // Backend server address
export const API_URL_SCRAPE = `${API_BASE_URL}/api/scrape`; // Endpoint for scanning
export const API_URL_LISTINGS = `${API_BASE_URL}/api/listings`; // Endpoint for getting all stored listings
export const API_URL_DETAILS = `${API_BASE_URL}/api/details`; // Placeholder endpoint
// Remove STORAGE_KEY as we are no longer using localStorage directly for listings

function App() {
  return (
    <div className="App">
      <Navbar />
      <main className="App-header">
        <Routes>
          <Route path="/" element={<ScannerPage />} />
          <Route path="/previous" element={<PreviousLinksPage />} />
          <Route path="/details" element={<PropertyDetailPage />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;