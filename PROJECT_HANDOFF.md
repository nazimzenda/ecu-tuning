# ECU Tuning Service — Project Handoff (resume here)

> For the NEXT AI agent. Read `.github/copilot-instructions.md` first, then this file.
> Stack: Node + Express + SQLite (default) / Firestore (optional) + Resend / Nodemailer + Twilio + multer.
> No secret values below — key names only.

## 1. Project identity

- Name: `ecu-tuning-service` v1.0.0 (`package.json`); README header says 2.0.0.
- Repo: `https://github.com/nazimzenda/ecu-tuning.git`, branch `master`.
- Live demo: Railway + SQLite + Resend (per README).
- Deps (`package.json`): `express ^4.18.2`, `sqlite3`, `multer ^1.4.5-lts.1` (installed `1.4.5-lts.2`, deprecated 1.x line), `resend`, `nodemailer`, `twilio`, `cors`, `compression`, `uuid`, `fs-extra`, `firebase-admin`.

## 2. Architecture (3 servers)

| Server | File | Port (default) | Serves |
|---|---|---|---|
| API | `server.js` | 4000 (`API_PORT`) | Orders CRUD, uploads/downloads, admin auth, email/WhatsApp |
| Client UI | `client-server.js` | 3000 (`CLIENT_PORT`) | Static `public/` + runtime `/config.js` |
| Admin UI | `admin-server.js` | 3001 (`ADMIN_PORT`) | `public/admin.html` + `/config.js` (API base URL injection) |

- DB layer: `database.js` (SQLite schema + helpers: `createOrder`, `getAllOrders`, `getOrder`, `updateOrderStatus`, `updateOrderModifiedFile`, `deleteOrder`) + `db/index.js` (adapter switch) + `db/firestore-adapter.js` (`USE_FIREBASE=1`).
- Files: `uploads/` (originals), `uploads/modified/` (tuned outputs). Both exist locally.
- Frontend: `public/` → `index.html`, `admin.html`, `research.html`, `app.js`, `admin.js`, `research.js`, `styles.css`, `research.css`, `favicon.svg`, `hero-bg.png`.
- All servers use gzip (`compression`) + static caching (1 day in prod).

## 3. API table (base = API server)

| Method | Endpoint | Auth | Notes |
|---|---|---|---|
| `POST` | `/api/orders` | no | Multipart upload (multer, 50 MB, `.bin .hex .ori .winols .dam`) |
| `GET` | `/api/orders` | admin | List all orders |
| `GET` | `/api/orders/:id` | admin | Single order |
| `PUT` | `/api/orders/:id/status` | admin | `pending → processing → completed` |
| `POST` | `/api/orders/:id/modified` | admin | Upload tuned file → sets COMPLETED + emails customer w/ attachment |
| `DELETE` | `/api/orders/:id` | admin | Remove order |
| `GET` | `/api/orders/:id/download/original` | — | Original file |
| `GET` | `/api/orders/:id/download/modified` | — | Tuned file |
| `GET` | `/` | no | Health check (API status) |
| `POST` | `/api/admin/login` | password | Returns `sessionId` |
| `POST` | `/api/admin/logout` | session | Invalidates session |

Admin session: in-memory `Map` in `server.js` with a 12-hour sliding expiry (`ADMIN_SESSION_TTL_MS`); pass as `x-admin-session` header or `?session=` query param. Lost on restart.

## 4. Env keys ONLY (never values)

```
USE_FIREBASE            # 0=SQLite (default) | 1=Firestore
ADMIN_PASSWORD          # required in production (dev fallback: admin123)
API_PORT CLIENT_PORT ADMIN_PORT   # defaults 4000 / 3000 / 3001
RESEND_API_KEY EMAIL_FROM ADMIN_EMAIL ADMIN_URL
SMTP_HOST SMTP_PORT SMTP_SECURE SMTP_USER SMTP_PASS
  # (aliases also read: EMAIL_USER/GMAIL_USER, EMAIL_PASS/EMAIL_PASSWORD/GMAIL_PASS)
TWILIO_ACCOUNT_SID TWILIO_AUTH_TOKEN TWILIO_WHATSAPP_NUMBER
  # (README documents TWILIO_WHATSAPP_FROM — code reads TWILIO_WHATSAPP_NUMBER; set both)
DATA_DIR                # Railway volume mount /app/data; else repo dir
ALLOWED_ORIGINS         # comma-separated CORS list (dev allows any localhost by default)
ADMIN_SESSION_TTL_MS    # admin session sliding expiry, default 12h
CLIENT_API_BASE_URL     # empty in production behind nginx (same origin)
ADMIN_API_BASE_URL      # empty in production behind nginx (same origin)
GOOGLE_SERVICE_ACCOUNT_JSON FIREBASE_STORAGE_BUCKET
NODE_ENV
```

- Servers load `.env` automatically via `load-env.js` + `dotenv` (v2.1.0+). Shell-exported variables still take priority.
- Start everything with `npm run start:all`; `npm test` runs the integration suite against a temp data directory.

## 5. Local run

```bash
npm install
cp .env.example .env        # set ADMIN_PASSWORD
npm run start:all           # supervises API + client + admin
# or individually: npm run start:api / start:client / start:admin
# tests: npm test
```

- Windows helpers: `scripts/start-clean.ps1` (stop → start all), `stop-all.ps1`, `check-ports.ps1` (run **before** start), `start-clean-debug.ps1` (crash capture), `e2e-smoke.ps1` (endpoint smoke), `backup-before-migrate.ps1`.
- Emulators (only for Firestore path): `npm run emulators` → UI `http://localhost:4005`, Firestore `8080`, Auth `9099`, Storage `9199`.
- Access: client `http://localhost:3000`, admin `http://localhost:3001` (password from `ADMIN_PASSWORD`), API `http://localhost:4000`.

## 6. Deployment

- **Railway (recommended):** `railway.json` (DOCKERFILE builder, restart ON_FAILURE×10). Set `ADMIN_PASSWORD, DATA_DIR=/app/data, USE_FIREBASE=0, RESEND_API_KEY, ADMIN_EMAIL, NODE_ENV=production`. Attach volume at `/app/data`. Auto-deploys on push to `master`. Resend required (SMTP ports blocked on Railway).
- **Docker:** `Dockerfile` (node:22-alpine + nginx, EXPOSE 8080, supervised by `scripts/start-all.js`, healthcheck `/healthz`). `docker-compose.yml` (api/client/admin + healthcheck; admin maps `${ADMIN_PORT:-3001}:3001`). `ADMIN_PASSWORD=... docker compose up`.
- **Render/Heroku:** via `Procfile` (`node server.js & node client-server.js & node admin-server.js`).
- **Firebase (optional):** `USE_FIREBASE=1` + `GOOGLE_SERVICE_ACCOUNT_JSON` + `FIREBASE_STORAGE_BUCKET`. Migrate: backup first, then `npm run migrate:firestore [-- --dry]`. Emulator UI moved to 4005 to avoid API collision.

## 7. Current state (verified 2026-11-06, v2.1.0)

- Test suite: `npm test` → 14/14 passing; `npm run check` passes.
- Dependencies: Express 4, multer 2, sqlite3 6, firebase-admin 14, helmet 8, express-rate-limit 8, dotenv 18. `npm audit` reports 0 vulnerabilities.
- Security: Helmet headers, upload/login rate limiting, admin session expiry, production `ADMIN_PASSWORD` guard, sanitized filenames, escaped notification emails.
- Correctness: orphan uploads cleaned up, missing-order modified uploads return 404, status allowlist enforced, SQLite stores `file_download_url` + `modified_file_download_url`, Firestore stores `ecu_reference`.
- Deployment: Node 22 Docker image; production API URLs default to same origin; CI deploy jobs skip when Cloudflare secrets / D1 config are absent.
- Docs: `.env.example` added; README/API tables corrected.

## 8. Known gaps / next DevOps tasks

1. Attach a persistent Railway volume at `/app/data` (`DATA_DIR=/app/data`) and schedule SQLite/uploads backups.
2. Admin sessions are still in-memory — use Redis/JWT if the API is scaled to more than one process.
3. Resend domain verification is still required for arbitrary recipients; set `ADMIN_EMAIL`.
4. Twilio WhatsApp remains optional/unconfigured; set `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` and `TWILIO_WHATSAPP_NUMBER`.
5. Add structured logging + rotation if traffic grows (currently console logs).
6. Cloudflare Workers deploy requires a real D1 `database_id` and the 4 Worker secrets in `workers/README-deploy.md`.
7. No CSP yet — the pages intentionally use inline styles/scripts and third-party map tiles; add a nonce-based CSP if those are refactored.

## 9. Instructions for next AI

1. Read `.github/copilot-instructions.md`, then `DIRECTORY_STRUCTURE.md`, `ARCHITECTURE.md`, `DEPLOYMENT.md`, `MAINTENANCE.md`.
2. `check-ports` before start; `stop-all` on EADDRINUSE; `start-clean-debug` on crash (`-1073741510` → AV/Event Viewer).
3. Backup `database.sqlite` (`backup-before-migrate.ps1`) before any migration; schema changes via `database.js` with safe `ALTER TABLE`.
4. New endpoints → small handlers in `server.js` + README help text; file-type changes → update multer allowlist in `server.js` + `public/app.js` validation.
5. Never commit `.env` / `service-account.json`; env keys only in docs/PRs.

## 10. Interface points (will be modified/added)

### 10.1 Client portal (`public/index.html` + `app.js` 107 lines)

| Area | Selectors / IDs | Notes |
|---|---|---|
| Navbar | `.navbar`, `.nav-brand` | Brand + Home link |
| Hero | `.hero-title`, `.hero-subtitle` | Headline text |
| Upload card | `.upload-card`, `#uploadForm` | Main order form |
| Fields | `#customerName`, `#customerEmail`, `#customerPhone` (pattern `^\+[1-9]\d{1,14}$`), `#vehicleInfo`, `#service` | Phone optional w/ country code |
| Service opts (7) | `DPF Removal`, `EGR Delete`, `DTC Removal`, `AdBlue Delete`, `VMAX Remove`, `Stage 1 Tune`, `Custom` | `<select id="service">` values |
| Custom group | `#customServiceGroup`, `#customServiceDescription` | Shown only when `Custom`; `FormData.set` pattern |
| File | `#ecuFile` accept `.bin,.hex,.ori,.winols,.dam`, `#fileInfo` | Size shown in MB on change |
| Submit | `#submitBtn`, `#btnLoader`, `#message` | Loader toggle + result message |
| Showcase | `.services-grid`, `.service-card[data-service]` | 6 cards: `dpf/egr/dtc/stage1/adblue/vmax` |
| Process | `.process-section`, `.process-steps` | 3 static steps |

JS flow (`app.js`): `change`→toggle custom (`required` on/off) · `change`→`#fileInfo` · `submit`→`POST API_BASE_URL/api/orders` via `FormData`.

### 10.2 Admin panel (`public/admin.html` + `admin.js` 651 lines)

| Area | Selectors / IDs | Notes |
|---|---|---|
| Login | `#loginSection`, `#loginForm`, `#adminPassword`, `#loginMessage` | `POST /api/admin/login` → `sessionId` |
| Panel | `#adminPanelSection` (hidden till login, `localStorage adminSessionId`) | `x-admin-session` header / `?session=` |
| Stats | `.stats-grid`, `.stat-card`, `#totalOrders`, `#pendingOrders`, `#processingOrders`, `#completedOrders` | Clickable → `filterStatus` |
| Search/list | `#searchInput` `oninput=searchOrders` → `searchQuery` (name/email/vehicle/service), `#ordersList` | Client-side filter |
| Modal | `#orderModal`, `#modalTitle`, `#modalBody`, `.modal-close` | Detail + upload views |
| Buttons | `#refreshBtn`, `#logoutBtn` | Reload / `POST /api/admin/logout` |

JS globals: `orders[]`, `adminSessionId`, `filterStatus`, `searchQuery`. Functions: `loadOrders`, `renderStats`+click filter, `renderOrders`, `searchOrders`, `viewOrderDetails` (6 color sections: status/vehicle/service/customer/file/actions), `updateStatus`, `showUploadModal`/`uploadModifiedFile` (`#uploadModifiedForm`/`#modifiedFile` → `POST /:id/modified`), `downloadOriginal`/`downloadModified`, `deleteOrder`.

### 10.3 Styling/theme

- `styles.css` (client + admin shared) and `research.css` (lead workspace). Vars: `--p-*` design tokens mapped to legacy `--gold`, `--black`, `--dark-*`, `--gray-*`, `--success`.
- Classes: `.upload-card`, `.service-card`, `.stat-card`, `.modal`, `.btn-primary`/`.btn-secondary`/`.btn-danger`.
- `prefers-reduced-motion` + GPU transforms; 1-day static cache in prod.

### 10.4 Where to modify/add next

| Change | Touch |
|---|---|
| New form field | `index.html` + `app.js` validation + `server.js` multer/DB + `admin.html`/`admin.js` modal |
| New service | `<select>` options + `services-grid` card + server allowlist |
| New admin filter/stat | `stats-grid` card + `filterStatus` logic |
| New order action | Modal buttons + `window.*` function + `server.js` endpoint |
| New theme | CSS vars in `styles.css` |
| Runtime API URL | `/config.js` `window.API_BASE_URL` (`client-server.js`/`admin-server.js` inject) |
