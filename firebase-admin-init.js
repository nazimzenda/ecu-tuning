const admin = require('firebase-admin');
const fs = require('fs');

function initFirebase() {
  const storageBucket = process.env.FIREBASE_STORAGE_BUCKET || undefined;

  // Reuse an existing app instead of calling initializeApp twice.
  const app = (admin.apps && admin.apps.length)
    ? admin.apps[0]
    : (() => {
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

        if (storageBucket) {
          initOptions.storageBucket = storageBucket;
        }

        return admin.initializeApp(initOptions);
      })();

  const db = admin.firestore();
  const bucket = storageBucket ? admin.storage().bucket(storageBucket) : null;

  return { admin, app, db, bucket };
}

module.exports = initFirebase;
