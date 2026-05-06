# RBAC Matrix

Source of truth: `backend/src/security/rbacMatrix.js`

| Capability | doctor | admin | nurse | technician | patient |
|---|---|---|---|---|---|
| `doctor.emr.read` | allow | allow | allow | allow | deny |
| `doctor.emr.write` | allow | allow | deny | deny | deny |
| `appointments.read.self` | deny | deny | deny | deny | allow |
| `appointments.write.self` | deny | deny | deny | deny | allow |
| `appointments.manage.open_slots` | deny | allow | allow | deny | deny |
| `appointments.nurse.checkin` | deny | allow | allow | deny | deny |

## Automated checks

- Node test file: `backend/test/rbac.test.js`
- Covers allow/deny logic and middleware behavior.
