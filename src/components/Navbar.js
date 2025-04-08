// src/components/Navbar.js
import React from 'react';
import { NavLink } from 'react-router-dom';
import './Navbar.css'; // Create this CSS file for styling

function Navbar() {
  return (
    <nav className="navbar">
      <NavLink to="/" className={({ isActive }) => isActive ? "nav-link active" : "nav-link"}>
        Scan Listings
      </NavLink>
      <NavLink to="/previous" className={({ isActive }) => isActive ? "nav-link active" : "nav-link"}>
        View Previous Scan
      </NavLink>
    </nav>
  );
}

export default Navbar;