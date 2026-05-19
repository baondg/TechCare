param(
  [Parameter(Mandatory = $true)] [string]$ProjectId,
  [string]$Region = "asia-southeast1",
  [string]$ApiDomain = "",
  [string]$WebDomain = "",
  [string]$CloudSqlInstance = "techcare-mysql",
  [string]$DbName = "techcare",
  [string]$RedisHost = "10.0.0.5",
  [string]$VpcConnectorName = "techcare-vpc-connector",
  [string]$ServiceSuffix = "",
  [switch]$PublicUnauthenticated
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $PSScriptRoot))
Set-Location $repoRoot

if ([string]::IsNullOrWhiteSpace($RedisHost)) {
  throw "RedisHost is required and cannot be empty. Example: -RedisHost '10.3.155.163'"
}
if ($RedisHost -match '[:/]') {
  throw "RedisHost must be host/IP only (without protocol/port). Example: 10.3.155.163"
}
if ($RedisHost -in @('127.0.0.1', 'localhost')) {
  throw "RedisHost must point to Memorystore/private Redis, not localhost."
}
if ($ServiceSuffix -ne "" -and $ServiceSuffix -notmatch '^-[a-z0-9-]{1,48}$') {
  throw "ServiceSuffix must be empty or a suffix like -staging (lowercase letters, digits, hyphens; max 48 chars)."
}

$backendServiceName = "techcare-backend$ServiceSuffix"
$frontendServiceName = "techcare-frontend$ServiceSuffix"

$registry = "$Region-docker.pkg.dev/$ProjectId/techcare"
$backendImage = "$registry/techcare-backend:latest"
$frontendImage = "$registry/techcare-frontend:latest"
$instanceConn = "$ProjectId`:$Region`:$CloudSqlInstance"
$corsOrigin = if ($WebDomain) { "https://$WebDomain" } else { "*" }
$vpcConnector = "projects/$ProjectId/locations/$Region/connectors/$VpcConnectorName"

gcloud config set project $ProjectId
gcloud config set run/region $Region

gcloud auth configure-docker "$Region-docker.pkg.dev" --quiet
docker build -f ./backend/Dockerfile.cloudrun -t $backendImage ./backend
docker push $backendImage

$backendArgs = @(
  "run", "deploy", $backendServiceName,
  "--image", $backendImage,
  "--region", $Region,
  "--service-account", "techcare-runtime@$ProjectId.iam.gserviceaccount.com",
  "--add-cloudsql-instances", $instanceConn,
  "--vpc-connector", $vpcConnector,
  "--vpc-egress", "private-ranges-only",
  "--set-env-vars", "NODE_ENV=production,DB_NAME=$DbName,CLOUDSQL_INSTANCE_CONNECTION_NAME=$instanceConn,REDIS_URL=redis://${RedisHost}:6379,ENABLE_PATIENT_RECORD_CACHE=1,ENABLE_DISTRIBUTED_RATE_LIMIT=1,BENCHMARK_RATE_LIMIT_BYPASS=0,AUTO_SYNC_DB=0,CORS_ALLOWED_ORIGINS=$corsOrigin",
  "--set-secrets", "DB_USER=techcare-backend-db-user:latest",
  "--set-secrets", "DB_PASSWORD=techcare-backend-db-password:latest",
  "--set-secrets", "JWT_SECRET=techcare-jwt-secret:latest",
  "--set-secrets", "GROQ_API_KEY=techcare-groq-api-key:latest",
  "--set-secrets", "INTERNAL_API_SECRET=techcare-internal-api-secret:latest",
  "--min-instances", "2",
  "--max-instances", "30",
  "--concurrency", "80",
  "--timeout", "120"
)

if ($PublicUnauthenticated) {
  $backendArgs += "--allow-unauthenticated"
}

& gcloud @backendArgs

$backendPublicUrl = (
  gcloud run services describe $backendServiceName --region $Region --format="value(status.url)"
).TrimEnd("/")

docker build -f ./frontend/Dockerfile.cloudrun -t $frontendImage ./frontend `
  --build-arg "VITE_API_BASE_URL=$backendPublicUrl"
docker push $frontendImage

$frontendArgs = @(
  "run", "deploy", $frontendServiceName,
  "--image", $frontendImage,
  "--region", $Region,
  "--service-account", "techcare-runtime@$ProjectId.iam.gserviceaccount.com",
  "--min-instances", "1",
  "--max-instances", "10",
  "--concurrency", "100",
  "--timeout", "60"
)

if ($PublicUnauthenticated) {
  $frontendArgs += "--allow-unauthenticated"
}

& gcloud @frontendArgs

$frontendPublicUrl = (
  gcloud run services describe $frontendServiceName --region $Region --format="value(status.url)"
).TrimEnd("/")

$effectiveCorsOrigin = if ($WebDomain) { "https://$WebDomain" } else { $frontendPublicUrl }
if ($effectiveCorsOrigin -and $effectiveCorsOrigin -ne $corsOrigin) {
  Write-Host "Updating backend CORS_ALLOWED_ORIGINS to $effectiveCorsOrigin"
  gcloud run services update $backendServiceName `
    --region $Region `
    --update-env-vars "CORS_ALLOWED_ORIGINS=$effectiveCorsOrigin" | Out-Null
}

if ($ApiDomain) {
  Write-Host "Map API domain manually or via Terraform: $ApiDomain"
}
if ($WebDomain) {
  Write-Host "Map web domain manually or via Terraform: $WebDomain"
}

Write-Host "Backend service: $backendServiceName"
Write-Host "Frontend service: $frontendServiceName"
Write-Host "Backend URL:  $backendPublicUrl"
Write-Host "Frontend URL: $frontendPublicUrl"
Write-Host "CORS origin:  $effectiveCorsOrigin"
Write-Host "Deployment complete."
