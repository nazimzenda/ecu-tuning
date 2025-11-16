# ✅ Pre-Deployment Checklist

## 📋 Before You Deploy

### Code Preparation
- [x] All code files ready
- [x] `.gitignore` configured (excludes uploads, database, .env)
- [x] `Procfile` created for Railway
- [x] `package.json` has start script
- [x] Server configured for cloud (PORT from env)

### Security
- [ ] **CHANGE ADMIN PASSWORD** (default: admin123)
- [ ] Set strong `ADMIN_PASSWORD` in environment variables
- [ ] Never commit `.env` file
- [ ] Never commit database files

### Email Setup
- [ ] Gmail App Password created
- [ ] Or SendGrid/Mailgun account ready
- [ ] SMTP credentials ready to add

### WhatsApp Setup (Optional)
- [ ] Twilio account created
- [ ] Account SID and Auth Token ready
- [ ] Or ready to use manual WhatsApp links

### Testing
- [ ] Tested locally
- [ ] Email sending works
- [ ] WhatsApp works (if configured)
- [ ] File upload works
- [ ] Admin login works

---

## 🚀 Deployment Steps

### 1. Push to GitHub
```powershell
git init
git add .
git commit -m "ECU Tuning Service - Production Ready"
git remote add origin https://github.com/YOUR_USERNAME/ecu-tuning-service.git
git push -u origin main
```

### 2. Deploy on Railway
1. Go to https://railway.app
2. Sign up with GitHub
3. New Project → Deploy from GitHub
4. Select your repo
5. Wait for deployment

### 3. Configure Environment Variables

In Railway → Your Project → Variables:

**Required:**
```bash
ADMIN_PASSWORD=YourSecurePassword123!
```

**Email (Required for notifications):**
```bash
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-16-char-app-password
```

**WhatsApp (Optional):**
```bash
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_WHATSAPP_NUMBER=whatsapp:+14155238886
```

### 4. Get Your URL
Railway provides: `https://your-app-name.railway.app`

### 5. Test Everything
- [ ] Visit your URL
- [ ] Submit test order
- [ ] Login to admin panel
- [ ] Upload modified file
- [ ] Check email received
- [ ] Check WhatsApp (if configured)

---

## 📧 Email Setup Details

### Gmail App Password:
1. Go to: https://myaccount.google.com/apppasswords
2. Enable 2FA first (if not already)
3. Create app password for "Mail"
4. Copy 16-character password (no spaces in Railway)

### Other Providers:
- **SendGrid**: Free 100 emails/day
- **Mailgun**: Free 5,000 emails/month
- **AWS SES**: Very cheap, production-ready

---

## 📱 WhatsApp Setup Details

### Twilio (Recommended):
1. Sign up: https://www.twilio.com/try-twilio
2. Get $15.50 free credit
3. Copy Account SID and Auth Token
4. Use sandbox number for testing
5. Upgrade to production number later

### Manual Alternative:
- If Twilio not configured, system generates WhatsApp link
- Admin can click link to send message manually
- Works without any API setup

---

## 🔄 After Deployment

### Monitor:
- Check Railway logs for errors
- Monitor email delivery
- Check WhatsApp messages
- Track file uploads

### Updates:
- Push to GitHub = Auto-deploy
- Railway redeploys automatically
- No downtime (usually)

### Backup:
- Database: Railway provides backups
- Files: Consider cloud storage (S3) for production
- Or use Railway volumes for persistence

---

## 🆘 Common Issues

### Email not sending:
- ✅ Check SMTP credentials
- ✅ Verify App Password (Gmail)
- ✅ Check spam folder
- ✅ Review Railway logs

### WhatsApp not working:
- ✅ Verify Twilio credentials
- ✅ Check phone number format (+country code)
- ✅ Verify sandbox setup
- ✅ Check Twilio console

### Files not persisting:
- ✅ Railway volumes for file storage
- ✅ Or migrate to cloud storage (S3)

---

## 📊 Cost Estimate

**Railway:**
- Free: $5 credit/month (usually enough)
- Hobby: $5/month if needed

**Email:**
- Gmail: Free
- SendGrid: Free (100/day) or $15/month

**WhatsApp:**
- Twilio: ~$0.005 per message
- Free $15.50 credit to start

**Total: ~$0-5/month** for small scale! 🎉

---

## ✅ You're Ready!

Follow `QUICK_DEPLOY.md` for step-by-step instructions.

**Your app will be live in 5 minutes!** 🚀

