# Backend observability (GCP and logs)

Short runbook for Phase C2-style operations: find failures faster using logs and optional Error Reporting.

## Structured logs

The backend logs through `src/common/logger.ts` (pino): **one JSON object per line on stdout**, so Cloud Run
ingests them as `jsonPayload` (not `textPayload`).

| Field | Meaning |
|---|---|
| `msg` | Event name / message (`http.request`, `ai.http`, `ai.orchestration`, `Unhandled error`, …) |
| `severity` | `INFO` / `WARNING` / `ERROR` / `CRITICAL` — Cloud Logging uses it for the level filter |
| `err` | Serialized error (`type`, `message`, `stack`) |
| `req.id` / `requestId` | The `X-Request-ID` of the request (also returned to clients in error bodies) |

- **`http.request`:** one access-log line per request (method, url, status, `responseTime` ms). `/health` is skipped. 4xx → `WARNING`, 5xx → `ERROR`.
- **`ai.http`:** one line per request under `/api/ai/*` (method, path, user id when authenticated on that route).
- **`ai.orchestration`:** lines from the appointment AI service when calling internal AI (`feature`: `chat`, `symptom-analysis`, `recovery-prediction`), includes `requestId`, `userId`, `patientId`, `modelId` where applicable.
- **`db.query`:** every SQL statement, **only at `LOG_LEVEL=debug`** — statements contain inlined values (patient data), so never enable debug in production.

`LOG_LEVEL` = `trace` | `debug` | `info` (default) | `warn` | `error` | `fatal` | `silent`.
Authorization headers, cookies and `password` / `token` fields are redacted. Request bodies are never logged.

### Cloud Logging queries (examples)

- `jsonPayload.msg="ai.orchestration"`
- `jsonPayload.feature="symptom-analysis"`
- `jsonPayload.requestId="..." OR jsonPayload.req.id="..."` (correlate with a client error body or support ticket)
- `severity>=ERROR AND jsonPayload.msg="Unhandled error"`

## Google Cloud Error Reporting

1. Enable the **Error Reporting API** on the project.
2. For Node on Cloud Run, errors logged as **stack traces** to stderr are often picked up automatically.
3. Optional: add `@google-cloud/error-reporting` and report handled errors you care about (follow Google Cloud Node.js docs).

## OpenTelemetry (optional)

For distributed traces (AI upstream, DB), consider:

- OpenTelemetry SDK for Node + exporter to **Cloud Trace** or a vendor.
- Start with one route (for example `POST /api/ai/chat`) before rolling out widely.

## Dashboards

- Cloud Run: request count, latency, error rate per service.
- Cloud SQL: connections, CPU (correlate with AI traffic spikes).

## Related

- `IMPROVEMENT_PLAN.md` Phase C1/C2
- `docs/operations/schema-migration-checklist.md`