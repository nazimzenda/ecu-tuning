<#
.SYNOPSIS
  Start API, Client and Admin servers each in a new PowerShell window.
.DESCRIPTION
  Uses Start-Process to open separate PowerShell windows so logs remain visible.
#>

$root = Join-Path $PSScriptRoot '..' | Resolve-Path

function Start-ServiceWindow($script, $label) {
    $cmd = "cd '$root'; npm run $script"
    Start-Process -FilePath powershell.exe -ArgumentList '-NoExit','-Command',$cmd -WindowStyle Normal
    Write-Host "Started $label (new window)." -ForegroundColor Green
}

Start-ServiceWindow 'start:api' 'API (port 4000)'
Start-ServiceWindow 'start:client' 'Client UI (port 3000)'
Start-ServiceWindow 'start:admin' 'Admin UI (port 3001)'

Write-Host "All start commands issued. Use scripts\check-ports.ps1 to verify." -ForegroundColor Cyan
