const admin = require('firebase-admin');
const fs = require('fs');

function initFirebase() {
  if (admin.apps && admin.apps.length) return admin;

  let serviceAccount;
  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    try {
      serviceAccount = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
    } catch (e) {
      console.error('ERROR: Invalid JSON in GOOGLE_SERVICE_ACCOUNT_JSON');
      throw e;
    }
  } else if (fs.existsSync('./service-account.json')) {
    serviceAccount = require('./service-account.json');
  }

  const initOptions = {};
  if (serviceAccount) {
    initOptions.credential = admin.credential.cert(serviceAccount);
  } else {
    // Fall back to application default credentials if available
    console.warn('⚠️ Firebase service account not provided; attempting application default credentials');
    initOptions.credential = admin.credential.applicationDefault();
  }

  if (process.env.FIREBASE_STORAGE_BUCKET) {
    initOptions.storageBucket = process.env.FIREBASE_STORAGE_BUCKET;
  }

  admin.initializeApp(initOptions);

  const db = admin.firestore();
  const bucket = admin.storage().bucket(process.env.FIREBASE_STORAGE_BUCKET);

  return { admin, db, bucket };
}

module.exports = initFirebase;
