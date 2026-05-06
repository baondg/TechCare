# Availability and Failover Runbook

## Trigger conditions

- sustained 5xx spike
- database connectivity errors
- platform-level instance crash/restart loop

## Immediate response

1. Confirm incident scope (`/health`, error-rate dashboards, recent deploys).
2. Freeze non-essential deployments.
3. Notify on-call and incident channel.

## Failover actions

### Backend service degradation

- Roll back to last known good revision.
- Scale instances up if saturation is the immediate cause.
- Verify `/health` and key user journeys after rollback.

### Database degradation

- Validate DB reachability from service.
- If primary DB is unavailable, switch to approved standby/recovery path.
- If data corruption suspected, run restore drill from latest backup snapshot.

## Recovery verification

- `/health` success stable for 15 minutes.
- API error rate back under 1%.
- Critical paths validated:
  - patient record read
  - appointment list read/write

## Post-incident

- Capture timeline, root cause, MTTR, and prevention actions.
- Update this runbook when new failure modes are discovered.

## Automated drill command

From repository root:

```powershell
.\scripts\nfr-runner.ps1 -Environment local -Reliability -BaseUrl http://localhost:5000
```

For non-local environments, the script records evidence and marks manual fault injection required:

```powershell
.\scripts\reliability-failover-drill.ps1 -Environment staging -BaseUrl https://<staging-host>
.\scripts\reliability-failover-drill.ps1 -Environment production -BaseUrl https://<prod-host>
```

Evidence output path:
- `docs/operations/evidence/<run-id>-<environment>/reliability-drill.json`
- `docs/operations/evidence/<run-id>-<environment>/reliability-drill.txt`

## Latest exercise evidence (2026-05-05)

- Scenario: backend service degradation simulated by stopping `techcare-backend` container, then starting it again.
- Health progression:
  - pre-check: `GET /health` => `200`
  - during outage: `GET /health` => connection error
  - post-recovery: `GET /health` => `200`
- Measured MTTR: `21s`
- Timeline (UTC+7):
  - start: `2026-05-05T20:11:59.9126034+07:00`
  - recovered: `2026-05-05T20:12:21.0844811+07:00`
- Follow-up: repeat this drill in staging/prod-like topology and attach dashboard snapshots (error-rate and latency) for audit completeness.
