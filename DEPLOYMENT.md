# 🚀 Deployment Guide - Production Ready

## Security Checklist

### 1. Change Admin Password

**IMPORTANT:** The default admin password is `admin123`. Change it immediately!

**Option A: Environment Variable (Recommended)**
```powershell
# Windows PowerShell
$env:ADMIN_PASSWORD="YourStrongPassword123!"
npm.cmd start
```

**Option B: Edit server.js**
```javascript
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'YourStrongPassword123!';
```

### 2. Production Environment Variables

Create a `.env` file (or use environment variables):
```
ADMIN_PASSWORD=YourStrongPassword123!
PORT=3000
```

### 3. Install Production Dependencies

```powershell
npm.cmd install --production
```

### 4. Use Process Manager (Recommended)

**Using PM2:**
```powershell
npm.cmd install -g pm2
pm2 start server.js --name ecu-tuning-service
pm2 save
pm2 startup
```

**Using Windows Service:**
- Use `node-windows` or `pm2-windows-service`

### 5. Reverse Proxy (Nginx/Apache)

**Nginx Configuration:**
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

### 6. SSL/HTTPS (Required for Production)

- Use Let's Encrypt for free SSL certificates
- Configure your reverse proxy to handle SSL
- Force HTTPS redirects

### 7. File Upload Limits

Current limit: 50MB
- Adjust in `server.js` if needed:
```javascript
limits: { fileSize: 50 * 1024 * 1024 } // 50MB
```

### 8. Database Backup

**Backup SQLite database:**
```powershell
# Create backup script
Copy-Item database.sqlite "backups/database_$(Get-Date -Format 'yyyyMMdd_HHmmss').sqlite"
```

**Automated backups:**
- Set up a scheduled task (Windows Task Scheduler)
- Or use a cron job on Linux

### 9. Monitoring

- Set up error logging
- Monitor disk space (uploads folder)
- Monitor server resources
- Set up alerts for errors

### 10. Firewall Configuration

- Only expose port 80/443 (via reverse proxy)
- Block direct access to port 3000
- Use firewall rules to restrict access

## Hosting Options

### Option 1: VPS (DigitalOcean, Linode, AWS EC2)
- Full control
- Install Node.js
- Use PM2 or systemd
- Set up Nginx reverse proxy

### Option 2: Platform as a Service
- **Heroku**: Easy deployment
- **Railway**: Simple setup
- **Render**: Free tier available
- **Fly.io**: Good performance

### Option 3: Windows Server
- Install Node.js
- Use IIS with iisnode
- Or use PM2 for Windows

## Quick Production Checklist

- [ ] Changed admin password
- [ ] Set up environment variables
- [ ] Configured reverse proxy (Nginx/Apache)
- [ ] Set up SSL/HTTPS
- [ ] Configured firewall
- [ ] Set up database backups
- [ ] Configured process manager (PM2)
- [ ] Set up monitoring/logging
- [ ] Tested file uploads
- [ ] Tested admin login
- [ ] Tested all order workflows

## Environment Variables

Create a `.env` file:
```
ADMIN_PASSWORD=YourSecurePassword123!
PORT=3000
NODE_ENV=production
```

## Performance Tips

1. **Enable compression:**
```javascript
const compression = require('compression');
app.use(compression());
```

2. **Set up caching for static files**

3. **Monitor uploads folder size** - implement cleanup for old files

4. **Use CDN for static assets** (if needed)

## Security Best Practices

1. ✅ Admin authentication (implemented)
2. ✅ File type validation (implemented)
3. ✅ File size limits (implemented)
4. ⚠️ Add rate limiting (recommended)
5. ⚠️ Add CSRF protection (recommended)
6. ⚠️ Add input sanitization (recommended)
7. ⚠️ Regular security updates

## Support

For issues or questions, check:
- Server logs
- Browser console
- Database integrity
- File permissions

---

**Remember:** Always test in a staging environment before deploying to production!

