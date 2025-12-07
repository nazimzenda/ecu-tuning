# ECU Tuning Service — Complete Directory Structure

This file maps every major directory and describes its purpose. Use this to navigate the codebase quickly.

## Root Level — Core Application Files

### Three Main Servers
- **`server.js`** — The API server (port 4000). Handles file uploads, order management, admin login, email/WhatsApp notifications. This is where 90% of API logic lives.
- **`client-server.js`** — Client UI server (port 3000). Serves static `public/index.html` and exposes runtime config via `/config.js`.
- **`admin-server.js`** — Admin UI server (port 3001). Serves `public/admin.html` and `/config.js` endpoint to inject API base URL at runtime.

### Database & Storage
- **`database.js`** — SQLite adapter and schema manager. Contains helper functions (createOrder, getAllOrders, getOrder, updateOrderStatus, updateOrderModifiedFile, deleteOrder) and runs migrations on startup.
- **`database.sqlite`** — SQLite database file. Stores all order metadata, customer info, and file references. Backed up before migrations.

### Firebase & Cloud Integration
- **`firebase-admin-init.js`** — Initializes Firebase Admin SDK. Used when `USE_FIREBASE=1` to enable Firestore and Storage.
- **`firebase.json`** — Firebase project configuration. Defines build behavior and emulator settings.
- **`firebase.emulators.json`** — Local emulator configuration (Firestore on 8080, Auth on 9099, Storage on 9199, UI on 4005).
- **`.firebaserc`** — Firebase project ID and aliases (allows `firebase` CLI commands to target the correct project).
- **`firestore.indexes.json`** — Firestore index definitions (if using Firestore backend).
- **`firestore.rules`** — Firestore security rules.
- **`storage.rules`** — Firebase Storage security rules.

### Configuration & Environment
- **`.env`** — Local environment variables (ADMIN_PASSWORD, SMTP credentials, Twilio keys, etc.). Not committed; create locally.
- **`.firebaserc`** — Firebase project configuration (tracks which Firebase project to deploy to).
- **`package.json`** — Node dependencies and npm scripts (start:api, start:client, start:admin, dev, emulators, migrate:firestore).
- **`package-lock.json`** — Locked dependency versions.

### Docker & Deployment
- **`Dockerfile`** — Multi-stage build; defines how to containerize the app. Runs `node server.js` by default.
- **`docker-compose.yml`** — Orchestration of three services (api, client, admin) with health checks.
- **`docker-compose.windows.yml`** — Windows-specific compose config (uses `host` network driver if needed).
- **`docker-start.ps1`** — PowerShell helper to start Docker Compose (Windows).
- **`Procfile`** — Heroku deployment config (legacy; tells Heroku which process to start).
- **`railway.json`** — Railway cloud deployment config.

### Logs
- **`server-log.txt`** — API process logs (written by `node server.js 2>&1 | Tee-Object server-log.txt`).
- **`admin-server-log.txt`** — Admin server logs.
- **`firebase-debug.log` / `firestore-debug.log`** — Removed; no longer tracked.

---

## Directories

### `/.github/`
- **`copilot-instructions.md`** — AI agent guidance (big picture architecture, workflows, conventions, gotchas).

### Documentation Files (current)

- **`README.md`** — Main project overview and quick start.
- **`DEPLOYMENT.md`** — Primary deployment guide.
- **`MAINTENANCE.md`** — Backup and maintenance procedures (includes quick start).
- **`ARCHITECTURE.md`** — Technical details.
- **`FIREBASE_SETUP.md`** — Firebase emulator/setup instructions.
- **`SEARCH_FILTER_GUIDE.md`** — Admin search/filter feature notes.
- **`DIRECTORY_STRUCTURE.md`** — This file.

### Config Files
- **`.env`** — Environment variables (not committed; create locally).
- **`.gitignore`** — Git ignore rules (excludes node_modules, .env, database.sqlite, etc.).
- **`.dockerignore`** — Docker build ignore rules.

### Miscellaneous
- **`node_modules/`** — npm packages directory (created by `npm install`).
- **`.git/`** — Git repository metadata.
Firebase Data Connect configuration (optional; currently minimal).
- **`dataconnect.yaml`** — Data Connect project config.
- **`schema/schema.gql`** — GraphQL schema definitions (if used).
- **`example/connector.yaml` & `queries.gql`** — Example Data Connect setup.
- **`seed_data.gql`** — Sample data for testing.

### `/ecu-tuning/` & `/ecu-tuning-service/`
Legacy or placeholder directories (may be unused; consider cleanup if not needed).

---

## Documentation Files

Use these to understand the project state and deployment:

### Quick Start
- **`START_HERE.md`** — Entry point for new developers.
- **`README.md`** — Main project overview.

### Deployment & Infrastructure
- **`DEPLOYMENT.md`** — How to deploy to Railway/Render/cloud platforms.
- **`CLOUD_DEPLOYMENT.md`** — Cloud-specific notes.
- **`FIREBASE_SETUP.md`** — Firebase initialization and emulator setup.
- **`DOCKER_GUIDE.md`** — Docker and Compose usage.
- **`DOCKER_README.md`** — Docker-specific README.

### Troubleshooting & Maintenance
- **`MAINTENANCE.md`** — How to run the project locally, emulator setup, Firebase billing notes, common issues.
- **`NETWORK_DIAGNOSTICS.md`** — Debugging network/connectivity issues.
- **`NETWORK_FIX.md`** — Solutions for network problems.
- **`NETWORK_ISSUE_FIXED.md`** — Resolution summary.
- **`NETWORK_SOLUTIONS_SUMMARY.md`** — Consolidated network solutions.

### Setup Guides
- **`EMAIL_WHATSAPP_SETUP.md`** — Configure SMTP and Twilio for notifications.
- **`QUICK_DOCKER_START.md`** — Quick Docker setup guide.

### Administrative
- **`CHANGES.md`** — Changelog of modifications made.
- **`CLEANUP_LOG.md`** — Log of cleanup operations.
- **`COMPLETION_SUMMARY.md`** — Summary of completed tasks.
- **`SCRIPT_CHANGES.md`** — Changes made to helper scripts.
- **`FINAL_REPORT.md`** — Final project status report.
- **`PUSH_TO_GITHUB.md`** — Instructions for pushing to GitHub.
- **`DEPLOY_CHECKLIST.md`** — Pre-deployment checklist.
- **`DOCUMENTATION_INDEX.md`** — Index of all documentation files.
- **`CLIENT_VIEW.md`** — Client-side implementation details.

### Config Files
- **`.env`** — Environment variables (not committed; create locally).
- **`.gitignore`** — Git ignore rules (excludes node_modules, .env, database.sqlite, etc.).
- **`.dockerignore`** — Docker build ignore rules.
- **`apphosting.emulator.yaml`** — Firebase App Hosting emulator config.
- **`manage-servers.ps1`** — PowerShell script to manage multiple servers.
- **`npm.ps1`** — Helper for npm commands on Windows.
- **`start-server.ps1`** — Legacy server starter script.

### Miscellaneous
- **`dockerfileeeeee`** — Typo/duplicate (consider removing).
- **`node_modules/`** — npm packages directory (created by `npm install`).
- **`.git/`** — Git repository metadata.

---

## Key File Locations by Function

### To modify API behavior
→ **`server.js`** (endpoints, middleware, error handling)

### To modify database schema or add fields
→ **`database.js`** (schema, migrations, helper functions)

### To modify client form or UI
→ **`public/app.js`** (form handling, validation, API calls)

### To modify admin dashboard
→ **`public/admin.js`** (order list, login, file upload handling)

### To enable/configure Firebase
→ **`firebase.json`**, **`firebase-admin-init.js`**, **`db/firestore-adapter.js`**

### To migrate data to Firestore
→ **`migration/migrate-sqlite-to-firestore.js`**

### To troubleshoot local startup
→ **`scripts/start-clean-debug.ps1`** (run interactively to see all output)

### To check running services
→ **`scripts/check-ports.ps1`** (verify listening ports)

---

## Summary

| Category | Location | Purpose |
|----------|----------|---------|
| **API Logic** | `server.js` | Main request handling, notifications |
| **Database** | `database.js`, `database.sqlite` | Persistence layer and schema |
| **Client UI** | `public/app.js`, `public/index.html` | File upload form and logic |
| **Admin UI** | `public/admin.js`, `public/admin.html` | Order management and file handling |
| **Configs** | `.env`, `firebase.json`, `package.json` | Environment and project setup |
| **Docker** | `Dockerfile`, `docker-compose.yml` | Containerization and orchestration |
| **Firebase** | `db/`, `firebase-admin-init.js` | Optional cloud backend |
| **Scripts** | `scripts/` | Developer helpers (Windows PowerShell) |
| **Docs** | `*.md` files at root | Guides, runbooks, and notes |

---

## Next Steps for You

1. **If changing API logic** → modify `server.js` and `database.js`.
2. **If adding a form field** → update `public/app.js` (client), `public/admin.html`/`admin.js` (admin), and `database.js` (schema).
3. **If deploying to cloud** → check `DEPLOYMENT.md` and set environment variables.
4. **If debugging locally** → run `.\scripts\start-clean-debug.ps1` to see all output in one terminal.
5. **If using Firebase** → run `npm run emulators` and set the three `FIREBASE_*_EMULATOR_HOST` env vars before starting the API.

