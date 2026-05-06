# NFR Evidence Normalization

This project now treats NFR evidence as a deterministic artifact set:

1. `k6/out/nfr-run-manifest.json` (run inputs)
2. `k6/out/nfr-baseline.json` (baseline summary export)
3. `k6/out/nfr-300vu.json` (300 VU summary export)
4. `k6/out/nfr-validated-report.json` (deterministic pass/fail report)

## Deterministic pass/fail interpretation

A run is compliant only when all conditions are true:

- Deterministic metric checks pass in `k6/scripts/validate-nfr-results.js`:
  - `patient_record` latency gate (conservative proxy from available percentile stats)
  - `appointment_write` latency gate (conservative proxy from available percentile stats)
  - `appointment_write_samples >= K6_APPOINTMENT_WRITE_MIN_SAMPLES`
  - `http_req_failed < 1%`
- Baseline vs 300 VU latency delta gate passes:
  - metric: `http_req_duration{name:patient_record}` average
  - rule: `load300_avg - baseline_avg <= 3000 ms`

## Commands

From repository root (PowerShell):

```powershell
.\scripts\k6-nfr-gate.ps1 -BaseUrl http://localhost:5000 `
  -Username <staff_user> -Password <staff_pass> `
  -WriteUsername <patient_user> -WritePassword <patient_pass> `
  -AppointmentIds "1001,1002,1003"
```

Or manual validation:

```powershell
node .\k6\scripts\validate-nfr-results.js .\k6\out\nfr-baseline.json .\k6\out\nfr-300vu.json
```

Unified runner (single entrypoint for selected domains):

```powershell
.\scripts\nfr-runner.ps1 -Environment local -Performance
.\scripts\nfr-runner.ps1 -Environment staging -Performance -BaseUrl https://<staging-host> `
  -K6Username <staff_user> -K6Password <staff_pass> `
  -K6WriteUsername <patient_user> -K6WritePassword <patient_pass> `
  -AppointmentIds "<id1,id2,id3>"
```

## Notes

- Deterministic appointment writes require valid patient credentials and appointment IDs.
- Use `K6_APPOINTMENT_WRITE_PROB=1` for audit runs.
- Archive all four artifacts together for release evidence.
- The unified runner archives performance artifacts under `k6/out/archive/<run-id>-<environment>/`.
