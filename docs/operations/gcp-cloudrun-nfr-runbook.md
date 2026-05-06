# GCP Cloud Run Production Hosting for NFR

Date: 2026-05-05

CI/CD automation reference:
- GitHub Actions setup (CI for PR + CD for main): `docs/operations/github-actions-cicd.md`

## 1) Scope

This runbook deploys TechCare frontend/backend to GCP Cloud Run with managed MySQL/Redis and runs NFR from a same-region runner.

- Runtime: Cloud Run (`asia-southeast1` default)
- Database: Cloud SQL MySQL 8
- Cache: Memorystore Redis 7
- Artifacts: `k6/out/*.json`, TLS probe output under `docs/operations/evidence/`

## 2) Required Files

- `infra/gcp/cloudrun/bootstrap.ps1`
- `infra/gcp/cloudrun/provision-datastores.ps1`
- `infra/gcp/cloudrun/deploy.ps1`
- `infra/gcp/cloudrun/run-nfr.ps1`
- `backend/Dockerfile.cloudrun`
- `frontend/Dockerfile.cloudrun`

## 3) Bootstrap Project and IAM

```powershell
.\infra\gcp\cloudrun\bootstrap.ps1 `
  -ProjectId techcare-prod `
  -Region asia-southeast1 `
  -BillingAccountId XXXX-XXXXXX-XXXXXX
```

Expected result:
- APIs enabled (Run, SQL Admin, Redis, Artifact Registry, Secret Manager)
- Runtime service account `techcare-runtime@<project>.iam.gserviceaccount.com`
- Docker repository `techcare`
- VPC connector `techcare-vpc-connector`

## 4) Provision Datastores

```powershell
.\infra\gcp\cloudrun\provision-datastores.ps1 `
  -ProjectId techcare-prod `
  -Region asia-southeast1 `
  -DbPassword "<strong-password>"
```

Then create secrets:

```powershell
echo "techcare" | gcloud secrets create techcare-backend-db-user --data-file=-
echo "<strong-password>" | gcloud secrets create techcare-backend-db-password --data-file=-
echo "<64-char-jwt-secret>" | gcloud secrets create techcare-jwt-secret --data-file=-
```

## 5) Deploy Cloud Run Services

```powershell
.\infra\gcp\cloudrun\deploy.ps1 `
  -ProjectId techcare-prod `
  -Region asia-southeast1 `
  -PublicUnauthenticated
```

Notes:
- Backend deploy includes Cloud SQL socket and Redis env.
- Backend `min-instances=2` to reduce cold-start bias during NFR.
- `deploy.ps1` builds frontend **sau** backend và set `VITE_API_BASE_URL` = URL public của backend (chỉ origin HTTPS, **không** `/api`). Nếu sau này bạn gom app + API sau một load balancer (`/api/*` → backend), có thể build lại frontend với base phù hợp (vẫn không được để base = `/api` vì code đã tự thêm `/api/...`).

## 6) HTTPS and TLS Evidence

1. Configure HTTPS load balancer and domain mappings:
   - `api.<domain>` -> backend service
   - `app.<domain>` -> frontend service
2. Enforce HTTP-to-HTTPS redirect at edge.
3. Collect evidence:

```powershell
.\scripts\tls-verify-evidence.ps1 `
  -StagingHost "staging-api.example.com" `
  -ProductionHost "api.example.com" `
  -OutFile "docs/operations/evidence/tls-verification-latest.txt"
```

## 7) Same-Region k6 Runner

Provision a small VM in `asia-southeast1` and install `k6`, Node.js, and this repository.

Run NFR:

```powershell
.\infra\gcp\cloudrun\run-nfr.ps1 `
  -BaseUrl "https://api.example.com" `
  -Username "<staff-user>" `
  -Password "<staff-pass>" `
  -WriteUsername "<patient-user>" `
  -WritePassword "<patient-pass>" `
  -AppointmentIds "1001,1002,1003"
```

Validate outputs:
- `k6/out/nfr-baseline.json`
- `k6/out/nfr-300vu.json`
- `k6/out/nfr-validated-report.json` (from `validate-nfr-results.js`)

## 8) Rollback

- Cloud Run revisions allow immediate rollback:

```powershell
gcloud run revisions list --service techcare-backend --region asia-southeast1
gcloud run services update-traffic techcare-backend --to-revisions <stable-revision>=100 --region asia-southeast1
```

- Repeat for `techcare-frontend`.

## 9) Audit Closure Checklist

- [ ] HTTPS endpoint is reachable and plain HTTP is redirected/blocked.
- [ ] NFR baseline + 300VU generated from same-region runner.
- [ ] `validate-nfr-results` report archived.
- [ ] Deployment variables and secret references documented.
- [ ] Rollback tested on both frontend/backend services.
