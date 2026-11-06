// Load environment variables from the project .env file.
// dotenv never overrides variables that are already exported in the shell.
const path = require('path');

require('dotenv').config({
  path: path.join(__dirname, '.env'),
  quiet: true
});
