/** Matches PATIENT.in_department enum in database_description.sql */
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
