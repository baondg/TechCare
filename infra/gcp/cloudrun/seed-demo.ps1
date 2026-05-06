param(
  [Parameter(Mandatory = $true)] [string]$BackendUrl
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $PSScriptRoot))
Set-Location "$repoRoot/backend"

$env:BASE_URL = $BackendUrl
npm run seed:demo -- --reset-demo-only

Write-Host "Demo seed completed for $BackendUrl"
