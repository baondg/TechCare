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
- [x] Sửa: nhân viên y tế (bác sĩ / y tá / kỹ thuật viên) từng đọc **và sửa** được profile (SĐT, email, CCCD) của **bất kỳ** user nào, kể cả admin / nhân viên khác. Nay chỉ profile của **bệnh nhân** (`ACCOUNT.type = 'PAT'`) + của chính mình; admin vẫn mọi profile. Người khác → 403, tài khoản không tồn tại → 404.
- [x] `PUT /api/profile`: tên người thân chỉ bắt buộc với tài khoản bệnh nhân (trước đây mọi tài khoản → nhân viên / admin không cập nhật được profile của mình); `fullName` được tách trước khi kiểm tra họ / tên.
- [x] `GET /api/health-info/:userId` dùng `:userId` theo cùng quy tắc với các thao tác ghi: chính bệnh nhân hoặc admin, người khác 403 (trước đây bỏ qua `:userId`).

## Lịch hẹn phía bệnh nhân / y tá (`appointmentController`)

- [x] 33 handler chuyển sang `asyncHandler` (`sendResult` / `sendJson`), 465 → 121 dòng. Test: `test/appointment-controller-passthrough.test.js` (tham số gửi service, kết quả trả nguyên, lỗi → 500 chung).
- [x] Bỏ `/api/chatbot` (proxy OpenRouter **không xác thực**, không ai dùng, gửi key sai header) + `OPENROUTER_API_KEY`.
- [x] Nhóm 1 — `appointmentPatientService`, `appointmentFeedbackService`, `appointmentCatalogService`, chi tiết xét nghiệm portal: trả dữ liệu + throw `AppError`. Test: `test/appointment-patient-characterization.test.js` (44 kịch bản).
- [x] Nhóm 2 — `appointmentSlotService`, `appointmentNurseService`: throw `AppError`, kiểm tra role chuyển hết ra route (`appointments.read.open_slots` mới cho `GET /open-slots`). Test: `test/appointment-slots-nurse-characterization.test.js` (53 kịch bản); fake DB chạy được managed transaction.
  - Y tá đổi giờ / phòng của slot **đã có bệnh nhân** (cùng bác sĩ): không ai được thông báo — chỉ đổi bác sĩ mới báo bệnh nhân.
  - [x] `POST /nurse/regimen/checkout` (legacy) giờ hoàn tất lịch hẹn của đợt khám như "kết thúc khám" của bác sĩ.
- [x] Nhóm 3 — `appointmentAiService`: throw `AppError`; lỗi MedAI giữ status + câu báo, các trường chẩn đoán (`error`/`hint`/`raw`) chỉ còn trong log. Test: `test/appointment-ai-characterization.test.js` (26 kịch bản). Sửa: lỗi kết nối chat không còn lộ URL nội bộ của MedAI.
- **Tất cả service `appointment*` đã trả dữ liệu + throw `AppError`**; `appointmentController` không còn `{ status, json }`.
- [x] Sửa: `GET /api/appointments/patients` (mọi bệnh nhân + chẩn đoán gần nhất) chỉ cho nhân viên EMR (`doctor.emr.read`); trước đây bệnh nhân nào cũng gọi được.
- [x] Frontend: base URL API dùng chung (`src/lib/api-base.ts`) — trước đây `VITE_API_BASE_URL=/api` (docker-compose prod) làm hầu hết request thành `/api/api/...`; trang kỹ thuật viên gọi cứng localhost. nginx / Vite proxy thêm `/uploads/`.
- [x] `getPortalPatients`: 3 truy vấn cố định thay vì 2–3 truy vấn mỗi bệnh nhân.

## Middleware (G3 bước B)

- [x] `authMiddleware`, `sessionMiddleware`, `rateLimitMiddleware` đọc DB qua `sessionRepository` (`findSessionByAccessToken`, `countActiveSessions`, …), `authAccountRepository.findAccountByUserId`, `systemConfigRepository` (`getValuesByKeys`, `findLatestLegacyLimits`); không middleware nào còn import model / `sequelize`. Test: `test/middleware-characterization.test.js` (24 kịch bản gọi trực tiếp middleware + 3 test qua app).
- [x] Bỏ `checkSessionTimeout` (chạy cho mọi request trước route): request đã đăng nhập từng tra session + ghi `lastActivity` hai lần; nay chỉ `authMiddleware` làm (phiên hết hạn → 401 `SESSION_EXPIRED` + xoá). Không còn nhận token qua `?token=` / `body.token`; route công khai (login, refresh…) không còn bị chặn bởi header `Authorization` của phiên cũ.
- `checkConcurrentUsers` xoá session hết hạn ở mỗi lần đăng nhập (ngoài lượt dọn định kỳ 5 phút).

## Follow-up (broader backend — khối lớn, làm dần)

- [x] `CONFIG_DEFAULTS` / `NUMERIC_CONFIG_RULES` chỉ còn ở `config/systemConfigurationContract.js` (lấy theo giá trị của trang admin: appointment 60/60, không có `aiRecovery*` / `aiModelCatalog`).
- [x] Rate limit: một bảng scope → key duy nhất (`RATE_LIMIT_SCOPE_TO_KEYS`), middleware dùng nó; `aiRecovery` dùng chung cấu hình "AI symptom" của trang admin (đúng như đang chạy). Test: `test/rate-limit-scope-keys.test.js`.
- [x] `adminRoutes.js` / `systemConfig.js` dùng `authorizeCapability('admin.console')`. Test: `test/admin-guard.test.js`.
- [x] Mật khẩu ban đầu của tài khoản admin tạo (trước đây: `Test@1234` dùng chung, không đổi được):
  - [x] **A1** — `POST /api/auth/change-password` (mật khẩu cũ + mới, luật độ mạnh như đăng ký — `services/auth/passwordPolicy.js`; sai → 400, không 401 vì client đăng xuất với 401; xong thì kết thúc các phiên khác). Cột `ACCOUNT.must_change_password` (thêm lúc khởi động — `common/ensureSchemaColumns.js`, `npm run db:ensure-columns`, cần quyền `ALTER`). Khi cờ bật, `authMiddleware` trả 403 `PASSWORD_CHANGE_REQUIRED` cho mọi route trừ change-password / logout / session; login + session trả `user.mustChangePassword`. Test: `test/change-password.test.js`.
  - [x] **A2** — tạo tài khoản sinh mật khẩu tạm ngẫu nhiên (14 ký tự, trả **một lần** trong `temporaryPassword`) + bật cờ; `POST /api/admin/accounts/:id/reset-password` (không cho tự reset; kết thúc mọi phiên của người đó). Bỏ `DEFAULT_ACCOUNT_PASSWORD`. `npm run db:flag-shared-passwords [-- --apply]` gắn cờ tài khoản còn dùng `Test@1234` / mật khẩu chung (chạy thử trước, `--apply` mới ghi). Test: `test/temporary-password.test.js`.
  - [x] **A3** — frontend: trang `/change-password` (App chuyển mọi trang về đây khi `mustChangePassword`; client xử lý 403 `PASSWORD_CHANGE_REQUIRED`), nút đổi mật khẩu trên header mọi portal, modal mật khẩu tạm + nút "Đặt lại mật khẩu" ở trang quản lý tài khoản.
  - Sau khi deploy: chạy `npm run db:flag-shared-passwords` (xem danh sách), rồi `-- --apply`.

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
  - [x] Sửa đơn thuốc không còn đặt lại `MEDICAL_PRESCRIPTION.time` (ngày kê — lịch nhắc thuốc, dashboard "đơn hôm nay", AI 90 ngày tính từ nó); thời điểm sửa lưu ở cột mới `updated_at` (thêm lúc khởi động). Response: `createdAt` = ngày kê, `updatedAt` = lần sửa cuối.
  - [x] `MSG_NO_DOCTOR_OR_PRIOR_TREATMENT` nói "record" thay vì "lab order". Cập nhật xét nghiệm / phẫu thuật chạy trong một transaction.
- [x] **Đợt 4** — lịch hẹn phía bác sĩ: `repositories/doctorAppointmentRepository.js`, `services/doctorAppointmentService.js`; dùng lại `appointmentRepository` (phòng khám, cùng khoa, tên bác sĩ, bệnh nhân theo user), `staffRepository.findDoctorIdByUserId`, `coverRepository.reassignAppointmentDoctor`. Controller chỉ còn HTTP. Test: `test/doctor-appointments-characterization.test.js` (47 kịch bản).
  - [x] Bỏ `POST /api/doctor/appointments` (không màn hình nào gọi; không kiểm tra ngày / giờ, `department` chỉ được trả lại, có thể vướng UNIQUE(time, doctor_id, room_id) với lịch đã huỷ → 500). Lấy lại từ git nếu cần màn hình bác sĩ đặt lịch.
  - [x] Nhờ khám thay (cover): kiểm tra + cập nhật trong một transaction, khoá lịch hẹn và bác sĩ nhận (`FOR UPDATE`) — hai yêu cầu đồng thời không còn cùng lọt qua kiểm tra trùng giờ.
- [x] **Đợt 5** — đợt khám (REGIMEN), phiếu, tài liệu, chuyển viện: `repositories/{regimen,regimenDocument,transfer}Repository.js` (+ `medicalRecordRepository.listVitalsByIds`), `services/emr/{regimenService,regimenDocumentsService,transferService}.js`. Hai handler ~300 dòng (tài liệu đợt đang mở, lịch sử đợt đã đóng) dùng chung một bộ truy vấn theo danh sách đợt (`IN (:regimenIds)` thay cho nối chuỗi id). Chuỗi dò phòng check-in thành một danh sách bước thử theo thứ tự. Kiểm tra quyền "chỉ bác sĩ" chuyển ra route (`authorizeCapability('doctor.emr.write')`, giữ câu báo); kiểm tra role trùng với `doctor.emr.read` của router đã bỏ. `bytFieldsForDisplay` dùng chung cho danh sách đơn thuốc và tài liệu đợt khám. Test: `test/doctor-regimen-characterization.test.js` (58 kịch bản).
  - [x] Kết thúc khám (`regimen/close`) chạy trong một transaction.
  - Dò phòng check-in dùng `CURDATE()`: đúng ngày phòng khám vì mỗi kết nối đặt `time_zone` = `CLINIC_TZ_OFFSET` (`common/database.js` → `syncMysqlClinicTimezone`); chỉ lệch nếu lệnh đó lỗi (có log cảnh báo).

**Doctor / EMR bước B — xong:** `controllers/doctor/*` và `services/emr/*` không còn SQL.
- `AppError(..., 500, { expose: true })` cho câu báo 5xx cố định mà người dùng cần thấy (vd. "Could not read signature").
- **`prescriptionQueryCompat.js`** giữ SQL dùng chung cho đơn thuốc (đã là lớp compat).
- **`src/index.ts`** vẫn truyền `sequelize` cho model/`SystemConfig`; scheduler dùng DB qua repository.
