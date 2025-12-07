<#
.SYNOPSIS
  Stop any processes currently listening on API/Client/Admin ports.
.DESCRIPTION
  Finds processes with TCP listeners on ports and stops them safely.
#>

$ports = @(4000,4001,4005,3000,3001)
$stopped = @()

foreach ($p in $ports) {
    $conns = @()
    try {
        $conns = Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction Stop
    } catch {
        # Fallback to netstat
        $net = netstat -ano | Select-String ":$p\s"
        foreach ($line in $net) {
            $parts = ($line -split '\s+') | Where-Object { $_ -ne '' }
            if ($parts.Length -ge 5) {
                $pid = [int]$parts[-1]
                $obj = New-Object PSObject -Property @{ OwningProcess = $pid }
                $conns += $obj
            }
        }
    }

    if ($conns -and $conns.Count -gt 0) {
        $uniquePids = $conns | Select-Object -ExpandProperty OwningProcess -Unique
        foreach ($processId in $uniquePids) {
            if ($processId -and $processId -ne 0) {
                try {
                    $proc = Get-Process -Id $processId -ErrorAction Stop
                    if ($proc.ProcessName -notin @('System','Idle')) {
                        Stop-Process -Id $processId -Force -ErrorAction Stop
                        Write-Host "Stopped PID $processId ($($proc.ProcessName)) on port $p" -ForegroundColor Yellow
                        $stopped += $processId
                    }
                } catch {
                    Write-Host "Failed to stop PID $processId on port $p" -ForegroundColor Red
                }
            }
        }
    } else {
        Write-Host "No listener on port $p" -ForegroundColor Green
    }
}

if ($stopped.Count -eq 0) {
    Write-Host "No processes stopped" -ForegroundColor Cyan
} else {
    Write-Host "Stopped PIDs: $($stopped -join ', ')" -ForegroundColor Cyan
}
