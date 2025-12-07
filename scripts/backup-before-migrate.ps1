<#
.SYNOPSIS
  Create a quick backup of SQLite DB and uploads before running migration.
.DESCRIPTION
  Copies `database.sqlite` and `uploads/` into `backups/<timestamp>/`.
#>

$root = Join-Path $PSScriptRoot '..' | Resolve-Path
$timestamp = (Get-Date).ToString('yyyyMMdd-HHmmss')
$dest = Join-Path $root "backups\$timestamp"

New-Item -Path $dest -ItemType Directory -Force | Out-Null

$dbSrc = Join-Path $root 'database.sqlite'
if (Test-Path $dbSrc) {
    Copy-Item -Path $dbSrc -Destination $dest -Force
    Write-Host "Copied database.sqlite to $dest" -ForegroundColor Green
} else {
    Write-Host "database.sqlite not found at $dbSrc" -ForegroundColor Yellow
}

$uploads = Join-Path $root 'uploads'
if (Test-Path $uploads) {
    $uploadsDest = Join-Path $dest 'uploads'
    Copy-Item -Path $uploads -Destination $uploadsDest -Recurse -Force
    Write-Host "Backed up uploads/ to $uploadsDest" -ForegroundColor Green
} else {
    Write-Host "uploads/ not found at $uploads" -ForegroundColor Yellow
}

Write-Host "Backup completed to $dest" -ForegroundColor Cyan
