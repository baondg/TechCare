/** Matches PATIENT.in_department enum in database_description.sql */
import type { TFunction } from "i18next"

export const PATIENT_IN_DEPARTMENT_OPTIONS = [
  "Outpatient",
  "Emergency",
  "Internal Medicine",
  "Surgery",
  "Cardiology",
  "Dermatology",
  "Ophthalmology",
  "Otolaryngology",
] as const

export type PatientInDepartment = (typeof PATIENT_IN_DEPARTMENT_OPTIONS)[number]

const DEPARTMENT_I18N_KEY_BY_VALUE: Record<PatientInDepartment, string> = {
  Outpatient: "outpatient",
  Emergency: "emergency",
  "Internal Medicine": "internalMedicine",
  Surgery: "surgery",
  Cardiology: "cardiology",
  Dermatology: "dermatology",
  Ophthalmology: "ophthalmology",
  Otolaryngology: "otolaryngology",
}

export function isPatientInDepartment(value: string): value is PatientInDepartment {
  return (PATIENT_IN_DEPARTMENT_OPTIONS as readonly string[]).includes(value)
}

export function translatePatientInDepartment(
  value: string | null | undefined,
  t: TFunction<"translation">,
): string {
  if (!value) return t("common.notAvailable")
  if (!isPatientInDepartment(value)) return value
  return t(`common.patientInDepartment.${DEPARTMENT_I18N_KEY_BY_VALUE[value]}`)
}
