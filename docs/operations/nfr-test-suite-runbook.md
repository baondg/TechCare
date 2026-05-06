# NFR Test Suite Runbook

## Purpose

Run full non-functional requirement checks from one entrypoint and collect auditable evidence for local, staging, and production.

## Entry point

Use `scripts/nfr-runner.ps1` from repository root.

## Domains

- `-Performance`: k6 baseline + 300VU + deterministic validator.
- `-Reliability`: failover drill with MTTR evidence.
- `-BackupRecovery`: backup and restore drill with health verification.
- `-Rbac`: backend authorization test suite (`node:test`).
- `-Tls`: HTTPS and HTTP behavior checks for staging/production hosts.

If no domain switch is specified, the runner executes all domains.

## Environment presets

### Local

```powershell
.\scripts\nfr-runner.ps1 -Environment local `
  -BaseUrl http://localhost:5000 `
  -Performance -Reliability -BackupRecovery -Rbac -Tls `
  -StagingHost localhost:5000 -ProductionHost localhost:5000 `
  -K6Username <staff_user> -K6Password <staff_pass> `
  -K6WriteUsername <patient_user> -K6WritePassword <patient_pass> `
  -AppointmentIds "<id1,id2,id3>"
```

### Staging

```powershell
.\scripts\nfr-runner.ps1 -Environment staging `
  -BaseUrl https://<staging-host> `
  -Performance -Reliability -BackupRecovery -Rbac -Tls `
  -StagingHost <staging-host> -ProductionHost <prod-host> `
  -K6Username <staff_user> -K6Password <staff_pass> `
  -K6WriteUsername <patient_user> -K6WritePassword <patient_pass> `
  -AppointmentIds "<id1,id2,id3>"
```

### Production

```powershell
.\scripts\nfr-runner.ps1 -Environment production `
  -BaseUrl https://<prod-host> `
  -Performance -Reliability -BackupRecovery -Rbac -Tls `
  -StagingHost <staging-host> -ProductionHost <prod-host> `
  -K6Username <staff_user> -K6Password <staff_pass> `
  -K6WriteUsername <patient_user> -K6WritePassword <patient_pass> `
  -AppointmentIds "<id1,id2,id3>"
```

## Output artifacts

Runner writes evidence per run under:

- `k6/out/archive/<run-id>-<environment>/`
- `docs/operations/evidence/<run-id>-<environment>/`

Primary summary file:

- `docs/operations/evidence/<run-id>-<environment>/nfr-runner-summary.json`

## Pass/fail mapping for closure

- **Performance**: `nfr-validated-report.json` has `pass=true`.
- **Reliability**: drill evidence reports `pass=true` and finite MTTR.
- **BackupRecovery**: backup/restore drill evidence reports `pass=true`.
- **RBAC**: backend test suite exits success.
- **TLS**: both staging and production checks satisfy:
  - HTTPS reachable (`httpsPass=true`)
  - HTTP blocked or redirected (`httpBlockedOrRedirected=true`)

NFR closure should only mark a domain as `Met` when corresponding evidence in the current run is passing.
