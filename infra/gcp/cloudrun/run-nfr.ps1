param(
  [Parameter(Mandatory = $true)] [string]$BaseUrl,
  [Parameter(Mandatory = $true)] [string]$Username,
  [Parameter(Mandatory = $true)] [string]$Password,
  [Parameter(Mandatory = $true)] [string]$WriteUsername,
  [Parameter(Mandatory = $true)] [string]$WritePassword,
  [Parameter(Mandatory = $true)] [string]$AppointmentIds,
  [string]$OutDir = "k6/out"
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $PSScriptRoot))
Set-Location $repoRoot

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

node k6/scripts/write-nfr-manifest.js "$OutDir/nfr-run-manifest.json"

Write-Host "Run baseline profile..." -ForegroundColor Cyan
k6 run `
  --summary-export="$OutDir/nfr-baseline.json" `
  -e BASE_URL=$BaseUrl `
  -e K6_USERNAME=$Username `
  -e K6_PASSWORD=$Password `
  -e K6_WRITE_USERNAME=$WriteUsername `
  -e K6_WRITE_PASSWORD=$WritePassword `
  -e K6_APPOINTMENT_IDS=$AppointmentIds `
  -e K6_APPOINTMENT_WRITE_PROB=1 `
  -e K6_MAX_VUS=5 `
  k6/scripts/nfr-performance.js

Write-Host "Run 300VU profile..." -ForegroundColor Cyan
k6 run `
  --summary-export="$OutDir/nfr-300vu.json" `
  -e BASE_URL=$BaseUrl `
  -e K6_USERNAME=$Username `
  -e K6_PASSWORD=$Password `
  -e K6_WRITE_USERNAME=$WriteUsername `
  -e K6_WRITE_PASSWORD=$WritePassword `
  -e K6_APPOINTMENT_IDS=$AppointmentIds `
  -e K6_APPOINTMENT_WRITE_PROB=1 `
  -e K6_MAX_VUS=300 `
  k6/scripts/nfr-performance.js

node k6/scripts/validate-nfr-results.js "$OutDir/nfr-baseline.json" "$OutDir/nfr-300vu.json"
Write-Host "NFR gate completed."
