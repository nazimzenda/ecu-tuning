-- ECU Tuning API — D1 schema (SQLite-compatible)
-- Apply with:
--   npx wrangler d1 execute ecu-tuning-db --remote --file=./schema.sql

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  original_file_name TEXT NOT NULL,
  stored_file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,              -- R2 object key of the original file
  service TEXT NOT NULL,
  custom_service_description TEXT,
  vehicle_info TEXT NOT NULL,
  customer_name TEXT,
  customer_email TEXT,
  customer_phone TEXT,
  ecu_reference TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  modified_file_name TEXT,
  modified_stored_file_name TEXT,
  modified_file_path TEXT,              -- R2 object key of the modified file (NULL until uploaded)
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders (created_at);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders (status);

-- Login brute-force protection (one row per client key, e.g. 'login:<ip>').
-- A row is upserted in place each attempt; window_start tells whether the
-- counter belongs to the current window or must reset.
CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT PRIMARY KEY,
  window_start INTEGER NOT NULL,
  count INTEGER NOT NULL
);
