#Requires -Version 5.1
param(
  [Parameter(Mandatory = $true)][string]$ProjectId,
  [Parameter(Mandatory = $false)][string]$Region = "asia-southeast1",
  [Parameter(Mandatory = $false)][string]$RedisUrl = "",
  [Parameter(Mandatory = $false)][string]$ApiDomain = "",
  [Parameter(Mandatory = $false)][string]$WebDomain = "",
  [Parameter(Mandatory = $false)][switch]$SkipBuild
)
$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$envFile = Join-Path $repoRoot "backend\.env"
if (-not (Test-Path $envFile)) { throw "Missing $envFile" }
function Get-EnvValue([string]$Key) {
  $m = Select-String -Path $envFile -Pattern "^$([regex]::Escape($Key))=(.+)$" | Select-Object -First 1
  if (-not $m) { throw "Missing $Key in backend/.env" }
  return $m.Matches.Groups[1].Value.Trim()
}
function Get-EnvValueOptional([string]$Key) {
  $m = Select-String -Path $envFile -Pattern "^$([regex]::Escape($Key))=(.*)$" | Select-Object -First 1
  if (-not $m) { return "" }
  return $m.Matches.Groups[1].Value.Trim()
}
$deployParams = @{
  ProjectId = $ProjectId; Region = $Region
  DbHost = (Get-EnvValue "DB_HOST"); DbPort = [int](Get-EnvValue "DB_PORT")
  DbName = (Get-EnvValue "DB_NAME"); DbUser = (Get-EnvValue "DB_USER")
  DbPassword = (Get-EnvValue "DB_PASSWORD"); DbUseSsl = $true
  JwtSecret = (Get-EnvValue "JWT_SECRET")
}
$groqKey = Get-EnvValueOptional "GROQ_API_KEY"
if ($groqKey) { $deployParams.GroqApiKey = $groqKey }
$groqModel = Get-EnvValueOptional "GROQ_MODEL"
if ($groqModel) { $deployParams.GroqModel = $groqModel }
if ($SkipBuild) { $deployParams.SkipBuild = $true }
if ($ApiDomain) { $deployParams.ApiDomain = $ApiDomain }
if ($WebDomain) { $deployParams.WebDomain = $WebDomain }
if (-not [string]::IsNullOrWhiteSpace($RedisUrl)) {
  $u = $RedisUrl.Trim()
  if ($u -match '^redis://') { $u = $u -replace '^redis://', 'rediss://' }
  $deployParams.RedisUrl = $u
}
# Keep Redis features if secret already exists on GCP (redeploy without -RedisUrl).
$deployParams.EnableDistributedRateLimit = $true
$deployParams.EnablePatientRecordCache = $true
Write-Host "Deploying to project $ProjectId..."
& (Join-Path $repoRoot "gcp\deploy-free-trial.ps1") @deployParams
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
$api = (gcloud run services describe techcare-api --project $ProjectId --region $Region --format="value(status.url)" 2>$null)
if ($api) {
  & (Join-Path $repoRoot "gcp\smoke-free-trial.ps1") -BackendBaseUrl $api.TrimEnd("/")
  $web = (gcloud run services describe techcare-app --project $ProjectId --region $Region --format="value(status.url)" 2>$null)
  Write-Host "Backend:  $api"; Write-Host "Frontend: $web"
}