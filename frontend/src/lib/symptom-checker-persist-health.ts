import type { SymptomInput } from "@/types/ai-types"
import { healthInfoService, type HealthInfo } from "@/services/health-info-service"

const DURATION_LABEL: Record<SymptomInput["duration"], string> = {
  less24h: "< 24h",
  "1to3days": "1–3 days",
  "3to7days": "3–7 days",
  moreThanWeek: "> 1 week",
}

const MAX_SYMPTOMS_CHARS = 12000

function stripLegacySymptomCheckerNoise(text: string): string {
  return (text || "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => {
      if (!line) return false
      if (/^\[Symptom checker — .+\]$/i.test(line)) return false
      if (/^Demo vitals\s+[-–—]\s+routine tracking$/i.test(line)) return false
      return true
    })
    .join("\n")
}

export function formatSymptomCheckerBlock(
  symptoms: Array<{ name: string; severity: string; duration: SymptomInput["duration"] }>
): string {
  const lines = symptoms.map(
    (s) => `- ${s.name}: ${s.severity}; ${DURATION_LABEL[s.duration] ?? s.duration}`
  )
  return lines.join("\n")
}

export function mergeHealthInfoSymptomText(existing: string, block: string): string {
  const e = stripLegacySymptomCheckerNoise(existing)
  const b = block.trim()
  if (!e) return b
  let merged = `${e}\n\n${b}`
  if (merged.length <= MAX_SYMPTOMS_CHARS) return merged
  const note = "...[earlier symptom-checker entries truncated]\n\n"
  const keep = MAX_SYMPTOMS_CHARS - note.length
  merged = `${note}${merged.slice(-keep)}`
  return merged
}

export const HEALTH_INFO_SYMPTOMS_UPDATED_EVENT = "health-info-symptoms-updated"

function asStringArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => String(x))
  if (typeof v === "string" && v.trim()) return [v]
  return []
}

export function vitalPayloadFromHealthInfo(hi: HealthInfo, currentSymptoms: string) {
  return {
    height: hi.height,
    weight: hi.weight,
    bloodPressureSys: hi.bloodPressureSys,
    bloodPressureDia: hi.bloodPressureDia,
    heartRate: hi.heartRate,
    respiratoryRate: hi.respiratoryRate,
    temperature: hi.temperature,
    spo2: hi.spo2,
    ...(hi.bloodType ? { bloodType: hi.bloodType } : {}),
    drugAllergies: asStringArray(hi.drugAllergies),
    foodAllergies: asStringArray(hi.foodAllergies),
    otherAllergies: asStringArray(hi.otherAllergies),
    chronicConditions: asStringArray(hi.chronicConditions),
    pastSurgeries: asStringArray(hi.pastSurgeries),
    familyHistory: asStringArray(hi.familyHistory),
    pastIllnesses: asStringArray(hi.pastIllnesses),
    vaccinations: asStringArray(hi.vaccinations),
    substanceAbuse: asStringArray(hi.substanceAbuse),
    currentSymptoms,
    status: "draft" as const,
  }
}

/**
 * Save the latest symptom-checker selection to Health Info `currentSymptoms` (MEDICAL_RECORD.condition).
 * Replaces previous symptoms with the current check (does not append history).
 * Updates the latest draft row if present; otherwise creates a new record (e.g. after confirm).
 */
export async function persistSymptomCheckerToHealthInfo(
  symptoms: Array<{ name: string; severity: string; duration: SymptomInput["duration"] }>
): Promise<{ ok: boolean; error?: string }> {
  if (!symptoms.length) return { ok: false, error: "No symptoms to save." }

  const currentSymptoms = formatSymptomCheckerBlock(symptoms)
  const info = await healthInfoService.getHealthInfo()
  if (!info.success || !info.healthInfo) {
    return { ok: false, error: info.error || "Could not load Health Info." }
  }

  const hi = info.healthInfo
  const payload = vitalPayloadFromHealthInfo(hi, currentSymptoms)

  const recordId = hi.id
  const isDraft = hi.status !== "confirmed"
  let res
  if (recordId != null && Number.isFinite(Number(recordId)) && isDraft) {
    res = await healthInfoService.updateHealthInfo(Number(recordId), payload)
  } else {
    res = await healthInfoService.createHealthInfo(payload)
  }

  if (res.success) {
    window.dispatchEvent(new CustomEvent(HEALTH_INFO_SYMPTOMS_UPDATED_EVENT))
    return { ok: true }
  }
  return { ok: false, error: res.error }
}
