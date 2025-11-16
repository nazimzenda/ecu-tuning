# 🐳 Docker Container Guide - Complete

## ✅ What's Been Created

Your app is now fully containerized with:

- ✅ `Dockerfile` - Container definition
- ✅ `docker-compose.yml` - Easy orchestration
- ✅ `.dockerignore` - Excludes unnecessary files
- ✅ `docker-start.ps1` - Windows quick start script
- ✅ `DOCKER_GUIDE.md` - Complete documentation

---

## 🚀 Quick Start (Windows PowerShell)

### Option 1: One-Click Start (Easiest)

```powershell
.\docker-start.ps1
```

This script will:
- Check if Docker is running
- Create .env template if needed
- Build the Docker image
- Start the container
- Show you the URLs

### Option 2: Manual Commands

```powershell
# 1. Build the image
docker-compose build

# 2. Start the container
docker-compose up -d

# 3. View logs
docker-compose logs -f
```

### Option 3: Direct Docker Commands

```powershell
# Build
docker build -t ecu-tuning-service .

# Run
docker run -d -p 3000:3000 --name ecu-tuning-service ecu-tuning-service
```

---

## 📋 Before Running

### 1. Create .env File (Optional but Recommended)

Create `.env` in project root:
```bash
ADMIN_PASSWORD=YourSecurePassword123!
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-16-char-app-password
TWILIO_ACCOUNT_SID=your_sid
TWILIO_AUTH_TOKEN=your_token
```

### 2. Ensure Docker Desktop is Running

- Check system tray for Docker icon
- Docker Desktop must be running

---

## 🌐 Access Your App

After starting:
- **Client Interface**: http://localhost:3000
- **Admin Panel**: http://localhost:3000/admin

---

## 📦 What Gets Containerized

- ✅ Node.js application
- ✅ All dependencies (npm packages)
- ✅ Application code
- ✅ Database (SQLite) - persisted via volume
- ✅ Uploads folder - persisted via volume

---

## 🔧 Environment Variables

### Set in .env file:
```bash
ADMIN_PASSWORD=your_password
SMTP_USER=your_email
SMTP_PASS=your_password
```

### Or pass directly:
```powershell
docker run -d -p 3000:3000 -e ADMIN_PASSWORD=your_password ecu-tuning-service
```

---

## 📊 Volume Mounts (Data Persistence)

Your `docker-compose.yml` includes:
- **Database**: `./database.sqlite` → `/app/database.sqlite`
- **Uploads**: `./uploads` → `/app/uploads`

This means:
- ✅ Data persists when container restarts
- ✅ Files are accessible on your host machine
- ✅ Database survives container removal

---

## 🛠️ Common Commands

### View Logs
```powershell
docker-compose logs -f
```

### Stop Container
```powershell
docker-compose down
```

### Restart Container
```powershell
docker-compose restart
```

### Rebuild After Code Changes
```powershell
docker-compose up -d --build
```

### Check Container Status
```powershell
docker-compose ps
docker ps
```

### Execute Commands Inside Container
```powershell
docker exec -it ecu-tuning-service sh
```

### Remove Everything
```powershell
docker-compose down -v  # Removes volumes too
```

---

## 🚀 Deploy to Cloud with Docker

### Railway (Recommended)
1. Push code to GitHub (with Dockerfile)
2. Deploy on Railway
3. Railway auto-detects Dockerfile
4. Add environment variables
5. Done!

### Render
1. Connect GitHub
2. Select "Docker" environment
3. Render builds from Dockerfile
4. Add environment variables

### DigitalOcean / AWS / Google Cloud
All support Docker containers!

---

## 🔍 Troubleshooting

### Container won't start:
```powershell
# Check logs
docker-compose logs

# Check if port is in use
netstat -ano | findstr :3000
```

### Database not persisting:
- Verify volume mount in docker-compose.yml
- Check file permissions
- Ensure path is correct

### Environment variables not working:
- Check .env file format
- Verify docker-compose.yml syntax
- Restart container after changes

### Files not uploading:
- Check uploads volume mount
- Verify directory permissions
- Check container logs

---

## 📁 File Structure

```
myapp/
├── Dockerfile              # Container definition
├── docker-compose.yml      # Orchestration config
├── .dockerignore          # Files to exclude
├── docker-start.ps1       # Windows start script
├── .env                   # Environment variables (create this)
├── server.js              # Main application
├── package.json           # Dependencies
└── public/                # Frontend files
```

---

## ✅ Benefits of Docker

1. **Consistency**: Runs same everywhere
2. **Isolation**: Doesn't affect your system
3. **Easy Deployment**: Deploy anywhere Docker runs
4. **Reproducible**: Same environment every time
5. **Portable**: Move between machines easily

---

## 🎯 Next Steps

1. **Test locally**: Run `.\docker-start.ps1`
2. **Configure email**: Add SMTP credentials to .env
3. **Configure WhatsApp**: Add Twilio credentials (optional)
4. **Deploy to cloud**: Push to GitHub, deploy on Railway/Render

---

## 📚 Documentation Files

- `QUICK_DOCKER_START.md` - Quick reference
- `DOCKER_GUIDE.md` - Complete guide
- `CLOUD_DEPLOYMENT.md` - Cloud deployment
- `EMAIL_WHATSAPP_SETUP.md` - Notification setup

---

## 🎉 Ready to Run!

```powershell
# Start your containerized app
.\docker-start.ps1
```

**Your app is now containerized and ready!** 🐳🚀

