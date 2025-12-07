<#
.SYNOPSIS
  Simple smoke tests for local services.
.DESCRIPTION
  Attempts basic HTTP requests against the API, client, and admin endpoints.
#>

$checks = @(
    @{Name='API'; Url='http://localhost:4000/api/orders'},
    @{Name='Client'; Url='http://localhost:3000/'},
    @{Name='Admin'; Url='http://localhost:3001/'}
)

foreach ($c in $checks) {
    try {
        $r = Invoke-WebRequest -Uri $c.Url -UseBasicParsing -TimeoutSec 5 -ErrorAction Stop
        Write-Host "$($c.Name) reachable: $($r.StatusCode)" -ForegroundColor Green
    } catch {
        Write-Host "$($c.Name) NOT reachable: $($_.Exception.Message)" -ForegroundColor Red
    }
}

Write-Host "Smoke tests completed." -ForegroundColor Cyan
