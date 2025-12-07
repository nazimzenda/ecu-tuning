Firebase Integration — Setup & Run

This project has optional Firebase integration (Firestore + Firebase Storage).
When enabled (`USE_FIREBASE=true`) the server will:
- Upload original and modified ECU files to Firebase Storage
- Store order metadata and file download URLs in Firestore

Required environment variables (production / CI)
- `USE_FIREBASE=true`  — enable the Firestore adapter
- `FIREBASE_STORAGE_BUCKET` — your bucket name (e.g. `my-project.appspot.com`)
- `GOOGLE_SERVICE_ACCOUNT_JSON` — JSON string of the service account key (preferred), OR place `service-account.json` at project root (not committed)

Security note
- Never commit service-account JSON to source control. Use env vars or secret managers.
- `service-account.json` is already added to `.gitignore`.

Local development with Firebase Emulator (recommended for dev/testing)
1. Install firebase-tools:

```powershell
npm install -g firebase-tools
```

2. Start emulators (in project root):

```powershell
firebase emulators:start --only firestore,storage
```

3. Set env vars for emulator (PowerShell example):

```powershell
$env:USE_FIREBASE = 'true'
$env:FIREBASE_STORAGE_BUCKET = 'your-bucket-name'
# Emulator endpoints will be used automatically if firebase-tools is running
```

Using real Firebase project (production/test)
1. Create a Firebase project and enable Firestore + Storage.
2. Create a service account in the Firebase Console (Project Settings -> Service accounts) and copy the JSON.
3. Provide credentials locally by either:
   - Setting `GOOGLE_SERVICE_ACCOUNT_JSON` to the JSON string (preferred), or
   - Saving the JSON to `service-account.json` in the repo root (file is ignored by git).
4. Set the bucket name, e.g. `my-project.appspot.com` in `FIREBASE_STORAGE_BUCKET`.

PowerShell example — set env and run dry-run migration

```powershell
# Set env variables in the current session (replace values)
$env:USE_FIREBASE = 'true'
$env:FIREBASE_STORAGE_BUCKET = 'my-project.appspot.com'
$env:GOOGLE_SERVICE_ACCOUNT_JSON = Get-Content C:\path\to\service-account.json -Raw

# Dry-run migration (no writes to Firestore/Storage)
npm run migrate:firestore -- --dry

# If dry-run looks good, run the real migration
npm run migrate:firestore
```

Start the server with Firebase enabled

```powershell
$env:USE_FIREBASE = 'true'
$env:FIREBASE_STORAGE_BUCKET = 'my-project.appspot.com'
$env:GOOGLE_SERVICE_ACCOUNT_JSON = Get-Content C:\path\to\service-account.json -Raw
npm run start:api
```

Quick verification
1. Create a test order via the client UI or curl POST `/api/orders` with multipart `ecuFile` field.
2. Check Firestore in Firebase Console — the `orders` collection should have documents with order data.
3. Check Firebase Storage — uploaded files should appear under `orders/...`.
4. Download links in order documents are public signed-like URLs with token query param. You can also proxy downloads via the API.

If you prefer, I can:
- Run the migration for you here (I cannot access your Firebase project; you must provide credentials or run migration locally).
- Add a short script to automate setting env and starting the server.

Problems or questions
- If migration fails due to missing credentials, set `GOOGLE_SERVICE_ACCOUNT_JSON` as shown.
- If uploads reach storage rules issues, ensure the service account has `Storage Admin` rights or use project owner credentials during migration.
