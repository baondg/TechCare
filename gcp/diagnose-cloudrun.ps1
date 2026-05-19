#Requires -Version 5.1
# Read-only: billing + Cloud Run list + /health HTTP code + sample logs.
param(
  [Parameter(Mandatory = $true)][string]$ProjectId,
  [Parameter(Mandatory = $false)][string]$Region = "asia-southeast1"
)
$ErrorActionPreference = "Continue"
Write-Host "=== Billing ===" -ForegroundColor Cyan
gcloud billing projects describe $ProjectId --format="yaml(billingEnabled,billingAccountName)"
Write-Host ""
Write-Host "=== Cloud Run services ===" -ForegroundColor Cyan
gcloud run services list --project $ProjectId --region $Region --format="table(metadata.name,status.url,status.latestReadyRevisionName)"
$services = @(gcloud run services list --project $ProjectId --region $Region --format="value(metadata.name)" 2>$null)
foreach ($svc in $services) {
  if (-not $svc) { continue }
  Write-Host ""
  Write-Host "--- /health : $svc ---" -ForegroundColor Cyan
  $url = (gcloud run services describe $svc --project $ProjectId --region $Region --format="value(status.url)" 2>$null)
  if (-not $url) { continue }
  $url = $url.TrimEnd("/")
  $code = curl.exe -sS -o NUL -w "%{http_code}" --max-time 20 "$url/health"
  Write-Host "GET $url/health -> HTTP $code"
}
Write-Host ""
Write-Host "=== Sample logs ===" -ForegroundColor Cyan
$backendLike = $services | Where-Object { $_ -match "backend" } | Select-Object -First 1
if ($backendLike) {
  gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=$backendLike" --project $ProjectId --limit=5 --freshness=7d --format="value(timestamp,textPayload)"
}
Write-Host ""
Write-Host "If billingEnabled is false, enable billing then redeploy." -ForegroundColor Yellow
