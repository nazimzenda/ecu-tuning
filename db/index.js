// Adapter loader: chooses SQLite (existing) or Firestore adapter based on USE_FIREBASE env var
const useFirebase = process.env.USE_FIREBASE === 'true' || process.env.USE_FIREBASE === '1';

let adapter;
if (useFirebase) {
  console.log('🔔 Using Firestore adapter for database operations');
  adapter = require('./firestore-adapter');
} else {
  console.log('🔔 Using SQLite adapter for database operations');
  adapter = require('../database');
}

module.exports = adapter;
