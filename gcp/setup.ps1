#Requires -Version 5.1
<#
  One-time GCP foundation: enable APIs and create an Artifact Registry Docker repository.
  Prerequisites: gcloud installed, authenticated (`gcloud auth login`), billing enabled.

  Usage (from repo root):
    powershell -ExecutionPolicy Bypass -File .\gcp\setup.ps1 -ProjectId "my-project" -Region "us-central1"
#>
param(
  [Parameter(Mandatory = $true)][string]$ProjectId,
  [Parameter(Mandatory = $false)][string]$Region = "us-central1",
  [Parameter(Mandatory = $false)][string]$Repository = "techcare"
)

$ErrorActionPreference = "Stop"

gcloud config set project $ProjectId

$apis = @(
  "run.googleapis.com",
  "artifactregistry.googleapis.com",
  "sqladmin.googleapis.com",
  "secretmanager.googleapis.com",
  "cloudbuild.googleapis.com",
  "iam.googleapis.com"
)
foreach ($api in $apis) {
  gcloud services enable $api --project $ProjectId
}

$repos = gcloud artifacts repositories list --location=$Region --format="value(name)" 2>$null
if ($repos -match $Repository) {
  Write-Host "Artifact Registry repo '$Repository' already exists in $Region."
} else {
  gcloud artifacts repositories create $Repository `
    --repository-format=docker `
    --location=$Region `
    --description="TechCare containers"
}

Write-Host "Done. Next: create Cloud SQL MySQL (Console or gcp/cloudsql.ps1), then run gcp/deploy.ps1."
