// Shared security headers for the API, client and admin servers.
// CSP is intentionally disabled: the public pages use inline styles, the admin
// login page has an inline bootstrap script, and the lead workspace loads
// Leaflet + CARTO map tiles from third-party origins.
const helmet = require('helmet');

const isProduction = process.env.NODE_ENV === 'production';

module.exports = helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  hsts: isProduction
    ? { maxAge: 15552000, includeSubDomains: true, preload: false }
    : false,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
});
