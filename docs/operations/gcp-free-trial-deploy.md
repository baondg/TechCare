# Google Cloud free-trial deployment

This guide deploys TechCare as a low-cost demo on Google Cloud Run. It is intentionally different from the production Cloud Run runbooks in this repo.

Google Cloud cannot guarantee "no fee ever." The goal here is to reduce charge risk while using free-trial credits or free-tier capacity. Always check the Google Cloud Billing page after deployment.

## What this setup creates

- Two Cloud Run services:
  - `techcare-backend-free`
  - `techcare-frontend-free`
- One Artifact Registry Docker repository.
- Three required Secret Manager secrets:
  - database password
  - JWT secret
  - internal API secret
- Optional fourth secret: Redis connection URL (for Upstash or any TCP Redis; see below).
- Optional billing budget alerts.

## What this setup avoids

- Cloud SQL
- Memorystore Redis on GCP (optional external Redis such as Upstash instead)
- VPC Access connector
- Load balancer
- Custom domain
- Cloud Run min instances
- Paid AI provider keys by default

Those services are useful for production, but they can create charges even when traffic is low or idle.

## Prerequisites

- Google Cloud SDK installed and authenticated.
- Docker Desktop running locally.
- A Google Cloud project with billing or free-trial billing enabled.
- An existing external MySQL database reachable from Cloud Run.
- Database schema and seed data already loaded into that MySQL database.
- Permission to grant `roles/secretmanager.secretAccessor` to the Cloud Run runtime service account.

The app needs these database values:

```powershell
$ProjectId = "your-gcp-project-id"
$Region = "asia-southeast1"
$DbHost = "your-mysql-host.example.com"
$DbPort = 3306
$DbName = "techcare"
$DbUser = "techcare"
$DbPassword = "replace-with-db-password"
$JwtSecret = "replace-with-a-long-random-secret"
```

## Deploy

Run from the repository root:

```powershell
powershell -ExecutionPolicy Bypass -File .\gcp\deploy-free-trial.ps1 `
  -ProjectId $ProjectId `
  -Region $Region `
  -DbHost $DbHost `
  -DbPort $DbPort `
  -DbName $DbName `
  -DbUser $DbUser `
  -DbPassword $DbPassword `
  -JwtSecret $JwtSecret
```

The script:

1. Enables only the APIs needed for this profile.
2. Creates or reuses the Artifact Registry repository.
3. Creates new versions of required secrets.
4. Grants the Cloud Run runtime service account Secret Manager access.
5. Builds and pushes the backend image.
6. Deploys the backend with `min-instances=0`, CPU throttling, no Cloud SQL, no VPC connector, and **no GCP Memorystore** (optional external Redis via Secret Manager).
7. Builds the frontend using the backend URL as `VITE_API_BASE_URL`.
8. Deploys the frontend with `min-instances=0` and CPU throttling.
9. Updates backend CORS to the frontend URL.

### Optional: Upstash Redis (TLS, same protocol as the Node `redis` client)

The backend uses **`REDIS_URL`** with the `redis` npm package (TCP). Upstash’s **REST** tab (`UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`) is **not** used by this app without extra code.

1. In the Upstash console, use the **Redis** / **CLI** connection string with TLS, and build a URL like:

   `rediss://default:<YOUR_PASSWORD>@<your-db>.upstash.io:6379`

   Use protocol **`rediss`** (TLS). If the password contains reserved characters, URL-encode it.

2. Pass it to the deploy script so it is stored in Secret Manager (default secret id `techcare-free-redis-url`) and wired to Cloud Run:

```powershell
powershell -ExecutionPolicy Bypass -File .\gcp\deploy-free-trial.ps1 `
  -ProjectId $ProjectId `
  -Region $Region `
  -DbHost $DbHost `
  -DbPort $DbPort `
  -DbName $DbName `
  -DbUser $DbUser `
  -DbPassword $DbPassword `
  -JwtSecret $JwtSecret `
  -DbUseSsl `
  -RedisUrl "rediss://default:YOUR_TOKEN@your-db.upstash.io:6379" `
  -EnableDistributedRateLimit `
  -EnablePatientRecordCache
```

- **`-EnableDistributedRateLimit`**: consistent rate limits across Cloud Run instances (recommended if `BackendMaxInstances` may be `2`).
- **`-EnablePatientRecordCache`**: Redis-backed patient record cache when enabled in app config.
- **`-RedisConnectTimeoutMs`**: optional (default `5000`) — useful if cold starts or network to Upstash are slow.
- **`-DbUseSsl`**: sets `DB_USE_SSL=1` for **TCP MySQL over TLS** (typical for **Aiven**). See [backend/src/common/database.js](backend/src/common/database.js). Add `DB_SSL_REJECT_UNAUTHORIZED=0` via `gcloud run services update` only if your provider’s TLS chain fails strict verification.

If the Redis URL secret already exists in GCP, omit **`-RedisUrl`** and pass only the `-Enable*` switches (default secret id **`techcare-free-redis-url`**, overridable with **`-RedisUrlSecretName`**).

Manual Redis secret (PowerShell). Avoid `echo -n`; write the URL to a one-line file, then:

```powershell
Set-Content -Path .\redis-url.txt -Value "rediss://default:TOKEN@host:6379" -NoNewline -Encoding utf8
gcloud secrets create techcare-free-redis-url --data-file=.\redis-url.txt --project $ProjectId
Remove-Item .\redis-url.txt

gcloud run services update techcare-backend-free `
  --region $Region `
  --project $ProjectId `
  --update-secrets "REDIS_URL=techcare-free-redis-url:latest" `
  --update-env-vars "ENABLE_DISTRIBUTED_RATE_LIMIT=1,ENABLE_PATIENT_RECORD_CACHE=1,REDIS_CONNECT_TIMEOUT_MS=5000"
```

## Optional budget alert

To create a low budget alert scoped to this project, pass a billing account ID:

```powershell
powershell -ExecutionPolicy Bypass -File .\gcp\deploy-free-trial.ps1 `
  -ProjectId $ProjectId `
  -Region $Region `
  -BillingAccountId "XXXXXX-XXXXXX-XXXXXX" `
  -CreateBudget `
  -BudgetAmountUsd 1 `
  -DbHost $DbHost `
  -DbPort $DbPort `
  -DbName $DbName `
  -DbUser $DbUser `
  -DbPassword $DbPassword `
  -JwtSecret $JwtSecret
```

Budget alerts notify you, but they do not stop billing automatically. For the strongest guardrail, delete the project after the demo.

## Verify deployment

Get URLs:

```powershell
$Api = gcloud run services describe techcare-backend-free --region $Region --format="value(status.url)"
$Web = gcloud run services describe techcare-frontend-free --region $Region --format="value(status.url)"
Write-Host $Api
Write-Host $Web
```

Check backend health:

```powershell
curl.exe "$Api/health"
powershell -ExecutionPolicy Bypass -File .\gcp\smoke-free-trial.ps1 -BackendBaseUrl $Api
```

Confirm scale-to-zero:

```powershell
gcloud run services describe techcare-backend-free `
  --region $Region `
  --format="value(spec.template.metadata.annotations.autoscaling.knative.dev/minScale)"

gcloud run services describe techcare-frontend-free `
  --region $Region `
  --format="value(spec.template.metadata.annotations.autoscaling.knative.dev/minScale)"
```

Expected value is empty or `0`. Also confirm maximum instances:

```powershell
gcloud run services describe techcare-backend-free `
  --region $Region `
  --format="value(spec.template.metadata.annotations.autoscaling.knative.dev/maxScale)"

gcloud run services describe techcare-frontend-free `
  --region $Region `
  --format="value(spec.template.metadata.annotations.autoscaling.knative.dev/maxScale)"
```

Expected value is `1` unless you intentionally passed `-BackendMaxInstances 2`.

## Runtime notes

- Login and normal app flows depend on the external MySQL database being reachable from Cloud Run.
- Redis-backed distributed rate limits and patient record cache are **disabled by default**; enable them with **`-EnableDistributedRateLimit`** / **`-EnablePatientRecordCache`** and **`-RedisUrl`** (or a pre-created `techcare-free-redis-url` secret) as documented above.
- AI provider keys are not configured by default. AI pages may show provider or fetch errors until you configure a no-cost provider intentionally.
- The frontend is built with the backend URL, so rebuild and redeploy the frontend if you change backend service names or projects.

## Cleanup

Delete the deployed services:

```powershell
gcloud run services delete techcare-backend-free --region $Region --quiet
gcloud run services delete techcare-frontend-free --region $Region --quiet
```

Delete secrets:

```powershell
gcloud secrets delete techcare-free-db-password --quiet
gcloud secrets delete techcare-free-jwt-secret --quiet
gcloud secrets delete techcare-free-internal-api-secret --quiet
```

If you created the optional Redis URL secret:

```powershell
gcloud secrets delete techcare-free-redis-url --quiet
```

Delete Artifact Registry repository and images:

```powershell
gcloud artifacts repositories delete techcare-free-trial `
  --location $Region `
  --quiet
```

Optional: delete the whole project after the demo. This is the cleanest way to prevent further charges:

```powershell
gcloud projects delete $ProjectId
```

## Pre-deploy local checks

Run read-only GCP checks (billing must be **true** before any Cloud Run deploy/update):

```powershell
powershell -ExecutionPolicy Bypass -File .\gcp\diagnose-cloudrun.ps1 -ProjectId $ProjectId -Region $Region
```

If `billingEnabled: false`, open the printed billing URL, link an account, wait a few minutes, then run `gcp/deploy-free-trial.ps1`. Legacy stack cost hints: `gcp/legacy-cost-down-hints.ps1`.

```powershell
Push-Location backend
npm run build
npm test
Pop-Location

Push-Location frontend
npm run build
Pop-Location
```

If these fail locally, fix them before deploying. The deployment script builds containers and will fail on backend or frontend build errors.
