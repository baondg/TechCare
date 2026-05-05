# Dot-source this file so env vars apply to your current session:
#   . .\scripts\import-k6-grafana-env.ps1
# Then: k6 cloud run --local-execution k6/scripts/smoke.js
#       .\scripts\k6.ps1 -Script smoke -Cloud

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
$path = Join-Path $repoRoot "k6\.env.grafana.local"

if (-not (Test-Path $path)) {
  throw "Missing file: $path - Copy k6/.env.grafana.local.example to k6/.env.grafana.local and set K6_CLOUD_STACK_ID (numeric), K6_CLOUD_TOKEN, and optionally K6_CLOUD_PROJECT_ID."
}

$loaded = 0
Get-Content -LiteralPath $path -Encoding UTF8 | ForEach-Object {
  if ($_ -match '^\s*([^#=\s]+)\s*=\s*(.+)\s*$') {
    $val = $Matches[2].Trim().Trim([char]0x22)
    Set-Item -Path ("Env:{0}" -f $Matches[1]) -Value $val
    $loaded++
  }
}

if ($loaded -eq 0) {
  throw "No KEY=value lines found in $path"
}

$hasStack = -not [string]::IsNullOrEmpty($env:K6_CLOUD_STACK_ID)
$hasTok = -not [string]::IsNullOrEmpty($env:K6_CLOUD_TOKEN)
Write-Host ("Loaded {0} vars from k6/.env.grafana.local (stack={1} token={2})." -f $loaded, $hasStack, $hasTok) -ForegroundColor Green
