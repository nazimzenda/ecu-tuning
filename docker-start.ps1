# Docker Start Script for Windows
Write-Host "🐳 Starting ECU Tuning Service in Docker..." -ForegroundColor Cyan
Write-Host ""

# Check if Docker is running
try {
    docker ps | Out-Null
    Write-Host "✅ Docker is running" -ForegroundColor Green
} catch {
    Write-Host "❌ Docker is not running. Please start Docker Desktop first." -ForegroundColor Red
    exit 1
}

# Check if .env file exists
if (-not (Test-Path ".env")) {
    Write-Host "⚠️  .env file not found. Creating template..." -ForegroundColor Yellow
    @"
ADMIN_PASSWORD=ChangeThisPassword123!
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_WHATSAPP_NUMBER=whatsapp:+14155238886
"@ | Out-File -FilePath ".env" -Encoding UTF8
    Write-Host "📝 Please edit .env file with your credentials" -ForegroundColor Yellow
    Write-Host ""
}

# Build and start
Write-Host "🔨 Building Docker image..." -ForegroundColor Cyan
docker-compose -f docker-compose.yml build

Write-Host ""
Write-Host "🚀 Starting container..." -ForegroundColor Cyan
docker-compose -f docker-compose.yml up -d

Write-Host ""
Write-Host "✅ Service started!" -ForegroundColor Green
Write-Host "🌐 Access your app at: http://localhost:3000" -ForegroundColor Cyan
Write-Host "🔧 Admin panel: http://localhost:3000/admin" -ForegroundColor Cyan
Write-Host ""
Write-Host "📋 Useful commands:" -ForegroundColor Yellow
Write-Host "  View logs: docker-compose logs -f" -ForegroundColor Gray
Write-Host "  Stop: docker-compose down" -ForegroundColor Gray
Write-Host "  Restart: docker-compose restart" -ForegroundColor Gray
Write-Host ""

