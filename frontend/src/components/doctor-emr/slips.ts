import type { PatientDetail } from "@/services/doctor-service"
import { buildHospitalTransferSlipHtmlDocument } from "@/lib/hospital-transfer-slip-html"
import { formatDdMmYyyy, parseIsoDateForSlip, splitInsuranceCardParts } from "@/lib/follow-up-reexam-slip-html"

export function readSignedInDisplayName(): string {
  try {
    const raw = localStorage.getItem("user")
    if (!raw) return ""
    const u = JSON.parse(raw) as { firstName?: string; lastName?: string; username?: string; fullName?: string }
    const n = `${u.lastName || ""} ${u.firstName || ""}`.trim()
    return n || String(u.fullName || "").trim() || String(u.username || "").trim()
  } catch {
    return ""
  }
}

export function formatDateTime(value: string | null | undefined, locale = "vi-VN") {
  if (!value) return "—"
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return String(value)
  return d.toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" })
}

export type FollowUpForm = { date: string; time: string; department: string; symptoms: string }

const PLACEHOLDER_DATE = "..../..../........"

/** Fields of the follow-up re-exam slip. The saved slip labels gender in Vietnamese, the on-screen preview in English. */
export function buildFollowUpSlipInputs(patient: PatientDetail, form: FollowUpForm, gender: { M: string; F: string }) {
  const patientName = `${patient.lastName || ""} ${patient.firstName || ""}`.trim() || "—"
  const genderLabel = patient.gender === "M" ? gender.M : patient.gender === "F" ? gender.F : patient.gender?.trim() || "—"
  const dx = patient.latestDiagnosis
  const diagnosis = [dx?.icd10, dx?.interpretation].filter(Boolean).join(" — ") || "—"
  const rev = form.date.trim() ? parseIsoDateForSlip(form.date) : null
  const now = new Date()
  const examDateDisplay = formatDdMmYyyy(
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`
  )
  return {
    patientName,
    genderLabel,
    dateOfBirthDisplay: patient.dateOfBirth ? formatDdMmYyyy(patient.dateOfBirth) || PLACEHOLDER_DATE : PLACEHOLDER_DATE,
    address: "—",
    insuranceCardParts: splitInsuranceCardParts(patient.healthInsuranceId),
    insuranceValidFromDisplay: PLACEHOLDER_DATE,
    insuranceValidToDisplay: patient.healthInsuranceExpiredDate
      ? formatDdMmYyyy(patient.healthInsuranceExpiredDate) || PLACEHOLDER_DATE
      : PLACEHOLDER_DATE,
    examDateDisplay: examDateDisplay || PLACEHOLDER_DATE,
    admissionDateDisplay: PLACEHOLDER_DATE,
    dischargeDateDisplay: PLACEHOLDER_DATE,
    diagnosis,
    comorbidities: form.symptoms.trim() || "—",
    revisitDay: rev ? rev.day.padStart(2, "0") : "…",
    revisitMonth: rev ? rev.month.padStart(2, "0") : "…",
    revisitYear: rev ? rev.year : "…",
    appointmentTimeLabel: form.time.trim() || undefined,
    departmentLabel: form.department.trim() || undefined,
    footerPlaceLine: "………………",
    footerDay: String(now.getDate()),
    footerMonth: String(now.getMonth() + 1),
    footerYear: String(now.getFullYear()),
    doctorDisplayName: readSignedInDisplayName() || "—",
  }
}

export type HospitalTransferForm = { reason: string; note: string; hospitalName: string }

/** Body of `doctorService.createPatientTransfer` for a transfer to another hospital. */
export function hospitalTransferRequest(form: HospitalTransferForm) {
  return {
    kind: "hospital" as const,
    reason: form.reason.trim(),
    note: form.note.trim() || undefined,
    toHospitalName: form.hospitalName.trim(),
    formPayload: {
      portalVersion: 1,
      recordedAt: new Date().toISOString(),
      toHospitalName: form.hospitalName.trim(),
    },
  }
}

export function hospitalTransferSlipHtml(patient: PatientDetail, form: HospitalTransferForm): string {
  const patientName = `${patient.lastName || ""} ${patient.firstName || ""}`.trim() || "—"
  const patientSex = patient.gender === "M" ? "Male" : patient.gender === "F" ? "Female" : patient.gender || "—"
  return buildHospitalTransferSlipHtmlDocument({
    patientName,
    patientDob: "—",
    patientSex,
    insuranceId: patient.healthInsuranceId || undefined,
    destinationHospital: form.hospitalName.trim() || "—",
    reason: form.reason.trim(),
    note: form.note.trim() || undefined,
    transferAt: new Date().toLocaleString("vi-VN", { dateStyle: "medium", timeStyle: "short" }),
    doctorName: readSignedInDisplayName() || "—",
    icd10: patient.latestDiagnosis?.icd10,
    diagnosis: patient.latestDiagnosis?.interpretation,
    formPayload: { portalVersion: 1, toHospitalName: form.hospitalName.trim() },
  })
}
