/**
 * Migration script: move orders and files from SQLite/uploads to Firestore + Firebase Storage
 *
 * Usage:
 *   node migration/migrate-sqlite-to-firestore.js --dry
 *   (set env vars: GOOGLE_SERVICE_ACCOUNT_JSON, FIREBASE_STORAGE_BUCKET)
 */
require('../load-env');

const sqlite = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs-extra');
const crypto = require('crypto');
const initFirebase = require('../firebase-admin-init');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry');

function firebaseDownloadUrl(bucketName, dest, token) {
  return `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(dest)}?alt=media&token=${token}`;
}

async function run() {
  console.log('🔁 Starting migration from SQLite -> Firestore');
  const fb = initFirebase();
  const firestore = fb.db;
  const bucket = fb.bucket;

  if (!dryRun && !bucket) {
    console.error('FIREBASE_STORAGE_BUCKET is required to migrate files.');
    process.exit(1);
  }

  const dataDir = process.env.DATA_DIR || path.join(__dirname, '..');
  const dbPath = path.join(dataDir, 'database.sqlite');
  if (!fs.existsSync(dbPath)) {
    console.error('SQLite DB not found at', dbPath);
    process.exit(1);
  }

  const db = new sqlite.Database(dbPath);
  db.all('SELECT * FROM orders', async (err, rows) => {
    if (err) {
      console.error('Error reading sqlite:', err);
      process.exit(1);
    }

    try {
      for (const row of rows) {
        console.log('-> Migrating order', row.id);
        const orderRef = firestore.collection('orders').doc(String(row.id));

        const doc = {
          original_file_name: row.original_file_name,
          stored_file_name: row.stored_file_name,
          file_path: row.file_path,
          file_download_url: row.file_download_url || null,
          service: row.service,
          custom_service_description: row.custom_service_description || null,
          vehicle_info: row.vehicle_info,
          ecu_reference: row.ecu_reference || null,
          customer_name: row.customer_name,
          customer_email: row.customer_email,
          customer_phone: row.customer_phone || null,
          status: row.status,
          modified_file_name: row.modified_file_name || null,
          modified_stored_file_name: row.modified_stored_file_name || null,
          modified_file_path: row.modified_file_path || null,
          modified_file_download_url: row.modified_file_download_url || null,
          created_at: row.created_at || fb.admin.firestore.FieldValue.serverTimestamp(),
          updated_at: row.updated_at || fb.admin.firestore.FieldValue.serverTimestamp()
        };

        // Upload original file if it still exists on local disk
        if (row.file_path && fs.existsSync(row.file_path)) {
          const dest = `orders/${row.id}/originals/${path.basename(row.file_path)}`;
          if (!dryRun) {
            const token = crypto.randomUUID();
            const f = bucket.file(dest);
            await f.save(fs.readFileSync(row.file_path));
            await f.setMetadata({ metadata: { firebaseStorageDownloadTokens: token } });
            doc.file_path = dest;
            doc.file_download_url = firebaseDownloadUrl(bucket.name, dest, token);
          } else {
            doc.file_path = dest;
          }
        }

        // Upload modified file if it still exists on local disk
        if (row.modified_file_path && fs.existsSync(row.modified_file_path)) {
          const dest = `orders/${row.id}/modified/${path.basename(row.modified_file_path)}`;
          if (!dryRun) {
            const token = crypto.randomUUID();
            const f = bucket.file(dest);
            await f.save(fs.readFileSync(row.modified_file_path));
            await f.setMetadata({ metadata: { firebaseStorageDownloadTokens: token } });
            doc.modified_file_path = dest;
            doc.modified_file_download_url = firebaseDownloadUrl(bucket.name, dest, token);
          } else {
            doc.modified_file_path = dest;
          }
        }

        if (!dryRun) {
          await orderRef.set(doc);
          console.log('  Migrated order', row.id);
        } else {
          console.log('  Dry-run would set', doc);
        }
      }

      db.close();
      console.log('✅ Migration complete');
      process.exit(0);
    } catch (migrationError) {
      console.error('Migration failed:', migrationError);
      db.close();
      process.exit(1);
    }
  });
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
