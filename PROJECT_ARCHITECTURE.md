# Project Architecture — ECU Tuning Service

> Verified against code (audit 2026-11-05). All diagrams label protocols. Broken paths marked with ✗.

## (A) General architecture

```mermaid
flowchart LR
    B[Browser] -->|"HTTP :8080 (single-container) or HTTP :3000/:3001/:4000 direct (dev)"| NG[nginx :8080]
    NG -->|"HTTP proxy /"| C[client-server.js :3000]
    NG -->|"HTTP proxy /admin"| A[admin-server.js :3001]
    NG -->|"HTTP proxy /api/"| API[server.js :4000]
    API -->|"sqlite3 (file I/O)"| SQL[(database.sqlite + uploads/)]
    API -.->|"✗ Firestore Admin SDK gRPC/HTTPS (broken)"| FS[(Firestore + Storage)]
    API -->|"HTTPS REST"| E[Resend / SMTP]
    API -->|"HTTPS REST"| W[Twilio WhatsApp API]
```

- Dev mode: browsers hit :3000/:3001/:4000 directly (no nginx).
- Compose mode: no nginx container → `✗` `/api/*` on :3000/:3001 404s (FE-002).
- External calls (email/WhatsApp) originate from the API process only.

## (B) Backend — monolithic reality

```mermaid
flowchart TB
    R[Express routes in server.js<br/>11 endpoints] -->|"function calls (no layers)"| H[Inline handlers:<br/>validation, storage, notifications]
    H -->|"sqlite3 queries"| DB[(database.js → SQLite)]
    H -.->|"adapter calls ✗ broken"| FA[(db/index.js → firestore-adapter.js → Firestore)]
    H -->|"fs I/O"| UP[(uploads/ + uploads/modified/)]
    H -->|"library calls"| NT[Resend / nodemailer / Twilio]
    LOGIN[login/logout routes] --> S[(in-memory session Set)]
```

Honest notes: there is **no controller/service/repository split** — `server.js` (801 lines) contains routing, business logic, validation, and notifications. The only abstraction is the two DB adapters (`database.js` vs `firestore-adapter.js`), and even that contract is asymmetric (SQLite drops download-URL fields).

## (C) Frontend

```mermaid
flowchart LR
    U[User] -->|"HTTP GET"| I[index.html]
    U -->|"HTTP GET /admin"| AD[admin.html]
    I -->|"loads"| J1[app.js + styles.css + /config.js]
    AD -->|"loads"| J2[admin.js + styles.css + /config.js]
    J1 -->|"fetch POST multipart"| B1[API_BASE_URL + /api/orders]
    J2 -->|"fetch + x-admin-session header"| B2[API_BASE_URL + /api/admin/*, /api/orders/*]
    J2 -->|"window.open ?session="| B3[API_BASE_URL + downloads]
    B1 -->|"HTTP"| API[server.js :4000]
    B2 -->|"HTTP"| API
    B3 -->|"HTTP"| API
```

- `window.API_BASE_URL` is injected by `/config.js` (client/admin servers). Dev → `http://localhost:4000`; production → `''` (same-origin, needs nginx).

## (D) Infrastructure

```mermaid
flowchart TB
    subgraph SingleContainer["Docker image (node:18-alpine) — working mode"]
        N1[nginx :8080] -->|"HTTP proxy"| S1[server.js :4000]
        N1 -->|"HTTP proxy"| C1[client-server.js :3000]
        N1 -->|"HTTP proxy"| A1[admin-server.js :3001]
        V1[(Volume: /app/data<br/>database.sqlite + uploads/)] --- S1
    end
    subgraph Compose["docker-compose (3 services) — ✗ broken FE-002"]
        S2[api :4000]
        C2[client :3000]
        A2[admin :3001]
        V2[(bind mounts:<br/>./database.sqlite, ./uploads)]
    end
    ext[[Resend / SMTP / Twilio]] -.->|"HTTPS outbound"| S1
    R[Railway: DOCKERFILE builder,<br/>Volume for DATA_DIR, TLS at edge] --> SingleContainer
```

Ports & protocols:

| Port | Service | Protocol |
|---|---|---|
| 8080 | nginx (entry) | HTTP |
| 4000 | API `server.js` | HTTP (JSON API) |
| 3000 | client `client-server.js` | HTTP (static) |
| 3001 | admin `admin-server.js` (compose: 3001) | HTTP (static) |
| 5001/8080/9099/9199 | Firebase emulators (functions/firestore/auth/storage) + UI 4005 | HTTP (dev only) |

Volumes: `database.sqlite` (persistent data), `uploads/` (ECU + modified files). ⚠️ Fresh-clone compose: gitignored `database.sqlite` bind mount becomes a directory → crash loop.
