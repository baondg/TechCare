import { doctorService } from "@/services/doctor-service"

/** Loads the logged-in doctor's saved signature image (data URL) for PDF export. */
export async function fetchDoctorSignatureForPdf(): Promise<string | null> {
  try {
    const got = await doctorService.getSignature()
    if (got.success && got.signature?.trim()) {
      return got.signature.trim()
    }
  } catch {
    return null
  }
  return null
}
