# Reliability SLO/SLI Definition

## Service level indicators (SLIs)

- **Availability SLI**: successful `/health` checks / total health checks.
- **Request error SLI**: `1 - (5xx responses / total responses)` for API endpoints.
- **Latency SLI**:
  - `patient_record` p80 latency
  - `appointment_write` p75 latency

## Service level objectives (SLOs)

- Availability: `>= 99.5%` per 30-day window.
- Error rate: `< 1%` server errors per 30-day window.
- Latency (NFR-aligned):
  - `patient_record` p80 `<= 5000 ms`
  - `appointment_write` p75 `<= 7000 ms`
- Scale delta gate:
  - 300 VU average latency increase vs baseline `<= 3000 ms`.

## Error budget policy

- Monthly error budget for 99.5% availability is ~3h 36m.
- If >50% budget is consumed mid-window:
  - pause non-critical releases
  - prioritize reliability fixes and incident prevention.
