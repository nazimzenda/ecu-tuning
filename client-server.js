const express = require('express');
const path = require('path');
const compression = require('compression');

const CLIENT_PORT = process.env.CLIENT_PORT || 3000;

// In production (Railway), use empty string so API calls go to same origin via Nginx
// In development, use explicit localhost URL
const API_BASE_URL = process.env.NODE_ENV === 'production'
  ? ''
  : (process.env.CLIENT_API_BASE_URL ||
     process.env.API_BASE_URL ||
     process.env.API_URL ||
     `http://localhost:${process.env.API_PORT || 4000}`);

const clientApp = express();

// Enable gzip compression
clientApp.use(compression());

// Cache static assets for 1 day in production
const cacheMaxAge = process.env.NODE_ENV === 'production' ? 86400000 : 0;

clientApp.get('/config.js', (req, res) => {
  res.type('application/javascript');
  res.send(`window.API_BASE_URL = '${API_BASE_URL.replace(/'/g, "\\'")}';`);
});

clientApp.use(express.static(path.join(__dirname, 'public'), {
  maxAge: cacheMaxAge,
  etag: true,
  lastModified: true
}));

clientApp.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const server = clientApp.listen(CLIENT_PORT, () => {
  console.log(`🟡 Client server running at http://localhost:${CLIENT_PORT}`);
  console.log(`↪️  Proxying API requests to ${API_BASE_URL}`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`❌ Port ${CLIENT_PORT} is already in use`);
  } else {
    console.error('Server error:', err);
  }
  process.exit(1);
});

