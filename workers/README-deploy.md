# Deploying the ECU Tuning API to Cloudflare Workers

This directory is a dependency-free port of `server.js` for Cloudflare Workers
(D1 + R2 + Resend). It runs on the Workers free tier. You need:

- A Cloudflare account
- Node.js ≥ 18 (for `npx wrangler`)
- Your Resend account verified sender (optional, for email notifications)

## Architecture at a glance

| Concern | Cloudflare service | Notes |
|---|---|---|
| API | Workers | `src/index.js`, ES module worker, no npm deps |
| Database | D1 (SQLite) | `orders` + `rate_limits` tables (see `schema.sql`) |
| Files | R2 | Originals: `orders/originals/<uuid>-<name>`; modified: `orders/<id>/modified/<uuid>-<name>` |
| Email | Resend HTTP API | `fetch()` directly, no SDK |
| Secrets | `wrangler secret put` | Never committed (see `wrangler.toml` comments) |

## Step-by-step

Run all commands from inside `workers/`.

### 1. Login to Cloudflare

```bash
npx wrangler login
```

### 2. Create the D1 database

```bash
npx wrangler d1 create ecu-tuning-db
```

Copy the printed `database_id` into `wrangler.toml` under
`[[d1_databases]].database_id`.

### 3. Apply the schema

```bash
npx wrangler d1 execute ecu-tuning-db --remote --file=./schema.sql
```

### 4. Create the R2 bucket

```bash
npx wrangler r2 bucket create ecu-tuning-files
```

### 5. Set secrets (4 total — NEVER commit these values)

```bash
npx wrangler secret put ADMIN_PASSWORD
npx wrangler secret put SESSION_SECRET     # generate: openssl rand -hex 32
npx wrangler secret put R2_SIGNING_SECRET  # generate: openssl rand -hex 32
npx wrangler secret put RESEND_API_KEY     # optional: email notifications skipped if unset
```

### 6. Configure vars in `wrangler.toml` (non-secret)

Edit `[vars]`:

- `ADMIN_EMAIL` — inbox that receives new-order notifications (leave empty to skip)
- `ADMIN_URL` — admin panel URL used in notification emails (empty = worker origin)
- `ALLOWED_ORIGINS` — comma-separated CORS allowlist, e.g. `https://ecu.example.com,https://admin.example.com`. Empty = same-origin only.
- `EMAIL_FROM` — verified sender on your Resend account

### 7. Deploy

```bash
npx wrangler deploy
```

Your API is live at `https://ecu-tuning-api.<your-subdomain>.workers.dev`.

### 8. (Optional) Migrate existing orders from local SQLite

`seed.sql` is a template for migrating existing rows from `../database.sqlite`:

1. Export rows locally:
   ```bash
   sqlite3 ../database.sqlite "SELECT id, original_file_name, stored_file_name, service, custom_service_description, vehicle_info, ecu_reference, customer_name, customer_email, customer_phone, status, modified_file_name, modified_stored_file_name, created_at, updated_at FROM orders ORDER BY id;"
   ```
2. Upload the corresponding files to R2 at the keys referenced in `seed.sql`:
   ```bash
   npx wrangler r2 object put ecu-tuning-files/orders/originals/<stored_file_name> --file ../uploads/<stored_file_name>
   npx wrangler r2 object put ecu-tuning-files/orders/<id>/modified/<modified_stored_file_name> --file ../uploads/modified/<modified_stored_file_name>
   ```
3. Fill the `__PLACEHOLDER__` values in `seed.sql`.
4. Apply:
   ```bash
   npx wrangler d1 execute ecu-tuning-db --remote --file=./seed.sql
   ```

## Client integration notes

The upload flow differs from the old Express API (which accepted `multipart/form-data`):

1. `POST /api/upload-url` with `{ fileName, fileSize, kind: "original" }` →
   `{ uploadUrl, key, exp, sig }`
2. `PUT` the raw file bytes to `uploadUrl` (Content-Length required, max 50MB,
   extensions `.bin .hex .ori .winols .dam`)
3. `POST /api/orders` with JSON:
   `{ service, vehicleInfo, ecuReference?, customerName?, customerEmail?,
   customerPhone?, customServiceDescription? (required when service === "Autres"),
   fileName, fileKey, fileExp, fileSig }`

Admin modified-file upload:

1. `POST /api/upload-url` with `{ fileName, fileSize, kind: "modified", orderId }`
   (requires admin auth)
2. `PUT` the file to `uploadUrl`
3. `POST /api/orders/:id/modified-upload` with `{ fileName, fileKey, fileExp, fileSig }`

Admin auth: login returns `{ success, sessionId }` and sets an HttpOnly
`admin_session` cookie (12h). Requests are authenticated by cookie OR
`x-admin-session` header — the existing admin panel's header flow keeps working
unchanged.

## About the "presigned" URLs

Upload/download tickets are HMAC-SHA256 signed with `R2_SIGNING_SECRET`
(`upload:<key>:<exp>` / `download:<key>:<exp>`) and served by the Worker, which
streams bytes to/from R2. No R2 S3 API credentials are required. If you want
true browser-direct-to-R2 uploads (S3 SigV4 presigned PUTs, bypassing the
Worker entirely), create an R2 API token, add the access key id + bucket
endpoint as vars, configure CORS on the bucket, and replace the ticket scheme
— out of scope for this port.

## Rollback / updates

```bash
npx wrangler deploy            # push new code
npx wrangler rollback          # revert last deployment
npx wrangler tail ecu-tuning-api  # live logs
```
