# Backend Documentation — ECU Tuning Service

> Verified against code (audit 2026-11-05). Legend: ✅ = existing/verified · ❌ = missing · 🚧 = proposed (not implemented). Firebase mode = **declared but broken**; `functions/` + `dataconnect/` = **declared, not running**.

## 1. Component overview

| Component | Technology | Role | What it does | What it needs |
|---|---|---|---|---|
| API server | Node.js + Express 4.21.2 (`server.js`, 801 lines, ~31 KB) | All business logic | 11 routes: health, admin login/logout, order CRUD + downloads, modified-file upload; notifications | `ADMIN_PASSWORD` set; `uploads/` writable; email/Twilio creds optional |
| Client UI server | Express (`client-server.js`, 52 lines) | Static hosting | Serves `public/`, injects `/config.js`, SPA fallback to `index.html` | `public/` directory; `CLIENT_PORT` (default 3000) |
| Admin UI server | Express (`admin-server.js`, 74 lines) | Static hosting | Serves `admin.html`, `/config.js`, static assets | `public/` directory; `ADMIN_PORT` (default 3001) |
| SQLite adapter | `sqlite3` (`database.js`, 195 lines) | Persistence (default) | Creates table `orders`, 6 helpers (`init`, `createOrder`, `getAllOrders`, `getOrder`, `updateOrderStatus`, `updateOrderModifiedFile`, `deleteOrder`), runtime ALTER migrations | Local `database.sqlite` file (path from `DATA_DIR`) |
| Firestore adapter | `firebase-admin` (`db/firestore-adapter.js`) | Persistence (optional) | Same helpers over Firestore + `uploadLocalFileToStorage` | `USE_FIREBASE=1` + Firebase credentials — **broken**: gating mismatch (BUG-006), deny-all storage rules (BUG-008), null-timestamp ordering (BUG-007) |
| Adapter loader | `db/index.js` | Persistence selection | Picks SQLite vs Firestore | Credential gate **inconsistent** with `server.js` (OR vs AND — BUG-006) |
| Firebase bootstrap | `firebase-admin-init.js` | Firebase Admin SDK init | Loads service account (env JSON or `./service-account.json`, else application-default creds) | `GOOGLE_SERVICE_ACCOUNT_JSON`, `FIREBASE_STORAGE_BUCKET` |
| Migration script | `migration/migrate-sqlite-to-firestore.js` | One-shot data migration | Copies orders + files to Firestore/Storage (`--dry` flag) | Both adapters working; per-row error recovery ❌ missing (BUG-016) |
| Cloud Functions | `functions/` | — | ❌ **Declared, not running**: zero exported callables; genkit sample missing deps (BUG-018) | n/a |
| Data Connect | `dataconnect/` + generated SDK | — | ❌ **Declared, not running**: schema (User/Vehicle/Tune/…) unrelated to `orders`; SDK installed but never imported | n/a |

## 2. Framework

- **Express 4.21.2** (installed; `^4.18.2` declared) — ✅ implemented. Single `app` in each of the 3 servers. CommonJS, no TypeScript build.
- **No dotenv** — `.env` exists but nothing loads it ❌ (env must come from shell/Docker/Railway).
- **No controllers / services / repositories split** — routes, validation, storage, and notification logic are all inline in `server.js` (monolith, ✅ by design, ⚠️ maintainability).

## 3. Entry points (3 processes)

| Entry | Port | Start command (Dockerfile CMD) | Notes |
|---|---|---|---|
| `server.js` | 4000 (`API_PORT`) | `node server.js` | `db.init()` before listen; exits on DB failure |
| `client-server.js` | 3000 (`CLIENT_PORT`) | `node client-server.js` | EADDRINUSE handler present |
| `admin-server.js` | 3001 (`ADMIN_PORT`) | `node admin-server.js` | Only server with global error handlers; compose and nginx both use 3001 |

All three run inside one container (nginx + `sh -c` chaining) or as 3 compose services. No process supervisor (❌ no PM2/systemd; `wait` returns 0 even if all crash).

## 4. API routes & endpoints (server.js, port 4000)

| # | Method | Path | Purpose | Auth |
|---|---|---|---|---|
| 1 | GET | `/` | Health JSON `{status, service, version}` | none |
| 2 | POST | `/api/admin/login` | Password check → returns `{success, sessionId}` | password `ADMIN_PASSWORD` (❌ no rate limiting) |
| 3 | POST | `/api/admin/logout` | Removes session | `x-admin-session` |
| 4 | POST | `/api/orders` | Create order (multipart `ecuFile`) | none |
| 5 | GET | `/api/orders` | List all orders (❌ no pagination) | `requireAdmin` |
| 6 | GET | `/api/orders/:id` | Single order | `requireAdmin` |
| 7 | PUT | `/api/orders/:id/status` | Update status (❌ no enum validation) | `requireAdmin` |
| 8 | POST | `/api/orders/:id/modified` | Upload modified file (`modifiedFile`), set status `completed`, notify | `requireAdmin` |
| 9 | GET | `/api/orders/:id/download/original` | Download/redirect original file | `requireAdmin` (also `?session=`) |
| 10 | GET | `/api/orders/:id/download/modified` | Download/redirect modified file | `requireAdmin` (also `?session=`) |
| 11 | DELETE | `/api/orders/:id` | Delete order + local files (Firebase blobs orphaned — BUG-015) | `requireAdmin` |

Client server routes: `/config.js`, static `public/`, `*` → `index.html`. Admin server routes: `/config.js`, static assets regex, `*` → `admin.html`.

## 5. Business logic (all in `server.js`)

| Flow | Steps (verified) |
|---|---|
| Order creation | multer save → validate presence + 12-service allowlist + "Autres" description → (Firebase branch) → `db.createOrder` → fire-and-forget admin email → JSON reply |
| Modified-file upload | multer save → move to `uploads/modified/` → DB update → status `completed` → fire-and-forget customer email + WhatsApp |
| Notifications | Provider chosen at boot: Resend (if `RESEND_API_KEY`) else SMTP transporter. ❌ No queue/retry/persistence — failures are console-only (BUG-024). ❌ Firebase mode: email claims attachment that is never attached (BUG-005). ❌ Resend 10 MB attachment cap vs 50 MB uploads (BUG-014) |
| Validation | Only presence checks + allowlist (❌ no email format / length caps — BUG-020; ❌ extension-only file filter — BUG-004; ❌ path traversal via `originalname` — BUG-003) |

## 6. Database & models

- **SQLite** (`database.js`): single table `orders`, **17 columns**: `id` (PK autoincrement), `original_file_name`, `stored_file_name`, `file_path`, `service`, `custom_service_description`, `vehicle_info`, `customer_name`, `customer_email`, `customer_phone`, `status` (default `'pending'`), `modified_file_name`, `modified_stored_file_name`, `modified_file_path`, `created_at`, `updated_at`, `ecu_reference` (added via runtime ALTER).
- ❌ No indexes, no real migrations (3 swallowed-error ALTERs), no pagination.
- ⚠️ SQLite adapter **drops** `file_download_url` / `modified_file_download_url` (Firestore stores them — adapter asymmetry, BUG-017).
- **Firestore**: `orders` collection, auto doc IDs, `serverTimestamp()` (declared; broken per BUG-006/007).

## 7. Authentication & authorization

| Aspect | Implementation | Status |
|---|---|---|
| Credential | Single shared password from `ADMIN_PASSWORD`, **default `admin123`** (`server.js:110`) | ⚠️ BUG-001 |
| Login | `POST /api/admin/login`, plain string compare, no throttling/lockout | ❌ BUG-002 |
| Sessions | In-memory `Set` of UUIDs; **no expiry**; lost on restart | ⚠️ BUG-012 |
| Transport | Header `x-admin-session` **and** `?session=` query (used for downloads → leaks into logs/history) | ⚠️ BUG-012 |
| Scope | All admin routes behind `requireAdmin`; public: health, order create | ✅ |

🚧 Proposed: HMAC-signed expiring tokens, drop query-string auth, rate limit + lockout.

## 8. Middleware

| Middleware | Config | Status |
|---|---|---|
| `cors` | dynamic origin callback, default allowlist `['*']` + `credentials: true` | ⚠️ insecure AND non-functional combo (BUG-023) |
| `compression` | default | ✅ |
| `multer` | diskStorage → `uploads/`, filename `${uuidv4()}-${originalname}`, 50 MB limit, extension filter `.bin/.hex/.ori/.winols/.dam` | ⚠️ BUG-003/004/005 |
| Error handler | none | ❌ BUG-011 — multer errors/404s return HTML, breaking JSON contract |

## 9. Background workers / scheduled tasks

- Background workers: **none** ✅ (no queue; notifications are inline fire-and-forget).
- Scheduled tasks: **none** ✅ (no cron/agenda; no sweeper for orphaned files — BUG-010).

## 10. External APIs

| API | Library | When | Status |
|---|---|---|---|
| Resend | `resend` 6.5.2 | Admin alert + customer "file ready" email (if `RESEND_API_KEY`) | ✅ implemented (⚠️ engines require Node ≥20 vs container Node 18) |
| SMTP (Gmail/any) | `nodemailer` 7.0.10 | Fallback email transport | ✅ implemented |
| Twilio WhatsApp | `twilio` 4.23.0 (declared ^4.19.0) | "File ready" WhatsApp (only on modified upload) | ✅ implemented; falls back to `wa.me` link |
| Firebase Admin (Firestore/Storage) | `firebase-admin` 13.6.0 | Optional storage mode | ❌ declared but broken (BUG-005/006/007/008) |

## 11. Config files

| File | Role | Status |
|---|---|---|
| `package.json` | deps + scripts (`start`, `emulators`, `migrate:firestore`) | ✅ |
| `.env` | local env — **inert** (nothing loads it) | ⚠️ |
| `nginx.conf` | reverse proxy :8080 → 4000/3000/3001, 60M body limit | ✅ (⚠️ no TLS/security headers) |
| `firebase.json` / `firebase.emulators.json` | Firestore/storage rules + emulators (UI 4005, Firestore 8080, Auth 9099, Storage 9199) | ✅ |
| `firestore.rules` / `storage.rules` | rules — expired open / deny-all | ❌ |
| `Dockerfile`, `docker-compose*.yml`, `railway.json`, `Procfile` | deployment | ⚠️ (see infrastructure audit) |

## 12. Environment variables (names only — verified reads in code)

`USE_FIREBASE`, `GOOGLE_SERVICE_ACCOUNT_JSON`, `FIREBASE_STORAGE_BUCKET`, `ADMIN_PASSWORD`, `ADMIN_EMAIL`, `ADMIN_URL`, `DATA_DIR`, `API_PORT`, `CLIENT_PORT`, `ADMIN_PORT`, `NODE_ENV`, `PORT`, `RESEND_API_KEY`, `EMAIL_FROM`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER` (aliases `EMAIL_USER`/`GMAIL_USER`), `SMTP_PASS` (aliases `EMAIL_PASS`/`EMAIL_PASSWORD`/`GMAIL_PASS`), `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_NUMBER`, `ALLOWED_ORIGINS`, `CLIENT_API_BASE_URL`, `ADMIN_API_BASE_URL`, `RAILWAY_PUBLIC_DOMAIN`; dev scripts: `FIRESTORE_EMULATOR_HOST`, `FIREBASE_AUTH_EMULATOR_HOST`, `FIREBASE_STORAGE_EMULATOR_HOST`.

## 13. Dependencies

`express 4.21.2`, `cors 2.8.5`, `compression 1.8.1`, `multer 1.4.5-lts.2` (deprecated line), `sqlite3 5.1.7` (^5.1.6), `firebase-admin 13.6.0`, `nodemailer 7.0.10`, `resend 6.5.2`, `twilio 4.23.0` (^4.19.0), `uuid 9.0.1`, `fs-extra 11.3.2` (^11.1.1), `path 0.12.7` (inert — Node builtin shadows it), `@dataconnect/admin-generated` (file: dep, unused). Dev: `nodemon`. See `DEPENDENCIES_AND_REQUIREMENTS.md` for security/status detail.
