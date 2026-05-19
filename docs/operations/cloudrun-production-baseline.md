# Cloud Run Production Baseline (NFR)

Date: 2026-05-05
Target region: `asia-southeast1`

## Deployed Components

- `techcare-backend` on Cloud Run from `backend/Dockerfile.cloudrun`
- `techcare-frontend` on Cloud Run from `frontend/Dockerfile.cloudrun`
- Cloud SQL MySQL 8 (`techcare-mysql`)
- Memorystore Redis 7 (`techcare-redis`)
- Artifact Registry repository `techcare`

## Runtime Configuration Baseline

- Backend env template: `infra/gcp/cloudrun/env.backend.prod.example`
- Frontend env template: `infra/gcp/cloudrun/env.frontend.prod.example`
- Cloud Run backend service spec: `infra/gcp/cloudrun/backend.service.yaml`
- Cloud Run frontend service spec: `infra/gcp/cloudrun/frontend.service.yaml`

Key runtime controls:
- `ENABLE_DISTRIBUTED_RATE_LIMIT=1` for multi-instance rate-limit consistency
- `ENABLE_PATIENT_RECORD_CACHE=1` and `REDIS_URL=redis://...` for cache path
- `CORS_ALLOWED_ORIGINS=https://app.<domain>` for browser production origin
- Default production: `BENCHMARK_RATE_LIMIT_BYPASS=0`. For isolated load testing only: `BENCHMARK_RATE_LIMIT_BYPASS=1` + `x-benchmark-run: 1` (strip this header at the edge in real production).

## Deployment Procedure

1. Bootstrap: `infra/gcp/cloudrun/bootstrap.ps1`
2. Datastores: `infra/gcp/cloudrun/provision-datastores.ps1`
3. Deploy services: `infra/gcp/cloudrun/deploy.ps1`
4. Seed deterministic demo data: `infra/gcp/cloudrun/seed-demo.ps1`
5. Capture TLS proof: `infra/gcp/cloudrun/collect-tls-evidence.ps1`
6. Run NFR from same-region runner: `infra/gcp/cloudrun/run-nfr.ps1`

## NFR Artifacts

Expected files after each NFR cycle:

- `k6/out/nfr-run-manifest.json`
- `k6/out/nfr-baseline.json`
- `k6/out/nfr-300vu.json`
- `k6/out/nfr-validated-report.json`
- `docs/operations/evidence/tls-verification-latest.txt`

## Rollback Baseline

- Keep previous stable revisions for frontend/backend.
- Shift traffic immediately to stable revision if p95/p99 regression or error-rate breach is detected.
- Re-run smoke (`k6/scripts/smoke.js`) before re-opening traffic.
