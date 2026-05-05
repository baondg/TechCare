#!/usr/bin/env bash
set -euo pipefail
# Mirror of deploy.ps1 — same env/secrets expectations.
# Usage: see comments in gcp/deploy.ps1

if [[ $# -lt 8 ]]; then
  echo "Usage: $0 PROJECT_ID REGION REPOSITORY CLOUD_SQL_CONNECTION DB_USER JWT_SECRET_NAME DB_PASSWORD_SECRET_NAME TAG"
  echo "Example: $0 myproj us-central1 techcare 'proj:us-central1:sql' techcare jwt-secret db-password v1"
  exit 1
fi

PROJECT_ID="$1"
REGION="$2"
REPOSITORY="$3"
CLOUD_SQL_INSTANCE="$4"
DB_USER="$5"
JWT_SECRET_NAME="$6"
DB_PASSWORD_SECRET_NAME="$7"
TAG="${8}"
DB_NAME="${DB_NAME:-techcare}"
API_NAME="${API_NAME:-techcare-api}"
WEB_NAME="${WEB_NAME:-techcare-web}"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

REGISTRY="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}"
API_IMAGE="${REGISTRY}/${API_NAME}:${TAG}"
WEB_IMAGE="${REGISTRY}/${WEB_NAME}:${TAG}"

gcloud config set project "${PROJECT_ID}"

gcloud builds submit . --config gcp/cloudbuild-api.yaml --substitutions="_IMAGE=${API_IMAGE}"
gcloud builds submit . --config gcp/cloudbuild-web.yaml --substitutions="_IMAGE=${WEB_IMAGE}"

gcloud run deploy "${API_NAME}" \
  --image "${API_IMAGE}" \
  --region "${REGION}" \
  --platform managed \
  --allow-unauthenticated \
  --add-cloudsql-instances "${CLOUD_SQL_INSTANCE}" \
  --set-env-vars "NODE_ENV=production,CLOUDSQL_INSTANCE_CONNECTION_NAME=${CLOUD_SQL_INSTANCE},DB_NAME=${DB_NAME},DB_USER=${DB_USER}" \
  --set-secrets "JWT_SECRET=${JWT_SECRET_NAME}:latest,DB_PASSWORD=${DB_PASSWORD_SECRET_NAME}:latest" \
  --memory 512Mi

API_URL="$(gcloud run services describe "${API_NAME}" --region "${REGION}" --format='value(status.url)')"

gcloud run deploy "${WEB_NAME}" \
  --image "${WEB_IMAGE}" \
  --region "${REGION}" \
  --platform managed \
  --allow-unauthenticated \
  --set-env-vars "BACKEND_URL=${API_URL}" \
  --memory 256Mi

WEB_URL="$(gcloud run services describe "${WEB_NAME}" --region "${REGION}" --format='value(status.url)')"
echo "Backend: ${API_URL}"
echo "Frontend: ${WEB_URL}"
