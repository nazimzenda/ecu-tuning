
## ECU Tuning Service — Copilot Instructions

This file tells AI coding agents the repository-specific facts and quick actions needed to be productive.

Core architecture (big picture)
- Three Node servers at repo root:
  - `server.js` — API: handles file uploads, creates orders, stores metadata, sends notifications (default `API_PORT=4000`).
  - `client-server.js` — serves `public/` for clients (default `CLIENT_PORT=3000`).
  - `admin-server.js` — serves admin UI and `/config.js` for runtime API base URL (default `ADMIN_PORT=3001`).
- Persistence: local SQLite via `database.js`. Optional Firestore adapter lives at `db/firestore-adapter.js` and is activated with `USE_FIREBASE=1`.
- File storage: `uploads/` (originals) and `uploads/modified/` (outputs). Optional Firebase Storage upload helper used when `USE_FIREBASE` is enabled.

Local developer workflows
- Typical local start (explicit):
  1. Start Firebase emulators when using the Firestore/Storage adapter: `npm run emulators` (uses `firebase.emulators.json`; UI runs on `4005`).
  2. Start API: `npm run start:api` (or `node server.js`).
  3. Start client and admin: `npm run start:client` and `npm run start:admin`.
- Helper scripts (see `scripts/`):
  - `check-ports.ps1` — report listeners on common ports.
  - `stop-all.ps1` — robustly stop processes attached to common ports (supports `Get-NetTCPConnection` and `netstat`).
  - `start-clean.ps1` — stop blockers and launch emulators + servers in new windows.
  - `start-clean-debug.ps1` — interactive debug: runs emulators/API in the same terminal to capture crashes and exit codes.

Project-specific conventions
- DB naming: persisted column names use snake_case; JS code maps to camelCase. Add DB changes via `database.js` helpers and follow its runtime migration patterns.
- Admin auth: in-memory session set. Login returns `sessionId` — include as `x-admin-session` header or `?session=` query param for admin routes.
- File upload validation: `server.js` enforces allowed extensions (`.bin,.hex,.ori,.winols,.dam`) and 50MB limit via `multer`. Update this list when supporting new formats.
- Client forms: `public/app.js` intentionally uses `FormData(form)` then `formData.set('customServiceDescription', ...)` to ensure trimmed value replaces any captured value (avoid duplicated fields).

Integration points & files to inspect first
- `server.js` — endpoints, multer config, email/Twilio logic, firebase adapter usage, startup logs.
- `database.js` — SQLite schema and helper functions (createOrder, getAllOrders, getOrder, updateOrderStatus, updateOrderModifiedFile, deleteOrder).
- `db/firestore-adapter.js` & `firebase-admin-init.js` — optional Firestore/Storage wiring.
- `migration/migrate-sqlite-to-firestore.js` — migration script (use with backups and service account or emulators).
- `firebase.emulators.json` & `firebase.json` — emulator configuration (UI on `4005`), functions deploy removed to avoid requiring Blaze billing.
- `public/` — client and admin front-end code (index/admin html + `app.js`, `admin.js`).

Common problems & quick solutions
- Port collisions: use `scripts/check-ports.ps1` and `scripts/stop-all.ps1` to find/stop listeners. The repo includes `start-clean.ps1` to automate a clean start.
- Firebase deploys may require Cloud Build / Blaze billing for functions/hosting; prefer local emulators for development.
- Unexpected terminal termination (exit code `-1073741510`): run `start-clean-debug.ps1` to reproduce in the current terminal and capture logs; check Windows Event Viewer or antivirus interference.

Commands you'll use often
```powershell
# Start emulators (in shell):
npm run emulators

# Start API with emulator env vars (shell):
$env:FIRESTORE_EMULATOR_HOST='127.0.0.1:8080'; $env:FIREBASE_AUTH_EMULATOR_HOST='127.0.0.1:9099'; $env:FIREBASE_STORAGE_EMULATOR_HOST='127.0.0.1:9199'; npm run start:api

# One-step helper (new windows):
.\scripts\start-clean.ps1

# Debug in current terminal to capture crashes:
.\scripts\start-clean-debug.ps1
```

When modifying code
- Schema changes → update `database.js` and add safe `ALTER TABLE` logic or a migration script; backup `database.sqlite` before running migrations.
- Add new endpoints → add small handlers in `server.js` and tests / help text in README.

Feedback
- Review this file and tell me if you want small runnable examples (curl requests, sample admin flows), or a short troubleshooting checklist to add for CI/Windows-specific issues.

