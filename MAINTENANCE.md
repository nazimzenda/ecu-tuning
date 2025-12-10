# ECU Tuning — Maintenance Guide

This maintenance guide explains how to run, debug, and maintain the ECU Tuning Service repository (`ecu-tuning`) for developers and operators. It focuses on the local Windows development environment using PowerShell, and also notes Docker usage.

**Last Updated:** December 10, 2025

**Quick summary**
- API: `server.js` — default port `4000`
- Client UI: `client-server.js` — default port `3000`
- Admin UI: `admin-server.js` — default port `3001`
- Database: `database.sqlite` via `database.js` (SQLite)
- Uploads: `uploads/` and modified files in `uploads/modified/`
- Email: Resend API (Railway) or SMTP (local)
- Performance: Gzip compression, static caching, optimized CSS animations

**Quick start (local, Windows PowerShell)**
- Start everything (stops blockers → starts emulators + API + client + admin in new windows):
```powershell
./scripts/start-clean.ps1
```
- Stop everything:
```powershell
./scripts/stop-all.ps1
```
- Check ports (4000, 3000, 3001):
```powershell
./scripts/check-ports.ps1
```
- Emergency stop (if scripts fail):
```powershell
Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force
```

**Manual starts (per service)**
- Start API:
```powershell
cd C:\Users\remad\myapp
npm run start:api
```
- Start Client UI:
```powershell
npm run start:client
```
- Start Admin UI:
```powershell
npm run start:admin
```
- Run all in Docker Compose (if using Docker):
```powershell
docker-compose up -d
```

**Useful PowerShell checks**
- Check listening ports (4000, 3000, 3001):
```powershell
$ports = @(4000,3000,3001)
foreach ($p in $ports) {
  $r = Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue
  if ($r) { Write-Host "Port $p - LISTENING (PID: $($r.OwningProcess))" } else { Write-Host "Port $p - NOT listening" }
}
```
- Find process by PID:
```powershell
tasklist /fi "PID eq <PID>"
```
- Kill all Node processes (careful on shared machines):
```powershell
Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force
```

**Environment variables**
- `ADMIN_PASSWORD` — default `admin123` (change for production)
- `API_PORT` — port for API (default `4000`)
- `CLIENT_PORT` — client UI (default `3000`)
- `ADMIN_PORT` — admin UI (default `3001`)
- `CLIENT_API_BASE_URL` / `ADMIN_API_BASE_URL` — frontend `config.js` injection
- `ALLOWED_ORIGINS` — CORS origins (comma-separated)
- Email variables: `RESEND_API_KEY` (recommended for Railway), `ADMIN_EMAIL` (receive new order alerts)
- SMTP variables (local dev): `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`
- Twilio variables (optional): `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_NUMBER`
- Railway: `DATA_DIR=/app/data` for persistent volume storage

**Email configuration**
- **Resend API (Production/Railway):** Set `RESEND_API_KEY` - works on Railway where SMTP ports are blocked
- **SMTP (Local Dev):** Set `SMTP_USER` and `SMTP_PASS` for Gmail
- **Admin alerts:** Set `ADMIN_EMAIL` to receive new order notifications
- **Customer notifications:** Modified files are sent as email attachments
- **Note:** Resend free tier requires domain verification to send to non-account emails

**What `config.js` does**
- Both `client-server.js` and `admin-server.js` expose `/config.js` which injects `window.API_BASE_URL` — this is how frontends locate the API at runtime.

**Admin auth & session**
- Admin routes use session-based auth via an in-memory `sessionId` set. Obtain session via POST `/api/admin/login` with the admin password, then use `x-admin-session` header or `?session=<id>` query for admin endpoints.

**Database**
- SQLite file: `database.sqlite` (created by `database.js` in repository root)
- Use `sqlite3` CLI or a GUI tool (DB Browser for SQLite) for inspection and backups.
- Quick backup (PowerShell):
```powershell
Copy-Item .\database.sqlite .\backups\database.sqlite.$((Get-Date).ToString('yyyyMMdd_HHmmss'))
```

**Uploads and storage**
- Uploaded files: `uploads/` (originals)
- Modified files: `uploads/modified/`
- On startup `server.js` ensures `uploads/modified/` exists. To reclaim disk, archive and remove old files using timestamps.

**Logging & error handling**
- The servers log to stdout (console). For production or long-running deployment, run with a process manager (`pm2`) or configure OS service.
- `admin-server.js` now includes global handlers for `uncaughtException` and `unhandledRejection` which log the stack and exit. This ensures fatal errors are recorded in logs for diagnosis.
- When you see `EADDRINUSE` the server's error listener prints which port is in use and exits; use the port checks above to find the process holding it.

**Common issues & fixes**
- EADDRINUSE (address in use)
  - Cause: stray Node process is holding the port.
  - Fix:
    1. `Get-NetTCPConnection -LocalPort <port> -State Listen` to find the PID.
    2. `tasklist /fi "PID eq <PID>"` then `Stop-Process -Id <PID> -Force` or `Get-Process node | Where-Object { $_.Id -eq <PID> } | Stop-Process -Force`.
- Admin UI shows `ERR_CONNECTION_REFUSED` while server logs `running`
  - Cause: server printed start message but then crashed on a synchronous/async error before accepting connections, or another process binds the port then exits.
  - Fix:
    1. Run `node admin-server.js` directly in a terminal (keep it open) and observe stdout/stderr.
    2. Look for stack traces printed by the `uncaughtException` / `unhandledRejection` handlers.
    3. Confirm port listening immediately after the start message using `Get-NetTCPConnection`.
- `/config.js` returns wrong API URL
  - Fix: check the environment variables `ADMIN_API_BASE_URL` / `CLIENT_API_BASE_URL` or `API_PORT`.

**Debugging steps (recommended sequence)**
1. Stop all node processes (if you suspect collisions):
```powershell
Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force
```
2. Start the API server and confirm health:
```powershell
npm run start:api
# then in another window
Invoke-WebRequest -Uri http://localhost:4000/ -UseBasicParsing
```
3. Start the Client UI and confirm `/config.js`:
```powershell
npm run start:client
Invoke-WebRequest -Uri http://localhost:3000/config.js -UseBasicParsing
```
4. Start the Admin UI and observe logs live:
```powershell
npm run start:admin
# watch stdout for errors and confirm
Invoke-WebRequest -Uri http://localhost:3001/config.js -UseBasicParsing
```
5. If admin exits, copy stdout/stderr and the stack trace for analysis.

**Docker notes**
- `docker-compose.yml` spins up `api`, `client`, and `admin`. A known mapping difference: `docker-compose.yml` may map the Admin panel to `3002` in some configs — check the compose file before assuming ports.
- Use `docker-compose logs -f` to tail logs for services.

**Maintenance & backup schedule**
- Daily/weekly: archive and rotate `uploads/modified/` (if heavy file usage).
- Weekly: backup `database.sqlite` to an external location.
- Monthly: review node package updates and run `npm audit`.

**Dev workflow tips**
- When adding endpoints, follow the existing pattern: keep admin-only routes behind the `requireAdmin` middleware in `server.js`.
- Use snake_case for DB columns; JS objects can be camelCase as currently used.
- When adding allowed file types for upload, update the extension whitelist in `server.js` where `multer` disk storage and validation is configured.

**Recommended improvements**
- Add structured logging (e.g., `winston`) and write logs to files with rotation.
- Add a process supervisor: `pm2` (cross-platform) for automatic restarts and log management.
- Add a health-check endpoint and a small integration test that verifies `/config.js` and API health after startup.
- Add CI job to run `node server.js` and smoke test endpoints inside the test matrix.

**Contact & notes for maintainers**
- File locations:
  - API: `server.js`
  - Client UI server: `client-server.js`
  - Admin UI server: `admin-server.js`
  - DB helpers: `database.js`
  - Frontend: `public/` (contains `index.html`, `admin.html`, `app.js`, `admin.js`)
- Keep `ADMIN_PASSWORD` out of public repositories — use environment variables in production.

---
This file was generated to help developers maintain and debug the ECU Tuning Service locally and in Docker. If you want, I can add short check scripts (PowerShell) that automate the common checks and safe restarts.

**Local helper scripts**
- `scripts\check-ports.ps1`: Check listening state for ports `4000`, `3000`, `3001` and show PID.
- `scripts\start-all.ps1`: Open three PowerShell windows and run `npm run start:api`, `npm run start:client`, `npm run start:admin` respectively (useful during development so logs remain visible).
- `scripts\stop-all.ps1`: Stop any process currently listening on the three service ports (safe, targeted stop).
- `scripts\backup-before-migrate.ps1`: Creates `backups/<timestamp>/` and copies `database.sqlite` and `uploads/` (run this before performing a migration).
- `scripts\e2e-smoke.ps1`: Simple smoke tests that `Invoke-WebRequest` to the three services and reports reachability.

Usage examples (PowerShell):
```powershell
# Check ports
.\scripts\check-ports.ps1

# Start all servers (each in new window)
.\scripts\start-all.ps1

# Stop any listeners on the service ports
.\scripts\stop-all.ps1

# Backup DB and uploads before migration
.\scripts\backup-before-migrate.ps1

# Run smoke tests after starting services
.\scripts\e2e-smoke.ps1
```

These scripts are intentionally minimal and safety-minded. If you'd like, I can extend them to integrate with the existing `manage-servers.ps1` utilities, add logging, or make them cross-platform (Node-based) so they work the same under WSL/macOS/Linux.

**Firebase note about Billing & Functions**
- The repository previously had Cloud Functions configured for Firebase deployment. Deploying functions via the Firebase CLI can attempt to enable the Google Cloud Build API (`cloudbuild.googleapis.com`), which requires the project to be on the Blaze (pay-as-you-go) plan.
- To avoid being forced to enable billing, this repo's `firebase.json` has been modified to remove the `functions` deployment block. This prevents `firebase deploy` from attempting to enable Cloud Build.
- If you want to deploy functions later, you have two options:
  - Upgrade the Firebase project to Blaze (Console → Billing) and re-add the `functions` block, then run `firebase deploy --only functions`.
  - Keep functions local and use the Firebase Emulator Suite for development: `firebase emulators:start --only functions,firestore,auth`

If you'd like, I can revert the `firebase.json` change and instead add a `--no-predeploy` or automation that only deploys functions when you explicitly allow enabling billing.
