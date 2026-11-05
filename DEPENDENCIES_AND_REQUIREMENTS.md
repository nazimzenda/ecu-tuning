# Dependencies & Requirements — ECU Tuning Service

> Verified against code/lockfile (audit 2026-11-05). Versions = installed (lockfile); "declared" range in parentheses where different.

## 1. Component dependency table

| Component | Required dependency | Version | Purpose | Free alternative |
|---|---|---|---|---|
| API framework | express | 4.21.2 (^4.18.2) | Routing/middleware | Fastify, Hono |
| CORS | cors | 2.8.5 (^2.8.5) | Cross-origin policy | express-cors built-ins |
| Compression | compression | 1.8.1 (^1.8.1) | Response gzip | nginx gzip (already present) |
| Uploads | multer | 1.4.5-lts.2 (^1.4.5-lts.1) | Multipart file handling — **deprecated line** | multer 2.x, busboy |
| SQLite | sqlite3 | 5.1.7 (^5.1.6) | Order persistence | **Turso/libSQL or Cloudflare D1** |
| Cloud DB (optional) | firebase-admin | 13.6.0 | Firestore/Storage mode — **declared but broken** | **Supabase or Neon** |
| Cloud SQL (declared) | @dataconnect/admin-generated | file: 0.0.1 | **Unused** generated SDK | (remove) |
| Email API | resend | 6.5.2 (^6.5.2) | Primary email transport | **Resend free tier**, Mailgun free |
| SMTP | nodemailer | 7.0.10 (^7.0.10) | Fallback email | **Resend free tier** |
| WhatsApp | twilio | 4.23.0 (^4.19.0) | WhatsApp notifications | **no free equivalent** (honest) — wa.me fallback link exists |
| IDs | uuid | 9.0.1 (^9.0.1) | Filenames/sessions | crypto.randomUUID (built-in) |
| File utils | fs-extra | 11.3.2 (^11.1.1) | ensureDir/move | fs/promises (built-in) |
| Path (junk) | path | 0.12.7 | **Inert** — remove | Node built-in `path` |
| Dev runner | nodemon | 3.x | Dev auto-restart | node --watch (built-in) |
| Reverse proxy | nginx | (alpine pkg) | Routing on :8080 | Caddy, Traefik |
| Hosting | Railway | — | Production PaaS | **Koyeb, Adaptable, Cloudflare (Workers/Pages)** |
| Containers | Docker + compose | — | Local/deploy packaging | Podman |

## 2. Runtime versions

| Runtime | Status |
|---|---|
| Node.js ≥ 18 | ✅ current container (`node:18-alpine`) — **blocks most vuln fixes** |
| Node.js ≥ 20 | 🚧 recommended floor for nodemailer/sqlite3/twilio/resend fixes |
| Node.js ≥ 22 | 🚧 needed for firebase-admin 14.x; recommended target (LTS) |
| Host machine | Node v26.8.1 (dev only) |

## 3. Packages

39 audit vulnerabilities (root): 2 low / 13 moderate / 19 high / 5 critical. Key direct-dep issues: nodemailer (21 advisories, fix needs ≥10.1.4 = Node ≥20), express (transitive, fixed in 4.22.3), compression (fixed in 1.8.2), multer deprecated, firebase-admin tree (biggest contributor), twilio→axios (~40). Full detail: `~/.fd-plan/ecu-tuning/technical-audit/findings/dependencies.md`.

## 4. Database & storage

| Item | Requirement | Type |
|---|---|---|
| SQLite file | `database.sqlite` (writable; path via `DATA_DIR`) | Mandatory (default mode) |
| Uploads dir | `uploads/` (+ `uploads/modified/`) on persistent disk | Mandatory |
| Firestore + Storage | `USE_FIREBASE=1` + `GOOGLE_SERVICE_ACCOUNT_JSON` + `FIREBASE_STORAGE_BUCKET` | Optional — **broken** |
| Volume | Railway: mount Volume at `DATA_DIR` | Prod-only |

## 5. Environment variables (names only)

| Variable | Classification |
|---|---|
| `ADMIN_PASSWORD` | Mandatory (prod) — ⚠️ weak default `admin123` if unset |
| `ADMIN_EMAIL` | Mandatory for admin alerts (silently skipped otherwise) |
| `EMAIL_FROM` | Mandatory for outbound email |
| `RESEND_API_KEY` | Prod-only (primary email) — optional if SMTP configured |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`/`EMAIL_USER`/`GMAIL_USER`, `SMTP_PASS`/`EMAIL_PASS`/`EMAIL_PASSWORD`/`GMAIL_PASS` | Prod-only (fallback email) |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_NUMBER` | Optional (WhatsApp; wa.me fallback otherwise) |
| `NODE_ENV` | Prod-only (`production` triggers same-origin API base) |
| `API_PORT` (4000), `CLIENT_PORT` (3000), `ADMIN_PORT` (3001), `PORT` | Optional |
| `ADMIN_URL`, `RAILWAY_PUBLIC_DOMAIN` | Optional |
| `USE_FIREBASE`, `GOOGLE_SERVICE_ACCOUNT_JSON`, `FIREBASE_STORAGE_BUCKET` | Optional (Firebase mode — broken) |
| `ALLOWED_ORIGINS`, `CLIENT_API_BASE_URL`, `ADMIN_API_BASE_URL`, `DATA_DIR` | Optional |
| `FIRESTORE_EMULATOR_HOST`, `FIREBASE_AUTH_EMULATOR_HOST`, `FIREBASE_STORAGE_EMULATOR_HOST` | Dev-only (set by PowerShell scripts) |

## 6. API credentials & external services

| Credential | Source | Optional? |
|---|---|---|
| Resend API key | `RESEND_API_KEY` | ✅ optional when `USE_FIREBASE=0` + SMTP, or no email |
| Twilio SID / auth token | `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` | ✅ optional (wa.me fallback) |
| SMTP credentials | `SMTP_USER` / `SMTP_PASS` | ✅ optional |
| Firebase service account | `GOOGLE_SERVICE_ACCOUNT_JSON` or `./service-account.json` | ✅ optional when `USE_FIREBASE=0` |

## 7. Storage requirements

- `uploads/` must be persistent (Railway Volume; Docker bind mount / named volume).
- No CDN/object-store requirement in SQLite mode.

## 8. Network & ports

| Port | Used by | Exposure |
|---|---|---|
| 8080 | nginx (single-container entry) | public |
| 4000 | API | internal (or public in dev) |
| 3000 / 3001 | client / admin | internal (or public in dev) |
| 5001, 8080, 9099, 9199, UI 4005 | Firebase emulators | local dev only |

## 9. Domain & SSL

- Railway terminates TLS at the edge; no TLS config in nginx.conf (no `listen 443`, no HSTS/CSP headers).
- Custom domain: optional (`RAILWAY_PUBLIC_DOMAIN` referenced in code).

## 10. External services summary

| Service | Purpose | Status |
|---|---|---|
| Resend | transactional email | configured if key present |
| SMTP provider (e.g., Gmail) | fallback email | configured if host set |
| Twilio | WhatsApp | configured if credentials present |
| Firebase (Firestore/Storage/Functions/DataConnect) | optional cloud mode | **declared, broken / not running** |
