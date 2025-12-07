# 🚀 ECU Tuning Service — Deployment (Production Ready)

**Status:** ✅ Complete and production-ready

---

## What’s Included

**Client (http://localhost:3000)**
- Premium UI with hero background, ECU file upload (.bin, .hex, .ori, .winols, .dam), vehicle/service selection, custom description, WhatsApp opt-in, progress bar, 50MB limit, CORS-enabled.

**Admin (http://localhost:3001)**
- Password login (`admin123` — change for prod), dashboard stats, click-to-filter status cards, search by name/email/vehicle/service, detailed modal (status, vehicle, service, customer, files, timeline), download/upload files, status changes, delete orders.

**API (http://localhost:4000)**
- REST endpoints, file uploads, order CRUD, admin auth, email (SMTP) + WhatsApp (Twilio) notifications, SQLite persistence, status tracking.

**Design/UX**
- Premium styling, responsive, animations, glassy cards, background image.

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
ADMIN_PASSWORD=admin123      # change in production
```

**Email (optional)**
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

**Runtime**
```
PORT=4000            # API port if overriding
NODE_ENV=production
```

---

## Production Hardening Checklist

- [ ] Change `ADMIN_PASSWORD` (env var preferred).
- [ ] Add `.env` and keep it out of git; set env vars in hosting platform.
- [ ] Install prod deps: `npm install --production` (or `npm ci --only=production`).
- [ ] Run under a process manager (PM2/systemd/IIS).
- [ ] Put a reverse proxy in front (Nginx/Apache/IIS) and terminate TLS (LetsEncrypt).
- [ ] Force HTTPS redirects; expose only 80/443; block direct access to app ports.
- [ ] Verify 50MB upload limit (adjust in `server.js` if needed).
- [ ] Set up SQLite backups (copy `database.sqlite` to `backups/` on a schedule).
- [ ] Add monitoring/logging and disk space alerts (uploads folder).
- [ ] Test uploads/admin login/order flows in staging.

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

## Performance & Security Notes

- Enable compression (`compression` middleware) and static caching headers.
- Monitor uploads folder size; prune old files if needed.
- Consider CDN for static assets if traffic is high.
- Add rate limiting, CSRF protection, and input sanitization for external exposure.
- Keep dependencies updated and apply OS security patches.

---

## Verification Checklist (prod/staging)

- [ ] Client at http://localhost:3000 (or your domain) loads.
- [ ] Admin at http://localhost:3001 (or proxied path) loads and login works.
- [ ] API responds on expected port/URL.
- [ ] File upload/download and status changes work.
- [ ] Search/filter and modal details work.
- [ ] Backups run successfully; restore tested.
- [ ] HTTPS enforced; firewall rules applied.

---

## Support & References

- `README.md` — main guide
- `MAINTENANCE.md` — quick start + ongoing ops
- `ARCHITECTURE.md` — system details
- `SEARCH_FILTER_GUIDE.md` — admin search/filter
- `DEPLOYMENT.md` — this guide

**Last Updated:** December 7, 2025

