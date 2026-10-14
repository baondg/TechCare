# Backup and Restore Operational Baseline

## Scope

This baseline covers MySQL logical backup and restore procedures for non-production and production drills.

## Tooling

- Script: `backend/scripts/backup-restore.js`
- npm wrappers:
  - `npm run db:backup -- <output_dir>`
  - `npm run db:restore -- <backup.sql.gz>`
- Managed-DB safe defaults (already baked into script):
  - `mysqldump --set-gtid-purged=OFF --single-transaction`

## Required environment

- `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`
- Installed CLI tools on the runner host:
  - `mysqldump`
  - `mysql`
  - `gzip`

## Backup runbook

From `backend/`:

```bash
npm run db:backup -- ./backups
```

Expected output: `Backup created: <path>/techcare-<timestamp>.sql.gz`

## Restore runbook

From `backend/`:

```bash
npm run db:restore -- ./backups/techcare-<timestamp>.sql.gz
```

## Verification after restore

- API health check (`/health`) is green.
- Spot-check critical reads:
  - patient profile
  - appointments list
  - doctor patient record
- Compare restored row counts for key tables (`PATIENT`, `APPOINTMENT`, `REGIMEN`).

## Targets

- RPO target: <= 24h
- RTO target: <= 2h

Record actual RPO/RTO for every drill in release evidence.

## Demo database full reset + seed

Use this flow only for demo/dev environments when you need a clean database and standard accounts for a full walkthrough.

From `backend/`:

```bash
npm run db:backup -- ./backups
npm run seed:demo:fullreset
```

The second command purges all current business rows (keeps schema) and recreates demo records.

Default demo password:

- `DEMO_ACCOUNT_PASSWORD` env var value if set
- otherwise: `Demo12345A`

Generated demo accounts:

- Admin: `admin_nguyenvana`
- Doctor: `doctor_levanc`
- Technician: `tech_tranthib`
- Patient (username = CCCD): `036096000004`

Manifest output after run: `backend/scripts/demo-seed-manifest.json`

## Latest drill evidence (2026-05-05)

- Backup command: `npm run db:backup -- ./backups`
- Backup output: `backend/backups/techcare-2026-05-05T13-06-17-866Z.sql.gz`
- Initial restore attempt failed before script hardening due managed DB privilege requirement on dump preamble (`SQL_LOG_BIN` / `GTID_PURGED` statements).
- Executed restore drill with sanitized SQL artifact:
  - `backend/backups/techcare-2026-05-05T13-06-17-866Z.sanitized.sql`
  - Restore execution completed successfully via `mysql` client against configured DB endpoint.
- Practical note: current script now emits managed-compatible dumps by default; rerun drill after this change should not require manual SQL sanitization.
- Evidence files for automated drills are emitted under `docs/operations/evidence/<run-id>-<environment>/backup-restore-drill.*`.
