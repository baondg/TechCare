#!/usr/bin/env bash
set -euo pipefail
# Usage: ./gcp/setup.sh PROJECT_ID [REGION] [REPOSITORY]
PROJECT_ID="${1:?PROJECT_ID required}"
REGION="${2:-us-central1}"
REPO="${3:-techcare}"

gcloud config set project "${PROJECT_ID}"

for api in run.googleapis.com artifactregistry.googleapis.com sqladmin.googleapis.com secretmanager.googleapis.com cloudbuild.googleapis.com iam.googleapis.com; do
  gcloud services enable "${api}" --project "${PROJECT_ID}"
done

if ! gcloud artifacts repositories describe "${REPO}" --location="${REGION}" &>/dev/null; then
  gcloud artifacts repositories create "${REPO}" \
    --repository-format=docker \
    --location="${REGION}" \
    --description="TechCare containers"
fi

echo "Done. Next: create Cloud SQL (Console or gcp/cloudsql.ps1), secrets, then gcp/deploy.ps1 or deploy.sh."
