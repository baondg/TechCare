#Requires -Version 5.1
<#
  Quick HTTP checks after deploy. Apply schema separately (Cloud SQL proxy + mysql import).

  Usage:
    powershell -ExecutionPolicy Bypass -File .\gcp\smoke-test.ps1 -ApiUrl "https://...run.app" -WebUrl "https://...run.app"
#>
param(
  [Parameter(Mandatory = $true)][string]$ApiUrl,
  [Parameter(Mandatory = $true)][string]$WebUrl
)

$ErrorActionPreference = "Stop"
$apiUrl = $ApiUrl.TrimEnd('/')
$webUrl = $WebUrl.TrimEnd('/')

Write-Host "GET $apiUrl/health"
try {
  $h = Invoke-RestMethod -Uri "$apiUrl/health" -Method Get
  $h | ConvertTo-Json
} catch {
  Write-Error "Backend health failed: $_"
  exit 1
}

Write-Host "GET $webUrl (expect 200)"
try {
  $r = Invoke-WebRequest -Uri $webUrl -Method Head -UseBasicParsing
  Write-Host "Status: $($r.StatusCode)"
} catch {
  Write-Error "Frontend check failed: $_"
  exit 1
}

Write-Host "GET $webUrl/api/ (via nginx proxy — may 404 without route; confirms proxy)"
try {
  Invoke-WebRequest -Uri "$webUrl/api/" -UseBasicParsing -TimeoutSec 30 | Out-Null
} catch {
  $code = $_.Exception.Response.StatusCode.value__
  Write-Host "Note: /api/ returned $code (expected if no root API handler)"
}

Write-Host "Smoke test finished."
