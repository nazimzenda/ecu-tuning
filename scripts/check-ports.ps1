<#
.SYNOPSIS
  Check whether service ports are listening and show owning PIDs.
.DESCRIPTION
  Prints the listening state for API (4000), Client (3000), Admin (3001).
#>

Param()

$ports = @(4000,4001,4005,3000,3001)
$names = @{4000='API (4000)'; 4001='API (4001)'; 4005='Emulator UI (4005)'; 3000='Client UI'; 3001='Admin Panel'}

foreach ($p in $ports) {
    $conn = Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue
    if ($conn) {
        Write-Host "$($names[$p]) - Port $p - LISTENING (PID: $($conn.OwningProcess))" -ForegroundColor Green
    } else {
        Write-Host "$($names[$p]) - Port $p - NOT listening" -ForegroundColor Red
    }
}

Write-Host "`nUse scripts\start-all.ps1 and scripts\stop-all.ps1 to manage services." -ForegroundColor Cyan
