require('./load-env');

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs-extra');

// Data directory - use DATA_DIR env var for Railway Volume, otherwise use local directory
const dataDir = process.env.DATA_DIR || __dirname;
const dbPath = path.join(dataDir, 'database.sqlite');

// Ensure data directory exists
fs.ensureDirSync(dataDir);

let db;

function init() {
  return new Promise((resolve, reject) => {
    console.log('📂 Database path:', dbPath);
    db = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        console.error('Error opening database:', err);
        reject(err);
        return;
      }
      console.log('✅ Connected to SQLite database');
      console.log('   - Location:', dbPath);
      console.log('   - Persistent:', process.env.DATA_DIR ? '✅ Railway Volume' : '⚠️ Ephemeral');

      db.configure('busyTimeout', 5000);
      db.run('PRAGMA journal_mode = WAL', (pragmaErr) => {
        if (pragmaErr) console.warn('⚠️ Could not enable WAL mode:', pragmaErr.message);
        createTables().then(resolve).catch(reject);
      });
    });
  });
}

// The columns added after the first release. Existing databases are upgraded
// in place; new databases get everything from the CREATE TABLE statement.
const ORDER_COLUMNS = [
  ['custom_service_description', 'TEXT'],
  ['customer_phone', 'TEXT'],
  ['ecu_reference', 'TEXT'],
  ['file_download_url', 'TEXT'],
  ['modified_file_download_url', 'TEXT']
];

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(err) {
      if (err) {
        reject(err);
        return;
      }
      resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(rows || []);
    });
  });
}

async function createTables() {
  await run(`
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      original_file_name TEXT NOT NULL,
      stored_file_name TEXT NOT NULL,
      file_path TEXT NOT NULL,
      file_download_url TEXT,
      service TEXT NOT NULL,
      custom_service_description TEXT,
      vehicle_info TEXT NOT NULL,
      ecu_reference TEXT,
      customer_name TEXT,
      customer_email TEXT,
      customer_phone TEXT,
      status TEXT DEFAULT 'pending',
      modified_file_name TEXT,
      modified_stored_file_name TEXT,
      modified_file_path TEXT,
      modified_file_download_url TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const columns = await all('PRAGMA table_info(orders)');
  const existingColumns = new Set(columns.map((column) => column.name));

  for (const [name, type] of ORDER_COLUMNS) {
    if (!existingColumns.has(name)) {
      try {
        await run(`ALTER TABLE orders ADD COLUMN ${name} ${type}`);
        console.log(`✅ Added missing orders column: ${name}`);
      } catch (err) {
        // Another process may have added it between PRAGMA and ALTER.
        if (!/duplicate column name/i.test(err.message)) throw err;
      }
    }
  }

  await run('CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders (created_at)');
  await run('CREATE INDEX IF NOT EXISTS idx_orders_status ON orders (status)');

  console.log('✅ Database tables created');
}

function createOrder(orderData) {
  return new Promise((resolve, reject) => {
    const sql = `
      INSERT INTO orders (
        original_file_name, stored_file_name, file_path, file_download_url,
        service, custom_service_description, vehicle_info, ecu_reference,
        customer_name, customer_email, customer_phone, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    db.run(sql, [
      orderData.originalFileName,
      orderData.storedFileName,
      orderData.filePath,
      orderData.fileDownloadURL || null,
      orderData.service,
      orderData.customServiceDescription || null,
      orderData.vehicleInfo,
      orderData.ecuReference || null,
      orderData.customerName,
      orderData.customerEmail,
      orderData.customerPhone || null,
      orderData.status
    ], function onInsert(err) {
      if (err) {
        reject(err);
        return;
      }
      resolve({ id: this.lastID, ...orderData });
    });
  });
}

function getAllOrders() {
  return new Promise((resolve, reject) => {
    const sql = `SELECT * FROM orders ORDER BY created_at DESC, id DESC`;
    db.all(sql, [], (err, rows) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(rows || []);
    });
  });
}

function getOrder(id) {
  return new Promise((resolve, reject) => {
    const sql = `SELECT * FROM orders WHERE id = ?`;
    db.get(sql, [id], (err, row) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(row);
    });
  });
}

function updateOrderStatus(id, status) {
  return new Promise((resolve, reject) => {
    const sql = `UPDATE orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`;
    db.run(sql, [status, id], function onUpdate(err) {
      if (err) {
        reject(err);
        return;
      }
      resolve({ changes: this.changes });
    });
  });
}

function updateOrderModifiedFile(id, fileData) {
  return new Promise((resolve, reject) => {
    const sql = `
      UPDATE orders
      SET modified_file_name = ?,
          modified_stored_file_name = ?,
          modified_file_path = ?,
          modified_file_download_url = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `;
    db.run(sql, [
      fileData.modifiedFileName,
      fileData.modifiedStoredFileName,
      fileData.modifiedFilePath,
      fileData.modifiedFileDownloadURL || null,
      id
    ], function onUpdate(err) {
      if (err) {
        reject(err);
        return;
      }
      resolve({ changes: this.changes });
    });
  });
}

function deleteOrder(id) {
  return new Promise((resolve, reject) => {
    const sql = `DELETE FROM orders WHERE id = ?`;
    db.run(sql, [id], (err) => {
      if (err) {
        reject(err);
        return;
      }
      resolve();
    });
  });
}

function close() {
  return new Promise((resolve, reject) => {
    if (!db) return resolve();
    db.close((err) => {
      if (err) return reject(err);
      resolve();
    });
  });
}

module.exports = {
  init,
  createOrder,
  getAllOrders,
  getOrder,
  updateOrderStatus,
  updateOrderModifiedFile,
  deleteOrder,
  close
};
