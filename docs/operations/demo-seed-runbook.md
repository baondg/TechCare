# Demo Seed Runbook

## Scope

This runbook creates deterministic demo data for end-to-end walkthroughs of:
- patient booking
- doctor management
- admin management
- RBAC capability checks

The seed process is idempotent and supports local dev DB and separate demo DB.

## Prerequisites

- Configure backend DB env vars in `backend/.env`:
  - `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`
- Optional password override for all seeded accounts:
  - `DEMO_ACCOUNT_PASSWORD` (default: `Test@1234`)

## Commands

Run from `backend/`:

```bash
npm run seed:demo
```

Reset demo namespace and then reseed:

```bash
npm run seed:demo:reset
```

Purge all business data (keep schema) and seed a clean demo dataset:

```bash
npm run seed:demo:fullreset
```

Write manifest to a custom location:

```bash
node scripts/seed-demo.js --manifest=./scripts/demo-seed-manifest.json
```

Seed booking window for patient booking (07/05-10/05, 4 slots/day):

```bash
node scripts/seed-demo.js --seed-booking-window --booking-start=2026-05-07 --booking-end=2026-05-10
```

**Một bệnh nhân cụ thể (CCCD = username):** vital signs + slot mở + tùy chọn đặt lịch nếu có regimen mở:

```bash
npm run seed:patient:vitals-slots
# hoặc: node scripts/seed-patient-vitals-and-slots.js --idcard=036096000004 --booking-start=2026-05-07 --booking-end=2026-05-10
# tùy chọn đổi mật khẩu: --set-password=Demo12345A
```

Cloud merge path (no data reset): import SQL helper to Cloud SQL

```bash
gcloud storage cp ./scripts/seed-booking-window-2026-05-07_2026-05-10.sql gs://techcare2026_cloudbuild/db-sync/seed-booking-window-2026-05-07_2026-05-10.sql
gcloud sql import sql techcare-mysql gs://techcare2026_cloudbuild/db-sync/seed-booking-window-2026-05-07_2026-05-10.sql --database=techcare --quiet
```

**Đồng bộ ngược (cloud → local):** xem [Update local database from Cloud SQL (GCP)](./backup-restore-baseline.md#task-update-local-database-from-cloud-sql-gcp) (`gcloud sql export` → tải `.sql.gz` → `npm run db:restore` với `.env` trỏ MySQL local).

## Seeded personas

- `admin` (admin)
- `nurse1` (nurse)
- `tech1` (technician, role code `PHY` or `TEC` depending DB enum)
- `doctor1` (doctor)
- `038204030823` (patient username / idcard)

All seeded accounts use the same password (`DEMO_ACCOUNT_PASSWORD` or default).

## Seeded workflow fixtures

- Department + room:
  - `Demo General Medicine`
  - `Demo Room A`
- Doctor, nurse, technician, admin profiles + doctor-department mapping
- 1 patient with linked `USER` / `ACCOUNT` / `PATIENT`
- 1 open regimen for seeded patient
- 3 appointment fixtures:
  - open slot (`scheduled`, no patient)
  - booked slot (`scheduled`, linked patient + regimen)
  - cancelled slot (`cancelled`)
- 1 work shift fixture linking doctor + nurse + technician to the seeded room

## Output manifest

After success, the script writes:
- `backend/scripts/demo-seed-manifest.json` (default)

Manifest includes IDs used in demos (doctor, patient, regimen, appointment, room, department) and seeded credentials.

## Verification checklist

- Run seed twice:
  - second run must not create duplicate users/fixtures
- Login checks:
  - patient can access self-appointment capabilities
  - doctor can access doctor EMR read capabilities
  - admin can access management capabilities
  - nurse can access check-in/open-slot capabilities
  - technician can access technician capabilities
- Confirm IDs exist using manifest values in API requests.
