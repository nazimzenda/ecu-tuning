// Adapter loader: chooses SQLite (existing) or Firestore adapter based on USE_FIREBASE env var
// Only use Firebase if explicitly set to 'true' or '1' AND we have the required credentials
const useFirebaseEnv = process.env.USE_FIREBASE === 'true' || process.env.USE_FIREBASE === '1';
const hasFirebaseCredentials = !!(process.env.GOOGLE_SERVICE_ACCOUNT_JSON || process.env.FIREBASE_STORAGE_BUCKET);

// Only enable Firebase if both the flag is set AND credentials are provided
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
