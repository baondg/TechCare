#Requires -Version 5.1
<#
  Build images (Cloud Build), deploy backend then frontend to Cloud Run (Option A).

  Create secrets first (example):
    echo -n "your-jwt" | gcloud secrets create jwt-secret --data-file=-
    echo -n "db-pass" | gcloud secrets create db-password --data-file=-

  Grant the Cloud Run runtime SA access:
    $PROJECT_NUMBER = gcloud projects describe PROJECT --format='value(projectNumber)'
    $SA = "${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"
    gcloud secrets add-iam-policy-binding jwt-secret --member="serviceAccount:$SA" --role="roles/secretmanager.secretAccessor"
    gcloud secrets add-iam-policy-binding db-password --member="serviceAccount:$SA" --role="roles/secretmanager.secretAccessor"

  Usage:
    powershell -ExecutionPolicy Bypass -File .\gcp\deploy.ps1 `
      -ProjectId "my-project" -Region "us-central1" -Repository "techcare" `
      -CloudSqlInstance "project:region:instance" `
      -DbName "techcare" -DbUser "techcare" `
      -JwtSecretName "jwt-secret" -DbPasswordSecretName "db-password" `
      -Tag "v1"
#>
param(
  [Parameter(Mandatory = $true)][string]$ProjectId,
  [Parameter(Mandatory = $false)][string]$Region = "us-central1",
  [Parameter(Mandatory = $false)][string]$Repository = "techcare",
  [Parameter(Mandatory = $false)][string]$ApiServiceName = "techcare-api",
  [Parameter(Mandatory = $false)][string]$WebServiceName = "techcare-web",
  [Parameter(Mandatory = $true)][string]$CloudSqlInstance,
  [Parameter(Mandatory = $false)][string]$DbName = "techcare",
  [Parameter(Mandatory = $true)][string]$DbUser,
  [Parameter(Mandatory = $true)][string]$JwtSecretName,
  [Parameter(Mandatory = $true)][string]$DbPasswordSecretName,
  [Parameter(Mandatory = $false)][string]$Tag = "latest"
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $repoRoot

$registry = "${Region}-docker.pkg.dev/${ProjectId}/${Repository}"
$apiImage = "${registry}/${ApiServiceName}:${Tag}"
$webImage = "${registry}/${WebServiceName}:${Tag}"

gcloud config set project $ProjectId

Write-Host "Building backend image (Cloud Build)..."
gcloud builds submit . --config gcp/cloudbuild-api.yaml --substitutions="_IMAGE=$apiImage"

Write-Host "Building frontend image (Cloud Build)..."
gcloud builds submit . --config gcp/cloudbuild-web.yaml --substitutions="_IMAGE=$webImage"

Write-Host "Deploying backend..."
gcloud run deploy $ApiServiceName `
  --image $apiImage `
  --region $Region `
  --platform managed `
  --allow-unauthenticated `
  --add-cloudsql-instances $CloudSqlInstance `
  --set-env-vars "NODE_ENV=production,CLOUDSQL_INSTANCE_CONNECTION_NAME=$CloudSqlInstance,DB_NAME=$DbName,DB_USER=$DbUser" `
  --set-secrets "JWT_SECRET=${JwtSecretName}:latest,DB_PASSWORD=${DbPasswordSecretName}:latest" `
  --memory 512Mi

$apiUrl = (gcloud run services describe $ApiServiceName --region $Region --format="value(status.url)").Trim()
if (-not $apiUrl) { throw "Could not read backend URL." }
Write-Host "Backend URL: $apiUrl"

Write-Host "Deploying frontend (proxy /api -> backend)..."
gcloud run deploy $WebServiceName `
  --image $webImage `
  --region $Region `
  --platform managed `
  --allow-unauthenticated `
  --set-env-vars "BACKEND_URL=$apiUrl" `
  --memory 256Mi

$webUrl = (gcloud run services describe $WebServiceName --region $Region --format="value(status.url)").Trim()
Write-Host "Frontend URL: $webUrl"
Write-Host ""
Write-Host "Smoke checks:"
Write-Host "  curl $apiUrl/health"
Write-Host "  curl -I $webUrl"
