# Backend refactor checklist

## Architecture (appointment domain)

| Layer | Role |
| --- | --- |
| **Controllers** | HTTP, validation, delegate to services; avoid embedding SQL. |
| **Services** | Orchestration, MedAI/fetch, mapping; no `sequelize.query` once a repo exists for that slice. |
| **Repositories** | Raw SQL / Sequelize queries for one bounded area. |

`appointmentController.js` delegates patient id resolution to **`appointmentPatientService`** (`getPatientPkForUserId`, `getPatientPkFromRouteId`); it no longer imports `appointmentRepository`.

---

## Repositories

- [x] **`src/repositories/appointmentRepository.js`** — Appointment CRUD, booking/slot helpers, patient id lookups used by services.
- [x] **`src/repositories/appointmentAiRepository.js`** — AI/recovery: symptom context, clinical summary queries, recovery prescription eligibility (`SELECT 1 AS ok` + `isRecoveryEligiblePrescriptionRow`), `AI_MODEL` / `AI_RECOMMENDATION` / `CHAT_TURN`, chat models, latest cached recovery row.
- [x] **`src/repositories/patientPortalRepository.js`** — Nurse + patient portal reads: portal patient list, dashboard / medical visits bundles, regimens, transfers/slips, symptom logs, lab ownership + `TEST_DETAIL`.
- [x] **`src/repositories/nurseCheckInRepository.js`** — Nurse check-in: patient resolution, today’s appointments, queue/detail/update SQL.
- [x] **`src/repositories/appointmentFeedbackRepository.js`** — `FEEDBACK` list (by user / visible), insert, fetch by id.
- [x] **`src/repositories/appointmentNotificationRepository.js`** — Appointment notify helpers: summary row, patient/doctor user ids, `NOTIFICATION` insert, room/department for transfers, doctors-in-department list.
- [x] **`src/repositories/appointmentReminderRepository.js`** — Tomorrow’s confirmed appointments, dedupe check, timed reminder insert.
- [x] **`src/repositories/medicationReminderRepository.js`** — Active Rx lines (duration compat fallbacks), med reminder dedupe + insert.
- [x] **`src/repositories/userNotificationRepository.js`** — Inbox: due notifications list, unread count, mark read (single / all).
- [x] **`src/repositories/coverRepository.js`** — Cover requests: doctor lookup, `COVER_REQUEST` CRUD, appointment reassignment, cover-specific `NOTIFICATION` inserts.
- [x] **`src/repositories/workShiftRepository.js`** — Staff directory, staff id resolution (doctor/nurse/technician), `WORK_SHIFT` range queries.

---

## Services (wired from `appointmentController.js`)

- [x] **`appointmentPatientService.js`** — Patient-facing appointment flows; uses `appointmentRepository`.
- [x] **`appointmentPatientPortalService.js`** — Portal/nurse dashboard bundles; uses `patientPortalRepository` + `appointmentRepository` + `appointmentNurseService`.
- [x] **`appointmentSlotService.js`** — Slot listing / availability; uses `appointmentRepository`.
- [x] **`appointmentNurseService.js`** — Check-in orchestration; uses `nurseCheckInRepository`.
- [x] **`appointmentCatalogService.js`** — Doctors/rooms/depts for booking; uses `appointmentRepository`.
- [x] **`appointmentAiService.js`** — Chat, symptom analysis, recovery prediction orchestration; uses `appointmentAiRepository` + `appointmentRepository`; no direct `sequelize.query`.
- [x] **`appointmentFeedbackService.js`** — Feedback list/create; uses `appointmentFeedbackRepository` only.

## Notification orchestration (no `sequelize` in module; DB via `appointmentNotificationRepository`)

- [x] **`appointmentNotifications.js`** — Used by `appointmentPatientService`, `appointmentSlotService`, `appointmentNurseService`, `doctorController.js`. Public functions no longer take a `sequelize` first argument.
- [x] **`appointmentReminderNotifications.js`** — Scheduler + “day before” batch; SQL in `appointmentReminderRepository`. **`startAppointmentReminderScheduler()`** takes no args.
- [x] **`medicationReminderNotifications.js`** — Scheduler + slot run; SQL in `medicationReminderRepository`. **`startMedicationReminderScheduler()`** takes no args.

## User notification inbox (`notificationController.js`)

- [x] **`notificationService.js`** — Maps user id to list/unread/mark-read; uses `userNotificationRepository` only.
- [x] **`notificationController.js`** — HTTP only; no `sequelize.query`.

## Cover (`coverController.js`)

- [x] **`coverService.js`** — Create/list/accept/reject cover requests; transaction on accept; uses `coverRepository`.
- [x] **`coverController.js`** — HTTP only; no `sequelize.query`.

## Work shifts (`workShiftController.js`)

- [x] **`workShiftService.js`** — Staff directory + shift calendar mapping; uses `workShiftRepository`.
- [x] **`workShiftController.js`** — HTTP only; no `sequelize.query`.

---

## Verification (run in `backend/`)

- [x] `npm run build` — `tsc` must exit 0.
- [x] `npm test` — includes RBAC/config tests and `test/recovery-eligibility-prescription.test.js` (prescription row `ok` contract).
- [x] After Windows edits: if **TS1127**, run `npm run normalize-js-utf8` (fixes accidental UTF-16 `.js` under `src/`, `test/`, `scripts/`).

---

## Encoding (Windows)

- Save and commit **UTF-8** for `.js` / `.ts` (not UTF-16), or `tsc` reports invalid characters.

---

## Follow-up (broader backend — khối lớn, làm dần)

- **`doctorController.js`**, **`adminController.js`**, **`systemConfigController.js`** vẫn còn raw SQL / Sequelize trực tiếp — tách từng miền (EMR, admin stats, cấu hình) khi chỉnh module.
- **`prescriptionQueryCompat.js`** giữ SQL dùng chung cho đơn thuốc (đã là lớp compat).
- **`src/index.ts`** vẫn truyền `sequelize` cho model/`SystemConfig`; scheduler dùng DB qua repository.
