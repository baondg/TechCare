/** EMR routes use OP + USER.id (not PATIENT.patient_id). */
export function formatPatientOpRouteId(userId: number | string | null | undefined): string {
  const n = Number(userId)
  if (!Number.isFinite(n) || n <= 0) return ""
  return `OP${String(Math.trunc(n)).padStart(9, "0")}`
}

export function doctorPatientEmrPath(
  userId: number | string | null | undefined,
  tab: string = "dashboard",
): string {
  const op = formatPatientOpRouteId(userId)
  return op ? `/doctor/medical_records/${op}/${tab}` : "/doctor/patients"
}