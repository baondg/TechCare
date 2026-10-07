# Backend refactor checklist

## Architecture (appointment domain)

| Layer | Role |
| --- | --- |
| **Controllers** | HTTP, validation, delegate to services; avoid embedding SQL. |
| **Services** | Orchestration, MedAI/fetch, mapping; no `sequelize.query` once a repo exists for that slice. |
| **Repositories** | Raw SQL / Sequelize queries for one bounded area. |

`appointmentController.js` delegates patient id resolution to **`appointmentPatientService`** (`getPatientPkForUserId`, `getPatientPkFromRouteId`); it no longer imports `appointmentRepository`.

## Conventions (G2 foundations — follow these in new/refactored code)

| Concern | Use | Don't |
| --- | --- | --- |
| **Config** | `const { config } = require('../config/env')` → `config.db.port`, `config.auth.jwtSecret`… Add new vars to the zod schema in `src/config/env.ts`. | Read `process.env` (ESLint error outside `config/env.ts`, `common/logger.ts`). |
| **Errors** | `throw new BadRequestError(msg)` / `NotFoundError` / `ForbiddenError` / `ConflictError` (`src/errors/AppError.ts`). Body: `{ success:false, error, message, code, details?, requestId }`. | `res.status(500).json({ error: e.message })` — never echo raw error text. |
| **Async handlers** | `exports.x = asyncHandler(async (req, res) => { … })` (`src/common/asyncHandler.ts`); let errors propagate. | Per-handler `try/catch` that only logs and answers 500. |
| **Validation** | zod schema in `src/validators/*Schemas.js` + `validate({ params, query, body })` in the route; handler receives coerced values. | Ad-hoc `Number(req.params.id)` checks in handlers. |
| **Logging** | `logger.info({ ...fields }, 'event.name')`, errors as `logger.error({ err }, 'msg')` (`src/common/logger.ts`). | `console.*`; logging request bodies or patient data. |

Reference implementations: `coverController.js`, `notificationController.js`, `workShiftController.js` (+ `routes/coverRoutes.js`, `routes/notificationRoutes.js`).

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

- [x] **`appointmentNotifications.js`** — Used by `appointmentPatientService`, `appointmentSlotService`, `appointmentNurseService`, `controllers/doctor/appointmentController.js` + `regimenController.js`. Public functions no longer take a `sequelize` first argument.
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

## Admin + system config (G3 bước B — xong)

SQL đã chuyển khỏi controller; controller chỉ còn HTTP (`asyncHandler`), input qua `validate` + zod, lỗi qua `AppError`.

- [x] **`repositories/accountRepository.js`** — ACCOUNT / USER / DOCTOR / DOCTOR_DEPARTMENT / DEPARTMENT cho trang quản trị tài khoản; danh sách có lọc + sắp xếp (whitelist `ACCOUNT_SORT_SQL`); tra role / danh sách admin cho phiên đăng nhập.
- [x] **`repositories/adminDashboardRepository.js`** · **`adminFeedbackRepository.js`** · **`featureRepository.js`** · **`sessionRepository.js`** (raw SQL + model `Session`).
- [x] **`services/admin/{accountService,dashboardService,feedbackService,roleLabels}.js`** · **`services/systemConfig/{featureService,sessionService}.js`**.
- [x] **`validators/adminSchemas.js`** · **`validators/systemConfigSchemas.js`** — giữ nguyên message lỗi cũ; query danh sách tài khoản vẫn "dễ dãi" (giá trị rác → mặc định).
- [x] **`repositories/systemConfigRepository.js`** (model `SYSTEM_CONFIGURATION`) · **`services/systemConfig/{configService,aiModelService}.js`** — `configController` / `aiModelController` chỉ còn HTTP; `configStore.js` đã bỏ, `toBooleanString` chuyển sang `validators/systemConfigSchemas.js`.
- [x] **`test/admin-characterization.test.js`** · **`test/system-config-characterization.test.js`** (runner chung `test/helpers/characterize.js`) — DB giả (`test/helpers/fakeDb.js`) ghi lại SQL + tham số + transaction + response của 54 kịch bản, snapshot chụp **trước** khi refactor. Dùng cùng cách này cho các miền tiếp theo khi chưa có MySQL test.

## Auth (`/api/auth/*`, G3 bước B — xong)

- [x] **`repositories/authAccountRepository.js`** (model Account / User / Patient) · **`sessionRepository.js`** thêm tạo / xoay / xoá phiên.
- [x] **`services/auth/authService.js`** (login, logout, refresh, session info, phiên đầu sau đăng ký) · **`services/auth/tokens.js`** (ký / xác thực JWT) · **`services/patientRegistrationService.js`** báo lỗi bằng `AppError`, tự quản transaction qua `registerPatient`.
- [x] `authorization/*` chỉ còn HTTP: cookie refresh (`sessionTokens.js`), `asyncHandler`, `validate({ body: loginBody })`.
- [x] `internalErrorMessage(msg)` (`middleware/errorHandler.ts`) giữ câu báo 500 thân thiện cho các màn hình hiển thị nguyên `error` của server (login, đăng ký…) — vẫn không lộ lỗi thật.
- [x] **`test/auth-characterization.test.js`** — 37 kịch bản.

## AI (`/api/ai/*`, G3 bước B — xong)

- [x] `routes/ai.ts` chỉ còn khai báo route; `controllers/aiController.ts` (HTTP) · `services/ai/aiService.ts` (chat, phân tích triệu chứng, dự đoán hồi phục, gợi ý thuốc, gợi ý bác sĩ).
- [x] Quyền: `authorizeCapability('ai.models.inspect' | 'ai.clinical.assist', { message })` thay cho `requireAdmin` / `requireClinicalStaff` (giữ nguyên câu báo lỗi).
- [x] `llmClient.loadAiModelRegistry` đọc qua `systemConfigRepository`; recovery / suggest-medicine / recommend-doctor không còn đọc registry 2 lần.
- [x] Lỗi riêng của AI (`502` + `raw`, `503` + `hint`, chat `200` + `fallback`) giữ nguyên qua `AiResponseError` — `appointmentAiService` đọc các trường này.
- [x] **`test/ai-characterization.test.js`** — 33 kịch bản, LLM được giả lập (fetch ra ngoài bị chặn và ghi lại).

## Profile + hồ sơ sức khoẻ phía bệnh nhân (`/api/profile`, `/api/health-info`, G3 bước B — xong)

- [x] `repositories/profileRepository.js` (ACCOUNT + USER, người thân + BHYT của bệnh nhân trong một truy vấn) · `patientRepository` / `medicalRecordRepository` thêm hàm theo model · `services/{profileService,patientHealthInfoService}.js`; hai controller chỉ còn HTTP. Test: `test/profile-health-info-characterization.test.js` (43 kịch bản).
- [x] Sửa: cập nhật profile trong một transaction — người thân sai email / SĐT không còn xoá mất người thân cũ (trước: 500 + đã xoá; nay 400 "Invalid relative email" + rollback).
- [x] Sửa: `PUT /api/health-info` lưu bệnh sử vào `medical_history` (trước đây dồn vào `allergic_info`).
- [x] Sửa: admin ghi hồ sơ sức khoẻ của bệnh nhân (so role với `'admin'`, không phải `'ADM'`).
- ⚠️ Nhân viên y tế (bác sĩ / y tá / kỹ thuật viên) đọc **và sửa** được profile của **bất kỳ** user nào, kể cả admin / nhân viên khác — chủ ý là "y tá sửa thông tin bệnh nhân" nhưng không giới hạn đối tượng là bệnh nhân.
- `PUT /api/profile` bắt buộc tên người thân hợp lệ với mọi tài khoản (nhân viên / admin không cập nhật được profile của mình nếu không có người thân); nhánh tách `fullName` vì thế không bao giờ chạy.
- `GET /api/health-info/:userId` bỏ qua `:userId`, luôn trả dữ liệu của người đang đăng nhập (portal chỉ gọi cho chính mình).

## Lịch hẹn phía bệnh nhân / y tá (`appointmentController`)

- [x] 33 handler chuyển sang `asyncHandler` (`sendResult` / `sendJson`), 465 → 121 dòng. Test: `test/appointment-controller-passthrough.test.js` (tham số gửi service, kết quả trả nguyên, lỗi → 500 chung).
- [x] Bỏ `/api/chatbot` (proxy OpenRouter **không xác thực**, không ai dùng, gửi key sai header) + `OPENROUTER_API_KEY`.
- [x] Nhóm 1 — `appointmentPatientService`, `appointmentFeedbackService`, `appointmentCatalogService`, chi tiết xét nghiệm portal: trả dữ liệu + throw `AppError`. Test: `test/appointment-patient-characterization.test.js` (44 kịch bản).
- [ ] Nhóm 2 — `appointmentSlotService`, `appointmentNurseService` (vẫn `{ status, json }` + tự kiểm tra role).
- [ ] Nhóm 3 — `appointmentAiService`.
- [x] Sửa: `GET /api/appointments/patients` (mọi bệnh nhân + chẩn đoán gần nhất) chỉ cho nhân viên EMR (`doctor.emr.read`); trước đây bệnh nhân nào cũng gọi được.
- Frontend: `pages/technician/patients.tsx` gọi cứng `http://localhost:3000/api/appointments/patients` (hỏng khi deploy). `getPortalPatients` truy vấn N+1 (mỗi bệnh nhân 2 truy vấn).

## Follow-up (broader backend — khối lớn, làm dần)

- [x] `CONFIG_DEFAULTS` / `NUMERIC_CONFIG_RULES` chỉ còn ở `config/systemConfigurationContract.js` (lấy theo giá trị của trang admin: appointment 60/60, không có `aiRecovery*` / `aiModelCatalog`).
- [x] Rate limit: một bảng scope → key duy nhất (`RATE_LIMIT_SCOPE_TO_KEYS`), middleware dùng nó; `aiRecovery` dùng chung cấu hình "AI symptom" của trang admin (đúng như đang chạy). Test: `test/rate-limit-scope-keys.test.js`.
- [x] `adminRoutes.js` / `systemConfig.js` dùng `authorizeCapability('admin.console')`. Test: `test/admin-guard.test.js`.
- ⚠️ `accountService.createAccount` vẫn rơi về mật khẩu mặc định cứng `Test@1234` (ghi trong docs) khi thiếu `DEFAULT_ACCOUNT_PASSWORD`; không deploy nào đặt biến này. **Backend không có API đổi mật khẩu** → mọi tài khoản admin tạo dùng chung một mật khẩu mãi mãi. Cần quyết định: mật khẩu ngẫu nhiên từng tài khoản (hiện một lần cho admin) + API đổi mật khẩu + bắt đổi ở lần đăng nhập đầu.

## Doctor / EMR (G3 — bước A: tách controller theo miền)

`doctorController.js` (5.163 dòng) đã được tách cơ học — thân hàm giữ nguyên, mọi route trỏ tới handler có source giống hệt trước khi tách:

| File | Nội dung |
| --- | --- |
| `controllers/doctor/catalogController.js` | Danh mục: bệnh (ICD-10), thuốc, kỹ thuật viên, khoa |
| `controllers/doctor/dashboardController.js` | `GET /dashboard/summary` |
| `controllers/doctor/patientController.js` | Danh sách / chi tiết bệnh nhân (cache hotpath) |
| `controllers/doctor/regimenController.js` | Đợt điều trị (REGIMEN): active, đóng, phiếu theo dõi, phiếu hẹn tái khám, chuyển viện, tài liệu |
| `controllers/doctor/healthInfoController.js` | Sinh hiệu (MEDICAL_RECORD) do bác sĩ ghi |
| `controllers/doctor/diagnosisController.js` | Chẩn đoán |
| `controllers/doctor/prescriptionController.js` | Đơn thuốc (mã BYT) |
| `controllers/doctor/labTestController.js` | Xét nghiệm + upload file |
| `controllers/doctor/surgeryController.js` | Thủ thuật / phẫu thuật |
| `controllers/doctor/appointmentController.js` | Lịch hẹn phía bác sĩ: xác nhận, từ chối, huỷ, nhờ khám thay |
| `controllers/doctor/signatureController.js` | Chữ ký số bác sĩ (mã hoá) |
| `services/emr/patientRouteResolver.js` | `:patientId` (OP000123 / id) → PATIENT pk |
| `services/emr/staffIdentity.js` | user → doctor_id / technician_id, tên hiển thị |
| `services/emr/treatmentService.js` | DISEASE / REGIMEN / TREATMENT dùng chung cho mọi phiếu |
| `services/emr/bytPrescription.js` | Cấu hình cơ sở + sinh / parse mã đơn thuốc BYT |
| `services/emr/patientRecordCache.js` | Cache hồ sơ bệnh nhân (invalidate khi sửa chẩn đoán) |

Bước B — chuyển SQL từ controllers/doctor/* và services/emr/* xuống `repositories/`, áp dụng `asyncHandler` + `validate`, kiểm chứng bằng characterization test (DB giả). Làm theo đợt:

- [x] **Đợt 1** — catalog / dashboard / chữ ký + helper dùng chung: `repositories/{catalog,doctorDashboard,staff,patient}Repository.js`, `services/emr/{catalogService,doctorDashboardService,signatureService}.js`; `staffIdentity`, `patientRouteResolver`, `common/resolvePatientRouteId`, `emrActiveVisitMiddleware` không còn SQL. Test: `test/doctor-catalog-characterization.test.js`.
- [x] **Đợt 2** — hồ sơ bệnh nhân, sinh hiệu, chẩn đoán: `repositories/{treatment,patientRecord,medicalRecord}Repository.js`, `services/emr/{patientRecordService,healthInfoService,diagnosisService}.js`; `treatmentService` giữ API nhưng không còn SQL. Sửa lỗi cache hồ sơ (đọc `v1`, xoá `v2` → hồ sơ cũ đến hết TTL). Test: `test/doctor-patient-characterization.test.js`.
- [x] **Đợt 3** — đơn thuốc, xét nghiệm, phẫu thuật: `repositories/{order,prescription,labTest,surgery}Repository.js` (+ `catalogRepository` tra / thêm MEDICINE), `services/emr/{prescriptionService,labTestService,surgeryService}.js`; `bytPrescription` không còn nhận `sequelize` (tra mã BYT trùng qua `prescriptionRepository.bytCodeInUse`), thêm `normalizeBytPrescriptionType`. `common/transaction.js` (`inTransaction`) dùng chung, thay 2 bản sao trong `diagnosisService` / `accountService`. Test: `test/doctor-orders-characterization.test.js` (73 kịch bản).
  - [x] Upload file xét nghiệm (`POST /lab-attachments`, base64 trong JSON) từng bị `express.json()` chặn ở 100 kB (file > ~75 kB → 413). Đã sửa: `middleware/jsonBody.js` — route này tự parse body 21 MB **sau** xác thực, các route khác giữ 100 kB; nginx frontend `client_max_body_size 21m` cho `/api/`. Test: `test/lab-attachment-upload.test.js`.
  - ⚠️ Sửa đơn thuốc đặt lại `MEDICAL_PRESCRIPTION.time = NOW()` → mất ngày kê gốc (response trả `createdAt = updatedAt`).
  - ⚠️ `MSG_NO_DOCTOR_OR_PRIOR_TREATMENT` nói "lab order" cả khi kê đơn / phẫu thuật. Cập nhật xét nghiệm / phẫu thuật chạy nhiều UPDATE không trong transaction.
- [x] **Đợt 4** — lịch hẹn phía bác sĩ: `repositories/doctorAppointmentRepository.js`, `services/doctorAppointmentService.js`; dùng lại `appointmentRepository` (phòng khám, cùng khoa, tên bác sĩ, bệnh nhân theo user), `staffRepository.findDoctorIdByUserId`, `coverRepository.reassignAppointmentDoctor`. Controller chỉ còn HTTP. Test: `test/doctor-appointments-characterization.test.js` (47 kịch bản).
  - ⚠️ `POST /api/doctor/appointments`: `department` chỉ được trả lại, không lưu; không kiểm tra định dạng ngày / giờ; chỉ chặn trùng lịch `scheduled` — nếu đã có bản ghi huỷ cùng giờ + phòng thì có thể vướng UNIQUE(time, doctor_id, room_id) → 500 (chưa kiểm chứng trên MySQL).
  - Nhờ khám thay (cover) kiểm tra rồi cập nhật không trong transaction (hai yêu cầu đồng thời có thể cùng lọt qua kiểm tra trùng giờ).
- [x] **Đợt 5** — đợt khám (REGIMEN), phiếu, tài liệu, chuyển viện: `repositories/{regimen,regimenDocument,transfer}Repository.js` (+ `medicalRecordRepository.listVitalsByIds`), `services/emr/{regimenService,regimenDocumentsService,transferService}.js`. Hai handler ~300 dòng (tài liệu đợt đang mở, lịch sử đợt đã đóng) dùng chung một bộ truy vấn theo danh sách đợt (`IN (:regimenIds)` thay cho nối chuỗi id). Chuỗi dò phòng check-in thành một danh sách bước thử theo thứ tự. Kiểm tra quyền "chỉ bác sĩ" chuyển ra route (`authorizeCapability('doctor.emr.write')`, giữ câu báo); kiểm tra role trùng với `doctor.emr.read` của router đã bỏ. `bytFieldsForDisplay` dùng chung cho danh sách đơn thuốc và tài liệu đợt khám. Test: `test/doctor-regimen-characterization.test.js` (58 kịch bản).
  - Kết thúc khám (`regimen/close`): đóng REGIMEN rồi cập nhật APPOINTMENT không trong transaction.
  - Dò phòng check-in dùng `CURDATE()` (giờ của MySQL) — lệch múi giờ thì bước "hôm nay" có thể trượt; các bước theo `REGIMEN.start` bù lại.

**Doctor / EMR bước B — xong:** `controllers/doctor/*` và `services/emr/*` không còn SQL.
- `AppError(..., 500, { expose: true })` cho câu báo 5xx cố định mà người dùng cần thấy (vd. "Could not read signature").
- **`prescriptionQueryCompat.js`** giữ SQL dùng chung cho đơn thuốc (đã là lớp compat).
- **`src/index.ts`** vẫn truyền `sequelize` cho model/`SystemConfig`; scheduler dùng DB qua repository.
