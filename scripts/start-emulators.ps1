<#
.SYNOPSIS
  Start Firebase emulators and set recommended env vars for current PowerShell session.
#>

$root = Resolve-Path "$PSScriptRoot\.."
Set-Location $root

# Set env vars for current session
$env:FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080'
$env:FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099'
$env:FIREBASE_STORAGE_EMULATOR_HOST = '127.0.0.1:9199'

Write-Host "Starting Firebase emulators (functions, firestore, auth)..." -ForegroundColor Cyan
Start-Process -FilePath powershell.exe -ArgumentList '-NoExit','-Command','npm run emulators' -WindowStyle Normal

Write-Host "Emulators will run in a new window. Environment variables set for this shell." -ForegroundColor Green
