# PROJECT TECHNICAL AUDIT REPORT — ECU Tuning Service

> **Remediation note (2026-11-06, v2.1.0):** the P0/P1 items in this report have
> been addressed: production password fail-closed + login/upload rate limiting,
> escaped admin rendering, generated upload filenames, compose API URLs, JSON
> error middleware, Helmet headers + CORS allowlist, expiring sessions,
> download tokens removed from URLs, Firebase adapter parity fixes, Node 22,
> clean `npm audit`, 14 integration tests and a CI pipeline. Remaining items are
> listed in `PROJECT_HANDOFF.md` §8. This document is retained as the original
> audit record.

**Date:** 2026-11-05 · **Repo:** `/home/zenda/ecu-tuning` (git master @ `49f2037`, remote origin/master)
**Method:** read-only inspection. No project file was modified during this audit. Evidence gathered via: full codebase mapping, dependency/CVE research (npm audit), infrastructure static validation, backend/frontend deep review, security audit, non-mutating test validation, and a sandboxed live smoke test (disposable copy under `/tmp/opencode`).

**Evidence files:** `~/.fd-plan/ecu-tuning/technical-audit/findings/{mapper,backend,frontend,security,infrastructure,dependencies,tests}.md` and `~/.fd-plan/ecu-tuning/.codebase/architecture.md`.

---

## 1. Executive Summary

**Project:** "ECU File Modification Service Platform" — a customer-facing service where users submit ECU binary files (.bin/.hex/.ori/.winols/.dam) through a public order form, select a tuning service (12 French services: Stage 1, E85, FAP, EGR, FAPEGR, AdBlue, Utilitaire, ImmoOff, Recherche, Diagnostic, DTCOff, Autres), and an admin panel manages orders (approve/complete/delete, upload the "modified" file) with email (Resend/SMTP) and WhatsApp (Twilio) notifications.

**Stack:** Node.js / Express ×3 processes (API :4000, client :3000, admin :3001) behind nginx (:8080) in a single container for Railway; SQLite primary (optional Firestore via adapter); vanilla JS frontend in `public/`. Deployed via Dockerfile (single container) or docker-compose (3 containers).

**Overall technical condition:** The core order workflow **works in SQLite mode** (live-verified: health, login, order creation, validation, file storage). However, the project is **not production-ready**: security posture FAILS (2 CRITICAL, 8 HIGH security findings), the Firebase mode is broken end-to-end and failing silently, the docker-compose deployment ships frontends that cannot reach the API at all, and there is **0% automated test coverage**.

**Top 5 findings:**
1. **SEC-001 / FE-001 — Stored XSS in admin panel (CRITICAL).** Any anonymous customer can inject HTML/JS via unescaped order fields rendered with `innerHTML` (admin.js:261,571 + 13 more sinks). Executes in admin's browser with session in localStorage → admin takeover, all customer PII and ECU files. No CSP (SEC-005).
2. **BUG-001 / SEC-002 — Default admin password + no brute-force protection (CRITICAL).** `server.js:110` falls back to a weak default password (also in compose defaults), login has zero rate limiting/lockout (`server.js:217-227`).
3. **FE-002 / INFRA-001 — docker-compose deployments are dead on arrival (CRITICAL).** `NODE_ENV=production` forces empty `API_BASE_URL` → same-origin `/api/*` calls, but no proxy exists in compose topology → order form and admin login always fail.
4. **BUG-003 / SEC-007 — Filename path traversal (HIGH).** `uuid + originalname` naming guards only the first path segment; `path.join` collapses intermediate `..` segments → anonymous uploaders can write files outside `uploads/` — as root in the container.
5. **DEP-001/003 — Dependency rot (HIGH).** 39 root vulnerabilities (2L/13M/19H/5C — **worsened** from 36 recorded in Sep 2026), 45 in `functions/`; Node 18 base image is below the `engines` requirements of the fixed versions of nodemailer/firebase-admin/sqlite3/twilio/resend → the vuln state is **unfixable on Node 18**.

**General assessment:** A functional prototype with a fundamentally sound core flow (parameterized SQL, allowlisted services, sane JSON contract on the happy path), layered with: an unsafe trust boundary, a parallel Firestore code path with no adapter contract, a fire-and-forget notification architecture that generated 10+ blind-fix commits, deployment topologies that disagree with each other, and documentation that describes a different application than the code implements.

---

## 2. Project Inventory

### Technologies
| Layer | Technology | Evidence |
|---|---|---|
| Runtime | Node.js (Dockerfile: `node:18-alpine`; host dev v26.8.1) | Dockerfile:2 |
| API framework | Express 4 (installed 4.21.2) | package.json:26 |
| Database (primary) | SQLite via `sqlite3` driver 5.1.6 | package.json:33; database.js |
| Database (alt) | Firestore via firebase-admin 13.6.0 adapter | db/firestore-adapter.js |
| Uploads | multer 1.4.5-lts.2 (deprecated line) | package.json:29 |
| Email | resend 6.5.2 / nodemailer 7.0.10 / Gmail fallback | server.js:126-185 |
| Messaging | twilio 4.19.0 (WhatsApp) | server.js:182-185 |
| Frontend | Vanilla JS/HTML/CSS, no framework, no build | public/ |
| Firebase extras | Cloud Functions (functions/, TS), Data Connect (dataconnect/), Storage rules | functions/; dataconnect/ |
| Deploy | Dockerfile (nginx+3 node, :8080) / docker-compose ×3 / Railway DOCKERFILE builder / Procfile | Dockerfile:41; railway.json |
| Reverse proxy | nginx (single-container only) | nginx.conf |

### Components
- `server.js` (API, 11 routes): health, admin login/logout, order CRUD, uploads, downloads, delete.
- `client-server.js` (:3000): serves `public/` + `/config.js` injection.
- `admin-server.js` (:3001): serves admin UI (shares `public/`).
- `database.js` / `db/index.js` / `db/firestore-adapter.js`: SQLite + Firestore adapters.
- `firebase-admin-init.js`: Firebase bootstrap (used by server.js).
- `functions/`: Cloud Functions (deploys zero callables — dead infra).
- `dataconnect/`: Data Connect schema (never imported — dead infra).
- `migration/migrate-sqlite-to-firestore.js`: one-shot SQLite→Firestore script.

### Database
SQLite: single table `orders` (18 columns; `ecu_reference` added via runtime `ALTER TABLE` at database.js:69 — startup-time migration, no versioned migration system, no indexes). Firestore: `orders` collection, auto doc IDs. Data Connect schema defines 5 unused types (User, Vehicle, Tune, TuneShare, Comment).

### Configuration files
`.env` (gitignored, present locally; **inert** — no dotenv loaded anywhere), `firebase.json`, `firebase.emulators.json`, `firestore.indexes.json` (JSONC), `firestore.rules`, `storage.rules`, `nginx.conf`, `Dockerfile`, `docker-compose.yml`, `docker-compose.windows.yml`, `docker-start.ps1`, `Procfile`, `railway.json`, `.dockerignore`, `.gitignore`, `.firebaserc`, `functions/{package.json,tsconfig*.json,.eslintrc.js}`, `dataconnect/dataconnect.yaml`.

### Docs-vs-reality drift (verified, not assumed)
- Docs claim v2.0.0; `package.json` says 1.0.0 (ARCH-007).
- Docs describe 7 English services; code has 12 French services (server.js:130, index.html:100-112) (ARCH-002).
- ARCHITECTURE.md:224-240 invents columns (`vehicle_make/model/year/engine`, `service_type`); real schema has one `vehicle_info` column (ARCH-003).
- ARCHITECTURE.md:380-392 claims 3 customer emails; code sends admin-alert on create + customer email on modified upload only (ARCH-004).
- ARCHITECTURE.md:600 documents `POST /admin/login`; actual route is `POST /api/admin/login` (server.js:217) (ARCH-005).
- Env vars documented but never read: `TWILIO_WHATSAPP_FROM` (code uses `TWILIO_WHATSAPP_NUMBER`, server.js:185), `EMAIL_SERVICE`; `.env` itself never loaded (ARCH-006).
- DIRECTORY_STRUCTURE.md lists ~25 nonexistent files and calls the Dockerfile "multi-stage" (it isn't) (ARCH-008).

---

## 3. Architecture Analysis

### 3.1 High-level architecture

```
                          ┌──────────────────────────────────────────────┐
 Browser ──HTTPS──▶ nginx │ :8080 (single-container)                     │
                          │  /            → client :3000  (order form)   │
                          │  /admin/      → admin  :3001  (admin panel)  │
                          │  /api/        → api    :4000  (REST)         │
                          └───────────────┬──────────────────────────────┘
                                          │
                          ┌───────────────▼────────────────┐
                          │ API (server.js)                │
                          │  orders CRUD · uploads · email │
                          └──┬───────────────┬─────────────┘
                  SQLite mode │ USE_FIREBASE=0│ USE_FIREBASE=1 (broken)
                    ┌─────────▼───┐     ┌─────▼───────────────────────┐
                    │ database.js │     │ Firestore + Storage (adapter)│
                    │ database.   │     │ firestore.rules: EXPIRED    │
                    │ sqlite      │     │ storage.rules: deny-all     │
                    └─────────────┘     └─────────────────────────────┘
                 Email: Resend API → SMTP (Gmail) → Twilio WhatsApp (fire-and-forget)
```

### 3.2 Component responsibilities

| Component | Responsibility | Dependencies | Failure points |
|---|---|---|---|
| server.js | All business logic: order lifecycle, auth, uploads, downloads, notifications | database.js or firestore-adapter, multer, email providers | No error middleware; fire-and-forget notifications; weak auth |
| client-server.js | Static client UI + `/config.js` API_BASE_URL injection | public/ | API_BASE_URL empty in production |
| admin-server.js | Static admin UI + `/config.js` | public/ (shared) | Same; `/admin/` MIME bug |
| database.js | SQLite CRUD (parameterized, good) | sqlite3 driver | Sync driver blocks event loop; drops `*_download_url` fields |
| db/firestore-adapter.js | Firestore CRUD | firebase-admin | No contract with SQLite adapter; broken chain |
| nginx | Routing/proxy | 3 upstreams on 127.0.0.1 | Not present in compose mode; no TLS/security headers |
| functions/, dataconnect/ | (nothing at runtime) | — | Dead infrastructure |

### 3.3 Data flow — order lifecycle

```
Customer: POST /api/orders (multipart ecuFile + service + vehicleInfo + contact)
  → multer diskStorage (uploads/<uuid>-<originalname>)  [50MB limit, ext filter]
  → ALLOWED_SERVICES check (12 FR services)
  → DB insert (SQLite: parameterized; Firestore: doc create)
  → fire-and-forget admin email notification (console-only failure visibility)
Admin: login (password → in-memory session token, no expiry)
  → GET /api/orders?session= (list) → approve/complete
  → upload modified file → customer email w/ attachment (fire-and-forget)
  → download original via ?session= query token
  → DELETE order (SQLite ok; Firebase mode orphans Storage blobs)
```

### 3.4 Deployment architecture

```
Mode A (Railway, DOCKERFILE builder): 1 container = sh PID1 → nginx + node×3 (& wait)
Mode B (docker-compose): api / client / admin containers; NO nginx → frontends cannot reach API (FE-002)
Mode C (Procfile): all 3 backgrounded, no wait → exits immediately (broken; unused)
```

### 3.5 Architectural weaknesses
1. **No adapter contract** between SQLite and Firestore (interface drift: field handling, ordering, side effects) — the root of the broken Firebase mode (BUG-005/006/007/008).
2. **Fire-and-forget observability** — notifications fail silently; 10+ commits since Sep 2026 are blind fixes to the same email saga (BUG-024).
3. **Three processes per container without supervision** — `sh` PID1, no SIGTERM forwarding, no restart detection (INFRA-002).
4. **Dual infrastructure (Firebase/DataConnect/Functions) is dead weight** — deployed artifacts that no runtime code uses (ARCH-009, INFRA-012).
5. **Configuration by environment guessing** — no shared config module; same knobs differ across servers/port chains (ARCH-006, INFRA-005).
6. **No tests, no CI, no lint gate** — all correctness rests on manual verification.

---

## 4. Detailed Technical Findings

### Findings Index

| ID | Severity | Status | One-line |
|---|---|---|---|
| BUG-001 | CRITICAL | Confirmed | Default admin password fallback |
| FE-001 | CRITICAL | Confirmed | Stored XSS in admin panel (15 sinks) |
| FE-002 | CRITICAL | Confirmed | Compose frontends cannot reach API |
| BUG-003 | HIGH | Confirmed | Filename path traversal on upload |
| BUG-005 | HIGH | Confirmed | Firebase email attachment silently dropped |
| BUG-006 | HIGH | Confirmed | AND/OR Firebase gate mismatch → broken adapter |
| BUG-007 | HIGH | Confirmed | Migrated orders invisible (orderBy null created_at) |
| BUG-008 | HIGH | Confirmed | Storage deny-all breaks admin downloads |
| BUG-002 | HIGH | Confirmed | No rate limiting on admin login |
| FE-004 | HIGH | Confirmed | /admin/ serves JS/CSS as text/html |
| FE-005 | HIGH | Confirmed | Multer errors → 500 HTML (live-confirmed) |
| FE-006 | HIGH | Confirmed | Modal backdrop close handler broken |
| FE-007 | HIGH | Confirmed | Session tokens in download URLs |
| SEC-004 | HIGH | Confirmed | Firestore world-accessible for ~1 year |
| SEC-005 | HIGH | Confirmed | No security headers / CSP |
| SEC-006 | HIGH | Confirmed | CORS * + credentials:true |
| DEP-001 | HIGH | Confirmed | 39 root vulns (2L/13M/19H/5C) |
| DEP-003 | HIGH | Confirmed | Node 18 blocks all vuln fixes |
| BUG-024 | MEDIUM | Confirmed | Fire-and-forget notifications |
| BUG-009 | MEDIUM | Confirmed | Email HTML unescaped user fields |
| BUG-011 | MEDIUM | Confirmed | No error middleware / JSON contract breaks |
| BUG-012 | MEDIUM | Confirmed | Sessions: memory-only, no expiry |
| BUG-013 | MEDIUM | Confirmed | No pagination on orders |
| BUG-014 | MEDIUM | Confirmed | 50MB upload vs Resend 10MB cap |
| BUG-015 | MEDIUM | Confirmed | DELETE orphans Storage blobs (Firebase) |
| BUG-017 | MEDIUM | Confirmed | SQLite drops *_download_url fields |
| FE-008 | MEDIUM | Confirmed | window.event (breaks Firefox) |
| FE-009 | MEDIUM | Confirmed | .show class has no CSS |
| FE-010 | MEDIUM | Confirmed | Dead file-label CSS / unstyled input |
| FE-011 | MEDIUM | Confirmed | Fake "Size" in admin modal |
| FE-012 | MEDIUM | Confirmed | Duplicate .modal CSS rule |
| FE-013 | MEDIUM | Confirmed | No upload progress/abort |
| SEC-007 | MEDIUM | Confirmed | Path traversal (see BUG-003) |
| SEC-008 | MEDIUM | Confirmed | No rate limit on order upload; email bombing |
| SEC-009 | MEDIUM | Confirmed | PII logged verbatim |
| SEC-010 | MEDIUM | Confirmed | Root container; world-readable mounts |
| SEC-011 | MEDIUM | Confirmed | SMTP rejectUnauthorized:false |
| SEC-012 | MEDIUM | Confirmed | Stack traces/paths to client |
| INFRA-002 | HIGH | Confirmed | sh PID1, no supervision |
| INFRA-004 | HIGH | Confirmed | No HEALTHCHECK in image |
| INFRA-005 | MEDIUM | Confirmed | Admin port chain 3001/3002 |
| INFRA-007 | MEDIUM | Confirmed | Fresh-clone compose crash loop |
| INFRA-008 | MEDIUM | Confirmed | nginx 60M vs multer 50M |
| DEP-002 | HIGH | Confirmed | 45 vulns in functions/ |
| DEP-004 | MEDIUM | Confirmed | multer 1.x deprecated line |
| DEP-006 | MEDIUM | Potential | file: dep breaks Docker npm ci |
| ARCH-001..008 | MED/LOW | Confirmed | Docs describe a different app |
| TST-001 | HIGH | Confirmed | 0% test coverage |
| TST-002 | MEDIUM | Confirmed | tsc -p functions FAIL (15 errors) |

### Finding ID: BUG-001 / SEC-002 / FE-003 (canonical)

- **Title:** Default admin password with no brute-force protection
- **Category:** Authentication / Security
- **Severity:** CRITICAL · **Status:** Confirmed
- **Affected file:** server.js:110, server.js:217-227, docker-compose.yml:13, .env
- **Affected component:** API auth boundary
- **Evidence:** `const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '<default>';` (literal in source); login handler does plaintext comparison with no delay, no attempt counter, no lockout, no logging.
- **Observed behavior:** If the operator skips one env var (compose default does exactly that), the admin API — including reading/deleting all orders and uploading "modified" files emailed to customers — is accessible with a publicly known default credential. Live smoke test confirms login works with a password supplied via env; nothing enforces changing it.
- **Root cause:** Convenience default in production code path + missing rate limiting.
- **Impact:** Full admin takeover, customer PII and ECU file integrity compromise.
- **Dependencies:** SEC-001 (XSS also yields admin session).
- **Recommended solution:** Fail startup when `ADMIN_PASSWORD` is unset/weak in production; add rate limiting + lockout + attempt logging; compare with `crypto.timingSafeEqual`.
- **Validation procedure:** Start server without ADMIN_PASSWORD in NODE_ENV=production → must refuse to start; brute-force script of 10 rapid attempts → must be throttled/blocked.

### Finding ID: FE-001 / SEC-001 (canonical)

- **Title:** Stored XSS in admin panel
- **Category:** Injection (A03) · **Severity:** CRITICAL · **Status:** Confirmed
- **Affected file:** public/admin.js:261, 571 (+13 more innerHTML sinks); fields originate from server.js:245 (no server-side sanitization)
- **Evidence:** Customer-controlled fields (`custom_service_description`, `customer_name`, `customer_email`, `vehicle_info`, even `original_file_name`) are interpolated into `innerHTML` without escaping. `escapeHtml()` exists but is applied only to `ecu_reference`.
- **Observed behavior:** Any anonymous visitor can submit an order containing `<script>`/`<img onerror>` in any of these fields; it executes when an admin views the order list/detail.
- **Root cause:** String-interpolation rendering with no output encoding and no CSP.
- **Impact:** Session theft (tokens in localStorage), admin takeover, data exfiltration — full platform compromise.
- **Dependencies:** SEC-005 (no CSP amplifies), SEC-003 (session in URL).
- **Recommended solution:** Server-side validation (length + reject control chars), client-side `textContent`/escape of every rendered field, CSP header.
- **Validation procedure:** Submit order with `<img src=x onerror=alert(1)>` in `customServiceDescription`; open admin panel; no execution, payload displayed as text.

### Finding ID: FE-002 / INFRA-001 (canonical)

- **Title:** docker-compose deployments cannot reach the API
- **Category:** Integration / Deployment · **Severity:** CRITICAL · **Status:** Confirmed
- **Affected file:** client-server.js:7-11, admin-server.js:14-18, docker-compose.yml:41-57
- **Evidence:** `API_BASE_URL` resolves to `''` when `NODE_ENV=production` (compose sets it). Compose has no nginx container, so same-origin `/api/*` requests hit the client/admin containers which proxy nothing.
- **Observed behavior:** In compose mode the order form's every `/api/orders` call 404s and admin login always fails → the platform is unusable.
- **Root cause:** Same-origin assumption baked into the frontend servers; compose topology lacks the reverse proxy that makes it true.
- **Impact:** Entire compose deployment path broken (and it's the documented self-host path).
- **Recommended solution:** Either add an nginx container to compose (route /api → api) or make `API_BASE_URL` explicitly configurable and default sensibly per topology.
- **Validation procedure:** `docker compose up` fresh clone → open client on :3000 → submit order → must succeed end-to-end.

### Finding ID: BUG-003 / SEC-007 (canonical)

- **Title:** Filename path traversal on upload
- **Category:** Security / Input validation · **Severity:** HIGH · **Status:** Confirmed
- **Affected file:** server.js:89-92 (diskStorage filename), multer internals (disk.js:37)
- **Evidence:** `filename: (req, file, cb) => cb(null, uuidv4() + '-' + file.originalname)` — the UUID prefix protects only the first segment; a crafted `originalname` like `../../pwn.bin` survives extension filtering (`.bin`) and `path.join(uploadsDir, name)` collapses the `..` segments.
- **Observed behavior:** Anonymous uploaders can write arbitrary-named files outside `uploads/` — executed as **root** (no `USER` in Dockerfile).
- **Root cause:** Trusting the multipart filename for filesystem composition instead of using the generated name alone.
- **Impact:** Arbitrary file write on server, up to host-level compromise via root container.
- **Recommended solution:** Discard `originalname` for storage entirely: store as `<uuid><ext>` and keep the original name only as a DB column.
- **Validation procedure:** Send multipart with `filename="../../x.bin"` → file must land inside uploads/ only.

### Finding ID: BUG-005

- **Title:** Firebase mode email attachment silently skipped
- **Category:** Integration · **Severity:** HIGH · **Status:** Confirmed
- **Affected file:** server.js:409, 589 (Storage path passed to mailer which expects local path)
- **Root cause:** Two storage backends, one email function with no branching.
- **Impact:** Customers receive "file attached" emails with no attachment in Firebase mode.

### Finding ID: BUG-006

- **Title:** Firebase gating mismatch (AND vs OR) loads broken adapter
- **Category:** Configuration · **Severity:** HIGH · **Status:** Confirmed
- **Affected file:** server.js:65 (AND: flag + credentials), db/index.js:4-7 + firebase-admin-init.js:35 (OR)
- **Evidence:** With `USE_FIREBASE=1` and missing credentials, server.js correctly stays SQLite, but db/index.js selects the Firestore adapter, whose init error is swallowed.
- **Impact:** Every order creation 500s with no actionable log. Two components disagreeing about the same decision.

### Finding ID: BUG-007

- **Title:** Migrated orders invisible in admin list
- **Category:** Data · **Severity:** HIGH · **Status:** Confirmed
- **Affected file:** firestore-adapter.js:43, migration/migrate-sqlite-to-firestore.js:49
- **Evidence:** Firestore query `orderBy('created_at')` excludes documents where `created_at` is null; migration inserts null timestamps.
- **Impact:** After migration, orders vanish from the admin panel (silent data "loss").

### Finding ID: BUG-008

- **Title:** Deny-all Storage rules break admin downloads in Firebase mode
- **Category:** Configuration · **Severity:** HIGH · **Status:** Confirmed
- **Affected file:** storage.rules (all false), server.js:434,460 (redirect to storage URL)
- **Impact:** Download links return 403 in Firebase mode — no customer can retrieve files.

### Finding ID: BUG-002

- **Title:** No rate limiting on admin login
- **Category:** Security · **Severity:** HIGH · **Status:** Confirmed
- **Affected file:** server.js:217-227
- **Impact:** Unlimited online brute force of the admin password (compounds BUG-001).

### Finding ID: FE-004

- **Title:** `/admin/` serves JS/CSS as text/html → panel dead
- **Category:** Frontend/nginx · **Severity:** HIGH · **Status:** Confirmed
- **Affected file:** nginx.conf:35-43, admin-server.js:43-59
- **Evidence:** `location /admin/ { proxy_pass http://admin/; }` — no extension routing; admin-server catch-all serves admin.html for `.js`/`.css` asset requests. Browsers refuse due to MIME mismatch → no JS/CSS.
- **Impact:** Admin panel non-functional behind nginx when assets are requested via `/admin/…` paths.

### Finding ID: FE-005 (live-confirmed)

- **Title:** Multer errors → 500 HTML, breaking JSON contract
- **Category:** Error handling · **Severity:** HIGH · **Status:** Confirmed (reproduced)
- **Affected file:** server.js:95-107 (no error middleware), app.js:77-91
- **Evidence (sandbox smoke test):** uploading a `.txt` file returned **HTTP 500** with an HTML stack-trace page (`Error: Invalid file type… at fileFilter (server.js:104)`) leaking absolute server paths. `response.json()` in app.js then throws → user sees "Network error" after uploading the whole file.
- **Root cause:** No Express error-handling middleware; default HTML error handler.
- **Impact:** Confusing UX, info disclosure (paths), broken error contract; oversize (>50MB) uploads behave the same. nginx allows 60M > multer's 50M (INFRA-008).
- **Recommended solution:** Error middleware returning JSON (`{error}`) with 400 for multer errors; align nginx/multer limits.

### Finding ID: FE-006

- **Title:** Modal backdrop close broken
- **Category:** Frontend · **Severity:** HIGH · **Status:** Confirmed
- **Affected file:** admin.js:125-129 (removes `show`) vs admin.js:395,680 (adds `active`)
- **Impact:** Modals can never be dismissed by clicking outside.

### Finding ID: FE-007 / BUG-012 / SEC-003 (canonical)

- **Title:** Session tokens: memory-only, never expire, passed via query string
- **Category:** Authentication · **Severity:** HIGH · **Status:** Confirmed
- **Affected file:** server.js:188,195,221-222; admin.js:341,345
- **Evidence:** Sessions are a `Set` of crypto-random UUIDs with no TTL; downloads use `?session=…` URLs.
- **Impact:** Tokens land in nginx access logs, browser history, Referer headers; a single leak grants indefinite admin access.

### Finding ID: SEC-004

- **Title:** Firestore world-readable/writable for ~1 year
- **Category:** Security · **Severity:** HIGH · **Status:** Confirmed
- **Affected file:** firestore.rules:15 (`allow read, write: if request.time < timestamp.date(2025, 12, 28)` — EXPIRED 2025-12-28, today 2026-11-05), firestore-adapter.js:76-78 (permanent download URLs)
- **Impact:** Before expiry, anyone with the project ID could read/write all orders (names, emails, phones) and harvest permanent file URLs. Data must be presumed compromised; rules now deny everything (which also breaks any future client-side Firebase use).

### Finding ID: SEC-005 / SEC-006

- **Title:** No security headers; CORS misconfigured
- **Category:** Security · **Severity:** HIGH · **Status:** Confirmed
- **Affected file:** nginx.conf (no headers), server.js:22-36 (`origin: '*'` + `credentials: true`)
- **Evidence:** `cors` with `origin: '*'` and `credentials: true` — the combination reflects any origin (browser disallows `*` with credentials, so the middleware effectively reflects arbitrary origins).
- **Recommended solution:** Explicit allowlist; add CSP/X-Frame-Options/X-Content-Type-Options/HSTS at nginx.

### Finding ID: DEP-001 / DEP-002 / DEP-003 (canonical)

- **Title:** Dependency vulnerabilities and unfixable Node 18 base
- **Category:** Supply chain · **Severity:** HIGH · **Status:** Confirmed
- **Affected file:** package.json, package-lock.json (root + functions/)
- **Evidence:** `npm audit` (2026-11-05): **root 39 vulns (2 low / 13 moderate / 19 high / 5 critical)** — worse than the 36 recorded 2026-09; **functions/ 45 vulns** (5/21/15/4). Top sources: firebase-admin 13.6.0 (fast-xml-parser, protobufjs, websocket-driver CRIT), twilio→axios (~40 advisories), nodemailer 7.0.10 (21: SMTP CRLF injection, ReDoS, TLS validation flaw), direct: compression, uuid, express chain.
- **Node 18 blocker (CONFIRMED):** resend 6.5.2 declares `engines >=20`; fixed versions of nodemailer (≥10.1.4 → ≥20), firebase-admin 14 (≥22), sqlite3 6 (≥20.17), twilio 6 (≥20) all require newer Node. **The vulnerability state cannot be remediated while the Dockerfile stays on node:18-alpine.**
- **Recommended solution:** Move to `node:22-alpine`; upgrade deps (immediate in-range wins: compression→1.8.2, express→4.22.3); re-audit.
- **Note (SEC-017):** lockfile pins (multer 1.4.5-lts.2, express 4.21.2, path-to-regexp 0.1.12) already mitigate the historically exploited CVEs; ranges could regress them.

### Finding ID: BUG-024

- **Title:** Fire-and-forget notifications with console-only visibility
- **Category:** Reliability · **Severity:** MEDIUM · **Status:** Confirmed
- **Affected file:** server.js:303, 409-411, 716-719
- **Evidence:** Email/WhatsApp sends are not awaited; failures go to console only; git log shows 10+ commits (Sep–Oct 2026) repeatedly "fixing" email — each a blind patch.
- **Root cause:** No queued/retryable notification channel, no failure surface.
- **Impact:** Customers silently miss notifications; operators cannot know.

### Finding ID: BUG-009 / SEC-013

- **Title:** Unescaped user fields in email HTML
- **Category:** Injection · **Severity:** MEDIUM · **Status:** Confirmed
- **Affected file:** server.js:552-666 (escapeHtml applied only to `ecu_reference`), server.js:663-671
- **Impact:** Email-HTML injection from order fields (secondary XSS vector, social engineering).

### Finding ID: BUG-011 / SEC-012

- **Title:** No error middleware; error messages to client
- **Category:** Error handling · **Severity:** MEDIUM · **Status:** Confirmed (live-reproduced for multer)
- **Affected file:** server.js (absent middleware), server.js:420 (`error.message` returned)
- **Impact:** Broken JSON contract on errors; filesystem paths disclosed (confirmed in smoke test).

### Finding ID: BUG-013 / 014 / 015 / 017 (consolidated data-layer defects)

- **Severity:** MEDIUM · **Status:** Confirmed
- **Evidence:**
  - No pagination on order listing (server.js — getAll returns everything).
  - 50MB upload limit vs Resend's 10MB attachment cap → large modified files never reach customers.
  - DELETE (Firebase mode) never removes Storage blobs (server.js:481-486) → orphaned PII files.
  - SQLite adapter silently drops `*_download_url` fields (database.js:80-98,150-163) that server.js:282,395 pass in → download URLs lost on SQLite path.

### Finding ID: FE-008 … FE-013 (frontend defects)

- FE-008 MEDIUM admin.js:207-222 — deprecated global `window.event` (throws in Firefox; gold border never resets).
- FE-009 MEDIUM app.js:34-101 — `.show` class has no CSS → empty green pill always visible.
- FE-010 MEDIUM index.html:131-135 vs styles.css:489-537 — `.file-label*` unstyled while `.file-upload-*` targets nothing.
- FE-011 MEDIUM admin.js:652 — modal "Size" is fabricated (`Math.random()*50+10` MB).
- FE-012 MEDIUM styles.css:873 vs 1654 — duplicate `.modal` rule puts content styles on the backdrop.
- FE-013 MEDIUM app.js:71-75, admin.js:426-430 — no upload progress/cancel/timeout → stuck "Uploading…".
- LOW cluster: silent session wipe on API outage; hardcoded localhost:3000 hint; client-only validation; orphan styles-premium.css + undefined `--primary-yellow`; ~40 dead CSS selectors; no CSP + invalid preconnect; triplicated service/pricing lists; UTC-vs-local timestamp drift; dead `uploadModifiedFile`; 587KB hero-bg.

### Finding ID: SEC-008 … SEC-020 (security remainder)

- SEC-008 MEDIUM server.js:239-303 — no rate limit on anonymous order uploads (email bombing, storage abuse).
- SEC-009 MEDIUM server.js:499-500,530,577,736 — customer email/phone logged verbatim.
- SEC-010 MEDIUM Dockerfile:41, docker-compose.yml:23-25 — root containers; database.sqlite (644) + uploads (775) world-readable on host bind mounts.
- SEC-011 MEDIUM server.js:163 — `rejectUnauthorized: false` in SMTP → MITM of credentials/emails.
- SEC-014 LOW server.js:220 — non-constant-time password comparison.
- SEC-015 LOW server.js:340 — arbitrary `status` string accepted and rendered raw.
- SEC-016 INFO .firebaserc:3 — project ID `ecu-tuning-8a2e0` is public.
- SEC-018 INFO — deny-all Storage rules bypassed by permanent `?alt=media&token=` URLs.
- SEC-019 INFO docker-compose.yml:8-9,22 — raw ports 4000/3000/3002 published; `ALLOWED_ORIGINS=*` default.
- SEC-020 INFO firebase.emulators.json:6 — emulator UI enabled (unauthenticated data browsing if exposed).

### Finding ID: INFRA-002 … INFRA-014 (infrastructure)

- INFRA-002 HIGH Dockerfile:37,41 — `sh` PID1 with `& wait`: no SIGTERM forwarding, no zombie reaping; `wait` returns 0 even after total crash → Railway `ON_FAILURE` never triggers.
- INFRA-004 HIGH — no HEALTHCHECK in Dockerfile; railway.json has no healthcheckPath → TCP-only :8080 check masks dead Node servers.
- INFRA-005 MEDIUM — admin port chain: .env 3001 → compose publishes 3001 but targets hardcoded 3002 → nginx upstream 3001 → docs 3001.
- INFRA-007 MEDIUM — fresh-clone compose: gitignored database.sqlite absent → bind mount creates a directory → db.init() fails → exit(1) crash loop.
- INFRA-008 MEDIUM — nginx `client_max_body_size 60M` vs multer 50MB.
- INFRA-009 LOW firebase.json — emulator UI port 4000 collides with API (worked around via `--config` 4005).
- INFRA-010 LOW — no CI/CD (`.github/` = copilot-instructions only); all scripts PowerShell-only (unusable on Linux/Railway).
- INFRA-012 INFO — dataconnect/ + functions/ dead; `@dataconnect/admin-generated` (file: dep) not copied by `npm ci` stage (Dockerfile:14 copies only package*.json) → potential Docker build failure.
- INFRA-013 INFO — nginx no TLS/security headers; `/admin` assets resolve only because client+admin share public/.
- INFRA-014 INFO — .dockerignore correctly excludes sqlite/uploads/.env from the image.

### Finding ID: ARCH-001 … ARCH-010 (architecture/coherence)

- ARCH-001 README:176 & PROJECT_HANDOFF:33 claim `GET /api/orders/:id` needs no auth — it has `requireAdmin` (server.js:324).
- ARCH-002/003/004/005/007/008 — docs describe different services, schema, email flow, routes, version (see §2).
- ARCH-006 — env vars documented but never read (`TWILIO_WHATSAPP_FROM` vs `TWILIO_WHATSAPP_NUMBER` server.js:185; `EMAIL_SERVICE`; `.env` inert).
- ARCH-009 — dead code: styles-premium.css, public/pic/*, functions/src/genkit-sample.ts (deps absent, no build), dataconnect/ + generated SDK never imported.
- ARCH-010 — `filterByStatus` uses global `event` (admin.js:218) — Firefox breaks (same as FE-008).

### Finding ID: TST-001 / TST-002

- **TST-001 HIGH — 0% test coverage:** no test runner, 0 test files, 0 test scripts (root and functions/); all correctness rests on manual verification.
- **TST-002 MEDIUM — `tsc --noEmit -p functions` FAILS:** 10×TS2307 (missing deps) + 5 real code errors (unused imports `hasClaim`/`onRequest`/`logger`, implicit any in genkit-sample.ts).

---

## 5. Root Cause Analysis

### Primary root causes

| ID | Root cause | Symptom findings |
|---|---|---|
| R1 | **No trust-boundary discipline** (defaults instead of fail-closed; no rate limits; output encoding absent) | BUG-001, BUG-002, FE-001, SEC-005/006, SEC-008, SEC-015 |
| R2 | **No adapter contract between storage backends** | BUG-005, BUG-006, BUG-007, BUG-008, BUG-015, BUG-017 |
| R3 | **Untrusted input reaches filesystem and HTML** | BUG-003, FE-001, SEC-013 |
| R4 | **Fire-and-forget delivery, no observability surface** | BUG-024, email saga commits, BUG-005 |
| R5 | **Deployment topology drift** (one config, three topologies that disagree) | FE-002, INFRA-002/004/005/007, FE-004 |
| R6 | **Version/base-image debt** (Node 18, deprecated multer, unpinned ranges) | DEP-001/002/003/004/006 |
| R7 | **Docs/implementation divergence** (docs written from intent, not code) | ARCH-001…008 |

### Failure propagation chains

```
R1 (weak auth) ──▶ BUG-001/002 ──▶ admin takeover ──▶ SEC-004 exposure leverage
R3 (unsanitized filename) ──▶ BUG-003 ──▶ arbitrary write as root (SEC-010 amplifies)
R2 (no contract) ──▶ BUG-006 ──▶ 500s on order create ──▶ customers can't order
                  ──▶ BUG-007/008/017 ──▶ data invisible / downloads broken
R4 (fire-and-forget) ──▶ BUG-024 ──▶ 10+ blind email fixes ──▶ still silent
R5 (topology drift) ──▶ FE-002 ──▶ compose deployment unusable
                   ──▶ FE-004 ──▶ admin panel dead behind nginx
R6 (Node 18) ──▶ DEP-001 unfixable ──▶ production runs known-exploitable libs
```

```
                        ┌──────────────────────┐
                        │ R1 weak trust boundary│
                        └───┬──────────┬───────┘
                            ▼          ▼
                     BUG-001/002   SEC-005/006 (no CSP/CORS) 
                            │          │
                            └────┬─────┘
                                 ▼
                    FE-001 stored XSS (admin takeover)
                                 │
                    SEC-003 session-in-URL (persistence)
                                 ▼
                    SEC-004 Firestore exposure (data breach)
        R3 filename traversal ─▶ arbitrary write as root (BUG-003)
        R2 no adapter contract ─▶ Firebase mode broken end-to-end
        R4 no observability ─▶ silent failures across the board
        R5 topology drift ─▶ deployment broken in compose
        R6 version debt ─▶ vulnerabilities unfixable on Node 18
```

### When evidence was insufficient
- The transient "invalid service → No file uploaded" response observed once in the cold-start smoke run did **not** reproduce on retry (canonical 400 JSON confirmed). Marked **Unverified/Potential**; hypothesis: synchronous sqlite3 writes blocking the event loop under concurrency. Requires load testing to confirm.
- Live Firebase/Storage/email/WhatsApp behavior: **BLOCKED** (no credentials, no production access).
- Railway runtime behavior: not tested (no deployment performed).

---

## 6. Security Assessment

### Verdict: FAIL

| ID | Severity | Status | Evidence | Remediation |
|---|---|---|---|---|
| SEC-001 | CRITICAL | Confirmed | admin.js:261,571 (+13 sinks) | Escape/validate server+client; CSP |
| SEC-002 | CRITICAL | Confirmed | server.js:110, 217-227 | Fail-closed password, rate limit, lockout |
| SEC-003 | HIGH | Confirmed | server.js:188,195,221-222 | Cookie/header-only, expiring sessions |
| SEC-004 | HIGH | Confirmed | firestore.rules:15 (expired) | Presume breach; rewrite rules; rotate URLs |
| SEC-005 | HIGH | Confirmed | nginx.conf | Helmet/nginx security headers |
| SEC-006 | HIGH | Confirmed | server.js:22-36 | CORS allowlist |
| SEC-007 | HIGH | Confirmed | server.js:89-92 | Server-generated filenames |
| SEC-008 | MEDIUM | Confirmed | server.js:239-303 | Upload rate limits, field length caps |
| SEC-009 | MEDIUM | Confirmed | server.js:499-500,530,577,736 | Redact PII from logs |
| SEC-010 | MEDIUM | Confirmed | Dockerfile:41; compose:23-25 | Non-root USER; mount permissions |
| SEC-011 | MEDIUM | Confirmed | server.js:163 | `rejectUnauthorized: true` |
| SEC-012 | MEDIUM | Confirmed | server.js:420 | JSON error middleware |
| SEC-013/014/015 | LOW | Confirmed | server.js:663-671,220,340 | Escape; timingSafeEqual; status enum |
| SEC-016/018/019/020 | INFO | Confirmed | (see §4) | Harden emulator, ports, tokens |

**Positive notes:** SQLite queries fully parameterized; no `exec`/`eval`/command-injection surface; `.env`/sqlite/uploads untracked; session tokens use crypto-random UUIDs; lockfile pins mitigate the historically exploited CVEs.

**Secrets:** no hardcoded API keys/tokens found in tracked files; the only credential issue is the default admin password literal (server.js:110) and the public Firebase project ID (.firebaserc:3). No secret values are reproduced in this report.

---

## 7. Testing Results

| # | Test | Command | Result | Verdict |
|---|---|---|---|---|
| 1 | Syntax check ×9 JS files | `node --check` | 9/9 clean | PASS |
| 2 | TS compile functions/ | `tsc --noEmit -p functions` | 15 errors (10 TS2307 env + 5 code) | FAIL |
| 3 | Config validity ×10 | JSON/YAML parse | all valid (indexes.json is JSONC) | PASS |
| 4 | Dependency integrity | `npm ls --depth=0` | exit 0, no missing/extraneous | PASS |
| 5 | SQLite read-only | driver OPEN_READONLY | `orders` 18 cols; 2 rows, both `pending` | PASS |
| 6 | Runtime state | `ss`/`ps` | idle — no servers, ports free | PASS |
| 7 | Compose validation | `docker compose config --quiet` | valid (obsolete `version` warning) | PASS |
| 8 | ESLint | — | root: not configured; functions: blocked (no install) | NOT EXECUTED / BLOCKED |
| 9 | Test suite existence | glob | **0 test files, 0 runners** | FAIL |
| 10 | nginx config | text checks | braces 10/10; upstreams match servers | PASS |
| 11 | .env tracking | `git check-ignore` | untracked + ignored | PASS |
| 12 | **Sandbox smoke test** | live API in disposable copy | see below | PASS w/ findings |
| 13 | npm audit (root / functions) | `npm audit --json` | 39 vulns (2/13/19/5) / 45 (5/21/15/4) | FAIL |

### Sandbox live smoke test (orchestrator, `/tmp/opencode/ecu-audit-*`, no project mutation)
- `GET /` → 200 `{"status":"ok","service":"ECU Tuning API","version":"1.0.0"}`
- `POST /api/admin/login` wrong password → 401 `{"error":"Invalid password"}`
- `POST /api/admin/login` correct → 200 `{sessionId: <uuid>}`
- `GET /api/orders` no session → 401
- `GET /api/orders` with session → 200 `[]`
- `POST /api/orders` valid multipart → 200 `{orderId:1,…}`; file stored as `<uuid>-test-ecu.bin` in `uploads/`
- `POST /api/orders` invalid service → 400 `{"error":"Invalid service selected"}` (canonical; see §5 note on one non-reproducible transient)
- `POST /api/orders` missing service → 400 `{"error":"Service and vehicle info are required"}`
- `POST /api/orders` wrong extension (.txt) → **500 HTML stack trace** leaking absolute paths (confirms FE-005/SEC-012)

### BLOCKED
| Item | Reason |
|---|---|
| Live Firebase/Firestore/Storage flows | No credentials; emulator run forbidden |
| Email (Resend/SMTP) & WhatsApp sends | No provider credentials |
| Docker build/run | Forbidden by audit constraint (compose config validated only) |
| `nginx -t` | nginx binary not installed |
| functions/ ESLint & local tsc | `npm install` forbidden |
| Railway deployment | No production access |

### Untested areas
Order-approval → modified-file upload → customer email round-trip; multi-order pagination; Firebase mode; concurrent load; backup/restore of database.sqlite; uploads > 50MB and exactly 50MB boundary.

---

## 8. DevOps and Deployment Assessment

- **Deployment readiness: NOT READY.** Compose path is broken (FE-002); single-container path runs but with no supervision (INFRA-002) and no health visibility (INFRA-004).
- **Containerization:** 3 processes + nginx in one image is an anti-pattern for signal handling and restart detection; no `USER` (root); no HEALTHCHECK in the image; `npm ci --only=production` + `COPY . .` is reasonable, but the `file:` dep `@dataconnect/admin-generated` is absent at the ci step (Dockerfile:14 copies only `package*.json`) — potential build break.
- **Networking:** nginx routes are correct for single-container; `/admin/` MIME bug (FE-004); no TLS config, no security headers (Railway terminates TLS, but headers must be set at app/nginx layer).
- **CI/CD: absent.** `.github/` contains only copilot-instructions; every fix has been manual. PowerShell-only helper scripts are unusable on the Linux/Railway target.
- **Monitoring:** console-only logging; PII logged verbatim (SEC-009); no structured logs, no metrics, no alerting.
- **Reliability:** no process supervision, no retry/queue for notifications, no DB backups in-repo, SQLite on bind mount with init-order crash risk (INFRA-007).
- **Storage:** database.sqlite + uploads/ on host mounts (compose) / Railway Volume (single container); uploads include customer binaries — treated as world-readable (SEC-010).

---

## 9. Technical Debt

- **Duplicated code:** triplicated service/pricing lists (server.js, index.html, admin.js/email templates); duplicated validation across 3 servers; duplicated DB-init logic.
- **Outdated dependencies:** Node 18 (EOL-era) base; multer 1.x deprecated line; express <4.22.3; 84 total vulns across both trees.
- **Incomplete features:** functions/ deploys nothing; dataconnect/ unused; `uploadModifiedFile` dead; modified-file email attachment broken in Firebase mode; pagination missing.
- **Architectural inconsistencies:** AND/OR Firebase gate; port chains (3001/3002); two CSS files with an orphan; Data Connect schema describing a social network (TuneShare, Comment) that has nothing to do with the product.
- **Missing documentation accuracy:** docs describe v2.0.0, 7 English services, a different schema, different auth and email flows; ~25 nonexistent files listed in DIRECTORY_STRUCTURE.md.
- **Zero tests, zero CI** — every defect above could regress silently.

---

## 10. Prioritized Remediation Plan

| Priority | Problem ID | Problem | Root Cause | Recommended Action | Dependencies |
|---|---|---|---|---|---|
| P0 | BUG-001/SEC-002 | Default admin password + no brute-force protection | R1 | Fail startup without strong ADMIN_PASSWORD in prod; rate-limit + lockout + audit log | — |
| P0 | FE-001/SEC-001 | Stored XSS in admin panel | R1/R3 | Escape all rendered fields (textContent); server-side field validation; CSP | SEC-005 |
| P0 | BUG-003/SEC-007 | Filename path traversal | R3 | Store files as `<uuid><ext>` only | — |
| P0 | FE-002 | Compose frontends cannot reach API | R5 | Add nginx service to compose OR explicit API_BASE_URL | — |
| P0 | SEC-004 | Firestore breach (expired open rules) | R2/ops | Incident review; rotate download tokens; rewrite rules; notify customers if used | legal/owner decision |
| P1 | FE-005/BUG-011 | 500 HTML stack leaks; broken error contract | R1 | JSON error middleware; align nginx 60M↔multer 50M | — |
| P1 | BUG-006 | Firebase gate mismatch | R2 | Single init function used by all consumers; fail loudly | — |
| P1 | BUG-007/008/005/015/017 | Firebase mode broken chain | R2 | Adapter contract + parity tests | BUG-006 |
| P1 | INFRA-002/004 | No supervision/healthcheck | R5 | dumb-init/tini; per-process healthchecks; Railway healthcheckPath | — |
| P1 | SEC-003/FE-007/BUG-012 | Session tokens in URL, no expiry | R1 | HttpOnly cookie sessions w/ TTL; signed download URLs | FE-005 |
| P1 | SEC-005/006 | No headers; CORS * | R1 | Helmet + nginx headers; allowlist CORS | — |
| P1 | DEP-001/003 | 39+45 vulns; Node 18 wall | R6 | node:22-alpine; upgrade deps; re-audit; Dependabot | — |
| P1 | FE-004 | /admin/ MIME break | R5 | Route asset extensions to static files in nginx/admin-server | — |
| P2 | BUG-024 | Silent notifications | R4 | Queued sends w/ retry + failure log/dashboard | — |
| P2 | SEC-008/009/010/011 | Rate limits, PII logs, root container, SMTP TLS | R1 | Upload rate limit; log redaction; non-root USER; rejectUnauthorized | — |
| P2 | INFRA-005/006/007/008 | Port chain, Procfile, compose crash loop, size mismatch | R5 | Unify ports; fix/remove Procfile; create dir if missing; align limits | — |
| P2 | TST-001/002 | 0 tests; tsc fail | — | Vitest + supertest for API/db/adapter; test gate in CI; fix functions/ | CI |
| P2 | INFRA-010 | No CI | — | GitHub Actions: lint + tsc + tests + docker build + audit | TST-001 |
| P3 | ARCH-001..009 | Doc drift, dead code, orphans | R7 | Delete dead infra (dataconnect, functions sample, styles-premium, pic); rewrite docs from code | — |
| P3 | FE-008..013 | Frontend defects (modal, CSS, progress, fake size) | — | Fix with UI tests | — |
| P3 | SEC-016/018/019/020 | Hardening extras | — | Bind emulators to localhost; restrict published ports | — |

---

## 11. Final Technical Assessment

1. **Is the project structurally correct?** Partially. The three-process split (API/client/admin) is reasonable, but there is no shared config or adapter contract, and Firebase/DataConnect/Functions form a parallel dead structure.
2. **Is the architecture coherent?** No. Two storage backends with drift, three deployment topologies that disagree, and documentation describing a different application.
3. **Are the components properly integrated?** Only in the single-container SQLite path. Firebase mode, compose mode, and the `/admin/` nginx route are broken.
4. **Is the code maintainable?** Poorly. Monolithic 31KB server.js, duplicated validation/templates, 0 tests, no CI, dead code, docs out of sync. The core CRUD is clean (parameterized SQL, allowlists), which is the salvageable foundation.
5. **Is the application functional?** Yes in SQLite single-container mode for the core order flow (live-verified). Admin panel functions but is XSS-unsafe; notifications unreliable; Firebase mode non-functional.
6. **Is the infrastructure deployment-ready?** No. Compose deployments cannot work; the single-container path lacks supervision, health checks, and TLS/headers hardening.
7. **Are there security weaknesses?** Yes — severe: 2 CRITICAL, 8 HIGH. Stored XSS, default credentials, path traversal, CORS misconfiguration, a year-long Firestore exposure, and an unfixable-on-Node-18 vulnerability load.
8. **What prevents the project from working correctly?** (a) compose topology vs same-origin assumption (FE-002); (b) silent failure design (Firebase chain, notifications); (c) weak trust boundary; (d) version debt; (e) no verification loop (0 tests, no CI).
9. **What must be fixed first?** P0 list: default-password fail-closed + rate limiting, stored XSS, filename traversal, compose API routing, and a Firestore-breach assessment.
10. **Recommended target architecture:** keep the single API as the source of truth (thin static client/admin hosting), formalize one storage adapter interface (SQLite + Firestore implementations behind contract tests), supervised multi-process container (or three containers with a shared network + one proxy), allowlisted CORS + security headers, expiring cookie sessions with signed download URLs, a queued notification channel with retries and a failure log, Node 22 + current deps, and CI with lint/tsc/test/docker-build/audit gates. That is an evolution of the existing codebase, not a rewrite.

**Bottom line:** the core business flow is real and works; the platform is currently unsafe to expose to the internet and broken in two of its three deployment modes. Fixing P0/P1 makes it shippable; P2/P3 make it maintainable.

---

*This report was produced entirely from read-only inspection. No project files were modified during the audit. Awaiting authorization before any remediation is applied.*
