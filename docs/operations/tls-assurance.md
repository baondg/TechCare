# TLS Assurance and Verification

## Runtime TLS model

- TLS terminates at the ingress/reverse proxy layer (Cloud Run HTTPS endpoint or external load balancer).
- Backend service only accepts trusted internal HTTP from the platform boundary.
- Client-facing traffic must use `https://` URLs exclusively.

## Deployment controls

- Enforce HTTPS-only routing at ingress.
- Redirect or reject plaintext HTTP at the edge.
- Certificates are managed by the platform (managed certs) or a monitored renewal process.
- Rotate certificates before expiry and verify chain health after rotation.

## Verification checklist

Run for each environment (`staging`, `production`):

```bash
curl -I https://<host>/health
curl -I http://<host>/health
```

PowerShell helper from repo root:

```powershell
.\scripts\tls-verify-evidence.ps1 -StagingHost <staging-host> -ProductionHost <production-host>
```

Default output file:
- `docs/operations/evidence/tls-verification-latest.txt`
- `docs/operations/evidence/tls-verification-latest.json`

Unified runner:

```powershell
.\scripts\nfr-runner.ps1 -Environment staging -Tls -StagingHost <staging-host> -ProductionHost <production-host>
```

Expected:

- HTTPS returns `200` (or expected auth status on protected endpoints).
- HTTP does not serve plaintext application traffic (redirect or deny).

Additional checks:

- Confirm valid certificate issuer/expiry in browser lock details.
- Verify HSTS header if configured at the edge.
- Record command output in release evidence.

## Residual risk to monitor

- Misconfigured ingress can re-enable plaintext paths.
- Expired certificates can cause full availability incidents.

## Latest verification evidence (2026-05-05)

- Output file: `docs/operations/evidence/tls-verification-2026-05-05.txt`
- Probed endpoints in this execution context:
  - `https://localhost:5000/health`
  - `http://localhost:5000/health`
- Observed result:
  - HTTPS probe failed TLS handshake (`SEC_E_INVALID_TOKEN`).
  - HTTP probe returned `200 OK` (plaintext path still open).
- Audit interpretation:
  - Current reachable endpoint in this run does **not** satisfy HTTPS-only requirement.
  - To close TLS NFR, attach equivalent probe outputs for real staging and production ingress hosts where TLS terminates.
