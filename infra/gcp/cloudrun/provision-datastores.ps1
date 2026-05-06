param(
  [Parameter(Mandatory = $true)] [string]$ProjectId,
  [string]$Region = "asia-southeast1",
  [string]$DbInstance = "techcare-mysql",
  [string]$DbName = "techcare",
  [string]$DbUser = "techcare",
  [string]$DbPassword = "REPLACE_ME",
  [string]$RedisInstance = "techcare-redis",
  [string]$Network = "default"
)

$ErrorActionPreference = "Stop"

gcloud config set project $ProjectId

gcloud sql instances create $DbInstance `
  --database-version=MYSQL_8_0 `
  --cpu=2 `
  --memory=8GB `
  --region=$Region `
  --availability-type=zonal `
  --storage-size=100GB `
  --storage-type=SSD

gcloud sql databases create $DbName --instance=$DbInstance
gcloud sql users create $DbUser --instance=$DbInstance --password=$DbPassword

gcloud redis instances create $RedisInstance `
  --region=$Region `
  --zone="$Region-b" `
  --size=1 `
  --redis-version=redis_7_0 `
  --network=$Network

Write-Host "Datastores provisioned. Next: seed DB and set Cloud Run secrets."
