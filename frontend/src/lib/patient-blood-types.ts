/** Matches PATIENT.blood_type ENUM in database_description.sql */
export const PATIENT_BLOOD_TYPES = ["A+", "B+", "AB+", "O+", "A-", "B-", "AB-", "O-"] as const

export type PatientBloodType = (typeof PATIENT_BLOOD_TYPES)[number]

/** Radix Select value when DB blood_type is NULL or unknown */
export const PATIENT_BLOOD_TYPE_UNSET = "__unset__" as const

const ALLOWED = new Set<string>(PATIENT_BLOOD_TYPES)

/** Map API / legacy values to a Select `value` (ENUM member or UNSET). */
export function normalizePatientBloodTypeForSelect(raw: unknown): string {
  const s = String(raw ?? "").trim()
  if (ALLOWED.has(s)) return s
  const u = s.toUpperCase()
  if (u === "A") return "A+"
  if (u === "B") return "B+"
  if (u === "AB") return "AB+"
  if (u === "O") return "O+"
  return PATIENT_BLOOD_TYPE_UNSET
}

/** Value to send in health-info API body; omit key when undefined so blood_type is left unchanged. */
export function bloodTypeForApiPayload(selectValue: string): string | undefined {
  if (!selectValue || selectValue === PATIENT_BLOOD_TYPE_UNSET) return undefined
  if (ALLOWED.has(selectValue)) return selectValue
  return undefined
}
