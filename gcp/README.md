# TechCare on Google Cloud (Option A)

Two **Cloud Run** services (Node API + nginx/Vite frontend) and **Cloud SQL** (MySQL). Redis is not required (the app uses MySQL for sessions).

## Prereqs

- [Google Cloud SDK](https://cloud.google.com/sdk) (`gcloud`) installed and authenticated
- Project with billing enabled
- **Cloud Build** and **Artifact Registry** API enabled (see `setup.ps1` / `setup.sh`)

## 1) Foundation

```powershell
powershell -ExecutionPolicy Bypass -File .\gcp\setup.ps1 -ProjectId "YOUR_PROJECT" -Region "us-central1"
```

## 2) Cloud SQL (optional script)

```powershell
powershell -ExecutionPolicy Bypass -File .\gcp\cloudsql.ps1 `
  -ProjectId "YOUR_PROJECT" -Region "us-central1" -InstanceName "techcare-sql" `
  -RootPassword "STRONG_ROOT" -DbName "techcare" -DbUser "techcare" -DbPassword "STRONG_APP"
```

Note the **instance connection name** from the output (`project:region:instance`).

## 3) Secrets (Secret Manager)

```powershell
echo -n "your-jwt-secret" | gcloud secrets create jwt-secret --data-file=-
echo -n "your-db-password" | gcloud secrets create db-password --data-file=-
```

Grant the default Cloud Run runtime service account access (replace `PROJECT_NUMBER`):

```powershell
$PROJECT_NUMBER = gcloud projects describe YOUR_PROJECT --format="value(projectNumber)"
$SA = "${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"
gcloud secrets add-iam-policy-binding jwt-secret --member="serviceAccount:$SA" --role="roles/secretmanager.secretAccessor"
gcloud secrets add-iam-policy-binding db-password --member="serviceAccount:$SA" --role="roles/secretmanager.secretAccessor"
```

The same service account needs **Cloud SQL Client** (usually granted by default for Cloud Run + Cloud SQL, or add explicitly).

## 4) Database schema

Load your production schema (e.g. from your internal `database_description.sql` or a dump) using the [Cloud SQL Auth Proxy](https://cloud.google.com/sql/docs/mysql/sql-proxy) or a one-off `gcloud sql connect` session. Do not rely on `AUTO_SYNC_DB` for a full production schema.

## 5) Deploy

```powershell
powershell -ExecutionPolicy Bypass -File .\gcp\deploy.ps1 `
  -ProjectId "YOUR_PROJECT" -Region "us-central1" -Repository "techcare" `
  -CloudSqlInstance "project:region:instance" `
  -DbName "techcare" -DbUser "techcare" `
  -JwtSecretName "jwt-secret" -DbPasswordSecretName "db-password" -Tag "v1"
```

On Linux/macOS, use `gcp/deploy.sh` with the same values (see script header).

## 6) Smoke test

```powershell
powershell -ExecutionPolicy Bypass -File .\gcp\smoke-test.ps1 -ApiUrl "https://...run.app" -WebUrl "https://...run.app"
```

## Optional: OpenAI

If you use AI routes, add a secret and extend `deploy.ps1` with e.g. `--set-secrets OPENAI_API_KEY=openai-key:latest` (and create the secret first).

## Uploads

See [UPLOADS.md](UPLOADS.md) for making file uploads durable with GCS.
