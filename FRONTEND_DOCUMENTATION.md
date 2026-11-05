# Frontend Documentation — ECU Tuning Service

> Verified against code (audit 2026-11-05). Legend: ✅ existing · ❌ missing · 🚧 proposed.

## 1. Framework & stack

- **Framework: none** ✅ — vanilla HTML/CSS/JS in `public/`, no build step, no bundler, no npm frontend dependencies.
- Files: `index.html` (451 lines) + `app.js` (151 lines) — customer order page; `admin.html` (109 lines) + `admin.js` (682 lines) — admin panel; `styles.css` (1775 lines); orphan `styles-premium.css` (1112 lines, zero references) ❌.

## 2. Entry points & pages

| Page | Entry | Served by | Port |
|---|---|---|---|
| Customer order form | `index.html` + `app.js` | `client-server.js` | 3000 (or nginx `/`) |
| Admin panel | `admin.html` + `admin.js` | `admin-server.js` | 3001 (or nginx `/admin`) |

## 3. Components

| Frontend component | Technology | Role | Backend connection | Requirements |
|---|---|---|---|---|
| Order form | HTML form + `app.js` | Collect customer/vehicle data + ECU file, `POST /api/orders` | `POST {API_BASE_URL}/api/orders` (multipart) | API reachable (see §6) |
| Service selector + cards | `index.html` (12 options/cards) | Present the 12 French services + prices | none (prices duplicated client-side ⚠️) | — |
| File picker | `<input type="file">` w/ `.file-label*` markup | Select ECU file | upload via form | ⚠️ `.file-label*` CSS missing (FE-010) |
| Admin login | `admin.html` form + `admin.js` | Password login → session in `localStorage` | `POST {API_BASE_URL}/api/admin/login` | API reachable; `ADMIN_PASSWORD` set server-side |
| Orders list | `admin.js` template rendering | Order cards, search, status filter | `GET {API_BASE_URL}/api/orders` (header auth) | — |
| Status filter | `admin.js` `filterByStatus` | Filter/highlight by status | none (client-side) | ⚠️ uses deprecated `window.event` (FE-008) |
| Order detail modal | `admin.js` `viewOrderDetails` | Full order info + actions | data from already-loaded list | ⚠️ stored XSS on raw fields (FE-001) |
| Modified-file upload modal | `admin.js` `showUploadModal`/`handleUploadModified` | Upload tuned file | `POST {API_BASE_URL}/api/orders/:id/modified` (header auth) | — |
| Downloads | `admin.js` `window.open` | Download original/modified | `GET .../download/original\|modified?session=<token>` | ⚠️ token in URL (FE-007) |
| Stats/search | `admin.js` | Client-side aggregates/filter | none | ⚠️ fabricated file-size stat (FE-011) |

## 4. Routing

- **nginx path routing** (single-container mode): `/` → client :3000, `/admin` & `/admin/` → admin :3001, `/api/` → API :4000.
- **No SPA router** ✅ — both pages are single documents; only the admin panel swaps innerHTML views.
- ⚠️ `/admin/` (trailing slash) breaks asset resolution → dead panel (FE-004).

## 5. State management

- DOM manipulation (`innerHTML` templates) + `localStorage` for the admin session id (`adminSessionId`).
- No store/framework. ❌ No persisted UI state beyond the session token.

## 6. API integration & base URL resolution

`/config.js` is generated at request time by each UI server and sets `window.API_BASE_URL`:

| Environment | Resolution (verified) | Result |
|---|---|---|
| Localhost dev (`NODE_ENV` ≠ production) | `CLIENT_API_BASE_URL` / `ADMIN_API_BASE_URL`, else `http://localhost:4000` | ✅ works on a dev machine |
| Production (`NODE_ENV=production`) | forced to `''` (same-origin) — the `*_API_BASE_URL` overrides are **ignored** | ✅ works only behind nginx (single container) |
| docker-compose (3 services, `NODE_ENV=production`, no nginx container) | `''` → `/api/*` hits the UI servers, which have no API routes → 404 | ❌ **FE-002 — order form & admin login always fail** |

Fetch table (all verified matching server routes):

| Caller | Endpoint | Method | Auth |
|---|---|---|---|
| `app.js:72` | `/api/orders` | POST (FormData) | none |
| `admin.js:51` | `/api/admin/login` | POST (JSON) | password |
| `admin.js:100` | `/api/admin/logout` | POST | `x-admin-session` |
| `admin.js:143/165` | `/api/orders` | GET | `x-admin-session` |
| `admin.js:350` | `/api/orders/:id/status` | PUT | `x-admin-session` |
| `admin.js:426` | `/api/orders/:id/modified` | POST (FormData) | `x-admin-session` |
| `admin.js:341/345` | `/api/orders/:id/download/{original,modified}` | GET (`?session=`) | query session |
| `admin.js:471` | `/api/orders/:id` | DELETE | `x-admin-session` |

## 7. Authentication interface (admin)

- Login form posts `{password}`; on success stores `sessionId` in `localStorage`.
- Subsequent calls send `x-admin-session` header; downloads use `?session=` query (⚠️ leaks — FE-007).
- 401 → session cleared → login screen. ⚠️ transient network errors also wipe the session silently (FE-014).

## 8. Forms

| Form | Fields | Validation | Status |
|---|---|---|---|
| Order form | `customerName`, `customerEmail`, `customerPhone`, `vehicleInfo`, `ecuReference`, `service`, `customServiceDescription`, file `ecuFile` | Client-side only (HTML5 `type="email"`, phone pattern, "Autres" description required) | ⚠️ server validates only presence + allowlist (FE-016) |
| Modified-file form | file `modifiedFile` | accept attr only | same |

## 9. Static assets

| Asset | Status |
|---|---|
| `hero-bg.png` (587 KB) | ✅ used by client hero + admin main-content (⚠️ heavy on every load — FE-023) |
| `pic/background and make it little transparent.png` | ❌ orphan |
| `styles-premium.css` | ❌ orphan (and `--primary-yellow` referenced by admin.js exists in neither stylesheet — FE-017) |

## 10. Config

- `/config.js` (injected, not a static file) is the **only** runtime config the frontend reads.
- No `.env`-driven frontend build (no build at all).

## 11. Frontend dependencies

- **None** ✅ — no npm packages, CDNs, or frameworks. All JS is hand-written.

## 12. Environment classification

| Target | Works? | Why |
|---|---|---|
| Localhost dev (3 node processes, dev env) | ✅ | `API_BASE_URL=http://localhost:4000` injected |
| Public/private via nginx single-container (Railway/Docker) | ✅ | same-origin `''` + nginx proxies `/api/` |
| Public via docker-compose (3 containers, no nginx) | ❌ | FE-002 — API unreachable from browser |
| Environment-based config (`NODE_ENV=production`) | ⚠️ | the switch that enables/breaks the above two cases |
