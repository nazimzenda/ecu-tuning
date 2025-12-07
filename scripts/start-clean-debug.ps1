<#
.SYNOPSIS
  Interactive debug helper to stop known listeners and start emulators/servers in the current terminal for troubleshooting.
.DESCRIPTION
  This script runs stop-all.ps1 then prompts you to start the Firebase emulators and the API in this same terminal so any errors are visible.
  Use this when `start-clean.ps1` or Start-Process-launched windows terminate unexpectedly (exit code -1073741510).

USAGE
  Open PowerShell (Run as Administrator if stop-all fails due to permissions).
  Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
  \> .\scripts\start-clean-debug.ps1
#>

$root = Resolve-Path "$PSScriptRoot\.."
Set-Location $root

Write-Host "[debug] Running stop-all.ps1 to free ports..." -ForegroundColor Cyan
try {
    & "$PSScriptRoot\stop-all.ps1"
} catch {
    Write-Host "[debug] stop-all.ps1 failed: $_" -ForegroundColor Yellow
}

Write-Host "\n[debug] READY: This script will now guide you to start services interactively." -ForegroundColor Green

# Start emulators in this terminal (blocking) so you can view stdout/stderr
$startEmulators = Read-Host "Start Firebase emulators in this terminal now? (y/n)"
if ($startEmulators -match '^[Yy]') {
    Write-Host "Running: npm run emulators" -ForegroundColor Cyan
    Write-Host "(Press Ctrl+C to stop emulators and return to this script)" -ForegroundColor Yellow
    npm run emulators
    Write-Host "Emulators process exited. Continue..." -ForegroundColor Green
} else {
    Write-Host "Skipping emulators. You can start them separately using: npm run emulators" -ForegroundColor Cyan
}

# Start API in this terminal (non-blocking guidance)
$startApi = Read-Host "Start API (node server) in this terminal now? (y/n)"
if ($startApi -match '^[Yy]') {
    Write-Host "Setting emulator env vars for this shell and starting API..." -ForegroundColor Cyan
    $env:FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080'
    $env:FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099'
    $env:FIREBASE_STORAGE_EMULATOR_HOST = '127.0.0.1:9199'
    Write-Host "Running: npm run start:api" -ForegroundColor Cyan
    Write-Host "(If the process terminates with exit code -1073741510, press Enter to continue and capture diagnostic info)" -ForegroundColor Yellow
    npm run start:api
    Write-Host "API process exited. Capturing last 200 lines of server-log.txt (if present)..." -ForegroundColor Green
    if (Test-Path .\server-log.txt) {
        Get-Content .\server-log.txt -Tail 200 | Out-String | Write-Host
    } else {
        Write-Host "server-log.txt not found." -ForegroundColor Yellow
    }
} else {
    Write-Host "Skipping API start. You can start it separately with the emulator env vars set." -ForegroundColor Cyan
}

Write-Host "\n[debug] Next steps:" -ForegroundColor Green
Write-Host " - If a process terminated with exit code -1073741510, it usually means it received a Ctrl+C or was force-terminated. Check the terminal output above for clues." -ForegroundColor Cyan
Write-Host " - Check Windows Event Viewer (Application logs) for any PowerShell/AppCrash entries around the time of termination." -ForegroundColor Cyan
Write-Host " - If you suspect antivirus/Defender killed the process, temporarily disable it or whitelist Node/PowerShell and retry." -ForegroundColor Cyan
Write-Host " - If you'd like, paste the last 200 lines of output from this terminal here and I'll analyze them." -ForegroundColor Green
