# NFR Audit Closure Report

Date: 2026-05-05  
Scope: Repository state plus executed P0 evidence drills on local runtime and configured database endpoint

## 0) Executed P0 Evidence (2026-05-05)

- **k6 deterministic evidence generated and archived**
  - Artifacts:
    - `k6/out/nfr-run-manifest.json`
    - `k6/out/nfr-baseline.json`
    - `k6/out/nfr-300vu.json`
    - `k6/out/nfr-validated-report.json`
    - `k6/out/archive/2026-05-05-p0-evidence/*`
  - Result: validation `pass=false` (delta and conservative latency gates failed under 300 VU).
- **Backup/restore drill executed**
  - Backup artifact: `backend/backups/techcare-2026-05-05T13-06-17-866Z.sql.gz`
  - Restore drill artifact: `backend/backups/techcare-2026-05-05T13-06-17-866Z.sanitized.sql`
  - Script hardening: `backend/scripts/backup-restore.js` now uses managed-safe dump flags (`--set-gtid-purged=OFF --single-transaction`).
  - Verification: new backup run completed with hardened script (`backend/backups/techcare-2026-05-05T13-47-25-579Z.sql.gz`).
- **Failover exercise executed**
  - Scenario: forced backend container stop/start.
  - Result: health transitioned `200 -> ERR -> 200`, measured MTTR `21s`.
- **TLS verification output attached**
  - Evidence file: `docs/operations/evidence/tls-verification-2026-05-05.txt`
  - Helper script: `scripts/tls-verify-evidence.ps1`
  - Result (current reachable endpoint): HTTPS to `localhost:5000` failed, HTTP served `200` plaintext; control remains non-compliant for HTTPS-only objective.

## 1) Requirement-by-Requirement Compliance Matrix


| Requirement                                                                | Current status     | Evidence (file/path + metric/source)                                                                                                                                                                                                                                                                                                                                                                                                                      | Gap                                                                                                                                | Required implementation artifact for closure                                                                                                          |
| -------------------------------------------------------------------------- | ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Performance: `patient_record` p80 <= 5s under NFR load                     | **Partially Met**  | `k6/scripts/nfr-performance.js` threshold `http_req_duration{name:patient_record}: p(80)<=5000`; `k6/out/nfr-patient-300-after-narrow-pass.json` shows `p90=9503ms`, threshold field reports `true`; `k6/out/nfr-baseline-after-narrow-pass.json` shows low latency but threshold field `false`                                                                                                                                                           | Threshold truth values are inconsistent across exports; pass/fail interpretation is not audit-safe yet                             | Versioned k6 result interpretation guide + normalized summary artifact (single parser/report template)                                                |
| Performance: `appointment_write` p75 <= 7s with meaningful sample coverage | **Partially Met**  | `k6/scripts/nfr-performance.js` threshold `http_req_duration{name:appointment_write}: p(75)<=7000`; `k6/lib/iteration.js` only emits writes when appointment IDs exist and random gate `r < appointmentWriteProbability`; `k6/out/nfr-baseline-after-narrow-pass.json` has `appointment_write` all-zero duration stats and threshold `false`; `k6/out/nfr-patient-300-after-narrow-pass.json` has `appointment_write 2xx passes=234` and threshold `true` | Baseline run generated no valid appointment_write samples; closure evidence is incomplete for repeatable compliance                | Deterministic performance test profile for appointment writes (fixed IDs, fixed write probability, minimum sample count gate) + exported run manifest |
| Reliability/Availability: API health and rate controls in place            | **Partially Met**  | `backend/src/index.ts` has `/health` endpoint and app-level middleware; `backend/src/middleware/rateLimitMiddleware.js` provides scoped limits; `backend/src/common/database.js` configures DB pooling and Cloud SQL socket support                                                                                                                                                                                                                       | No codified availability SLO, no failover runbook, no error-budget policy, no reliability test evidence in repo                    | SLO/SLI specification, failover procedure runbook, and scheduled reliability test report template                                                     |
| Backup/Recovery: backup, restore, and DR readiness                         | **Partially Met**  | `backend/scripts/backup-restore.js` (managed-safe flags); `docs/operations/backup-restore-baseline.md`; backup outputs under `backend/backups/techcare-2026-05-05T13-06-17-866Z.sql.gz` and `backend/backups/techcare-2026-05-05T13-47-25-579Z.sql.gz`                                                                                                                                                                                                  | Need clean end-to-end restore evidence using the hardened script path and signed RPO/RTO evidence                                  | Backup policy + automated backup job spec + restore drill SOP + RPO/RTO acceptance record                                                             |
| Security: password hashing at rest                                         | **Met**            | `backend/src/services/patientRegistrationService.js` uses `bcrypt.hash` with `SALT_ROUNDS=12`; `backend/src/authorization/controller.js` verifies via `bcrypt.compare`; `backend/package.json` includes `bcrypt`                                                                                                                                                                                                                                          | None for baseline password hashing control                                                                                         | Keep control in security baseline checklist and regression security tests                                                                             |
| Security: authn/authz (JWT + role checks)                                  | **Partially Met**  | `backend/src/middleware/authMiddleware.js` verifies JWT and session state; `backend/src/routes/doctorRoutes.js` enforces role gate (`doctor/admin/nurse/technician`)                                                                                                                                                                                                                                                                                      | RBAC policy is route-local and not mapped to a central permission matrix; no explicit negative authorization test evidence package | Central RBAC matrix document + automated authz negative/positive test report                                                                          |
| Security: transport security posture (TLS)                                 | **Partially Met**  | `docs/operations/tls-assurance.md`; curl evidence file `docs/operations/evidence/tls-verification-2026-05-05.txt` with captured HTTPS/HTTP probe outputs                                                                                                                                                                                                                                                                                                  | Captured endpoint is currently non-compliant (`https` fail, `http` plaintext 200). Need staging/prod edge with HTTPS-only enforcement proof | Deployment security architecture doc proving TLS termination point, cert management, and HTTPS-only policy checks                                     |


## 2) Explicit Gap Section (Non-compliant / Non-verifiable)

1. **Appointment write benchmark coverage gap**
  Current nfr baseline export shows zero-value `appointment_write` metric distribution, indicating no usable write samples in that run.
2. **Performance audit consistency gap**
  k6 export fields (for thresholds and failed-rate interpretation) are inconsistent between files; no normalized post-run interpretation standard exists.
3. **Availability engineering evidence gap**
  Health endpoint and throttling exist, but there is no repository artifact for SLOs, failover drills, or reliability acceptance criteria.
4. **Backup and recovery operational gap**
  Backup UX is present in frontend as mock behavior; there is no backend backup automation, restore procedure evidence, or DR test output.
5. **TLS assurance gap**
  Repo does not provide verifiable proof of HTTPS enforcement at runtime environment boundary.

## 3) Prioritized Remediation Roadmap (P0/P1/P2)

### P0 (Blocker for NFR closure)

- **P0-1: Deterministic appointment_write performance profile**
  - Acceptance criteria:
    - k6 profile guarantees non-zero `appointment_write` samples in every audit run.
    - Minimum sample floor documented (for example: >= 200 writes).
    - Audit export includes run manifest (env vars, seed inputs, IDs source).
- **P0-2: Backup/restore implementation and drill evidence**
  - Acceptance criteria:
    - Automated backup job exists with retention policy.
    - Restore procedure executed in a non-prod drill and documented.
    - RPO/RTO measured and signed off against target.
- **P0-3: TLS posture evidence pack**
  - Acceptance criteria:
    - Architecture document identifies TLS termination point(s).
    - HTTPS-only enforcement and certificate rotation process documented.
    - Verification output (curl/ingress config/proxy policy) attached.

### P1 (High priority stabilization)

- **P1-1: Availability SLO + reliability runbook**
  - Acceptance criteria:
    - Service SLO/SLI defined (availability, latency, error rate).
    - Incident/failover playbook published.
    - At least one controlled failover or dependency-failure exercise recorded.
- **P1-2: Central RBAC matrix and test suite**
  - Acceptance criteria:
    - Role-permission matrix exists and maps all protected routes.
    - Automated authz tests include allow/deny cases per role.
    - Regression checks are wired into CI.

### P2 (Hardening and audit efficiency)

- **P2-1: NFR evidence normalization**
  - Acceptance criteria:
    - Single parser/report format generated for each benchmark run.
    - Threshold and pass/fail interpretation is deterministic and reviewed.
    - Historical trend report retained for release audits.
- **P2-2: Reliability observability pack**
  - Acceptance criteria:
    - Dashboards and alert rules for key SLO indicators are documented.
    - On-call escalation policy and error budget policy are linked in repo docs.

## 4) Post-Implementation Verification Protocol

### A. Performance

1. Run baseline and target-load NFR scripts using fixed, versioned input manifest.
2. Verify both threshold compliance and sample sufficiency:
  - `patient_record` p80 <= 5000 ms
  - `appointment_write` p75 <= 7000 ms
  - `http_req_failed` rate < 1%
  - minimum write sample gate satisfied
3. Archive raw k6 JSON plus normalized summary artifact in `k6/out/` and audit docs.

### B. Availability / Reliability

1. Validate `/health` and dependency health checks under nominal and degraded conditions.
2. Execute at least one fault scenario (DB unavailable, high latency, or service restart).
3. Confirm SLO metrics are collected and alerts fire/escalate correctly.
4. Record MTTR and closure notes in reliability verification log.

### C. Backup / Recovery

1. Confirm scheduled backups execute and retention policy is enforced.
2. Perform restore drill from latest backup into isolated environment.
3. Measure actual RPO and RTO against approved targets.
4. Store restore evidence (timestamps, data integrity checks, operator checklist).

### D. Security

1. Validate password hashing and authentication flows (positive + negative tests).
2. Run RBAC authorization tests per protected route and role matrix.
3. Verify TLS in deployed environment (HTTPS-only, valid cert chain, no plaintext exposure).
4. Capture security verification report with remediation status for any failed control.

---

This document intentionally records closure artifacts required for implementation follow-through, while preserving the approved plan file unchanged.

## 5) Unified NFR test entrypoint

- Orchestrator script: `scripts/nfr-runner.ps1`
- Consolidated runbook: `docs/operations/nfr-test-suite-runbook.md`
- Runner emits machine-readable domain results at:
  - `docs/operations/evidence/<run-id>-<environment>/nfr-runner-summary.json`
- Closure mapping rule:
  - Requirement status should move to `Met` only when the mapped runner domain is `pass=true` in the latest approved evidence package.