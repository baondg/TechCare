param(
  [Parameter(Mandatory = $true)] [string]$StagingHost,
  [Parameter(Mandatory = $true)] [string]$ProductionHost,
  [string]$OutFile = "docs/operations/evidence/tls-verification-latest.txt"
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $PSScriptRoot))
Set-Location $repoRoot

.\scripts\tls-verify-evidence.ps1 `
  -StagingHost $StagingHost `
  -ProductionHost $ProductionHost `
  -OutFile $OutFile

Write-Host "TLS evidence captured: $OutFile"
