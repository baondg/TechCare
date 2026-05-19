#Requires -Version 5.1
<#
  Low-cost / free-trial oriented Cloud Run deployment for TechCare.

  This script intentionally does NOT create Cloud SQL, Memorystore Redis,
  VPC connectors, load balancers, custom domains, or min instances. It deploys
  the backend and frontend to Cloud Run with scale-to-zero and points the
  backend at an existing external MySQL database.

  Billing note: Google Cloud cannot guarantee zero cost. This script reduces
  charge risk with min instances set to 0, small instance limits, optional
  budget alerts, and by avoiding always-on managed services.

  Example:
    powershell -ExecutionPolicy Bypass -File .\gcp\deploy-free-trial.ps1 `
      -ProjectId "my-free-trial-project" `
      -DbHost "mysql.example.com" `
      -DbName "techcare" `
      -DbUser "techcare" `
      -DbPassword "replace-with-db-password" `
      -JwtSecret "replace-with-long-random-secret"

  Optional budget:
    powershell -ExecutionPolicy Bypass -File .\gcp\deploy-free-trial.ps1 `
      -ProjectId "my-free-trial-project" `
      -BillingAccountId "XXXXXX-XXXXXX-XXXXXX" `
      -CreateBudget `
      -BudgetAmountUsd 1 `
      -DbHost "mysql.example.com" `
      -DbName "techcare" `
      -DbUser "techcare" `
      -DbPassword "replace-with-db-password"

  Optional Upstash Redis (TCP+TLS URL, not REST):
    powershell -ExecutionPolicy Bypass -File .\gcp\deploy-free-trial.ps1 `
      -ProjectId "my-free-trial-project" `
      -DbHost "mysql.example.com" -DbName "techcare" -DbUser "techcare" -DbPassword "..." -JwtSecret "..." `
      -RedisUrl "rediss://default:YOUR_TOKEN@YOUR-DB.upstash.io:6379" `
      -EnableDistributedRateLimit `
      -EnablePatientRecordCache
#>
param(
  [Parameter(Mandatory = $true)][string]$ProjectId,
  [Parameter(Mandatory = $false)][string]$Region = "asia-southeast1",
  [Parameter(Mandatory = $false)][string]$Repository = "techcare-free-trial",
  [Parameter(Mandatory = $false)][string]$BackendServiceName = "techcare-api",
  [Parameter(Mandatory = $false)][string]$FrontendServiceName = "techcare-app",
  # Optional custom domains (e.g. api.example.com, app.example.com) — requires DNS + domain verification in GCP.
  [Parameter(Mandatory = $false)][string]$ApiDomain = "",
  [Parameter(Mandatory = $false)][string]$WebDomain = "",
  [Parameter(Mandatory = $false)][string]$Tag = "latest",

  [Parameter(Mandatory = $true)][string]$DbHost,
  [Parameter(Mandatory = $false)][int]$DbPort = 3306,
  [Parameter(Mandatory = $false)][string]$DbName = "techcare",
  [Parameter(Mandatory = $true)][string]$DbUser,
  [Parameter(Mandatory = $true)][string]$DbPassword,
  [Parameter(Mandatory = $false)][switch]$DbUseSsl,

  [Parameter(Mandatory = $false)][string]$JwtSecret = "",
  [Parameter(Mandatory = $false)][string]$InternalApiSecret = "",
  [Parameter(Mandatory = $false)][string]$AllowedOrigins = "",
  [Parameter(Mandatory = $false)][string]$RuntimeServiceAccount = "",

  [Parameter(Mandatory = $false)][int]$BackendMaxInstances = 1,
  [Parameter(Mandatory = $false)][int]$FrontendMaxInstances = 1,
  [Parameter(Mandatory = $false)][string]$BackendMemory = "512Mi",
  [Parameter(Mandatory = $false)][string]$FrontendMemory = "256Mi",

  [Parameter(Mandatory = $false)][string]$BillingAccountId = "",
  [Parameter(Mandatory = $false)][switch]$CreateBudget,
  [Parameter(Mandatory = $false)][decimal]$BudgetAmountUsd = 1,

  [Parameter(Mandatory = $false)][string]$DbPasswordSecretName = "techcare-free-db-password",
  [Parameter(Mandatory = $false)][string]$JwtSecretName = "techcare-free-jwt-secret",
  [Parameter(Mandatory = $false)][string]$InternalApiSecretName = "techcare-free-internal-api-secret",
  [Parameter(Mandatory = $false)][string]$GroqApiKey = "",
  [Parameter(Mandatory = $false)][string]$GroqApiKeySecretName = "techcare-free-groq-api-key",
  [Parameter(Mandatory = $false)][string]$GroqModel = "llama-3.1-8b-instant",
  [Parameter(Mandatory = $false)][switch]$SkipBuild,

  # Upstash / external Redis (TCP+TLS). Use rediss://default:TOKEN@host:6379 — not UPSTASH_REDIS_REST_*.
  [Parameter(Mandatory = $false)][string]$RedisUrl = "",
  [Parameter(Mandatory = $false)][string]$RedisUrlSecretName = "techcare-free-redis-url",
  [Parameter(Mandatory = $false)][switch]$EnableDistributedRateLimit,
  [Parameter(Mandatory = $false)][switch]$EnablePatientRecordCache,
  [Parameter(Mandatory = $false)][int]$RedisConnectTimeoutMs = 5000
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $repoRoot

function Assert-CommandExists([string]$CommandName) {
  if (-not (Get-Command $CommandName -ErrorAction SilentlyContinue)) {
    throw "Required command '$CommandName' was not found on PATH."
  }
}

function New-Base64Secret([int]$ByteCount = 48) {
  $bytes = New-Object byte[] $ByteCount
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try {
    $rng.GetBytes($bytes)
  } finally {
    $rng.Dispose()
  }
  return [Convert]::ToBase64String($bytes)
}

function Set-GcpSecretNoNewline([string]$SecretId, [string]$Value) {
  $tmp = New-TemporaryFile
  try {
    $utf8NoBom = New-Object System.Text.UTF8Encoding $false
    [System.IO.File]::WriteAllText($tmp.FullName, $Value, $utf8NoBom)
    $exists = $false
    try {
      gcloud secrets describe $SecretId --project $ProjectId *> $null
      $exists = $true
    } catch {
      $exists = $false
    }

    if ($exists) {
      gcloud secrets versions add $SecretId --project $ProjectId --data-file=$tmp | Out-Null
    } else {
      gcloud secrets create $SecretId --project $ProjectId --data-file=$tmp | Out-Null
    }
  } finally {
    Remove-Item $tmp -Force -ErrorAction SilentlyContinue
  }
}

function Ensure-ApiEnabled([string]$ApiName) {
  Write-Host "Ensuring API is enabled: $ApiName"
  gcloud services enable $ApiName --project $ProjectId | Out-Null
}

function Ensure-ArtifactRepository() {
  $prevEa = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  try {
    $existing = @(gcloud artifacts repositories list `
      --project $ProjectId `
      --location $Region `
      --format="value(name)" 2>&1 |
      ForEach-Object { "$_" } |
      Where-Object { $_ -match "/" })
  } finally {
    $ErrorActionPreference = $prevEa
  }
  $existingNames = @($existing | ForEach-Object { ([string]$_ -split "/")[-1] })

  if ($existingNames -contains $Repository) {
    Write-Host "Artifact Registry repository '$Repository' already exists in $Region."
    return
  }

  Write-Host "Creating Artifact Registry repository '$Repository' in $Region..."
  gcloud artifacts repositories create $Repository `
    --project $ProjectId `
    --repository-format=docker `
    --location=$Region `
    --description="TechCare free-trial container images" | Out-Null
}

function Ensure-Budget() {
  if (-not $CreateBudget) {
    Write-Host "Budget creation skipped. Use -CreateBudget -BillingAccountId <id> to create a budget alert."
    return
  }
  if ([string]::IsNullOrWhiteSpace($BillingAccountId)) {
    throw "-BillingAccountId is required when -CreateBudget is set."
  }

  Ensure-ApiEnabled "billingbudgets.googleapis.com"
  $projectNumber = (gcloud projects describe $ProjectId --format="value(projectNumber)").Trim()
  if (-not $projectNumber) {
    throw "Could not resolve project number for $ProjectId."
  }

  $displayName = "TechCare free-trial guardrail - $ProjectId"
  Write-Host "Creating or updating budget alert '$displayName' for project $ProjectId..."

  $existingBudget = (gcloud billing budgets list `
    --billing-account=$BillingAccountId `
    --format="value(name,displayName)" |
    Select-String -Pattern ([regex]::Escape($displayName)) |
    Select-Object -First 1)

  if ($existingBudget) {
    Write-Host "A budget with this display name already exists; leaving it unchanged."
    return
  }

  gcloud billing budgets create `
    --billing-account=$BillingAccountId `
    --display-name=$displayName `
    --budget-amount="${BudgetAmountUsd}USD" `
    --filter-projects="projects/$projectNumber" `
    --threshold-rule=percent=0.5 `
    --threshold-rule=percent=0.9 `
    --threshold-rule=percent=1.0 | Out-Null
}

function Resolve-RuntimeServiceAccount() {
  if (-not [string]::IsNullOrWhiteSpace($RuntimeServiceAccount)) {
    return $RuntimeServiceAccount
  }
  $projectNumber = (gcloud projects describe $ProjectId --format="value(projectNumber)").Trim()
  if (-not $projectNumber) {
    throw "Could not resolve project number for $ProjectId."
  }
  return "$projectNumber-compute@developer.gserviceaccount.com"
}

function Ensure-RuntimeSecretAccess([string]$ServiceAccountEmail) {
  Write-Host "Granting Secret Manager access to runtime service account $ServiceAccountEmail..."
  gcloud projects add-iam-policy-binding $ProjectId `
    --member "serviceAccount:$ServiceAccountEmail" `
    --role "roles/secretmanager.secretAccessor" `
    --quiet | Out-Null
}

function Assert-GcpBillingWritable() {
  $billing = (gcloud billing projects describe $ProjectId --format="value(billingEnabled)" 2>$null).Trim()
  if ($billing -ne "True") {
    throw "Project '$ProjectId' does not have billing enabled. Link an active billing account: https://console.cloud.google.com/billing/linkedaccount?project=$ProjectId"
  }
  $prevEa = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  try {
    $probe = gcloud artifacts repositories list --project $ProjectId --location $Region --format="value(name)" 2>&1 | ForEach-Object { "$_" }
    $probeText = ($probe -join "`n")
    if ($probeText -match "BILLING_DISABLED") {
      throw @"
GCP reports BILLING_DISABLED for billable APIs on '$ProjectId'.
'billingEnabled' may be true while the linked billing account is closed or invalid.
Open https://console.cloud.google.com/billing - reactivate or create a billing account (status must be OPEN), link it to the project, wait 2-5 minutes, then rerun this script.
"@
    }
  } finally {
    $ErrorActionPreference = $prevEa
  }
  Write-Host "Billing check passed for project $ProjectId."
}

Assert-CommandExists "gcloud"
Assert-CommandExists "docker"

if ($BackendMaxInstances -lt 1 -or $BackendMaxInstances -gt 2) {
  throw "BackendMaxInstances must be 1 or 2 for this free-trial profile."
}
if ($FrontendMaxInstances -ne 1) {
  throw "FrontendMaxInstances must be 1 for this free-trial profile."
}
if ($RedisConnectTimeoutMs -lt 500 -or $RedisConnectTimeoutMs -gt 60000) {
  throw "RedisConnectTimeoutMs must be between 500 and 60000."
}
if ([string]::IsNullOrWhiteSpace($JwtSecret)) {
  $JwtSecret = New-Base64Secret
  Write-Host "Generated JWT secret for this deployment."
}
if ([string]::IsNullOrWhiteSpace($InternalApiSecret)) {
  $InternalApiSecret = New-Base64Secret
  Write-Host "Generated internal API secret for this deployment."
}

gcloud config set project $ProjectId | Out-Null
gcloud config set run/region $Region | Out-Null

@(
  "run.googleapis.com",
  "artifactregistry.googleapis.com",
  "secretmanager.googleapis.com",
  "iam.googleapis.com",
  "cloudbilling.googleapis.com"
) | ForEach-Object { Ensure-ApiEnabled $_ }

Assert-GcpBillingWritable
Ensure-ArtifactRepository
Ensure-Budget

Write-Host "Creating/updating Secret Manager secrets..."
Set-GcpSecretNoNewline $DbPasswordSecretName $DbPassword
Set-GcpSecretNoNewline $JwtSecretName $JwtSecret
Set-GcpSecretNoNewline $InternalApiSecretName $InternalApiSecret

if (-not [string]::IsNullOrWhiteSpace($GroqApiKey)) {
  Write-Host "Creating/updating Groq API key secret '$GroqApiKeySecretName'..."
  Set-GcpSecretNoNewline $GroqApiKeySecretName $GroqApiKey.Trim()
}

if (-not [string]::IsNullOrWhiteSpace($RedisUrl)) {
  $trimRedis = $RedisUrl.Trim()
  $lower = $trimRedis.ToLowerInvariant()
  if ($lower -notmatch '^(redis|rediss)://') {
    throw "RedisUrl must start with redis:// or rediss:// (Upstash needs rediss:// for TLS)."
  }
  Write-Host "Creating/updating Redis URL secret '$RedisUrlSecretName'..."
  Set-GcpSecretNoNewline $RedisUrlSecretName $trimRedis
}

$redisSecretExists = $false
try {
  gcloud secrets describe $RedisUrlSecretName --project $ProjectId *> $null
  $redisSecretExists = $true
} catch {
  $redisSecretExists = $false
}

$mountRedisUrl = (-not [string]::IsNullOrWhiteSpace($RedisUrl)) -or $EnableDistributedRateLimit -or $EnablePatientRecordCache
if ($EnableDistributedRateLimit -or $EnablePatientRecordCache) {
  if (-not $redisSecretExists) {
    throw "Redis features require secret '$RedisUrlSecretName'. Pass -RedisUrl with your rediss://... URL (creates the secret) or create the secret in GCP first."
  }
}

$runtimeServiceAccountEmail = Resolve-RuntimeServiceAccount
Ensure-RuntimeSecretAccess $runtimeServiceAccountEmail

$registry = "$Region-docker.pkg.dev/$ProjectId/$Repository"
$backendImage = "$registry/$BackendServiceName`:$Tag"
$frontendImage = "$registry/$FrontendServiceName`:$Tag"

if (-not $SkipBuild) {
  Write-Host "Configuring Docker authentication for Artifact Registry..."
  gcloud auth configure-docker "$Region-docker.pkg.dev" --quiet | Out-Null

  Write-Host "Building backend image locally..."
  docker build -f .\backend\Dockerfile.cloudrun -t $backendImage .\backend
  docker push $backendImage
} else {
  Write-Host "Skipping backend build/push. Using image: $backendImage"
}

$initialCors = if ([string]::IsNullOrWhiteSpace($AllowedOrigins)) { "*" } else { $AllowedOrigins }

$enableDistFlag = if ($EnableDistributedRateLimit) { "1" } else { "0" }
$enableCacheFlag = if ($EnablePatientRecordCache) { "1" } else { "0" }
$dbUseSslFlag = if ($DbUseSsl) { "1" } else { "0" }
$dbSslRejectFlag = if ($DbUseSsl) { "0" } else { "1" }
$groqModelEnv = if ([string]::IsNullOrWhiteSpace($GroqModel)) { "llama-3.1-8b-instant" } else { $GroqModel.Trim() }
$backendEnvCore = "NODE_ENV=production,DB_HOST=$DbHost,DB_PORT=$DbPort,DB_NAME=$DbName,DB_USER=$DbUser,DB_USE_SSL=$dbUseSslFlag,DB_SSL_REJECT_UNAUTHORIZED=$dbSslRejectFlag,CLOUDSQL_INSTANCE_CONNECTION_NAME=,INSTANCE_CONNECTION_NAME=,CLOUD_SQL_CONNECTION_NAME=,ENABLE_DISTRIBUTED_RATE_LIMIT=$enableDistFlag,ENABLE_PATIENT_RECORD_CACHE=$enableCacheFlag,BENCHMARK_RATE_LIMIT_BYPASS=0,AUTO_SYNC_DB=0,CORS_ALLOWED_ORIGINS=$initialCors,GROQ_MODEL=$groqModelEnv"
if ($mountRedisUrl -and $redisSecretExists) {
  $backendEnvCore += ",REDIS_CONNECT_TIMEOUT_MS=$RedisConnectTimeoutMs"
}

$backendSecrets = "DB_PASSWORD=${DbPasswordSecretName}:latest,JWT_SECRET=${JwtSecretName}:latest,INTERNAL_API_SECRET=${InternalApiSecretName}:latest"
$groqSecretExists = $false
if (-not [string]::IsNullOrWhiteSpace($GroqApiKey)) {
  try {
    gcloud secrets describe $GroqApiKeySecretName --project $ProjectId *> $null
    $groqSecretExists = $true
  } catch {
    $groqSecretExists = $false
  }
  if ($groqSecretExists) {
    $backendSecrets += ",GROQ_API_KEY=${GroqApiKeySecretName}:latest"
  }
}
if ($mountRedisUrl -and $redisSecretExists) {
  $backendSecrets += ",REDIS_URL=${RedisUrlSecretName}:latest"
}

Write-Host "Deploying backend with scale-to-zero (no Cloud SQL/VPC on GCP; optional external Redis via secret)..."
gcloud run deploy $BackendServiceName `
  --project $ProjectId `
  --region $Region `
  --platform managed `
  --image $backendImage `
  --service-account $runtimeServiceAccountEmail `
  --allow-unauthenticated `
  --min-instances 0 `
  --max-instances $BackendMaxInstances `
  --memory $BackendMemory `
  --cpu 1 `
  --cpu-throttling `
  --concurrency 40 `
  --timeout 120 `
  --set-env-vars $backendEnvCore `
  --set-secrets $backendSecrets
if ($LASTEXITCODE -ne 0) {
  throw "Backend Cloud Run deploy failed (exit $LASTEXITCODE). Fix errors above before continuing."
}

$backendUrl = (gcloud run services describe $BackendServiceName `
  --project $ProjectId `
  --region $Region `
  --format="value(status.url)" 2>$null)
if ($backendUrl) { $backendUrl = $backendUrl.TrimEnd("/") }

if ([string]::IsNullOrWhiteSpace($backendUrl)) {
  throw "Could not read backend Cloud Run URL after deploy."
}
Write-Host "Backend URL: $backendUrl"

if (-not $SkipBuild) {
  Write-Host "Building frontend image locally with VITE_API_BASE_URL=$backendUrl..."
  docker build -f .\frontend\Dockerfile.cloudrun -t $frontendImage .\frontend `
    --build-arg "VITE_API_BASE_URL=$backendUrl"
  docker push $frontendImage
} else {
  Write-Host "Skipping frontend build/push. Using image: $frontendImage"
}

Write-Host "Deploying frontend with scale-to-zero..."
gcloud run deploy $FrontendServiceName `
  --project $ProjectId `
  --region $Region `
  --platform managed `
  --image $frontendImage `
  --service-account $runtimeServiceAccountEmail `
  --allow-unauthenticated `
  --min-instances 0 `
  --max-instances $FrontendMaxInstances `
  --memory $FrontendMemory `
  --cpu 1 `
  --cpu-throttling `
  --concurrency 40 `
  --timeout 60

$frontendUrl = (gcloud run services describe $FrontendServiceName `
  --project $ProjectId `
  --region $Region `
  --format="value(status.url)").TrimEnd("/")

if (-not $frontendUrl) {
  throw "Could not read frontend Cloud Run URL."
}
Write-Host "Frontend URL: $frontendUrl"

$effectiveCorsOrigin = if (-not [string]::IsNullOrWhiteSpace($WebDomain)) {
  "https://$($WebDomain.Trim().TrimStart('https://').TrimStart('http://').TrimEnd('/'))"
} elseif (-not [string]::IsNullOrWhiteSpace($AllowedOrigins)) {
  $AllowedOrigins
} else {
  $frontendUrl
}
if ($effectiveCorsOrigin -and $effectiveCorsOrigin -ne "*") {
  Write-Host "Updating backend CORS_ALLOWED_ORIGINS to $effectiveCorsOrigin"
  gcloud run services update $BackendServiceName `
    --project $ProjectId `
    --region $Region `
    --update-env-vars "CORS_ALLOWED_ORIGINS=$effectiveCorsOrigin" | Out-Null
}

function Invoke-RunDomainMapping([string]$ServiceName, [string]$Domain) {
  $hostName = $Domain.Trim().TrimStart("https://").TrimStart("http://").TrimEnd("/")
  if ([string]::IsNullOrWhiteSpace($hostName)) { return }
  Write-Host "Mapping domain $hostName -> $ServiceName (add DNS records shown below if this is new)..."
  gcloud beta run domain-mappings create `
    --service $ServiceName `
    --domain $hostName `
    --project $ProjectId `
    --region $Region `
    --platform managed 2>&1 | ForEach-Object { Write-Host $_ }
}
if (-not [string]::IsNullOrWhiteSpace($ApiDomain)) {
  Invoke-RunDomainMapping $BackendServiceName $ApiDomain
}
if (-not [string]::IsNullOrWhiteSpace($WebDomain)) {
  Invoke-RunDomainMapping $FrontendServiceName $WebDomain
}

Write-Host ""
Write-Host "Free-trial deployment complete."
Write-Host "Backend health check:"
Write-Host "  curl.exe $backendUrl/health"
Write-Host "Frontend:"
Write-Host "  $frontendUrl"
Write-Host ""
Write-Host "Verify scale-to-zero:"
Write-Host "  gcloud run services describe $BackendServiceName --project $ProjectId --region $Region --format='value(spec.template.metadata.annotations.autoscaling.knative.dev/minScale)'"
Write-Host "  gcloud run services describe $FrontendServiceName --project $ProjectId --region $Region --format='value(spec.template.metadata.annotations.autoscaling.knative.dev/minScale)'"
Write-Host ""
Write-Host "Cleanup commands are documented in docs/operations/gcp-free-trial-deploy.md"
