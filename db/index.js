// Adapter loader: chooses SQLite (existing) or Firestore adapter based on USE_FIREBASE.
// Firebase is only enabled when the flag is set AND both required credentials
// are present. server.js uses exactly the same decision, so the storage helper
// and the database always switch together.
require('../load-env');

const useFirebaseEnv = process.env.USE_FIREBASE === 'true' || process.env.USE_FIREBASE === '1';
const hasFirebaseCredentials = !!(
  process.env.GOOGLE_SERVICE_ACCOUNT_JSON && process.env.FIREBASE_STORAGE_BUCKET
);
const useFirebase = useFirebaseEnv && hasFirebaseCredentials;

let adapter;
if (useFirebase) {
  console.log('🔔 Using Firestore adapter for database operations');
  try {
    adapter = require('./firestore-adapter');
  } catch (err) {
    console.error('❌ Failed to load Firestore adapter, falling back to SQLite:', err.message);
    adapter = require('../database');
  }
} else {
  if (useFirebaseEnv && !hasFirebaseCredentials) {
    console.warn('⚠️ USE_FIREBASE is set but Firebase credentials are missing!');
    console.warn('   Set GOOGLE_SERVICE_ACCOUNT_JSON and FIREBASE_STORAGE_BUCKET, or set USE_FIREBASE=0');
  }
  console.log('🔔 Using SQLite adapter for database operations');
  adapter = require('../database');
}

module.exports = adapter;
