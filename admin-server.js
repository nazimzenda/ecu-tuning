const express = require('express');
const path = require('path');
const fs = require('fs');

// Global error handlers to capture crashes and unhandled rejections
process.on('uncaughtException', (err) => {
  console.error('Uncatch Exception:', err && err.stack ? err.stack : err);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

const ADMIN_PORT = process.env.ADMIN_PORT || 3001;
const API_BASE_URL =
  process.env.ADMIN_API_BASE_URL ||
  process.env.API_BASE_URL ||
  process.env.API_URL ||
  `http://localhost:${process.env.API_PORT || process.env.PORT || 4000}`;

const adminApp = express();

// Config endpoint
adminApp.get('/config.js', (req, res) => {
  res.type('application/javascript');
  res.send(`window.API_BASE_URL = '${API_BASE_URL.replace(/'/g, "\\'")}';`);
});

// Serve CSS, JS, images, fonts (but NOT HTML files)
adminApp.get(/\.(css|js|png|jpg|jpeg|gif|svg|woff|woff2|ttf|eot)$/i, (req, res, next) => {
  express.static(path.join(__dirname, 'public'))(req, res, next);
});

// Serve admin.html for ALL routes (including root)
adminApp.get('*', (req, res) => {
  const adminHtmlPath = path.join(__dirname, 'public', 'admin.html');
  if (fs.existsSync(adminHtmlPath)) {
    res.sendFile(adminHtmlPath);
  } else {
    res.status(404).send('Admin panel not found');
  }
});

const server = adminApp.listen(ADMIN_PORT, () => {
  console.log(`🔐 Admin server running at http://localhost:${ADMIN_PORT}`);
  console.log(`↪️  API Base URL: ${API_BASE_URL}`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`❌ Port ${ADMIN_PORT} is already in use`);
  } else {
    console.error('Server error:', err);
  }
  process.exit(1);
});

