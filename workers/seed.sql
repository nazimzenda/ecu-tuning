-- ECU Tuning API — seed template for migrating existing orders from the local
-- SQLite database (database.sqlite) into D1.
--
-- Steps:
--   1. Export the rows locally:
--        sqlite3 database.sqlite "SELECT id, original_file_name, stored_file_name,
--          service, custom_service_description, vehicle_info, ecu_reference,
--          customer_name, customer_email, customer_phone, status,
--          modified_file_name, modified_stored_file_name, created_at, updated_at
--          FROM orders ORDER BY id;"
--
--   2. Upload the corresponding files to R2 at the keys used below:
--        npx wrangler r2 object put ecu-tuning-files/orders/originals/<stored_file_name> --file ./uploads/<stored_file_name>
--        npx wrangler r2 object put ecu-tuning-files/orders/<id>/modified/<modified_stored_file_name> --file ./uploads/modified/<modified_stored_file_name>
--
--   3. Replace every __PLACEHOLDER__ in the INSERT below with the exported
--      values (keep 'NULL' unquoted where the exported value is empty).
--
--   4. Apply:
--        npx wrangler d1 execute ecu-tuning-db --remote --file=./seed.sql

-- NOTE: leaving this file as-is (with __PLACEHOLDER__ values) will insert two
-- bogus rows. Fill the placeholders before running.

INSERT INTO orders (
  id, original_file_name, stored_file_name, file_path, service,
  custom_service_description, vehicle_info, ecu_reference, customer_name,
  customer_email, customer_phone, status, modified_file_name,
  modified_stored_file_name, modified_file_path, created_at, updated_at
) VALUES
  (
    __ID_1__, '__ORIGINAL_FILE_NAME_1__', '__STORED_FILE_NAME_1__',
    'orders/originals/__STORED_FILE_NAME_1__', '__SERVICE_1__', NULL,
    '__VEHICLE_INFO_1__', '__ECU_REFERENCE_1__', '__CUSTOMER_NAME_1__',
    '__CUSTOMER_EMAIL_1__', '__CUSTOMER_PHONE_1__', 'completed',
    '__MODIFIED_FILE_NAME_1__', '__MODIFIED_STORED_FILE_NAME_1__',
    'orders/__ID_1__/modified/__MODIFIED_STORED_FILE_NAME_1__',
    '__CREATED_AT_1__', '__UPDATED_AT_1__'
  ),
  (
    __ID_2__, '__ORIGINAL_FILE_NAME_2__', '__STORED_FILE_NAME_2__',
    'orders/originals/__STORED_FILE_NAME_2__', '__SERVICE_2__', NULL,
    '__VEHICLE_INFO_2__', '__ECU_REFERENCE_2__', '__CUSTOMER_NAME_2__',
    '__CUSTOMER_EMAIL_2__', '__CUSTOMER_PHONE_2__', 'completed',
    '__MODIFIED_FILE_NAME_2__', '__MODIFIED_STORED_FILE_NAME_2__',
    'orders/__ID_2__/modified/__MODIFIED_STORED_FILE_NAME_2__',
    '__CREATED_AT_2__', '__UPDATED_AT_2__'
  );
