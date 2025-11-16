# 🐳 Quick Docker Start - Windows

## Prerequisites

1. **Install Docker Desktop**: https://www.docker.com/products/docker-desktop
2. **Start Docker Desktop** (make sure it's running)

## 🚀 Quick Start (3 Steps)

### Step 1: Create .env file (Optional)

Create `.env` file in project root:
```bash
ADMIN_PASSWORD=YourSecurePassword123!
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
```

### Step 2: Build and Run

**Option A: Using PowerShell Script (Easiest)**
```powershell
.\docker-start.ps1
```

**Option B: Manual Commands**
```powershell
# Build the image
docker-compose build

# Start the container
docker-compose up -d
```

### Step 3: Access Your App

- **Client**: http://localhost:3000
- **Admin**: http://localhost:3000/admin

---

## 📋 Common Commands

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

### Rebuild and Restart
```powershell
docker-compose up -d --build
```

### Check Status
```powershell
docker-compose ps
```

### Execute Commands in Container
```powershell
docker exec -it ecu-tuning-service sh
```

---

## 🔧 Environment Variables

### Method 1: .env File (Recommended)

Create `.env` file:
```bash
ADMIN_PASSWORD=YourPassword123!
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
TWILIO_ACCOUNT_SID=your_sid
TWILIO_AUTH_TOKEN=your_token
```

### Method 2: PowerShell Environment Variables

```powershell
$env:ADMIN_PASSWORD="YourPassword123!"
$env:SMTP_USER="your-email@gmail.com"
$env:SMTP_PASS="your-app-password"
docker-compose up -d
```

---

## 🐛 Troubleshooting

### Docker not running:
- Start Docker Desktop
- Wait for it to fully start (whale icon in system tray)

### Port already in use:
```powershell
# Find what's using port 3000
netstat -ano | findstr :3000

# Stop the process or change port in docker-compose.yml
```

### Container won't start:
```powershell
# Check logs
docker-compose logs

# Check container status
docker ps -a
```

### Database/Uploads not persisting:
- Check volume mounts in docker-compose.yml
- Verify paths are correct for Windows
- Check file permissions

---

## 🚀 Deploy to Cloud

### Railway (Auto-detects Dockerfile)
1. Push to GitHub
2. Deploy on Railway
3. Railway builds from Dockerfile automatically!

### Render
1. Connect GitHub
2. Select "Docker"
3. Render builds from Dockerfile

---

## ✅ That's It!

Your app is now running in a Docker container! 🎉

For more details, see `DOCKER_GUIDE.md`

