# Lead Intelligence — Worldwide Garage & ECU Business Research

Admin-only business-development workspace for **ECU Tuning Pro**. It discovers
tuning shops, ECU specialists, diagnostics businesses and lawful
emissions-repair workshops, verifies public business details, scores fit for a
file-service partnership, and keeps an evidence trail.

The guiding rule is simple:

> Research lawful ECU calibration, diagnostics and emissions-system repair.
> Do not market emissions-control defeat or modifications that violate
> applicable road-emissions rules.

## What it does

1. **Plans a bounded research pass** from the priority-market catalog in
   `leads/catalog.js`.
2. **Discovers businesses** from OpenStreetMap:
   - Overpass API with mirror fallback for city-radius queries.
   - Nominatim as a rate-limited fallback for named POIs.
3. **Enriches from official websites** where a public URL exists:
   - business email, phone and WhatsApp links,
   - social profiles,
   - postal address and structured `LocalBusiness` data,
   - service signals (ECU remapping, diagnostics, emissions repair, file-service/B2B),
   - compliance flags for emissions-delete wording.
4. **Verifies and scores** each record. A lead is only `verified` when it has
   street-level coordinates, a reachable official website, and at least one
   public business contact channel.
5. **Stores provenance**: source URL, evidence URL, last verification date,
   confidence parts and scoring reasons.
6. **Exports** a filtered CSV for a human-reviewed CRM import. There is no
   automated outreach.

The admin UI is at **`/admin/leads`** (or `/leads` when the admin server is
opened directly). It uses the same admin session/password as the order panel.

## Quick start

```bash
# 1. Install dependencies (already used by the main app)
npm install

# 2. Start the API + admin servers as usual
npm run start:api
npm run start:admin

# 3. Open the lead workspace
#    http://localhost:3001/admin/leads
```

The lead store is created automatically in `database.sqlite` (or
`$DATA_DIR/database.sqlite`). It is independent of the orders adapter and works
when `USE_FIREBASE=0` or `1`, as long as the SQLite file is on persistent
storage.

### Seed the starter set

The repo ships with a curated set of **real OpenStreetMap business records**
(not invented demo rows) across France, Germany, the UK, Spain, Italy, Belgium,
the Netherlands, the US, Australia and several expansion markets:

```bash
npm run leads:seed
```

This also visits the public websites that have a URL, respects `robots.txt`, and
can take a couple of minutes. Use `npm run leads:seed -- --no-enrich` to import
the map records only.

### Run research from the CLI

```bash
# Priority cities for France and Germany
npm run leads:research -- --countries FR,DE --limit 50

# Specific cities
npm run leads:research -- --cities "Lyon, Berlin, London" --limit 30

# Use the Nominatim fallback (one request/second)
npm run leads:research -- --countries GB --source nominatim --limit 25

# Include general repair garages (lower fit by default)
npm run leads:research -- --countries US --limit 100 --include-general
```

## Admin workspace

- **Overview** — discovered / verified / high-potential counts, a world map,
  top opportunities and country coverage.
- **Lead database** — filter by country, potential, verification state and
  compliance state. Click any row for the full evidence drawer.
- **Research runs** — start a bounded run, watch progress and per-run counts.
- **Sources & compliance** — the method, scope and data policy.

Lead detail includes:

- public contact channels (email, phone, WhatsApp, website, socials),
- service signals and compliance flags,
- score and confidence breakdown with reasons,
- source/evidence links,
- pipeline state (`new` → `contacted` → `qualified`, or `not_fit` / `opted_out`),
- notes and opt-out handling,
- a **Verify website** action that re-fetches the official site and refreshes
  the record.

## API

All routes require the existing admin session (`x-admin-session` header or
`?session=`). Mounted at `/api/leads`.

| Method | Route | Purpose |
|---|---|---|
| GET | `/config` | Priority countries/cities, sources, limits, compliance text |
| GET | `/stats` | Totals, country/potential/status breakdowns |
| GET | `/` | Filtered, paginated lead list |
| GET | `/map` | Lightweight map points |
| GET | `/:id` | Full lead record |
| POST | `/` | Create a manual lead |
| PATCH | `/:id` | Update pipeline/notes/contact fields |
| DELETE | `/:id` | Delete a lead |
| POST | `/:id/verify` | Re-fetch the official website and re-score |
| POST | `/research` | Start a background research job |
| GET | `/jobs` / `/jobs/:id` | Research run status |
| POST | `/import` | Import JSON rows (the UI parses CSV client-side) |
| GET | `/export` | CSV export of the current filter |

### List filters

`q`, `country`, `city`, `potential`, `status`, `pipeline`, `compliance`,
`category`, `source`, `has_email=1`, `has_whatsapp=1`, `verified=1`,
`bbox=south,west,north,east`, `limit`, `offset`, `sort`.

## Data model

`leads` table (SQLite):

- identity: `name`, `legal_name`, `category`, `description`
- location: `address`, `city`, `region`, `postal_code`, `country_code`,
  `country`, `latitude`, `longitude`, `geo_precision`
- contact: `website`, `domain`, `email`, `phone`, `whatsapp`,
  `instagram`, `facebook`, `linkedin`
- intelligence: `services`, `tags`, `potential`, `score`, `confidence`,
  `verification_status`, `pipeline_status`, `compliance_status`,
  `compliance_flags`
- provenance: `source`, `source_url`, `source_id`, `evidence_url`,
  `last_verified_at`, `raw_data`
- governance: `opt_out`, `notes`, timestamps

`research_jobs` stores each run's targets, progress, counters and log.

## Verification model

| State | Meaning |
|---|---|
| `discovered` | Found in a public source; little or no enrichment |
| `enriched` | Website/contact data captured, but not enough for verified |
| `verified` | Street-level coordinates + reachable official website + public contact |
| `needs_review` | Public site signals a compliance concern; no outreach |
| `contacted` / `qualified` | Human-managed pipeline state |
| `rejected` | Opted out / archived |

Confidence is composed of location (0–35), contact (0–25), website (0–12) and
service relevance (0–10). Potential is `high` ≥ 70, `medium` ≥ 45, otherwise
`low`. Every point has a reason in `raw_data.scoring.reasons`.

## Compliance and data policy

- Only publicly published **business** contact data is stored.
- No private individuals, login-protected pages, paywall bypass, or social
  network scraping.
- `robots.txt` is checked before fetching a page; response size and time are
  capped; private/link-local addresses are blocked to prevent SSRF.
- Duplicate rows are merged by OSM id, domain, phone or name + city.
- Opt-outs are stored and excluded from exports.
- Emissions-delete/defeat wording is flagged for human review. The system does
  not market those services.
- There is **no automated sending**. CSV export is for a human-reviewed CRM.
- Verify GDPR/UK GDPR, CAN-SPAM, local ePrivacy and road-emissions rules before
  outreach. The compliance flag is a review aid, not legal advice.

## Scaling notes

The default flow is intentionally bounded so a single operator can run it on a
small server:

- one Overpass query per target; public mirrors with backoff,
- Nominatim at ≤ 1 request/second,
- website enrichment at 3 concurrent requests,
- interactive runs capped at 12 targets / 500 candidates,
- in-process job queue (two active runs), with stale jobs marked failed on
  restart.

For large campaigns, run the agent as a separate worker, use a self-hosted
Overpass instance or a commercial places API, and move the lead store to
Postgres. The store and agent are isolated under `leads/` for that migration.

## Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `DATA_DIR` | repo root | SQLite location (`database.sqlite`) |
| `OVERPASS_URLS` | public mirrors | Comma-separated Overpass endpoints |
| `NOMINATIM_URL` | `https://nominatim.openstreetmap.org` | Nominatim endpoint |
| `LEAD_RESEARCH_CONTACT` | `admin@ecu-tuning.example` | Contact in the research User-Agent |
| `LEAD_FETCH_TIMEOUT_MS` | `12000` | Website fetch timeout |
| `LEAD_MAX_PAGE_BYTES` | `2500000` | Max page size |

Set `LEAD_RESEARCH_CONTACT` to a real operations address before running
research at any volume, so public data providers can contact you if needed.
