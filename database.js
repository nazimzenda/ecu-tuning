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
      createTables().then(resolve).catch(reject);
    });
  });
}

function createTables() {
  return new Promise((resolve, reject) => {
    const sql = `
      CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        original_file_name TEXT NOT NULL,
        stored_file_name TEXT NOT NULL,
        file_path TEXT NOT NULL,
        service TEXT NOT NULL,
        custom_service_description TEXT,
        vehicle_info TEXT NOT NULL,
        customer_name TEXT,
        customer_email TEXT,
        customer_phone TEXT,
        status TEXT DEFAULT 'pending',
        modified_file_name TEXT,
        modified_stored_file_name TEXT,
        modified_file_path TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `;

    db.run(sql, (err) => {
      if (err) {
        console.error('Error creating tables:', err);
        reject(err);
        return;
      }
      // Add custom_service_description column if it doesn't exist (for existing databases)
      db.run(`ALTER TABLE orders ADD COLUMN custom_service_description TEXT`, () => {
        // Ignore error if column already exists
      });
      // Add customer_phone column if it doesn't exist
      db.run(`ALTER TABLE orders ADD COLUMN customer_phone TEXT`, () => {
        // Ignore error if column already exists
      });
      console.log('✅ Database tables created');
      resolve();
    });
  });
}

function createOrder(orderData) {
  return new Promise((resolve, reject) => {
    const sql = `
      INSERT INTO orders (
        original_file_name, stored_file_name, file_path,
        service, custom_service_description, vehicle_info, customer_name, customer_email, customer_phone, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    db.run(sql, [
      orderData.originalFileName,
      orderData.storedFileName,
      orderData.filePath,
      orderData.service,
      orderData.customServiceDescription || null,
      orderData.vehicleInfo,
      orderData.customerName,
      orderData.customerEmail,
      orderData.customerPhone || null,
      orderData.status
    ], function(err) {
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
    const sql = `SELECT * FROM orders ORDER BY created_at DESC`;
    db.all(sql, [], (err, rows) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(rows);
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
    db.run(sql, [status, id], (err) => {
      if (err) {
        reject(err);
        return;
      }
      resolve();
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
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `;
    db.run(sql, [
      fileData.modifiedFileName,
      fileData.modifiedStoredFileName,
      fileData.modifiedFilePath,
      id
    ], (err) => {
      if (err) {
        reject(err);
        return;
      }
      resolve();
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

module.exports = {
  init,
  createOrder,
  getAllOrders,
  getOrder,
  updateOrderStatus,
  updateOrderModifiedFile,
  deleteOrder
};

