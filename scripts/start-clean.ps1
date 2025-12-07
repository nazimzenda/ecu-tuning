<#
.SYNOPSIS
  Stop known service ports (safely) and start emulators + API/Client/Admin in new windows.
.DESCRIPTION
  1. Runs scripts/stop-all.ps1 to stop node processes on common ports (4000,4001,4005,3000,3001).
  2. Starts Firebase emulators in a new window.
  3. Starts API, Client and Admin servers in individual windows with recommended env vars for emulators.

  Use this when local dev got into a bad state (ports-in-use) and you want a quick clean start.
#>

$root = Resolve-Path "$PSScriptRoot\.."
Set-Location $root

Write-Host "Stopping known listeners (4000,4001,4005,3000,3001)..." -ForegroundColor Cyan
& "$PSScriptRoot\stop-all.ps1"

Write-Host "Starting Firebase emulators in a new window..." -ForegroundColor Cyan
Start-Process -FilePath powershell.exe -ArgumentList '-NoExit','-Command',"cd '$root'; npm run emulators" -WindowStyle Normal

Start-Sleep -Seconds 2

Write-Host "Starting API (new window) with emulator env vars..." -ForegroundColor Cyan
# Build the command string safely (avoid premature variable expansion or backtick escaping)
$apiCmd = 'cd "' + $root + '"; $Env:FIRESTORE_EMULATOR_HOST="127.0.0.1:8080"; $Env:FIREBASE_AUTH_EMULATOR_HOST="127.0.0.1:9099"; $Env:FIREBASE_STORAGE_EMULATOR_HOST="127.0.0.1:9199"; npm run start:api'
Start-Process -FilePath powershell.exe -ArgumentList '-NoExit','-Command',$apiCmd -WindowStyle Normal

Start-Sleep -Milliseconds 500

Write-Host "Starting Client UI (new window)..." -ForegroundColor Cyan
Start-Process -FilePath powershell.exe -ArgumentList '-NoExit','-Command',"cd '$root'; npm run start:client" -WindowStyle Normal

Start-Sleep -Milliseconds 200

Write-Host "Starting Admin UI (new window)..." -ForegroundColor Cyan
Start-Process -FilePath powershell.exe -ArgumentList '-NoExit','-Command',"cd '$root'; npm run start:admin" -WindowStyle Normal

Write-Host "All windows launched. Use scripts\check-ports.ps1 to verify listeners." -ForegroundColor Green
