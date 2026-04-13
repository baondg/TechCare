"use client"

/** Wraps the doctor EMR page in nurse mode; blood type options are `PATIENT_BLOOD_TYPES` in `@/lib/patient-blood-types`. */
import DoctorHealthInfoPage from "@/pages/doctor/medical_records/health-info"

export default function NurseHealthInfoPage() {
  return <DoctorHealthInfoPage mode="nurse" />
}
