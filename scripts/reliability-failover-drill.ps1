param(
  [ValidateSet("local", "staging", "production")]
  [string]$Environment = "local",
  [string]$BaseUrl = "http://localhost:5000",
  [string]$OutJson = "",
  [string]$OutTxt = "",
  [string]$ContainerName = "techcare-backend",
  [int]$PollIntervalSeconds = 5,
  [int]$MaxWaitSeconds = 180
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

function Get-HealthStatus([string]$url) {
  try {
    $resp = Invoke-WebRequest -Uri "$url/health" -UseBasicParsing -TimeoutSec 10
    return @{ ok = $true; status = [int]$resp.StatusCode; message = "ok" }
  } catch {
    return @{ ok = $false; status = -1; message = $_.Exception.Message }
  }
}

$runId = Get-Date -Format "yyyyMMdd-HHmmss"
if (-not $OutJson) { $OutJson = "docs/operations/evidence/$runId/reliability-drill-$Environment.json" }
if (-not $OutTxt) { $OutTxt = "docs/operations/evidence/$runId/reliability-drill-$Environment.txt" }
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $OutJson) | Out-Null
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $OutTxt) | Out-Null

$startedAt = Get-Date
$pre = Get-HealthStatus $BaseUrl
$during = @{ ok = $false; status = -1; message = "not-executed" }
$recovered = @{ ok = $false; status = -1; message = "not-recovered" }
$faultAction = ""

if ($Environment -eq "local") {
  $faultAction = "docker stop/start $ContainerName"
  docker stop $ContainerName | Out-Null
  Start-Sleep -Seconds 5
  $during = Get-HealthStatus $BaseUrl
  docker start $ContainerName | Out-Null
} else {
  $faultAction = "manual-fault-action-required"
  $during = @{ ok = $false; status = -1; message = "manual drill required for non-local environment" }
}

$deadline = (Get-Date).AddSeconds($MaxWaitSeconds)
while ((Get-Date) -lt $deadline) {
  Start-Sleep -Seconds $PollIntervalSeconds
  $probe = Get-HealthStatus $BaseUrl
  if ($probe.ok -and $probe.status -eq 200) {
    $recovered = $probe
    break
  }
}

$endedAt = Get-Date
$mttrSeconds = if ($recovered.ok) { [int](($endedAt - $startedAt).TotalSeconds) } else { -1 }
$pass = $pre.ok -and $recovered.ok -and ($recovered.status -eq 200)

$result = [ordered]@{
  runId = $runId
  environment = $Environment
  baseUrl = $BaseUrl
  faultAction = $faultAction
  startedAt = $startedAt.ToString("o")
  endedAt = $endedAt.ToString("o")
  mttrSeconds = $mttrSeconds
  preHealth = $pre
  duringFaultHealth = $during
  recoveredHealth = $recovered
  pass = $pass
}

$result | ConvertTo-Json -Depth 6 | Set-Content -Path $OutJson -Encoding UTF8
@(
  "runId: $runId",
  "environment: $Environment",
  "baseUrl: $BaseUrl",
  "faultAction: $faultAction",
  "startedAt: $($startedAt.ToString("o"))",
  "endedAt: $($endedAt.ToString("o"))",
  "mttrSeconds: $mttrSeconds",
  "preHealth: status=$($pre.status) ok=$($pre.ok)",
  "duringFaultHealth: status=$($during.status) ok=$($during.ok)",
  "recoveredHealth: status=$($recovered.status) ok=$($recovered.ok)",
  "pass: $pass"
) | Set-Content -Path $OutTxt -Encoding UTF8

Write-Host "Wrote reliability drill evidence:"
Write-Host " - $OutJson"
Write-Host " - $OutTxt"
if (-not $pass) { exit 1 }
