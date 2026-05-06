param(
  [ValidateSet("local", "staging", "production")]
  [string]$Environment = "local",
  [string]$BaseUrl = "http://localhost:5000",
  [string]$BackendDir = "backend",
  [string]$OutJson = "",
  [string]$OutTxt = ""
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
if (-not $OutJson) { $OutJson = "docs/operations/evidence/$runId/backup-restore-drill-$Environment.json" }
if (-not $OutTxt) { $OutTxt = "docs/operations/evidence/$runId/backup-restore-drill-$Environment.txt" }
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $OutJson) | Out-Null
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $OutTxt) | Out-Null

$startedAt = Get-Date
$backendPath = Join-Path $repoRoot $BackendDir
if (-not (Test-Path $backendPath)) { throw "Backend directory not found: $backendPath" }

$backupCmd = "npm run db:backup -- ./backups"
$restoreCmd = "npm run db:restore -- <latest-backup>"
$backupOutput = ""
$restoreOutput = ""
$latestBackup = $null
$pass = $false
$notes = @()

Push-Location $backendPath
try {
  $backupOutput = & npm run db:backup -- ./backups 2>&1 | Out-String
  $latestBackup = Get-ChildItem -Path "./backups" -Filter "techcare-*.sql.gz" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
  if (-not $latestBackup) { throw "No backup artifact generated under backend/backups" }
  $restoreCmd = "npm run db:restore -- ./backups/$($latestBackup.Name)"
  $restoreOutput = & npm run db:restore -- "./backups/$($latestBackup.Name)" 2>&1 | Out-String
  $postHealth = Get-HealthStatus $BaseUrl
  $pass = $postHealth.ok -and $postHealth.status -eq 200
  if (-not $pass) {
    $notes += "Post-restore health check failed."
  }
} catch {
  $notes += $_.Exception.Message
} finally {
  Pop-Location
}

$endedAt = Get-Date
$result = [ordered]@{
  runId = $runId
  environment = $Environment
  baseUrl = $BaseUrl
  startedAt = $startedAt.ToString("o")
  endedAt = $endedAt.ToString("o")
  backupCommand = $backupCmd
  restoreCommand = $restoreCmd
  backupArtifact = if ($latestBackup) { "backend/backups/$($latestBackup.Name)" } else { $null }
  backupOutput = $backupOutput
  restoreOutput = $restoreOutput
  pass = $pass
  notes = $notes
}

$result | ConvertTo-Json -Depth 6 | Set-Content -Path $OutJson -Encoding UTF8
@(
  "runId: $runId",
  "environment: $Environment",
  "baseUrl: $BaseUrl",
  "backupCommand: $backupCmd",
  "restoreCommand: $restoreCmd",
  "backupArtifact: $($result.backupArtifact)",
  "pass: $pass",
  "notes: $([string]::Join('; ', $notes))"
) | Set-Content -Path $OutTxt -Encoding UTF8

Write-Host "Wrote backup/restore drill evidence:"
Write-Host " - $OutJson"
Write-Host " - $OutTxt"
if (-not $pass) { exit 1 }
