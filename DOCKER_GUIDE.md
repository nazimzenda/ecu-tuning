# 🐳 Docker Deployment Guide

## Quick Start

### Option 1: Using Docker Compose (Easiest) ⭐

1. **Create `.env` file** (optional, or use environment variables):
```bash
ADMIN_PASSWORD=your_secure_password
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
TWILIO_ACCOUNT_SID=your_sid
TWILIO_AUTH_TOKEN=your_token
```

2. **Build and run**:
```bash
docker-compose up -d
```

3. **Access your app**: http://localhost:3000

4. **View logs**:
```bash
docker-compose logs -f
```

5. **Stop**:
```bash
docker-compose down
```

---

### Option 2: Using Docker Directly

1. **Build the image**:
```bash
docker build -t ecu-tuning-service .
```

2. **Run the container**:
```bash
docker run -d \
  --name ecu-tuning-service \
  -p 3000:3000 \
  -e ADMIN_PASSWORD=your_secure_password \
  -e SMTP_USER=your-email@gmail.com \
  -e SMTP_PASS=your-app-password \
  -e SMTP_HOST=smtp.gmail.com \
  -e SMTP_PORT=587 \
  -v $(pwd)/database.sqlite:/app/database.sqlite \
  -v $(pwd)/uploads:/app/uploads \
  --restart unless-stopped \
  ecu-tuning-service
```

3. **Access**: http://localhost:3000

---

## 📋 Docker Commands

### Build
```bash
docker build -t ecu-tuning-service .
```

### Run
```bash
docker run -d -p 3000:3000 --name ecu-tuning-service ecu-tuning-service
```

### Stop
```bash
docker stop ecu-tuning-service
```

### Remove
```bash
docker rm ecu-tuning-service
```

### View Logs
```bash
docker logs -f ecu-tuning-service
```

### Execute Commands in Container
```bash
docker exec -it ecu-tuning-service sh
```

---

## 🔧 Environment Variables

### Using .env file (Docker Compose)

Create `.env` file in project root:
```bash
ADMIN_PASSWORD=YourSecurePassword123!
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-16-char-app-password
TWILIO_ACCOUNT_SID=your_account_sid
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_WHATSAPP_NUMBER=whatsapp:+14155238886
```

Docker Compose will automatically load `.env` file.

### Using Environment Variables Directly

```bash
docker run -d \
  -p 3000:3000 \
  -e ADMIN_PASSWORD=your_password \
  -e SMTP_USER=your_email \
  -e SMTP_PASS=your_password \
  ecu-tuning-service
```

---

## 📦 Volume Mounts

### Database Persistence
```bash
-v $(pwd)/database.sqlite:/app/database.sqlite
```

### Uploads Persistence
```bash
-v $(pwd)/uploads:/app/uploads
```

### Full Example
```bash
docker run -d \
  -p 3000:3000 \
  -v $(pwd)/database.sqlite:/app/database.sqlite \
  -v $(pwd)/uploads:/app/uploads \
  ecu-tuning-service
```

---

## 🚀 Deploy to Cloud with Docker

### Railway (Supports Docker)

1. **Push to GitHub** (with Dockerfile)
2. **Deploy on Railway**
3. **Railway auto-detects Dockerfile**
4. **Add environment variables in Railway dashboard**
5. **Done!**

### Render (Supports Docker)

1. **Connect GitHub repo**
2. **Select "Docker" as environment**
3. **Render builds from Dockerfile**
4. **Add environment variables**
5. **Deploy!**

### DigitalOcean App Platform

1. **Connect GitHub**
2. **Select Dockerfile**
3. **Configure environment variables**
4. **Deploy**

### AWS ECS / Google Cloud Run

Both support Docker containers directly!

---

## 🔍 Troubleshooting

### Container won't start:
```bash
# Check logs
docker logs ecu-tuning-service

# Check if port is in use
netstat -ano | findstr :3000  # Windows
lsof -i :3000                 # Linux/Mac
```

### Database not persisting:
- Ensure volume mount is correct
- Check file permissions
- Verify path in docker-compose.yml

### Files not uploading:
- Check uploads volume mount
- Verify directory permissions
- Check container logs

### Environment variables not working:
- Verify `.env` file format
- Check docker-compose.yml syntax
- Restart container after changes

---

## 📊 Production Docker Setup

### Multi-stage Build (Optimized)

```dockerfile
# Build stage
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci

# Production stage
FROM node:18-alpine
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY . .
RUN mkdir -p uploads/modified
EXPOSE 3000
CMD ["node", "server.js"]
```

### Health Checks

Already included in docker-compose.yml:
```yaml
healthcheck:
  test: ["CMD", "wget", "--quiet", "--tries=1", "--spider", "http://localhost:3000/"]
  interval: 30s
  timeout: 10s
  retries: 3
```

---

## 🔐 Security Best Practices

1. **Never commit `.env` file**
2. **Use secrets management** (Docker secrets, Kubernetes secrets)
3. **Run as non-root user** (add to Dockerfile if needed)
4. **Keep base image updated**
5. **Scan for vulnerabilities**: `docker scan ecu-tuning-service`

---

## 📝 Docker Compose Commands

```bash
# Start services
docker-compose up -d

# Stop services
docker-compose down

# View logs
docker-compose logs -f

# Rebuild
docker-compose up -d --build

# Restart
docker-compose restart

# Check status
docker-compose ps
```

---

## 🎯 Quick Reference

### Build & Run (One Command)
```bash
docker-compose up -d --build
```

### View Logs
```bash
docker-compose logs -f ecu-tuning-service
```

### Stop & Remove
```bash
docker-compose down
```

### Update & Restart
```bash
docker-compose up -d --build
```

---

## ✅ Checklist

- [ ] Docker installed
- [ ] Dockerfile created
- [ ] .dockerignore configured
- [ ] docker-compose.yml created
- [ ] .env file created (optional)
- [ ] Environment variables set
- [ ] Volumes configured for persistence
- [ ] Tested locally
- [ ] Ready for cloud deployment

---

**Your app is now containerized and ready to deploy anywhere!** 🐳🚀

