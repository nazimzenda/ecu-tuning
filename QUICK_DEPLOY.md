# ⚡ Quick Deploy Guide - 5 Minutes

## 🚀 Fastest Way: Railway

### Step 1: Push to GitHub (2 min)

```powershell
# If you haven't initialized git yet
git init
git add .
git commit -m "ECU Tuning Service - Ready for deployment"

# Create a new repository on GitHub.com, then:
git remote add origin https://github.com/YOUR_USERNAME/ecu-tuning-service.git
git branch -M main
git push -u origin main
```

### Step 2: Deploy on Railway (2 min)

1. Go to: **https://railway.app**
2. Click **"Start a New Project"**
3. Select **"Deploy from GitHub repo"**
4. Choose your repository
5. Railway auto-detects Node.js and deploys!

### Step 3: Add Environment Variables (1 min)

In Railway dashboard → Your Project → Variables:

**Copy and paste these (update with your values):**

```bash
ADMIN_PASSWORD=ChangeThisToSecurePassword123!

SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-16-char-app-password

TWILIO_ACCOUNT_SID=your_twilio_sid
TWILIO_AUTH_TOKEN=your_twilio_token
TWILIO_WHATSAPP_NUMBER=whatsapp:+14155238886
```

### Step 4: Get Your URL

Railway gives you: `https://your-app-name.railway.app`

**Done!** 🎉 Your app is live!

---

## 📧 Quick Email Setup (Gmail)

1. Go to: https://myaccount.google.com/apppasswords
2. Select "Mail" → "Other" → Name it "ECU Service"
3. Copy the 16-character password
4. Paste in Railway: `SMTP_PASS=xxxx xxxx xxxx xxxx`

---

## 📱 Quick WhatsApp Setup (Twilio)

1. Sign up: https://www.twilio.com/try-twilio (Free $15.50 credit)
2. Get Account SID and Auth Token from dashboard
3. Add to Railway variables
4. Join sandbox: Send "join [code]" to Twilio WhatsApp number

---

## ✅ Test Your Deployment

1. Visit: `https://your-app-name.railway.app`
2. Submit a test order
3. Login to admin: `/admin` (password from ADMIN_PASSWORD)
4. Upload modified file
5. Check email and WhatsApp!

---

## 🔄 Update Your App

Just push to GitHub:
```powershell
git add .
git commit -m "Update"
git push
```

Railway auto-deploys! ✨

---

**That's it!** Your service is now live in the cloud! ☁️

