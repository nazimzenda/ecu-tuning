# FREE HOSTING ANALYSIS — ECU Tuning Service

**Date:** 2026-11-05 · **Budget:** strictly $0 · **Constraint:** laptop is NOT part of the production architecture
All allowances below were verified against official provider pages on 2026-11-05 (source URLs in `hosting-research-notes.md`). Providers whose pages could not be reached are marked UNVERIFIED.

---

## 1. What we actually need to host

| Need | Current implementation | Hard to host for free? |
|---|---|---|
| Static frontend (client + admin) | `public/` — vanilla HTML/CSS/JS, no build | Easy (any static host) |
| API backend | Express 4, 11 routes, 31KB monolithic `server.js` | Hard — see §2 |
| Database | SQLite file via **native** `sqlite3` module (1 table, no indexes) | Hard on FaaS; easy on a real VM |
| File storage (uploads) | multer → local disk `uploads/` (ECU binaries up to 50MB) | Hard on FaaS (ephemeral disk) |
| Email notifications | Resend / SMTP | Easy (Resend free tier) |
| WhatsApp notifications | Twilio | Not free beyond 1,000 msgs/mo (see §3) |
| Reverse proxy | nginx (:8080) in the container | Only needed in VM topology |

## 2. Reality check: can the CURRENT backend run unchanged on free serverless?

**No.** Cloudflare Workers are V8 isolates: no native `sqlite3` module, no writable disk (multer writes are impossible), no long-running process, 30s CPU cap. Vercel/Netlify functions are Lambda-like: Express needs an adapter, `/tmp` is wiped between invocations, and 50MB binary uploads exceed default body limits.

**What CAN run the current code unchanged:** real VMs / container hosts with persistent disk (Oracle Always Free, Render free web services with caveats). Everything else requires a **moderate refactor** (DB driver swap + upload path rewrite).

## 3. Verified free-tier table (fetched 2026-11-05)

| Provider | Free allowance (verified) | Card | Sleep/idle | Runs current Express+sqlite3+multer unchanged? |
|---|---|---|---|---|
| Cloudflare Pages | 500 builds/mo, 20k files, 25MiB/file, 100 domains, unlimited bandwidth, no egress fees | No | None | Static only (frontend) |
| Cloudflare Workers | 100k requests/day; D1 5GB + 5M rows read/day; R2 10GB/mo + 10M Class B ops; KV 100k reads/day; zero egress | No | None | ❌ Needs refactor (see §2) |
| GitHub Pages | Static only; soft 100GB/mo bandwidth; site ≤1GB; ToS forbids commercial use | No | None | Static only |
| Netlify | $0 but credit-based since Sep 2025: ~300 credits/mo ≈ 15GB bandwidth, 30 GB-hrs compute, 20 deploys; pauses at limit | No | Pauses at limit | ❌ Lambda-style functions, ephemeral /tmp |
| Vercel Hobby | 100GB transfer/mo, 1M function invocations, 4h fluid CPU | No | None | ❌ Ephemeral /tmp, body-size limits vs 50MB uploads |
| Neon (Postgres) | No card; 100 projects, 1GB storage, 5GB object storage, 100 CU-hrs/project | No | Scale-to-zero after 5 min | DB only |
| Supabase (Postgres) | 500MB DB, 2 projects, 5GB egress, 1GB storage | No | Paused after 1 week inactive | DB only |
| Turso (libSQL/SQLite) | No card; 100 DBs, 5GB storage, 500M rows read/mo (merging with Supabase) | No | None | DB only — SQLite dialect, smallest migration |
| Cloudflare D1 (SQLite) | 5GB storage, 5M row reads/day (included with Workers free) | No | None | DB only — SQLite dialect |
| Koyeb | ⚠️ No free compute tier anymore (pivoted to GPU/AI) | n/a | — | Not viable at $0 |
| Render | Free web services reinstated: 750 instance-hrs/mo, 5GB bandwidth, 500 build mins | No | **Spin-down after 15 min idle; ephemeral FS; SMTP blocked**; free Postgres expires in 30 days | ⚠️ Runs, but uploads+DB lost on spin-down; email broken |
| Fly.io | ❌ No free tier (only $1/7-day trial, then card required) | Yes | — | Not $0 |
| Adaptable.io | UNVERIFIED (site unreachable during research) | ? | Historically sleeps on idle | Unverified |
| Oracle Cloud Always Free | 2 AMD Micro + Ampere A1 (4 OCPU/24GB) VMs, 200GB block storage, forever | **Yes** (identity verification) | None (30-day idle → suspension risk) | ✅ Runs unchanged (real VM, persistent disk, full Node, SMTP) |
| Resend (email) | 100 emails/day (~3,000/mo), 3 domains | No | None | Email only |
| WhatsApp (Meta Cloud API) | 1,000 free service msgs/mo per number + 7-day free-entry window; beyond that pay-per-message (payment method required) | Payment method for paid tier | — | Notify only — **no free-unlimited path exists** |

**2025–2026 policy changes that affect us:** Netlify moved to credit-based free tier (Sep 2025); Fly.io removed free allowances (Oct 2024); Koyeb left free compute; Turso merged into Supabase; Render reinstated free web services (with spin-down + SMTP block); Resend dropped from 3,000/mo to 100/day; Meta resumed charging WhatsApp service messages with a 1,000/mo free tier (Oct 2026).

## 4. Conclusion per component

| Component | Free verdict |
|---|---|
| Frontend | ✅ Trivially free (Cloudflare Pages / GitHub Pages / Netlify / Vercel) |
| API backend | ✅ Free IF refactored to Workers (or Vercel/Netlify functions with rewritten upload path); ⚠️ free-but-fragile unchanged on Render; ✅ free unchanged on Oracle (card at signup only) |
| Database | ✅ Free (D1 or Turso keep the SQLite dialect; Neon/Supabase require a Postgres rewrite) |
| ECU file storage | ✅ Free (Cloudflare R2 10GB, zero egress) |
| Email | ✅ Free (Resend 100/day) |
| WhatsApp | ⚠️ Not fully free — 1,000 service msgs/mo free, then paid. No free alternative exists. |
| Domain | ✅ Free subdomain (e.g., `*.pages.dev`, `*.vercel.app`) or a self-owned domain |
| CI/CD | ✅ Free (Cloudflare Pages git integration, GitHub Actions free tier) |
| Monitoring | ✅ Free (Cloudflare Analytics, Workers logs; simple uptime checks) |

## 5. What genuinely CANNOT be free

1. **WhatsApp notifications beyond 1,000 service messages/month** — Meta charges per message after the free tier. Realistic mitigation: make WhatsApp optional (fall back to email), or accept the paid tier only if volume justifies it.
2. **Guaranteed no-sleep compute at $0 with no card and no refactor** — this combination does not exist in 2026. You must pick one concession: refactor (→ Workers, no sleep, no card), or a card for identity verification (→ Oracle Always Free, no refactor), or accept 15-min idle spin-downs with data loss (→ Render, no card, not recommended for this app).
3. **50MB binary uploads on serverless function tiers** — Vercel/Netlify function body limits make the current multer flow impractical; the upload path must move to R2 (presigned URL or direct upload) regardless of which serverless provider is chosen.
