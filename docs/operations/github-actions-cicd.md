# GitHub Actions CI/CD for Cloud Run

Date: 2026-05-06

## 1) Overview

This repository uses these GitHub Actions workflows:

- `CI` (`.github/workflows/ci.yml`): runs on pull requests to `main`.
- `CD Cloud Run` (`.github/workflows/cd-cloudrun.yml`): runs on pushes to `main` and deploys backend/frontend to Cloud Run (`techcare-backend`, `techcare-frontend`).
- `CD Cloud Run Staging` (`.github/workflows/cd-cloudrun-staging.yml`): runs on pushes to `develop` (and manual `workflow_dispatch`) and deploys `techcare-backend-staging` / `techcare-frontend-staging` using `deploy.ps1 -ServiceSuffix "-staging"`.

The CD workflow authenticates to Google Cloud with Workload Identity Federation (WIF), so no long-lived service account key JSON is required.

## 2) Prerequisites

- GitHub repository admin access (to set repository secrets/variables and environments).
- GCP project with Cloud Run/Artifact Registry/Cloud SQL/Redis already provisioned.
- Existing deploy script: `infra/gcp/cloudrun/deploy.ps1`.

## 3) Create Workload Identity Federation in GCP

Set your values first:

```bash
PROJECT_ID="techcare-prod"
PROJECT_NUMBER="$(gcloud projects describe "${PROJECT_ID}" --format='value(projectNumber)')"
POOL_ID="github-pool"
PROVIDER_ID="github-provider"
REPO="OWNER/REPO"
DEPLOYER_SA="techcare-github-deployer@${PROJECT_ID}.iam.gserviceaccount.com"
```

Create a deployer service account (if not created yet):

```bash
gcloud iam service-accounts create techcare-github-deployer \
  --project "${PROJECT_ID}" \
  --display-name "TechCare GitHub Actions deployer"
```

Create Workload Identity Pool and OIDC Provider:

```bash
gcloud iam workload-identity-pools create "${POOL_ID}" \
  --project "${PROJECT_ID}" \
  --location "global" \
  --display-name "GitHub Actions pool"

gcloud iam workload-identity-pools providers create-oidc "${PROVIDER_ID}" \
  --project "${PROJECT_ID}" \
  --location "global" \
  --workload-identity-pool "${POOL_ID}" \
  --display-name "GitHub OIDC provider" \
  --issuer-uri "https://token.actions.githubusercontent.com" \
  --attribute-mapping "google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.ref=assertion.ref"
```

Allow only `main` branch of your repository to impersonate the service account:

```bash
gcloud iam service-accounts add-iam-policy-binding "${DEPLOYER_SA}" \
  --project "${PROJECT_ID}" \
  --role "roles/iam.workloadIdentityUser" \
  --member "principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL_ID}/attribute.repository/${REPO}"
```

WIF provider resource string (used in GitHub secret):

```bash
echo "projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL_ID}/providers/${PROVIDER_ID}"
```

## 4) IAM Roles for deployer service account

Grant least-privilege roles required by `deploy.ps1`:

```bash
gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
  --member "serviceAccount:${DEPLOYER_SA}" \
  --role "roles/run.admin"

gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
  --member "serviceAccount:${DEPLOYER_SA}" \
  --role "roles/artifactregistry.writer"

gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
  --member "serviceAccount:${DEPLOYER_SA}" \
  --role "roles/cloudbuild.builds.editor"
```

Also allow this deployer SA to act as the runtime SA used by Cloud Run (from `deploy.ps1`):

```bash
RUNTIME_SA="techcare-runtime@${PROJECT_ID}.iam.gserviceaccount.com"

gcloud iam service-accounts add-iam-policy-binding "${RUNTIME_SA}" \
  --project "${PROJECT_ID}" \
  --member "serviceAccount:${DEPLOYER_SA}" \
  --role "roles/iam.serviceAccountUser"
```

If your deploy path touches Cloud SQL/Secret Manager policies in your environment, grant additional roles accordingly.

### Internal API secret (required for default `deploy.ps1`)

Before deploying the backend with `infra/gcp/cloudrun/deploy.ps1`, create Secret Manager secret **`techcare-internal-api-secret`** holding a strong random value (used for header `x-internal-api-secret` on internal AI HTTP calls):

```bash
openssl rand -hex 32 | gcloud secrets create techcare-internal-api-secret --data-file=- --project "${PROJECT_ID}"
```

Grant the **Cloud Run runtime** service account access to this secret (same pattern as `techcare-jwt-secret`). If the secret is missing, deployment or runtime may fail when the service expects `INTERNAL_API_SECRET`.

## 5) Configure GitHub repository secrets and variables

### Secrets

- Configure **exactly one** auth mode:
  - **WIF mode**:
    - `GCP_WIF_PROVIDER`: `projects/<number>/locations/global/workloadIdentityPools/<pool>/providers/<provider>`
    - `GCP_DEPLOYER_SERVICE_ACCOUNT`: deployer SA email, e.g. `techcare-github-deployer@techcare-prod.iam.gserviceaccount.com`
  - **JSON key mode**:
    - `GCP_CREDENTIALS_JSON`: full service-account key JSON string

### Variables

- `GCP_PROJECT_ID` (required)
- `GCP_REGION` (optional, defaults to `asia-southeast1`)
- `CLOUDSQL_INSTANCE` (optional, defaults to `techcare-mysql`)
- `DB_NAME` (optional, defaults to `techcare`)
- `REDIS_HOST` (required)
- `VPC_CONNECTOR_NAME` (optional, defaults to `techcare-vpc-connector`)
- `API_DOMAIN` (optional)
- `WEB_DOMAIN` (optional)
- `PUBLIC_UNAUTHENTICATED` (optional: `true|false`, default false)

## 6) Optional environment protection

The CD job uses `environment: production`. Configure branch protection and required reviewers for the `production` environment if you want manual approval before deployment.

### Staging environment

Create a GitHub Environment named **`staging`** and attach the same variables (and secrets) as production, or point `GCP_PROJECT_ID` at a non-production GCP project. The staging workflow expects Cloud Run services **`techcare-backend-staging`** and **`techcare-frontend-staging`** (created on first deploy). WIF bindings must allow the `develop` branch (or your chosen ref) if you restrict pool providers by attribute.

## 7) Verification checklist

1. Open a PR targeting `main`.
2. Confirm `CI` workflow runs and passes:
   - backend: `lint`, `build`, `test`
   - frontend: `lint`, `build`, `test:run`, Playwright smoke (`npm run test:e2e` after Chromium install)
3. Merge PR into `main`.
4. Confirm `CD Cloud Run` workflow starts and passes (including pre-deploy tests and post-deploy `/health` smoke step).
5. Validate both Cloud Run services receive new revisions.
6. Validate frontend can reach backend and health checks pass.

## 8) Troubleshooting

- `google-github-actions/auth` fails with `must specify exactly one of workload_identity_provider or credentials_json`:
  - Ensure only one mode is configured (WIF or JSON key).
  - If using environment secrets, confirm secrets exist in the same environment used by workflow (`production`).
  - For fork/Dependabot-triggered workflows, remember secrets are not injected by default.
- `google-github-actions/auth` fails in WIF mode: verify OIDC provider string and `workloadIdentityUser` binding.
- Permission denied in deploy step: verify deployer SA IAM roles and runtime SA `iam.serviceAccountUser`.
- Deploy succeeds but app fails: verify repository variables (`REDIS_HOST`, `GCP_PROJECT_ID`, domain values) and service-level env in Cloud Run revisions.
