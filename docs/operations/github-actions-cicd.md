# GitHub Actions CI/CD for Cloud Run

Date: 2026-05-06

## 1) Overview

This repository uses two GitHub Actions workflows:

- `CI` (`.github/workflows/ci.yml`): runs on pull requests to `main`.
- `CD Cloud Run` (`.github/workflows/cd-cloudrun.yml`): runs on pushes to `main` and deploys backend/frontend to Cloud Run.

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

## 5) Configure GitHub repository secrets and variables

### Secrets

- `GCP_WIF_PROVIDER`: `projects/<number>/locations/global/workloadIdentityPools/<pool>/providers/<provider>`
- `GCP_DEPLOYER_SERVICE_ACCOUNT`: deployer SA email, e.g. `techcare-github-deployer@techcare-prod.iam.gserviceaccount.com`

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

## 7) Verification checklist

1. Open a PR targeting `main`.
2. Confirm `CI` workflow runs and passes:
   - backend: `lint`, `build`, `test`
   - frontend: `lint`, `build`, `test:run`
3. Merge PR into `main`.
4. Confirm `CD Cloud Run` workflow starts and passes.
5. Validate both Cloud Run services receive new revisions.
6. Validate frontend can reach backend and health checks pass.

## 8) Troubleshooting

- `google-github-actions/auth` fails: verify OIDC provider string and `workloadIdentityUser` binding.
- Permission denied in deploy step: verify deployer SA IAM roles and runtime SA `iam.serviceAccountUser`.
- Deploy succeeds but app fails: verify repository variables (`REDIS_HOST`, `GCP_PROJECT_ID`, domain values) and service-level env in Cloud Run revisions.
