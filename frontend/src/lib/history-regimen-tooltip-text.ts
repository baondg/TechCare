import type { PatientMedicalRegimen } from "@/services/appointment-service"

export type FormatDateTimeFn = (value: string | null | undefined, locale?: string) => string

/** Plain-text summary; `form_payload` is rendered separately via `FormPayloadPreview`. */
export function buildHospitalTransferTooltipSummary(
  ht: PatientMedicalRegimen["hospitalTransfers"][number],
  formatDateTime: FormatDateTimeFn
): string {
  const lines: string[] = ["Hospital transfer — preview"]
  lines.push(`Destination: ${ht.toHospitalName?.trim() || "—"}`)
  if (ht.toHospitalId?.trim()) lines.push(`Reference / ID: ${ht.toHospitalId.trim()}`)
  lines.push(`Transfer time: ${formatDateTime(ht.transferAt)}`)
  if (ht.transport?.trim()) lines.push(`Transport: ${ht.transport.trim()}`)
  lines.push("")
  lines.push("Reason:")
  lines.push((ht.reason || "—").trim() || "—")
  if (ht.note?.trim()) {
    lines.push("")
    lines.push("Note:")
    lines.push(ht.note.trim())
  }
  return lines.join("\n")
}

export function buildHealthTrackingSlipTooltipSummary(
  slip: PatientMedicalRegimen["healthTrackingSlips"][number],
  formatDateTime: FormatDateTimeFn
): string {
  const lines: string[] = [`Health tracking slip #${slip.orderId} — preview`]
  lines.push(`Recorded: ${formatDateTime(slip.createdAt)}`)
  if (slip.createdByDoctor?.trim()) lines.push(`Created by: ${slip.createdByDoctor.trim()}`)
  const rows = slip.rows ?? []
  lines.push(`Rows: ${rows.length}`)
  lines.push("")
  rows.forEach((r, idx) => {
    lines.push(`── Row ${idx + 1} · ${formatDateTime(r.updatedAt)}`)
    lines.push(
      `  BP ${r.bloodPressure ?? "—"} · Pulse ${r.pulse ?? "—"} bpm · Temp ${r.temperature ?? "—"} °C · Weight ${r.weight ?? "—"} kg`
    )
    lines.push(
      `  RR ${r.respiratoryRate ?? "—"}/min · SpO₂ ${r.spo2 ?? "—"} %`
    )
    const sx = (r.symptoms || "").trim()
    if (sx) {
      lines.push(`  Symptoms / notes: ${sx}`)
    }
    lines.push("")
  })
  return lines.join("\n").trimEnd()
}
