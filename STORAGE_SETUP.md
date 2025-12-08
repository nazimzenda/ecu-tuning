# 📦 ECU Tuning Service - Storage Setup Guide

This guide explains how to set up persistent storage for your Railway deployment.

---

## 🚨 The Problem

By default on Railway (Free plan):
- **Ephemeral storage**: Data disappears on every redeploy
- **Your uploaded files are LOST** when you push code changes
- **Your database resets** after each deployment

---

## 📊 Storage Options Comparison

| Option | Storage Limit | Cost | Best For |
|--------|--------------|------|----------|
| **Railway Volume (Free)** | 500 MB | Free | Small business (5-25 orders) |
| **Railway Volume (Hobby)** | 5 GB | $5/month | Growing business (~100 orders) |
| **Firebase Storage** | 5 GB | Free | Unlimited orders, cloud-based |

---

## Option 1: Railway Volume (Recommended for Simplicity)

### Step 1: Go to Railway Dashboard
1. Visit: https://railway.app/dashboard
2. Click on your **ecu-tuning** project
3. Click on your **service** (the deployed app)

### Step 2: Create a Volume
1. Press `Cmd+K` (Mac) or `Ctrl+K` (Windows) to open Command Palette
2. Type "Volume" and select **"Add Volume"**
3. Or right-click on the canvas → **"Add Volume"**

### Step 3: Configure the Volume
1. **Mount Path**: `/app/data`
2. Click **Create**

### Step 4: Connect Volume to Service
1. Click on the volume you just created
2. Click **"Connect to Service"**
3. Select your main service
4. Confirm the mount path: `/app/data`

### Step 5: Update Environment Variables
In Railway dashboard, add/update these variables:

```
DATA_DIR=/app/data
```

### Step 6: Redeploy
After adding the volume, Railway will automatically redeploy your service.

### Volume Storage Limits (Free Plan)

| Average File Size | Max Orders |
|-------------------|------------|
| 10 MB | ~25 orders |
| 20 MB | ~12 orders |
| 30 MB | ~8 orders |
| 50 MB | ~5 orders |

---

## Option 2: Firebase Storage (Recommended for Scale)

Firebase Storage gives you **5 GB FREE** - that's 10x more than Railway Volume!

### Step 1: Create Firebase Project
1. Go to: https://console.firebase.google.com/
2. Click **"Add Project"**
3. Name it: `ecu-tuning-storage`
4. Disable Google Analytics (optional)
5. Click **Create Project**

### Step 2: Enable Storage
1. In Firebase Console, click **"Storage"** in left sidebar
2. Click **"Get Started"**
3. Select **"Start in test mode"** (for now)
4. Choose region: `europe-west1` (closest to Morocco)
5. Click **Done**

### Step 3: Get Storage Bucket Name
1. After Storage is enabled, you'll see a bucket URL like:
   ```
   gs://ecu-tuning-storage.appspot.com
   ```
2. Your bucket name is: `ecu-tuning-storage.appspot.com`

### Step 4: Create Service Account
1. Go to **Project Settings** (gear icon) → **Service Accounts**
2. Click **"Generate new private key"**
3. Download the JSON file
4. Keep this file safe - it contains your credentials!

### Step 5: Add Credentials to Railway
1. Go to Railway dashboard → your project → Variables
2. Add these environment variables:

```
USE_FIREBASE=1
FIREBASE_STORAGE_BUCKET=ecu-tuning-storage.appspot.com
GOOGLE_SERVICE_ACCOUNT_JSON={"type":"service_account","project_id":"...paste entire JSON here..."}
```

**Important**: Paste the entire service account JSON on ONE LINE (no line breaks)

### Step 6: Update Storage Rules (Optional - for security later)
In Firebase Console → Storage → Rules:

```javascript
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /uploads/{allPaths=**} {
      allow read: if true;  // Public downloads
      allow write: if false; // Only server can write
    }
  }
}
```

### Step 7: Redeploy
Push any change to trigger a redeploy, or manually redeploy from Railway dashboard.

---

## 🔧 How It Works

### With Railway Volume Only (USE_FIREBASE=0)

```
Customer uploads file
        ↓
Saved to: /app/data/uploads/filename.bin
        ↓
Railway Volume persists the file
        ↓
Survives redeploys ✅
```

### With Firebase Storage (USE_FIREBASE=1)

```
Customer uploads file
        ↓
Saved temporarily to: /app/uploads/filename.bin
        ↓
Uploaded to Firebase Storage: gs://bucket/uploads/filename.bin
        ↓
Download URL saved in Firestore database
        ↓
Local file can be deleted (optional)
        ↓
Unlimited cloud storage ✅
```

---

## 📋 Environment Variables Reference

### For Railway Volume Only:
```env
USE_FIREBASE=0
DATA_DIR=/app/data
```

### For Firebase Storage:
```env
USE_FIREBASE=1
FIREBASE_STORAGE_BUCKET=your-project.appspot.com
GOOGLE_SERVICE_ACCOUNT_JSON={"type":"service_account",...}
```

---

## 🧪 Testing Your Setup

### Test Railway Volume:
1. Upload a file through the client portal
2. Go to Railway dashboard → Logs
3. Look for: `✅ File saved to volume: /app/data/uploads/...`
4. Redeploy your app (push a small change)
5. Check if the file is still accessible

### Test Firebase Storage:
1. Upload a file through the client portal
2. Go to Railway logs
3. Look for: `✅ File uploaded to Firebase Storage: https://...`
4. Go to Firebase Console → Storage → Files
5. You should see your uploaded file there

---

## ❓ FAQ

### Q: Can I use both Railway Volume AND Firebase Storage?
**A:** Yes! Use Railway Volume for the database (`database.sqlite`) and Firebase Storage for large ECU files.

### Q: What happens to existing files when I enable Firebase?
**A:** New files go to Firebase. Existing files stay on Railway (if you have a volume) or are lost (if ephemeral).

### Q: How do I migrate existing files to Firebase?
**A:** You would need to download files from Railway and re-upload through the admin panel, or write a migration script.

### Q: Is Firebase Storage secure?
**A:** Yes, when properly configured. The server uses a service account with full access, but public download URLs are generated with secure tokens.

---

## 🆘 Need Help?

If you run into issues:
1. Check Railway logs for error messages
2. Verify environment variables are set correctly
3. Make sure Firebase service account JSON is on ONE LINE
4. Test locally first with Firebase emulators

---

**Last Updated**: December 8, 2025
