# Grafana k6 load tests for TechCare

Scripts exercise the Express API ([backend/src/index.ts](../backend/src/index.ts)). Default `BASE_URL` matches Docker dev: `http://localhost:5000` (host port 5000 maps to container port 3000).

## Grafana Cloud k6 (recommended for dashboards)

Use [Grafana Cloud k6](https://grafana.com/docs/grafana-cloud/testing/k6/) so each run appears in the **hosted Grafana web UI** (metrics, checks, thresholds, trends). Official CLI guide: [Use the CLI](https://grafana.com/docs/grafana-cloud/testing/k6/author-run/use-the-cli/).

### One-time setup

1. Sign up at [grafana.com](https://grafana.com/) and open your stack’s **Performance testing** / **k6 Cloud** area (product name may appear as **Grafana Cloud k6**).
2. Install k6 locally: [Install k6](https://grafana.com/docs/k6/latest/set-up/install-k6/) (e.g. Windows: `winget install --id GrafanaLabs.k6 -e`).
3. **Stack (required on current k6):** In Grafana Cloud open **Testing & synthetics** → **Performance** (k6) → **Settings** → **Access**. You need two different values depending on how you authenticate:
   - **`k6 cloud login --stack …`** accepts your **stack URL** or **slug** (e.g. `https://yourorg.grafana.net`).
   - **`K6_CLOUD_STACK_ID` (k6 v1.6+)** must be the **numeric Stack ID** from that same screen — not the URL. Putting a URL here causes a parse error.
4. Authenticate the CLI (pick one):
   - **Token + stack (recommended on Windows):**

     ```bash
     k6 cloud login --token YOUR_API_TOKEN --stack https://YOURORG.grafana.net
     ```

     Replace `YOURORG` with your real stack hostname. Without `--stack`, you may see: `stack value is required but it was not passed or is empty`.

   - **Interactive:** `k6 cloud login --stack https://YOURORG.grafana.net` then paste the token (input is hidden; press Enter after paste).

   - **CI / scripts:** **Authentication** is only via **`K6_CLOUD_TOKEN`** (or interactive login). Also set **`K6_CLOUD_STACK_ID`** (numeric). **`K6_CLOUD_PROJECT_ID`** is *not* a credential — it only tells k6 **which cloud project** to attach the run to when your machine has no `k6 cloud login` config with a default project; see [Troubleshooting](#default-project-id-is-not-available). See [tokens and CLI authentication](https://grafana.com/docs/grafana-cloud/testing/k6/author-run/tokens-and-cli-authentication/).

     *(Tiếng Việt: Đăng nhập Grafana Cloud k6 chỉ bằng **token** (hoặc `k6 cloud login`). **Project ID** không dùng để xác thực — chỉ chọn project lưu kết quả chạy test.)*

   If a token was ever pasted into a shared screen recording or chat, **revoke it in Grafana Cloud** and create a new one.

#### Windows / token login (“cách 1”): `k6 cloud login` dường như không nhập được token

Đây là hành vi bình thường của CLI: **ô nhập token không hiển thị ký tự** (giống nhập mật khẩu). Bạn **dán (paste) token xong bấm Enter một lần** — dù màn hình vẫn trống, lệnh vẫn có thể thành công.

- Dán trong terminal: thử **chuột phải** vào cửa sổ terminal, hoặc **Ctrl+Shift+V** (đôi khi Ctrl+V không dán được).
- Sao chép token **không** kèm khoảng trắng đầu/cuối hay xuống dòng thừa.

*(English: the token prompt is **blind**—no stars, no dots. Paste, then **Enter**.)*

#### Where to put `K6_CLOUD_STACK_ID` / `K6_CLOUD_TOKEN` (sửa / lưu ở đâu)

Các lệnh `$env:...` **không nằm trong file code** của project — bạn chọn **một** cách lưu trên **máy bạn**:

| Cách | Ở đâu | Ghi chú |
|------|--------|---------|
| **1. Chỉ trong phiên terminal** | Gõ trực tiếp trong PowerShell / CMD | Hết khi đóng cửa sổ terminal. Không sửa file repo. |
| **2. PowerShell profile** | File `$PROFILE` (gõ `$PROFILE` để xem đường dẫn) | Thêm `$env:K6_CLOUD_STACK_ID = '12345'` (ID số) và token; tùy chọn `$env:K6_CLOUD_PROJECT_ID`. Chỉ trên máy bạn. |
| **3. File local trong repo** | Sửa **`k6/.env.grafana.local`** (file này **không** commit — [`.gitignore`](../.gitignore) mục `k6/.env.grafana.local`). Lần đầu: `Copy-Item .\k6\.env.grafana.local.example .\k6\.env.grafana.local` rồi điền **`K6_CLOUD_STACK_ID`** (số) + **`K6_CLOUD_TOKEN`** (+ **`K6_CLOUD_PROJECT_ID`** nếu cần). Trước khi chạy `k6 cloud ...`, nạp biến (PowerShell): |

```powershell
. .\scripts\import-k6-grafana-env.ps1
```

*(Hoặc tương đương: `Get-Content .\k6\.env.grafana.local | ForEach-Object { ... }` như trước — xem [import-k6-grafana-env.ps1](../scripts/import-k6-grafana-env.ps1).)*

*(English: these env vars live on **your machine**—terminal session, `$PROFILE`, or a **git-ignored** local file—not in committed source.)*

### Run TechCare scripts with results in Grafana Cloud

**Default (best for this repo): local VUs + cloud dashboards**

Load is generated **on your machine** (so `http://localhost:5000` and Docker `host.docker.internal` still work), while metrics stream to Grafana Cloud:

```bash
export K6_CLOUD_STACK_ID="12345"   # numeric Stack ID from Grafana UI
export K6_CLOUD_PROJECT_ID="67890" # optional if `k6 cloud login` already ran on this machine
k6 cloud run --local-execution k6/scripts/smoke.js
k6 cloud run --local-execution -e BASE_URL=http://localhost:5000 -e K6_USERNAME=... -e K6_PASSWORD=... k6/scripts/load.js
```

From repo root on Windows:

```powershell
$env:K6_CLOUD_STACK_ID = "12345"
# $env:K6_CLOUD_PROJECT_ID = "67890"  # if you see "default project ID is not available"
.\scripts\k6.ps1 -Script smoke -Cloud
# or pass stack on the command line (still numeric):
.\scripts\k6.ps1 -Script load -Cloud -CloudStack 12345 -BaseUrl http://localhost:5000 -Username ... -Password ...
```

**Distributed run (VUs on Grafana’s infrastructure)** — only if your API has a **public** URL (staging, tunnel, etc.):

```bash
export K6_CLOUD_STACK_ID="12345"
k6 cloud run -e BASE_URL=https://your-staging.example.com k6/scripts/load.js
```

```powershell
$env:K6_CLOUD_STACK_ID = "12345"
.\scripts\k6.ps1 -Script load -CloudDistributed -BaseUrl https://your-staging.example.com
```

`-Cloud` and `-Docker` cannot be combined (Cloud auth is tied to your local k6 login or `K6_CLOUD_TOKEN`).

### Option B — Your own Grafana + time-series backend (self-hosted)

Typical pattern: run k6 with a **results output** your Grafana stack can query (**InfluxDB**, **Prometheus remote write**, **Timescale**, etc.), then add that store as a **Grafana data source** and build or import dashboards.

For **InfluxDB v2**, Grafana documents using the [`xk6-output-influxdb`](https://github.com/grafana/xk6-output-influxdb) extension (custom `k6` build) and env vars such as `K6_INFLUXDB_ORGANIZATION`, `K6_INFLUXDB_BUCKET`, `K6_INFLUXDB_TOKEN`, plus `-o xk6-influxdb=http://localhost:8086`. Follow the current steps here: [Send k6 results to InfluxDB](https://grafana.com/docs/k6/latest/results-output/real-time/influxdb/).

### Option C — JSON export only (no Grafana UI)

Export a run to disk and inspect or post-process:

```bash
k6 run --summary-export=k6/out/summary.json k6/scripts/smoke.js
```

That file is not a Grafana dashboard; use it for CI artifacts or custom reporting.

**Note:** Vitest / `node --test` results are separate from k6. Grafana is suited to **k6 time-series metrics**, not npm test pass/fail, unless you build a custom pipeline (e.g. push CI results to Prometheus).

## Prerequisites

- **k6** on your PATH, **or** Docker (see below). From the repo root, [scripts/k6.ps1](../scripts/k6.ps1) uses **Docker automatically** if `k6` is not installed.
- Stack running (`docker compose up` from repo root) for real API checks.
- **Rate limits** ([backend/src/middleware/rateLimitMiddleware.js](../backend/src/middleware/rateLimitMiddleware.js)): aggressive runs from one IP can hit `429` on `/api/*`. For capacity testing, relax limits in `SystemConfig` (admin) on a **non-production** environment, or interpret results accordingly.
- **Do not** drive `POST /api/ai/chat`, symptom analysis, or external chatbot at high VUs (cost, quotas, and results do not reflect your Node/MySQL capacity). These scripts avoid AI POST routes.

## Environment variables

| Variable | Description |
|----------|-------------|
| `BASE_URL` | API origin, no trailing slash. Default `http://localhost:5000`. Use `https://…` against TLS staging. |
| `K6_USERNAME` / `K6_PASSWORD` | Primary account for authenticated scenarios. **Doctor** (or staff) recommended for dictionary + optional `K6_PATIENT_RECORD_ID` flows; **patient** for profile / health-info / appointments. |
| `K6_PATIENT_RECORD_ID` | Optional. Patient route id for `GET /api/doctor/patients/:id` (numeric or `OP…` as in the app). |
| `K6_APPOINTMENT_ID` | Optional. For **patient** login only: existing appointment id for `PUT /api/appointments/:id` (NFR `appointment_write` latency in `nfr-performance.js`). |
| `K6_PATIENT_USERNAME` / `K6_PATIENT_PASSWORD` | Optional. With a **staff** primary login, smoke test asserts patient receives `403` on `GET /api/doctor/diseases` (RBAC). |
| `K6_STAGE_TARGET` | Peak VUs for `load.js` (default `10`). |
| `K6_MAX_VUS` | Peak VUs for `nfr-performance.js` (default `30`, cap `300`). |
| `K6_STRESS_PEAK_VUS` | Peak VUs for `stress.js` (default `80`). |
| `K6_TIMEOUT_MS` | HTTP timeout (default `60000`). |
| `K6_CLOUD_STACK_ID` | **Grafana Cloud only (k6 v1.6+):** numeric **Stack ID** from Performance → Settings → Access. Required for `k6 cloud run` when using env auth. Same value as `scripts/k6.ps1 -CloudStack` (do not use `https://…` here). |
| `K6_CLOUD_PROJECT_ID` | **Grafana Cloud only:** numeric **project** where this run is created. **Not** used for authentication (token/login does that). Needed when `K6_CLOUD_TOKEN` + `K6_CLOUD_STACK_ID` are set but k6 has no saved default project (e.g. no prior `k6 cloud login` on that host). |
| `K6_CLOUD_TOKEN` | **Grafana Cloud only:** API token when not using interactive `k6 cloud login`. |

Never commit real passwords; pass env vars from your shell or CI secrets.

### Windows: `k6` not recognized

Install the CLI (recommended):

```powershell
winget install --id GrafanaLabs.k6 -e
```

Close and reopen the terminal, then `k6 version`.

**Without installing k6**, use the helper (needs [Docker Desktop](https://www.docker.com/products/docker-desktop/) running):

```powershell
.\scripts\k6.ps1 -Script smoke
```

If `k6` is missing, the script runs `grafana/k6` in Docker and sets `BASE_URL=http://host.docker.internal:5000` by default so the container can reach the API on the host. Override with `-BaseUrl` or `$env:BASE_URL`.

## NFR alignment (thesis table)

- **Patient record ≤ 5 s (80%)**: enforced on requests tagged `name:patient_record` in `nfr-performance.js` (`p(80)<=5000` ms).
- **Appointment booking/update ≤ 7 s (75%)**: enforced on `name:appointment_write` when `K6_APPOINTMENT_ID` is set and the **patient** login issues `PUT` updates (`p(75)<=7000` ms). Use a patient `K6_USERNAME` plus `K6_APPOINTMENT_ID` so this submetric receives traffic; doctor-only runs never hit appointment writes.
- **300 concurrent users / +3 s vs baseline**: run `nfr-performance.js` twice—first with low `K6_MAX_VUS` (e.g. `5`), then with `K6_MAX_VUS=300`—and compare exported summaries:

```bash
k6 run --summary-export=k6/out/summary-baseline.json -e BASE_URL=http://localhost:5000 -e K6_USERNAME=... -e K6_PASSWORD=... -e K6_MAX_VUS=5 k6/scripts/nfr-performance.js
k6 run --summary-export=k6/out/summary-load.json -e K6_MAX_VUS=300 ...
```

Compare `metrics.http_req_duration.values` (and tagged submetrics if you split them) manually or with a small script.

## Commands (CLI)

Start the API first (from repo root), otherwise k6 will get **connection refused** on port 5000:

```powershell
.\scripts\docker.ps1 -Action up
# wait until backend is healthy, then:
```

From the **repository root**:

```bash
k6 run k6/scripts/smoke.js
k6 run -e BASE_URL=http://localhost:5000 -e K6_USERNAME=doctor1 -e K6_PASSWORD=secret k6/scripts/smoke.js
k6 run -e K6_STAGE_TARGET=25 k6/scripts/load.js
k6 run -e K6_MAX_VUS=300 -e K6_PATIENT_RECORD_ID=1 k6/scripts/nfr-performance.js
```

## Docker (grafana/k6)

From repository root (PowerShell):

```powershell
docker run --rm -i `
  -e BASE_URL=http://host.docker.internal:5000 `
  -e K6_USERNAME=doctor1 `
  -e K6_PASSWORD=yourpassword `
  -v "${PWD}/k6:/k6:ro" `
  grafana/k6 run /k6/scripts/smoke.js
```

On Linux, if `host.docker.internal` is unavailable, use the host gateway IP or publish ports and use `http://172.17.0.1:5000`.

## PowerShell helper

[scripts/k6.ps1](../scripts/k6.ps1) runs from the repo root. Examples:

```powershell
.\scripts\k6.ps1 -Script smoke
.\scripts\k6.ps1 -Script load -BaseUrl http://localhost:5000 -Username doc -Password secret
.\scripts\k6.ps1 -Script smoke -Docker
```

With `-Docker`, `BASE_URL` defaults to `http://host.docker.internal:5000` when `-BaseUrl` is omitted.

**Grafana Cloud:** use **`-Cloud`** (runs `k6 cloud run --local-execution` so results show in Grafana Cloud while hitting a local API). Use **`-CloudDistributed`** for a full cloud run against a **public** `BASE_URL`. Set **`K6_CLOUD_STACK_ID`** or **`-CloudStack`** (numeric). Optional **`K6_CLOUD_PROJECT_ID`** targets which cloud project records the run — it does **not** replace **`K6_CLOUD_TOKEN`** / login for authentication.

Load **`k6/.env.grafana.local`** into the **current** PowerShell session (k6 does not read that file by itself):

```powershell
. .\scripts\import-k6-grafana-env.ps1
.\scripts\k6.ps1 -Script smoke -Cloud
```

*(The leading `.` is required — it dot-sources the script so `$env:K6_CLOUD_*` apply to this window.)*

## Troubleshooting

### `You must first authenticate to run tests in Grafana Cloud`

`k6 cloud run` does **not** load `k6/.env.grafana.local` automatically. Do **one** of:

1. **Same terminal:** after editing `k6/.env.grafana.local`, run **`. .\scripts\import-k6-grafana-env.ps1`** then `k6 cloud run --local-execution ...` or `.\scripts\k6.ps1 -Cloud`.
2. **Persist login once:** `k6 cloud login --token YOUR_TOKEN --stack https://YOURORG.grafana.net` (then `k6 cloud run` may work without env vars until the login expires). See [tokens and CLI authentication](https://grafana.com/docs/grafana-cloud/testing/k6/author-run/tokens-and-cli-authentication/).

### `stack value is required but it was not passed or is empty`

Recent k6 builds require your **Grafana Cloud stack** on every cloud command. Fix:

```bash
k6 cloud login --token YOUR_TOKEN --stack https://YOURORG.grafana.net
```

Or set **`K6_CLOUD_STACK_ID`** to the **numeric Stack ID** (same screen in the UI) / `.\scripts\k6.ps1 -Cloud -CloudStack 12345`.

### `strconv.ParseInt` / `assigning K6_CLOUD_STACK_ID` (invalid syntax)

`K6_CLOUD_STACK_ID` must be a **number**, not `https://yourorg.grafana.net`. Use the **Stack ID** field from **Performance** → **Settings** → **Access**. URLs are only for `k6 cloud login --stack …`.

### `default project ID is not available`

You are already **authenticated** (token is fine). k6 knows the **stack** but not which **project** should own the test run — often when only **`K6_CLOUD_TOKEN`** + **`K6_CLOUD_STACK_ID`** are set and there is no `k6 cloud login` file with `defaultProjectID`. Fix **one** of:

1. Run **`k6 cloud login --token YOUR_TOKEN --stack https://YOURORG.grafana.net`** once on that machine (refreshes `%AppData%\Roaming\k6\config.json` / the path in [tokens and CLI authentication](https://grafana.com/docs/grafana-cloud/testing/k6/author-run/tokens-and-cli-authentication/)), then retry.
2. Set **`K6_CLOUD_PROJECT_ID`** to the numeric **project** id (UI / [Use the CLI](https://grafana.com/docs/grafana-cloud/testing/k6/author-run/use-the-cli/)) **in addition to** the token — this is **routing**, not a second login.

*(Việt: Lỗi này không phải “sai mật khẩu”. Token vẫn là cách xác thực; project ID chỉ bổ sung “chạy test ghi vào project nào”.)*

### `(404/E3) Resource does not exist` when creating a cloud test run

The k6 Cloud API could not find the **stack** or **project** your CLI is using (IDs or token do not line up). Check in order:

1. **Token matches the stack** — Use a **Personal** or **Stack** token from **Testing & synthetics → Performance → Settings → Access** on the **same** Grafana Cloud stack as your stack URL / stack ID. A token from another org or only from “Grafana” (not k6 Performance) can produce 404-class errors when creating runs.
2. **`K6_CLOUD_STACK_ID`** — Must be the **numeric Stack ID** from that same **Performance → Settings → Access** screen (not the stack slug, not an org id, not a Prometheus/Mimir id).
3. **`K6_CLOUD_PROJECT_ID`** — If set, it must be a **k6 Cloud project** id that **exists under that stack** (open the project in the Performance UI and copy the id from the URL or project settings). A typo, an id from another stack, or a non‑k6 “project” id will often return **Resource does not exist**.
4. **Prefer login once to validate** — Run `k6 cloud login --token YOUR_TOKEN --stack https://YOURORG.grafana.net`, then temporarily **unset** `K6_CLOUD_STACK_ID` / `K6_CLOUD_PROJECT_ID` in the shell and run `k6 cloud run --local-execution k6/scripts/smoke.js`. If that works, re-copy stack and project ids from the UI into `k6/.env.grafana.local`.
5. **k6 prereleases** — If you use a **release candidate** CLI (`k6 version` shows `rc`), try the latest **stable** k6 from [Install k6](https://grafana.com/docs/k6/latest/set-up/install-k6/) in case of API/client mismatch.

*(Việt: 404/E3 gần như luôn là **sai Stack ID / Project ID** hoặc **token không cùng stack** với các ID đó — kiểm tra lại trong UI Performance và thử `k6 cloud login` rồi chạy không cần env ID.)*

### `connectex: No connection could be made` / `connection refused` on `:5000`

Nothing is accepting HTTP on that host and port. Start the stack so the backend listens on **5000** (see [docker-compose.yml](../docker-compose.yml): `5000:3000`). Confirm in a browser or with:

```powershell
Invoke-WebRequest -Uri http://localhost:5000/health -UseBasicParsing
```

Then re-run k6. If the API runs on another port or host, set `BASE_URL` accordingly (for example `-e BASE_URL=http://127.0.0.1:8080`).

### `http_req_failed` threshold crossed with 100% failures

Usually the same as above (server down), wrong `BASE_URL`, or TLS mismatch (use `https://` only if the server actually serves HTTPS on that port).
