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

## Task: Update local database from Cloud SQL (GCP)

*(Runbook VN: cập nhật database local từ cloud.)*

Dùng khi bạn muốn **bản sao dữ liệu production/demo trên Cloud SQL** chạy trên MySQL **local** (cùng schema, dữ liệu đầy đủ).

### Trước khi làm

1. **Backup local** (tránh mất dữ liệu dev đang có):

   ```bash
   cd backend
   npm run db:backup -- ./backups
   ```

2. Đảm bảo `backend/.env` trỏ tới **instance MySQL local** (`DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`) — restore sẽ ghi đè database tên trong `DB_NAME`.

3. Cài `gcloud` SDK, đăng nhập project đúng; bucket GCS và quyền export/import theo chuẩn GCP.

### Bước 1 — Export từ Cloud SQL ra GCS

Thay `INSTANCE`, `BUCKET`, `OBJECT`, `DATABASE` theo môi trường của bạn (ví dụ instance `techcare-mysql`, DB `techcare`):

```bash
gcloud sql export sql INSTANCE gs://BUCKET/path/techcare-cloud-export.sql.gz --database=DATABASE
```

### Bước 2 — Tải file về máy

```bash
gcloud storage cp gs://BUCKET/path/techcare-cloud-export.sql.gz ./techcare-cloud-export.sql.gz
```

( Hoặc `gsutil cp` nếu team vẫn dùng wrapper cũ. )

### Bước 3 — Restore vào MySQL local

```bash
cd backend
npm run db:restore -- ../techcare-cloud-export.sql.gz
```

Đường dẫn thứ hai là file **`.sql.gz`** (script dùng `gzip -dc` + `mysql`). Nếu bạn chỉ có file `.sql` thuần, nén trước (`gzip -c file.sql > file.sql.gz`) hoặc import thủ công: `mysql ... < file.sql`.

### Bước 4 — Kiểm tra

- Giống mục [Verification after restore](#verification-after-restore).
- Đăng nhập app local với tài khoản đã có trên cloud (JWT/secret local vẫn dùng `.env` của backend local).

### Lưu ý

- Export/import Cloud SQL có thể gặp lỗi **DEFINER** / user không tồn tại trên local — xử lý theo playbook từng môi trường (tạo user definer hoặc chỉnh dump).
- Dung lượng lớn: export qua GCS thường ổn định hơn dump trực tiếp qua máy cá nhân.

Unified runner:

```powershell
.\scripts\nfr-runner.ps1 -Environment local -BackupRecovery -BaseUrl http://localhost:5000
```

Expected output: `Restore completed from: <file>`

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
