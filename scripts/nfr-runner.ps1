param(
  [ValidateSet("local", "staging", "production")]
  [string]$Environment = "local",
  [switch]$Performance,
  [switch]$Reliability,
  [switch]$BackupRecovery,
  [switch]$Rbac,
  [switch]$Tls,
  [string]$BaseUrl = "",
  [string]$StagingHost = "",
  [string]$ProductionHost = "",
  [string]$K6Username = $env:K6_USERNAME,
  [string]$K6Password = $env:K6_PASSWORD,
  [string]$K6WriteUsername = $env:K6_WRITE_USERNAME,
  [string]$K6WritePassword = $env:K6_WRITE_PASSWORD,
  [string]$AppointmentIds = $env:K6_APPOINTMENT_IDS
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

if (-not ($Performance -or $Reliability -or $BackupRecovery -or $Rbac -or $Tls)) {
  $Performance = $true
  $Reliability = $true
  $BackupRecovery = $true
  $Rbac = $true
  $Tls = $true
}

$runId = Get-Date -Format "yyyyMMdd-HHmmss"
$k6ArchiveDir = "k6/out/archive/$runId-$Environment"
$evidenceDir = "docs/operations/evidence/$runId-$Environment"
New-Item -ItemType Directory -Force -Path $k6ArchiveDir | Out-Null
New-Item -ItemType Directory -Force -Path $evidenceDir | Out-Null

if (-not $BaseUrl) {
  switch ($Environment) {
    "local" { $BaseUrl = "http://localhost:5000" }
    "staging" { if ($StagingHost) { $BaseUrl = "https://$StagingHost" } }
    "production" { if ($ProductionHost) { $BaseUrl = "https://$ProductionHost" } }
  }
}
if (-not $StagingHost -and $Environment -eq "local") { $StagingHost = "localhost:5000" }
if (-not $ProductionHost -and $Environment -eq "local") { $ProductionHost = "localhost:5000" }

$summary = [ordered]@{
  runId = $runId
  environment = $Environment
  startedAt = (Get-Date).ToString("o")
  baseUrl = $BaseUrl
  outputs = [ordered]@{
    k6ArchiveDir = $k6ArchiveDir
    evidenceDir = $evidenceDir
  }
  modules = [ordered]@{
    performance = [ordered]@{ enabled = [bool]$Performance; pass = $null; error = $null }
    reliability = [ordered]@{ enabled = [bool]$Reliability; pass = $null; error = $null }
    backupRecovery = [ordered]@{ enabled = [bool]$BackupRecovery; pass = $null; error = $null }
    rbac = [ordered]@{ enabled = [bool]$Rbac; pass = $null; error = $null }
    tls = [ordered]@{ enabled = [bool]$Tls; pass = $null; error = $null }
  }
}

function Invoke-Step([string]$name, [scriptblock]$action) {
  try {
    & $action
    $summary.modules[$name].pass = $true
  } catch {
    $summary.modules[$name].pass = $false
    $summary.modules[$name].error = $_.Exception.Message
  }
}

if ($Performance) {
  Invoke-Step "performance" {
    if (-not $K6Username -or -not $K6Password -or -not $K6WriteUsername -or -not $K6WritePassword -or -not $AppointmentIds) {
      throw "Performance module requires K6Username/K6Password/K6WriteUsername/K6WritePassword/AppointmentIds."
    }
    & ".\scripts\k6-nfr-gate.ps1" `
      -BaseUrl $BaseUrl `
      -Username $K6Username `
      -Password $K6Password `
      -WriteUsername $K6WriteUsername `
      -WritePassword $K6WritePassword `
      -AppointmentIds $AppointmentIds
    Copy-Item "k6/out/nfr-run-manifest.json","k6/out/nfr-baseline.json","k6/out/nfr-300vu.json","k6/out/nfr-validated-report.json" -Destination $k6ArchiveDir -Force
  }
}

if ($Reliability) {
  Invoke-Step "reliability" {
    & ".\scripts\reliability-failover-drill.ps1" `
      -Environment $Environment `
      -BaseUrl $BaseUrl `
      -OutJson "$evidenceDir/reliability-drill.json" `
      -OutTxt "$evidenceDir/reliability-drill.txt"
  }
}

if ($BackupRecovery) {
  Invoke-Step "backupRecovery" {
    & ".\scripts\backup-restore-drill.ps1" `
      -Environment $Environment `
      -BaseUrl $BaseUrl `
      -OutJson "$evidenceDir/backup-restore-drill.json" `
      -OutTxt "$evidenceDir/backup-restore-drill.txt"
  }
}

if ($Rbac) {
  Invoke-Step "rbac" {
    Push-Location ".\backend"
    try {
      & npm test
      if ($LASTEXITCODE -ne 0) { throw "backend npm test failed with exit code $LASTEXITCODE" }
    } finally {
      Pop-Location
    }
  }
}

if ($Tls) {
  Invoke-Step "tls" {
    if (-not $StagingHost -or -not $ProductionHost) {
      throw "TLS module requires both StagingHost and ProductionHost."
    }
    & ".\scripts\tls-verify-evidence.ps1" `
      -StagingHost $StagingHost `
      -ProductionHost $ProductionHost `
      -OutFile "$evidenceDir/tls-verification.txt" `
      -OutJson "$evidenceDir/tls-verification.json"
  }
}

$summary.finishedAt = (Get-Date).ToString("o")
$moduleResults = $summary.modules.GetEnumerator() | ForEach-Object {
  if ($_.Value.enabled) { $_.Value.pass -eq $true } else { $true }
}
$summary.pass = ($moduleResults -notcontains $false)
$summaryPath = "$evidenceDir/nfr-runner-summary.json"
$summary | ConvertTo-Json -Depth 8 | Set-Content -Path $summaryPath -Encoding UTF8
Write-Host "NFR runner summary: $summaryPath"
if (-not $summary.pass) { exit 1 }
