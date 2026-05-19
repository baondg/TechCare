#Requires -Version 5.1
param(
  [Parameter(Mandatory = $true)][string]$ProjectId,
  [Parameter(Mandatory = $false)][string]$Region = "asia-southeast1"
)
Write-Host @"
# Scale legacy min instances to 0:
gcloud run services update techcare-backend --project $ProjectId --region $Region --min-instances=0
gcloud run services update techcare-frontend --project $ProjectId --region $Region --min-instances=0
# Enable billing: https://console.developers.google.com/billing/enable?project=$ProjectId
"@
