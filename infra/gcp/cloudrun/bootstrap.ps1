param(
  [Parameter(Mandatory = $true)] [string]$ProjectId,
  [string]$Region = "asia-southeast1",
  [string]$BillingAccountId = "",
  [string]$Network = "default",
  [string]$ConnectorName = "techcare-vpc-connector"
)

$ErrorActionPreference = "Stop"

if ($BillingAccountId) {
  gcloud projects create $ProjectId --name $ProjectId
  gcloud beta billing projects link $ProjectId --billing-account $BillingAccountId
}

gcloud config set project $ProjectId
gcloud config set run/region $Region

gcloud services enable `
  artifactregistry.googleapis.com `
  cloudbuild.googleapis.com `
  run.googleapis.com `
  sqladmin.googleapis.com `
  redis.googleapis.com `
  vpcaccess.googleapis.com `
  secretmanager.googleapis.com `
  compute.googleapis.com

gcloud iam service-accounts create techcare-runtime `
  --display-name "TechCare Cloud Run runtime"

gcloud projects add-iam-policy-binding $ProjectId `
  --member "serviceAccount:techcare-runtime@$ProjectId.iam.gserviceaccount.com" `
  --role "roles/cloudsql.client"

gcloud projects add-iam-policy-binding $ProjectId `
  --member "serviceAccount:techcare-runtime@$ProjectId.iam.gserviceaccount.com" `
  --role "roles/secretmanager.secretAccessor"

gcloud projects add-iam-policy-binding $ProjectId `
  --member "serviceAccount:techcare-runtime@$ProjectId.iam.gserviceaccount.com" `
  --role "roles/vpcaccess.user"

gcloud artifacts repositories create techcare `
  --repository-format=docker `
  --location=$Region `
  --description="TechCare container images"

gcloud compute networks vpc-access connectors create $ConnectorName `
  --network $Network `
  --region $Region `
  --range 10.8.0.0/28

Write-Host "Bootstrap complete for project $ProjectId in $Region"
