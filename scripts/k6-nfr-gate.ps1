param(
  [string]$BaseUrl = $env:BASE_URL,
  [string]$Username = $env:K6_USERNAME,
  [string]$Password = $env:K6_PASSWORD,
  [string]$WriteUsername = $env:K6_WRITE_USERNAME,
  [string]$WritePassword = $env:K6_WRITE_PASSWORD,
  [string]$AppointmentIds = $env:K6_APPOINTMENT_IDS,
  [string]$PatientRecordId = $env:K6_PATIENT_RECORD_ID,
  [int]$BaselineVus = 5,
  [int]$LoadVus = 300
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

if (-not $BaseUrl) { throw "BASE_URL is required." }
if (-not $Username -or -not $Password) { throw "K6_USERNAME and K6_PASSWORD are required." }
if (-not $WriteUsername -or -not $WritePassword) { throw "K6_WRITE_USERNAME and K6_WRITE_PASSWORD are required for deterministic appointment writes." }
if (-not $AppointmentIds) { throw "K6_APPOINTMENT_IDS is required (comma-separated existing appointment IDs)." }

if (-not $env:K6_BENCHMARK_RUN) { $env:K6_BENCHMARK_RUN = "1" }
if (-not $env:K6_APPOINTMENT_WRITE_MIN_SAMPLES) { $env:K6_APPOINTMENT_WRITE_MIN_SAMPLES = "100" }
if (-not $env:K6_APPOINTMENT_WRITE_PROB) { $env:K6_APPOINTMENT_WRITE_PROB = "1" }

$outDir = "k6/out"
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

$baselineOut = Join-Path $outDir "nfr-baseline.json"
$loadOut = Join-Path $outDir "nfr-300vu.json"
$reportOut = Join-Path $outDir "nfr-validated-report.json"

Write-Host "Writing NFR run manifest..." -ForegroundColor Cyan
node "k6/scripts/write-nfr-manifest.js" (Join-Path $outDir "nfr-run-manifest.json")

Write-Host "Running baseline NFR (VUs=$BaselineVus)..." -ForegroundColor Cyan
k6 run `
  --summary-export $baselineOut `
  -e BASE_URL=$BaseUrl `
  -e K6_USERNAME=$Username `
  -e K6_PASSWORD=$Password `
  -e K6_WRITE_USERNAME=$WriteUsername `
  -e K6_WRITE_PASSWORD=$WritePassword `
  -e K6_APPOINTMENT_IDS=$AppointmentIds `
  -e K6_PATIENT_RECORD_ID=$PatientRecordId `
  -e K6_BENCHMARK_RUN=$env:K6_BENCHMARK_RUN `
  -e K6_APPOINTMENT_WRITE_PROB=$env:K6_APPOINTMENT_WRITE_PROB `
  -e K6_APPOINTMENT_WRITE_MIN_SAMPLES=$env:K6_APPOINTMENT_WRITE_MIN_SAMPLES `
  -e K6_TIMEOUT_MS=$env:K6_TIMEOUT_MS `
  -e K6_MAX_VUS=$BaselineVus `
  "k6/scripts/nfr-performance.js"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "Running load NFR (VUs=$LoadVus)..." -ForegroundColor Cyan
k6 run `
  --summary-export $loadOut `
  -e BASE_URL=$BaseUrl `
  -e K6_USERNAME=$Username `
  -e K6_PASSWORD=$Password `
  -e K6_WRITE_USERNAME=$WriteUsername `
  -e K6_WRITE_PASSWORD=$WritePassword `
  -e K6_APPOINTMENT_IDS=$AppointmentIds `
  -e K6_PATIENT_RECORD_ID=$PatientRecordId `
  -e K6_BENCHMARK_RUN=$env:K6_BENCHMARK_RUN `
  -e K6_APPOINTMENT_WRITE_PROB=$env:K6_APPOINTMENT_WRITE_PROB `
  -e K6_APPOINTMENT_WRITE_MIN_SAMPLES=$env:K6_APPOINTMENT_WRITE_MIN_SAMPLES `
  -e K6_TIMEOUT_MS=$env:K6_TIMEOUT_MS `
  -e K6_MAX_VUS=$LoadVus `
  "k6/scripts/nfr-performance.js"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "Validating baseline-vs-300VU delta gate..." -ForegroundColor Cyan
node "k6/scripts/validate-nfr-results.js" $baselineOut $loadOut $reportOut
exit $LASTEXITCODE
