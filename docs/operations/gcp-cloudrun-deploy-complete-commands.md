# TechCare — Lệnh deploy GCP Cloud Run đầy đủ (copy-paste)

Tài liệu này gom **toàn bộ bước** từ zero tới có URL chạy được. Chạy trong **PowerShell** từ thư mục gốc repo (`TechCare-2`).

---

## 0) Điều kiện trước khi chạy

- [Google Cloud SDK](https://cloud.google.com/sdk) (`gcloud`) đã cài và đăng nhập.
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) đang chạy (build/push image).
- Project GCP đã **bật billing** (hoặc bạn dùng bước tạo project + link billing bên dưới).

---

## 1) Biến cấu hình — sửa cho đúng môi trường của bạn

```powershell
# === BẮT BUỘC CHỈNH ===
$ProjectId   = "techcare2026"                    # GCP Project ID
$Region      = "asia-southeast1"                 # Region thống nhất cho Run + SQL + Redis
$DbPassword  = "Thay_Bang_Mat_Khau_Manh_123!"     # Mật khẩu user MySQL Cloud SQL
$JwtSecret   = "Thay_Bang_Chuoi_JWT_Dai_Ngau_Nhien_Toi_Thieu_32_Ky_Tu"

# Tên resource (giữ mặc định nếu không đụng trùng)
$DbInstance  = "techcare-mysql"
$DbName      = "techcare"
$DbUser      = "techcare"
$RedisName   = "techcare-redis"
$VpcConnector = "techcare-vpc-connector"
$Network     = "default"

# Chỉ dùng khi tạo project MỚI từ dòng lệnh (lấy ID từ: gcloud billing accounts list)
$BillingAccountId = ""   # ví dụ: "XXXXXX-XXXXXX-XXXXXX"

# Tuỳ chọn: domain thật cho CORS (nếu để trống, backend dùng * khi deploy bằng script)
$WebDomain = ""   # ví dụ: "app.example.com" → CORS https://app.example.com
```

---

## 2) Đăng nhập và chọn project

```powershell
gcloud auth login
gcloud config set project $ProjectId
gcloud config set run/region $Region
```

---

## 3) Tạo project + gắn billing (chỉ khi project chưa tồn tại)

Bỏ qua nếu bạn đã có project `$ProjectId`.

```powershell
if ($BillingAccountId) {
  gcloud projects create $ProjectId --name $ProjectId
  gcloud beta billing projects link $ProjectId --billing-account $BillingAccountId
}
gcloud config set project $ProjectId
```

---

## 4) Bootstrap: API, IAM, Artifact Registry, VPC connector

Chạy script có sẵn trong repo (khuyến nghị):

```powershell
Set-Location "C:\Users\peter\Desktop\TechCare-2"   # đổi nếu repo ở chỗ khác
.\infra\gcp\cloudrun\bootstrap.ps1 -ProjectId $ProjectId -Region $Region
```

**Lưu ý:**

- Nếu báo repository `techcare` đã tồn tại hoặc connector đã tồn tại: bỏ qua lỗi đó hoặc xóa resource cũ trong console rồi chạy lại.
- Service account runtime: `techcare-runtime@$ProjectId.iam.gserviceaccount.com`

---

## 5) Cloud SQL + Memorystore Redis

### 5.1 Tạo instance (chạy một lần)

```powershell
Set-Location "C:\Users\peter\Desktop\TechCare-2"
.\infra\gcp\cloudrun\provision-datastores.ps1 `
  -ProjectId $ProjectId `
  -Region $Region `
  -DbPassword $DbPassword
```

### 5.2 Nếu Redis lỗi “Not enough zonal resources”

Thử zone khác trong cùng region, ví dụ:

```powershell
gcloud redis instances create $RedisName `
  --region=$Region `
  --zone="$Region-c" `
  --size=1 `
  --redis-version=redis_7_0 `
  --network=$Network
```

(Nếu instance tên `techcare-redis` đã tạo dở, xóa trong console hoặc đổi `$RedisName`.)

### 5.3 Lấy host Redis (private IP) — cần cho deploy backend

```powershell
$RedisHost = gcloud redis instances describe $RedisName --region=$Region --format="value(host)"
Write-Host "REDIS_HOST=$RedisHost"
```

---

## 6) Secret Manager — DB user, DB password, JWT, Groq API key

**Quan trọng:** không được có ký tự xuống dòng thừa trong secret (dễ gây `Access denied` MySQL).

### Lần đầu tạo secret

```powershell
function Set-SecretNoNewline([string]$SecretId, [string]$Value) {
  $tmp = New-TemporaryFile
  Set-Content -Path $tmp -Value $Value -NoNewline -Encoding utf8
  if (gcloud secrets describe $SecretId 2>$null) {
    gcloud secrets versions add $SecretId --data-file=$tmp
  } else {
    gcloud secrets create $SecretId --data-file=$tmp
  }
  Remove-Item $tmp
}

Set-SecretNoNewline "techcare-backend-db-user"     $DbUser
Set-SecretNoNewline "techcare-backend-db-password" $DbPassword
Set-SecretNoNewline "techcare-jwt-secret"          $JwtSecret
Set-SecretNoNewline "techcare-groq-api-key"        $GroqApiKey
```

`techcare-groq-api-key` là khóa Groq Cloud (https://console.groq.com/keys). Backend chọn provider dựa trên `GROQ_API_KEY`: nếu chưa set, mọi route AI (`/api/ai/chat`, `/api/ai/symptom-analysis`, `/api/ai/recovery-prediction`, `/api/ai/suggest-medicine`, `/api/ai/recommend-doctor`) sẽ thử fallback sang local LLM tại `localhost:11434` — không tồn tại trên Cloud Run nên trả `fetch failed` (502). Nhớ cấp quyền cho service account runtime:

```powershell
gcloud secrets add-iam-policy-binding techcare-groq-api-key `
  --member "serviceAccount:techcare-runtime@$ProjectId.iam.gserviceaccount.com" `
  --role "roles/secretmanager.secretAccessor"
```

### Chuỗi kết nối Cloud SQL (dùng trong deploy)

```powershell
$InstanceConn = "$ProjectId`:$Region`:$DbInstance"
Write-Host "CLOUDSQL_INSTANCE_CONNECTION_NAME=$InstanceConn"
```

---

## 7) Build Docker image và push lên Artifact Registry

Frontend cần **origin backend đầy đủ** tại build-time (`VITE_API_BASE_URL`), **không** kèm `/api` (code đã tự thêm `/api/...`). Không được dùng `/api` làm base — sẽ thành `/api/api/...` và 404.

Thứ tự khuyến nghị: build + deploy backend trước, lấy URL, rồi build frontend.

```powershell
Set-Location "C:\Users\peter\Desktop\TechCare-2"

$Registry     = "$Region-docker.pkg.dev/$ProjectId/techcare"
$BackendImage = "$Registry/techcare-backend:latest"
$FrontendImage = "$Registry/techcare-frontend:latest"

gcloud auth configure-docker "$Region-docker.pkg.dev" --quiet

docker build -f ./backend/Dockerfile.cloudrun  -t $BackendImage  ./backend
docker push $BackendImage

# Sau khi đã deploy backend ít nhất một lần (hoặc dùng URL cố định của bạn):
$BackendPublicUrl = (
  gcloud run services describe techcare-backend --region $Region --format="value(status.url)"
).TrimEnd("/")

docker build -f ./frontend/Dockerfile.cloudrun -t $FrontendImage ./frontend `
  --build-arg "VITE_API_BASE_URL=$BackendPublicUrl"
docker push $FrontendImage
```

---

## 8) Deploy Cloud Run — backend

Backend cần:

- Cloud SQL attachment
- Biến `DB_NAME`
- (Khuyến nghị) VPC connector để tới **Memorystore** private IP
- Secret: `DB_USER`, `DB_PASSWORD`, `JWT_SECRET`, `GROQ_API_KEY`, `INTERNAL_API_SECRET` (`techcare-internal-api-secret`)

### CORS

- Nếu có `$WebDomain`: `CORS_ALLOWED_ORIGINS=https://$WebDomain`
- Nếu không: `CORS_ALLOWED_ORIGINS=*`

```powershell
$Cors = if ($WebDomain) { "https://$WebDomain" } else { "*" }

$VpcConnectorFull = "projects/$ProjectId/locations/$Region/connectors/$VpcConnector"

gcloud run deploy techcare-backend `
  --image $BackendImage `
  --region $Region `
  --service-account "techcare-runtime@$ProjectId.iam.gserviceaccount.com" `
  --add-cloudsql-instances $InstanceConn `
  --vpc-connector $VpcConnectorFull `
  --vpc-egress private-ranges-only `
  --set-env-vars "NODE_ENV=production,DB_NAME=$DbName,CLOUDSQL_INSTANCE_CONNECTION_NAME=$InstanceConn,REDIS_URL=redis://${RedisHost}:6379,ENABLE_PATIENT_RECORD_CACHE=1,ENABLE_DISTRIBUTED_RATE_LIMIT=1,BENCHMARK_RATE_LIMIT_BYPASS=0,AUTO_SYNC_DB=0,CORS_ALLOWED_ORIGINS=$Cors" `
  --set-secrets "DB_USER=techcare-backend-db-user:latest,DB_PASSWORD=techcare-backend-db-password:latest,JWT_SECRET=techcare-jwt-secret:latest,GROQ_API_KEY=techcare-groq-api-key:latest,INTERNAL_API_SECRET=techcare-internal-api-secret:latest" `
  --min-instances 2 `
  --max-instances 30 `
  --concurrency 80 `
  --timeout 120 `
  --allow-unauthenticated
```

**Nếu** `gcloud` trên máy bạn báo lỗi parse `--set-secrets` (hiếm), tách làm lệnh `gcloud run services update` với `--update-secrets` từng cặp, hoặc cấu hình qua Console.

---

## 9) Deploy Cloud Run — frontend

```powershell
gcloud run deploy techcare-frontend `
  --image $FrontendImage `
  --region $Region `
  --service-account "techcare-runtime@$ProjectId.iam.gserviceaccount.com" `
  --min-instances 1 `
  --max-instances 10 `
  --concurrency 100 `
  --timeout 60 `
  --allow-unauthenticated
```

---

## 10) Lấy URL sau deploy

```powershell
gcloud run services describe techcare-backend --region $Region --format="value(status.url)"
gcloud run services describe techcare-frontend --region $Region --format="value(status.url)"
```

---

## 11) Kiểm tra nhanh

```powershell
$Api = gcloud run services describe techcare-backend --region $Region --format="value(status.url)"
curl.exe -sS "$Api/health"
```

---

## 12) Cách nhanh hơn (đã có script trong repo)

Sau khi bootstrap + datastore + secret + biết `$RedisHost`:

```powershell
Set-Location "C:\Users\peter\Desktop\TechCare-2"
.\infra\gcp\cloudrun\deploy.ps1 `
  -ProjectId $ProjectId `
  -Region $Region `
  -RedisHost $RedisHost `
  -WebDomain $WebDomain `
  -PublicUnauthenticated
```

**Ghi chú:** `deploy.ps1` hiện **không** gắn VPC connector; nếu cần Redis private IP ổn định, dùng mục **8** (lệnh `gcloud` đầy đủ) cho backend, hoặc chỉnh script để thêm `--vpc-connector` / `--vpc-egress` giống mục 8.

---

## 13) Seed dữ liệu demo / chạy NFR (tuỳ chọn)

- Runbook NFR: [gcp-cloudrun-nfr-runbook.md](./gcp-cloudrun-nfr-runbook.md)
- Seed demo (cần backend reachable và schema đã có): xem [demo-seed-runbook.md](./demo-seed-runbook.md) và `backend/scripts/seed-demo.js`

---

## 14) TLS / domain riêng

Cloud Run mặc định đã có HTTPS (`*.run.app`). Nếu cần domain + chứng chỉ riêng và redirect HTTP→HTTPS, cấu hình **Load Balancer + certificate** trong GCP; thu thập bằng chứng có thể dùng:

```powershell
.\scripts\tls-verify-evidence.ps1 -StagingHost "api.example.com" -ProductionHost "api.example.com"
```

---

## Checklist tóm tắt

| Bước | Việc |
|------|------|
| 1 | `gcloud auth`, chọn `$ProjectId`, billing |
| 2 | `bootstrap.ps1` |
| 3 | `provision-datastores.ps1` (hoặc Redis zone khác nếu lỗi) |
| 4 | Lấy `$RedisHost`, tạo secret **không newline** |
| 5 | `docker build` + `push` backend/frontend |
| 6 | `gcloud run deploy` backend (+ VPC nếu dùng Redis private) |
| 7 | `gcloud run deploy` frontend |
| 8 | Mở URL, kiểm tra `/health` |

---

*File này được tạo để bạn có một chỗ duy nhất copy toàn bộ lệnh; chi tiết vận hành bổ sung: [gcp-cloudrun-nfr-runbook.md](./gcp-cloudrun-nfr-runbook.md).*
