/**
 * Migration script: move orders and files from SQLite/uploads to Firestore + Firebase Storage
 *
 * Usage:
 *   node migration/migrate-sqlite-to-firestore.js --dry
 *   (set env vars: GOOGLE_SERVICE_ACCOUNT_JSON, FIREBASE_STORAGE_BUCKET)
 */
const sqlite = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs-extra');
const initFirebase = require('../firebase-admin-init');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry');

async function run() {
  console.log('🔁 Starting migration from SQLite -> Firestore');
  const fb = initFirebase();
  const firestore = fb.db;
  const bucket = fb.bucket;

  const dbPath = path.join(__dirname, '..', 'database.sqlite');
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

    for (const row of rows) {
      console.log('-> Migrating order', row.id);
      const orderRef = firestore.collection('orders').doc(String(row.id));

      const doc = {
        original_file_name: row.original_file_name,
        stored_file_name: row.stored_file_name,
        service: row.service,
        custom_service_description: row.custom_service_description,
        vehicle_info: row.vehicle_info,
        customer_name: row.customer_name,
        customer_email: row.customer_email,
        customer_phone: row.customer_phone,
        status: row.status,
        created_at: row.created_at || null,
        updated_at: row.updated_at || null
      };

      // Upload original file if exists
      if (row.file_path && fs.existsSync(row.file_path)) {
        const dest = `orders/${row.id}/originals/${path.basename(row.file_path)}`;
        if (!dryRun) {
          const uuid = require('uuid').v4();
          const f = bucket.file(dest);
          await f.save(fs.readFileSync(row.file_path));
          await f.setMetadata({ metadata: { firebaseStorageDownloadTokens: uuid } });
          doc.file_path = dest;
          doc.file_download_url = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(dest)}?alt=media&token=${uuid}`;
        } else {
          doc.file_path = dest;
        }
      }

      // Upload modified file if exists
      if (row.modified_file_path && fs.existsSync(row.modified_file_path)) {
        const dest = `orders/${row.id}/modified/${path.basename(row.modified_file_path)}`;
        if (!dryRun) {
          const uuid = require('uuid').v4();
          const f = bucket.file(dest);
          await f.save(fs.readFileSync(row.modified_file_path));
          await f.setMetadata({ metadata: { firebaseStorageDownloadTokens: uuid } });
          doc.modified_file_path = dest;
          doc.modified_file_download_url = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(dest)}?alt=media&token=${uuid}`;
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

    console.log('✅ Migration complete');
    process.exit(0);
  });
}

run().catch(e => { console.error(e); process.exit(1); });
