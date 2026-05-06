param(
  [ValidateSet("smoke", "load", "nfr", "stress")]
  [string]$Script = "smoke",

  [switch]$Docker,

  [switch]$NoDockerFallback,

  # Stream results to Grafana Cloud k6 (requires: k6 on PATH + `k6 cloud login` or K6_CLOUD_TOKEN)
  [switch]$Cloud,

  # Run VUs on Grafana Cloud infrastructure instead of this machine (BASE_URL must be reachable from the public internet)
  [switch]$CloudDistributed,

  [string]$BaseUrl = $env:BASE_URL,

  [string]$Username = $env:K6_USERNAME,

  [string]$Password = $env:K6_PASSWORD,

  # Grafana Cloud numeric stack ID (k6 v1.6+): same as env K6_CLOUD_STACK_ID - not the https://... URL
  [string]$CloudStack = $env:K6_CLOUD_STACK_ID
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

$localScript = switch ($Script) {
  "smoke" { "k6/scripts/smoke.js" }
  "load" { "k6/scripts/load.js" }
  "nfr" { "k6/scripts/nfr-performance.js" }
  "stress" { "k6/scripts/stress.js" }
}

$containerScript = switch ($Script) {
  "smoke" { "/k6/scripts/smoke.js" }
  "load" { "/k6/scripts/load.js" }
  "nfr" { "/k6/scripts/nfr-performance.js" }
  "stress" { "/k6/scripts/stress.js" }
}

function Get-ResolvedBaseUrl {
  param([string]$Explicit)
  if ($Explicit) { return $Explicit }
  $fromEnv = [Environment]::GetEnvironmentVariable("BASE_URL")
  if ($fromEnv) { return $fromEnv }
  return "http://host.docker.internal:5000"
}

function Build-EnvK6Args {
  param([string]$GrafanaStackId)
  $pairs = [System.Collections.Generic.List[string]]::new()
  if ($BaseUrl) { $pairs.Add("BASE_URL=$BaseUrl") }
  if ($Username) { $pairs.Add("K6_USERNAME=$Username") }
  if ($Password) { $pairs.Add("K6_PASSWORD=$Password") }
  $stack = if (-not [string]::IsNullOrEmpty($GrafanaStackId)) { $GrafanaStackId.Trim() } else { [Environment]::GetEnvironmentVariable("K6_CLOUD_STACK_ID") }
  if (-not [string]::IsNullOrEmpty($stack)) {
    $pairs.Add("K6_CLOUD_STACK_ID=$stack")
  }
  $forwardKeys = @(
    "K6_PATIENT_USERNAME", "K6_PATIENT_PASSWORD",
    "K6_PATIENT_RECORD_ID", "K6_APPOINTMENT_ID", "K6_APPOINTMENT_IDS",
    "K6_APPOINTMENT_WRITE_PROB",
    "K6_STAGE_TARGET", "K6_MAX_VUS", "K6_STRESS_PEAK_VUS", "K6_TIMEOUT_MS",
    "K6_CLOUD_TOKEN",
    "K6_CLOUD_PROJECT_ID"
  )
  foreach ($key in $forwardKeys) {
    $v = [Environment]::GetEnvironmentVariable($key)
    if ($v) { $pairs.Add("$key=$v") }
  }
  $out = [System.Collections.Generic.List[string]]::new()
  foreach ($p in $pairs) {
    $out.Add("-e")
    $out.Add($p)
  }
  return [string[]]$out.ToArray()
}

function Invoke-K6Docker {
  param(
    [string]$Url,
    [string]$InnerScript
  )

  $dockerCmd = Get-Command docker -ErrorAction SilentlyContinue
  if (-not $dockerCmd) {
    throw "Neither 'k6' nor 'docker' was found. Install k6: winget install --id GrafanaLabs.k6 -e  OR install Docker Desktop and re-run."
  }

  $dockerArgs = @(
    "run", "--rm", "-i",
    "-e", "BASE_URL=$Url",
    "-v", "${PWD}/k6:/k6:ro",
    "grafana/k6", "run"
  )

  $forwardKeys = @(
    "K6_USERNAME", "K6_PASSWORD",
    "K6_PATIENT_USERNAME", "K6_PATIENT_PASSWORD",
    "K6_PATIENT_RECORD_ID", "K6_APPOINTMENT_ID", "K6_APPOINTMENT_IDS",
    "K6_APPOINTMENT_WRITE_PROB",
    "K6_STAGE_TARGET", "K6_MAX_VUS", "K6_STRESS_PEAK_VUS", "K6_TIMEOUT_MS"
  )
  foreach ($key in $forwardKeys) {
    $v = [Environment]::GetEnvironmentVariable($key)
    if ($v) { $dockerArgs += "-e", "$key=$v" }
  }

  if ($Username) { $dockerArgs += "-e", "K6_USERNAME=$Username" }
  if ($Password) { $dockerArgs += "-e", "K6_PASSWORD=$Password" }

  if ($Url -match '^https?://(localhost|127\.0\.0\.1)(:|/|$)') {
    Write-Warning "BASE_URL points at localhost; from inside the k6 container that is the container itself. Use http://host.docker.internal:5000 (or your machine IP) to reach the host API."
  }

  $dockerArgs += $InnerScript
  Write-Host "Running k6 via Docker (grafana/k6), BASE_URL=$Url" -ForegroundColor Cyan
  & docker @dockerArgs
  return $LASTEXITCODE
}

$resolvedUrl = Get-ResolvedBaseUrl -Explicit $BaseUrl

if ($Cloud -and $Docker) {
  throw 'Combine -Cloud with local k6 only (not -Docker). Grafana Cloud needs k6 cloud login on this machine, or set K6_CLOUD_TOKEN and run: k6 cloud run --local-execution ...'
}

if ($Cloud) {
  $k6Cmd = Get-Command k6 -ErrorAction SilentlyContinue
  if (-not $k6Cmd) {
    throw "Grafana Cloud mode requires the k6 CLI on PATH. Install: winget install --id GrafanaLabs.k6 -e  Then: k6 cloud login"
  }
  $stackTrim = if ($CloudStack) { $CloudStack.Trim() } else { "" }
  if ([string]::IsNullOrEmpty($stackTrim)) {
    Write-Warning "K6_CLOUD_STACK_ID is required (k6 v1.6+): numeric stack ID from Grafana Performance -> Settings -> Access -> Stack ID. Example: `$env:K6_CLOUD_STACK_ID='12345' or .\scripts\k6.ps1 -Cloud -CloudStack 12345. See k6/README.md."
  }
  elseif ($stackTrim -match '^\s*https?://') {
    Write-Warning "K6_CLOUD_STACK_ID must be a numeric stack ID, not a URL (got: $stackTrim). Use the Stack ID from the Grafana UI, or run k6 cloud login --stack <URL> and rely on saved config. See k6/README.md."
  }
  $tok = [Environment]::GetEnvironmentVariable("K6_CLOUD_TOKEN")
  $proj = [Environment]::GetEnvironmentVariable("K6_CLOUD_PROJECT_ID")
  if (-not [string]::IsNullOrEmpty($tok) -and [string]::IsNullOrEmpty($proj)) {
    Write-Host "Tip: token authenticates; if k6 errors about default project, set K6_CLOUD_PROJECT_ID (which project owns the run) or run k6 cloud login once. See k6/README.md." -ForegroundColor DarkGray
  }
  if ([string]::IsNullOrEmpty([Environment]::GetEnvironmentVariable("K6_CLOUD_TOKEN"))) {
    Write-Host "k6 cloud login: token input is hidden (nothing appears). Paste token, press Enter. Or set K6_CLOUD_TOKEN. See k6/README.md (section: Windows / token login)." -ForegroundColor DarkYellow
  }
  $k6Args = @("cloud", "run")
  if (-not $CloudDistributed) {
    $k6Args += "--local-execution"
    Write-Host "Grafana Cloud: local VUs + results streamed to Grafana Cloud k6" -ForegroundColor Cyan
  }
  else {
    Write-Host 'Grafana Cloud: VUs run on Grafana infrastructure - use a public BASE_URL' -ForegroundColor Yellow
  }
  $k6Args += (Build-EnvK6Args -GrafanaStackId $CloudStack)
  $k6Args += $localScript
  & k6 @k6Args
  exit $LASTEXITCODE
}

if ($Docker) {
  exit (Invoke-K6Docker -Url $resolvedUrl -InnerScript $containerScript)
}

$k6Cmd = Get-Command k6 -ErrorAction SilentlyContinue
if (-not $k6Cmd -and -not $NoDockerFallback) {
  Write-Host "k6 is not on PATH. Using Docker instead. To install k6 natively: winget install --id GrafanaLabs.k6 -e" -ForegroundColor Yellow
  exit (Invoke-K6Docker -Url $resolvedUrl -InnerScript $containerScript)
}

if (-not $k6Cmd) {
  throw "k6 not found. Install with: winget install --id GrafanaLabs.k6 -e  Or run without -NoDockerFallback so Docker can be used."
}

$k6Args = @("run")
$k6Args += (Build-EnvK6Args -GrafanaStackId $CloudStack)
$k6Args += $localScript

& k6 @k6Args
exit $LASTEXITCODE
