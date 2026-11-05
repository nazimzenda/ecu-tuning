# Tools & Technologies — ECU Tuning Service

> Verified against code (audit 2026-11-05). Status legend: **installed** = in node_modules · **declared** = referenced in config/code but not functional · **configured** = config present · **running** = verified working at runtime. Nothing is currently running on the host (audit was static).

## Master table

| Tool | Role | Why | What it needs | Connected components | Classification | Status |
|---|---|---|---|---|---|---|
| Node.js (host v26.8.1 / container node:18-alpine) | Runtime | Runs all 3 servers | — | all `.js` | development | installed; container 18 = **vuln-fix blocker** |
| Express 4.21.2 | Web framework | Routing/middleware in all 3 servers | — | server.js, client-server.js, admin-server.js | backend | installed; 4.22.3 in-range fix not applied |
| sqlite3 5.1.7 | SQLite driver | Order persistence (`orders` table) | writable `database.sqlite` (path via `DATA_DIR`) | database.js | database | installed; running in SQLite mode |
| Firebase Admin SDK 13.6.0 | Firestore/Storage access | Optional cloud storage mode | `GOOGLE_SERVICE_ACCOUNT_JSON`, `FIREBASE_STORAGE_BUCKET`, `USE_FIREBASE=1` | firebase-admin-init.js, db/firestore-adapter.js, migration | database | installed; mode **declared but broken** |
| Firestore + Storage | Cloud DB/files | Alternative to SQLite/uploads | Firebase project `ecu-tuning-8a2e0`; rules fix | firestore.rules, storage.rules | database | declared; **broken** (rules expired/deny-all, gating mismatch) |
| Cloud Functions (`functions/`) | Serverless functions | None — zero exported callables | — | functions/ | backend | declared, **not running** |
| Data Connect (`dataconnect/`) | Cloud SQL API layer | None — schema unused | — | dataconnect/, src/dataconnect-admin-generated/ | database | declared, **not running** |
| multer 1.4.5-lts.2 | Multipart uploads | Receives ECU + modified files (diskStorage, 50 MB, ext filter) | writable `uploads/` | server.js routes | backend | installed; **deprecated line** |
| nodemailer 7.0.10 | SMTP email | Fallback transport (Gmail/any SMTP) | `SMTP_HOST/PORT/SECURE/USER/PASS`, `EMAIL_FROM` | server.js email functions | external | installed; 21 advisories, fix needs Node ≥20 |
| Resend 6.5.2 | Email API | Primary email transport | `RESEND_API_KEY` | server.js email functions | external | installed (⚠️ engines ≥20 vs container 18) |
| Twilio 4.23.0 | WhatsApp API | "File ready" WhatsApp message | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_NUMBER` | server.js WhatsApp function | external | installed; falls back to wa.me link |
| uuid 9.0.1 | ID generation | Upload filenames, session tokens | — | server.js, adapters, migration | backend | installed |
| cors 2.8.5 | CORS middleware | Cross-origin policy (⚠️ misconfigured `*`+credentials) | `ALLOWED_ORIGINS` | server.js | security | installed |
| compression 1.8.1 | Response compression | Bandwidth | — | all 3 servers | backend | installed (HIGH advisory, fix 1.8.2) |
| fs-extra 11.3.2 | File utilities | ensureDir/move/pathExists for uploads | — | server.js, database.js, migration | backend | installed |
| path 0.12.7 | (npm package) | **None — inert junk** (Node builtin shadows it) | — | — | backend | installed; should be removed |
| nginx | Reverse proxy | Routes `/`, `/admin`, `/api/` on :8080; 60M body limit | nginx.conf | all 3 node servers | infrastructure | configured (in Docker image only) |
| Docker | Containerization | Single-container image (node:18-alpine + nginx + 3 procs) | Dockerfile | all | infrastructure | configured; ⚠️ no HEALTHCHECK, no process supervision |
| docker-compose | Multi-service deploy | 3 services (api/client/admin) | docker-compose.yml (+ .windows.yml) | all | deployment | configured; **broken UI→API path (FE-002)** |
| Railway | PaaS deployment | Production hosting (DOCKERFILE builder + Volume) | railway.json; `RAILWAY_PUBLIC_DOMAIN` | Dockerfile | deployment | declared |
| Git + GitHub | Version control | Repo hosting | — | — | development | installed |
| PowerShell scripts (`scripts/*.ps1`) | Ops helpers | start/stop servers + emulators, port checks, smoke | Windows host | dev workflow | development | declared; Windows-only, unusable on Linux/Railway |
| CI | — | ❌ **No CI** — `.github/` has only copilot-instructions | — | — | deployment | missing |
| Monitoring | — | ❌ **None** — console logs only; no health endpoints beyond `/`; no HEALTHCHECK in Dockerfile | — | — | monitoring | missing |
| Redis / k8s / PostgreSQL/MySQL | — | ❌ not present in code (Postgres only a future target per user) | — | — | infrastructure | missing |

## Classification summary

| Category | Tools |
|---|---|
| development | Node.js, Git/GitHub, PowerShell scripts, nodemon (dev dep) |
| backend | Express, multer, uuid, compression, fs-extra, cors, path (junk), Cloud Functions (declared) |
| frontend | none (vanilla HTML/CSS/JS) |
| database | sqlite3, Firebase Admin/Firestore, Data Connect (declared) |
| infrastructure | nginx, Docker |
| deployment | docker-compose, Railway, Procfile (broken), docker-start.ps1 |
| security | cors (misconfigured), Firestore/Storage rules (broken) |
| monitoring | none (console logs only) |
| external | Resend, nodemailer (SMTP), Twilio WhatsApp, Firebase Storage |
