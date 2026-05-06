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
  - `DEMO_ACCOUNT_PASSWORD` (default: `Demo12345A`)

## Commands

Run from `backend/`:

```bash
npm run seed:demo
```

Reset demo namespace and then reseed:

```bash
npm run seed:demo:reset
```

Write manifest to a custom location:

```bash
node scripts/seed-demo.js --manifest=./scripts/demo-seed-manifest.json
```

## Seeded personas

- `demo_admin` (admin)
- `demo_nurse` (nurse)
- `demo_technician` (technician, role code `PHY`)
- `demo_doc_1`, `demo_doc_2` (doctor)
- `900000000001`, `900000000002`, `900000000003` (patient usernames / idcards)

All seeded accounts use the same password (`DEMO_ACCOUNT_PASSWORD` or default).

## Seeded workflow fixtures

- Department + room:
  - `Demo General Medicine`
  - `Demo Room A`
- Doctor profiles + doctor-department mapping
- 3 patients with linked `USER` / `ACCOUNT` / `PATIENT`
- 1 open regimen for first patient
- 3 appointment fixtures:
  - open slot (`scheduled`, no patient)
  - booked slot (`scheduled`, linked patient + regimen)
  - cancelled slot (`cancelled`)

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
  - nurse/admin can access open-slot and check-in capabilities
- Confirm IDs exist using manifest values in API requests.
