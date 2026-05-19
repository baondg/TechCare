# Backend observability (GCP and logs)

Short runbook for Phase C2-style operations: find failures faster using logs and optional Error Reporting.

## Structured logs (already in app)

- **Request ID:** middleware sets `X-Request-ID` and `req.requestId` on every request.
- **`ai.http`:** one JSON line per request under `/api/ai/*` (method, path, user id when authenticated on that route).
- **`ai.orchestration`:** JSON lines from `appointmentController` when calling internal AI (`feature`: `chat`, `symptom-analysis`, `recovery-prediction`), includes `requestId`, `userId`, `patientId`, `modelId` where applicable.

### Cloud Logging queries (examples)

In Log Explorer, filter for JSON `msg` field:

- `jsonPayload.msg="ai.orchestration"`
- `jsonPayload.feature="symptom-analysis"`
- `jsonPayload.requestId="..."` (correlate with client or support ticket)

If logs are plain text (stdout), use:

- `textPayload=~"ai.orchestration"`

Adjust field names to how Cloud Run ingests your log format (structured logging to `jsonPayload` may require a logging library; today lines are JSON strings in `textPayload`).

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