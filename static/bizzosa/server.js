/**
 * Simple Node.js server for local development
 * Install: npm install express
 * Run with: node server.js
 * Then open: http://localhost:8000
 */

const express = require('express');
const path = require('path');
const app = express();
const PORT = 8000;

// Serve static files
app.use(express.static(__dirname));

// Enable CORS for API routes
app.use('/api', (req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    next();
});

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
    console.log('Press Ctrl+C to stop');
});