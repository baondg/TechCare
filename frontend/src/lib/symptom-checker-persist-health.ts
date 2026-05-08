import type { SymptomInput } from "@/types/ai-types"
import { healthInfoService, type HealthInfo } from "@/services/health-info-service"

const DURATION_LABEL: Record<SymptomInput["duration"], string> = {
  less24h: "< 24h",
  "1to3days": "1–3 days",
  "3to7days": "3–7 days",
  moreThanWeek: "> 1 week",
}

const MAX_SYMPTOMS_CHARS = 12000

export function formatSymptomCheckerBlock(
  symptoms: Array<{ name: string; severity: string; duration: SymptomInput["duration"] }>
): string {
  const when = new Date().toISOString().slice(0, 16).replace("T", " ")
  const lines = symptoms.map(
    (s) => `- ${s.name}: ${s.severity}; ${DURATION_LABEL[s.duration] ?? s.duration}`
  )
  return `[Symptom checker — ${when}]\n${lines.join("\n")}`
}

export function mergeHealthInfoSymptomText(existing: string, block: string): string {
  const e = (existing || "").trim()
  const b = block.trim()
  if (!e) return b
  let merged = `${e}\n\n${b}`
  if (merged.length <= MAX_SYMPTOMS_CHARS) return merged
  const note = "...[earlier symptom-checker entries truncated]\n\n"
  const keep = MAX_SYMPTOMS_CHARS - note.length
  merged = `${note}${merged.slice(-keep)}`
  return merged
}

function asStringArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => String(x))
  if (typeof v === "string" && v.trim()) return [v]
  return []
}

function vitalPayloadFromHealthInfo(hi: HealthInfo, currentSymptoms: string) {
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
 * Append structured symptom-checker lines to Health Info `currentSymptoms` (MEDICAL_RECORD.condition).
 * Updates the latest draft row if present; otherwise creates a new record (e.g. after confirm).
 */
export async function persistSymptomCheckerToHealthInfo(
  symptoms: Array<{ name: string; severity: string; duration: SymptomInput["duration"] }>
): Promise<{ ok: boolean; error?: string }> {
  if (!symptoms.length) return { ok: false, error: "No symptoms to save." }

  const block = formatSymptomCheckerBlock(symptoms)
  const info = await healthInfoService.getHealthInfo()
  if (!info.success || !info.healthInfo) {
    return { ok: false, error: info.error || "Could not load Health Info." }
  }

  const hi = info.healthInfo
  const merged = mergeHealthInfoSymptomText(hi.currentSymptoms ?? "", block)
  const payload = vitalPayloadFromHealthInfo(hi, merged)

  const recordId = hi.id
  const isDraft = hi.status !== "confirmed"
  if (recordId != null && Number.isFinite(Number(recordId)) && isDraft) {
    const res = await healthInfoService.updateHealthInfo(Number(recordId), payload)
    return res.success ? { ok: true } : { ok: false, error: res.error }
  }

  const res = await healthInfoService.createHealthInfo(payload)
  return res.success ? { ok: true } : { ok: false, error: res.error }
}
