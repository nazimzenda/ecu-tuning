const express = require('express');
const path = require('path');

const CLIENT_PORT = process.env.CLIENT_PORT || 3000;
const API_BASE_URL =
  process.env.CLIENT_API_BASE_URL ||
  process.env.API_BASE_URL ||
  process.env.API_URL ||
  `http://localhost:${process.env.API_PORT || process.env.PORT || 4000}`;

const clientApp = express();

clientApp.get('/config.js', (req, res) => {
  res.type('application/javascript');
  res.send(`window.API_BASE_URL = '${API_BASE_URL.replace(/'/g, "\\'")}';`);
});

clientApp.use(express.static(path.join(__dirname, 'public')));

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

