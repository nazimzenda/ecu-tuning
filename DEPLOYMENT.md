# 🚀 ECU Tuning Service — Deployment (Production Ready)

**Status:** ✅ Complete and production-ready  
**Last Updated:** December 10, 2025

---

## What's Included

**Client (http://localhost:3000)**
- Premium UI with hero background, ECU file upload (.bin, .hex, .ori, .winols, .dam), vehicle/service selection, custom description, WhatsApp opt-in, progress bar, 50MB limit, CORS-enabled.
- Optimized with gzip compression, caching, and reduced animations.

**Admin (http://localhost:3001)**
- Password login (`admin123` — change for prod), dashboard stats, click-to-filter status cards, search by name/email/vehicle/service, detailed modal (status, vehicle, service, customer, files, timeline), download/upload files, status changes, delete orders.
- Admin receives email alerts for new orders with direct link to admin panel.

**API (http://localhost:4000)**
- REST endpoints, file uploads, order CRUD, admin auth, Resend email API (recommended) or SMTP, SQLite persistence, status tracking.
- Modified files sent as email attachments to customers.
- Gzip compression enabled for all responses.

**Design/UX**
- Premium styling, responsive, optimized animations (respects prefers-reduced-motion), glassy cards, background image.
- GPU-accelerated transforms, preload/preconnect hints.

---

## Quick Start (Local)

```powershell
# Start all servers
./scripts/start-clean.ps1

# Access
# Client: http://localhost:3000
# Admin:  http://localhost:3001 (password: admin123)
# API:    http://localhost:4000

# Stop all servers
./scripts/stop-all.ps1
```

---

## Deployment Options

1) **Railway (recommended)** — connect repo, set env vars, deploy.
2) **Docker** — `docker-compose up -d`.
3) **Node direct** — `npm run start:api`, `npm run start:client`, `npm run start:admin`.

---

## Environment Variables

**Required**
```
ADMIN_PASSWORD=your-secure-password   # change from default!
```

**Email - Resend API (Recommended for Railway)**
```
RESEND_API_KEY=re_xxxxxxxxxxxx
EMAIL_FROM=ECU Tuning Pro <onboarding@resend.dev>
ADMIN_EMAIL=your-admin@gmail.com
```

**Email - SMTP (Alternative for local dev)**
```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
```

**WhatsApp/Twilio (optional)**
```
TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
TWILIO_WHATSAPP_NUMBER=whatsapp:+1234567890
```

**Database (Railway Volume)**
```
DATA_DIR=/app/data      # Railway volume mount for persistent storage
USE_FIREBASE=0          # Use SQLite (default)
```

**Runtime**
```
API_PORT=4000
CLIENT_PORT=3000
ADMIN_PORT=3001
NODE_ENV=production
```

---

## Production Hardening Checklist

- [x] Gzip compression enabled on all servers
- [x] Static file caching (1 day in production)
- [x] CSS animations optimized (prefers-reduced-motion support)
- [ ] Change `ADMIN_PASSWORD` (env var preferred)
- [ ] Set up Resend API key for email delivery
- [ ] Add `ADMIN_EMAIL` to receive new order notifications
- [ ] Verify domain in Resend to send emails to customers
- [ ] Set up Railway volume for persistent storage (DATA_DIR=/app/data)
- [ ] Put a reverse proxy in front (Nginx/Apache) and terminate TLS
- [ ] Force HTTPS redirects
- [ ] Set up SQLite backups (copy `database.sqlite` on schedule)
- [ ] Add monitoring/logging and disk space alerts

### Reverse Proxy (Nginx sample)
```nginx
server {
    listen 80;
    server_name yourdomain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### Process Manager (PM2 example)
```powershell
npm install -g pm2
pm2 start server.js --name ecu-tuning-service
pm2 save
pm2 startup
```

### Backup snippet (Windows)
```powershell
Copy-Item database.sqlite "backups/database_$(Get-Date -Format 'yyyyMMdd_HHmmss').sqlite"
```

---

## Railway Deployment Guide

### Step 1: Connect Repository
1. Go to [railway.app](https://railway.app)
2. Create new project → Deploy from GitHub
3. Select your `ecu-tuning` repository

### Step 2: Add Volume for Persistence
1. Click "+ New" → Volume
2. Set mount path: `/app/data`
3. This stores database.sqlite and uploaded files

### Step 3: Set Environment Variables
```
ADMIN_PASSWORD=your-secure-password
DATA_DIR=/app/data
USE_FIREBASE=0
RESEND_API_KEY=re_xxxxxxxxxxxx
ADMIN_EMAIL=your-email@gmail.com
NODE_ENV=production
```

### Step 4: Deploy
Railway auto-deploys on git push to master branch.

---

## Performance & Security Notes

- ✅ Gzip compression enabled (`compression` middleware)
- ✅ Static caching headers (1 day for CSS, JS, images)
- ✅ CSS animations respect `prefers-reduced-motion`
- ✅ GPU acceleration for animated elements
- Monitor uploads folder size; prune old files if needed
- Consider CDN for static assets if traffic is high
- Add rate limiting for production exposure
- Keep dependencies updated

---

## Verification Checklist (prod/staging)

- [ ] Client loads at your domain
- [ ] Admin login works with correct password
- [ ] File upload works and saves to Railway volume
- [ ] Admin receives email for new orders
- [ ] Customer receives email with file attachment when modified file uploaded
- [ ] Download links work for both original and modified files
- [ ] Backups run successfully
- [ ] HTTPS enforced

---

## Support & References

- `README.md` — main guide
- `MAINTENANCE.md` — quick start + ongoing ops
- `ARCHITECTURE.md` — system details
- `FIREBASE_SETUP.md` — optional Firebase configuration

**Last Updated:** December 10, 2025

