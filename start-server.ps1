# Start Server Script
Write-Host "🚀 Starting ECU Tuning Service Server..." -ForegroundColor Yellow
Write-Host ""

# Check if dependencies are installed
if (-not (Test-Path "node_modules")) {
    Write-Host "📦 Installing dependencies..." -ForegroundColor Cyan
    npm.cmd install
    Write-Host ""
}

# Start the server
Write-Host "✅ Starting server on http://localhost:3000" -ForegroundColor Green
Write-Host "📱 Client Interface: http://localhost:3000" -ForegroundColor Cyan
Write-Host "🔧 Admin Panel: http://localhost:3000/admin" -ForegroundColor Cyan
Write-Host ""
Write-Host "Press Ctrl+C to stop the server" -ForegroundColor Yellow
Write-Host ""

npm.cmd start

