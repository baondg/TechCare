#Requires -Version 5.1
<#
  Create a small Cloud SQL MySQL 8 instance and database (optional helper).
  Adjust tier/disk for production workloads.

  Usage:
    powershell -ExecutionPolicy Bypass -File .\gcp\cloudsql.ps1 `
      -ProjectId "my-project" -Region "us-central1" -InstanceName "techcare-sql" `
      -RootPassword "secure-root-pw" -DbName "techcare" -DbUser "techcare" -DbPassword "secure-app-pw"
#>
param(
  [Parameter(Mandatory = $true)][string]$ProjectId,
  [Parameter(Mandatory = $false)][string]$Region = "us-central1",
  [Parameter(Mandatory = $true)][string]$InstanceName,
  [Parameter(Mandatory = $true)][string]$RootPassword,
  [Parameter(Mandatory = $false)][string]$DbName = "techcare",
  [Parameter(Mandatory = $false)][string]$DbUser = "techcare",
  [Parameter(Mandatory = $true)][string]$DbPassword
)

$ErrorActionPreference = "Stop"
gcloud config set project $ProjectId

# Do not use `instances describe` when missing — 404 + stderr can abort the script on Windows PowerShell.
$existingNames = @(gcloud sql instances list --format="value(name)" 2>$null)
if ($existingNames -contains $InstanceName) {
  Write-Host "Instance $InstanceName already exists."
} else {
  gcloud sql instances create $InstanceName `
    --database-version=MYSQL_8_0 `
    --tier=db-f1-micro `
    --region=$Region `
    --root-password=$RootPassword `
    --storage-type=SSD `
    --storage-size=10GB `
    --availability-type=zonal
}

gcloud sql databases create $DbName --instance=$InstanceName 2>$null

$dbUserExists = gcloud sql users list --instance=$InstanceName --format="value(name)" | Select-String -Pattern "^$DbUser$"
if (-not $dbUserExists) {
  gcloud sql users create $DbUser --instance=$InstanceName --password=$DbPassword
} else {
  gcloud sql users set-password $DbUser --instance=$InstanceName --password=$DbPassword
}

$connName = gcloud sql instances describe $InstanceName --format="value(connectionName)"
Write-Host ""
Write-Host "Instance connection name (set CLOUDSQL_INSTANCE_CONNECTION_NAME on backend): $connName"
Write-Host "Create Secret Manager secrets for DB_PASSWORD and JWT_SECRET before deploying."
