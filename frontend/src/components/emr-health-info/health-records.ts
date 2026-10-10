import { createEmptySymptomEntry, parseHealthInfoSymptoms, serializeSymptomEntries, type SymptomEntry } from "@/lib/health-info-symptoms"
import { PATIENT_BLOOD_TYPE_UNSET, bloodTypeForApiPayload, normalizePatientBloodTypeForSelect } from "@/lib/patient-blood-types"

/** The list fields of a health record: in the allergy blob or the medical-history blob, camelCase or snake_case. */
export const LIST_FIELDS = [
  { key: "drugAllergies", label: "Drug Allergies", blob: "allergic", alias: "drug_allergies" },
  { key: "foodAllergies", label: "Food Allergies", blob: "allergic", alias: "food_allergies" },
  { key: "otherAllergies", label: "Other Allergies", blob: "allergic", alias: "other_allergies" },
  { key: "chronicConditions", label: "Chronic Conditions", blob: "history", alias: "chronic_conditions" },
  { key: "pastSurgeries", label: "Past Surgeries", blob: "history", alias: "past_surgeries" },
  { key: "familyHistory", label: "Family Medical History", blob: "history", alias: "family_history" },
  { key: "pastIllnesses", label: "Previous Illnesses", blob: "history", alias: "past_illnesses" },
  { key: "vaccinations", label: "Vaccinations", blob: "history", alias: undefined },
  { key: "substanceAbuse", label: "Substance Abuse", blob: "history", alias: "substance_abuse" },
] as const

export type ListKey = (typeof LIST_FIELDS)[number]["key"]
export type HealthLists = Record<ListKey, string[]>

export type HealthRecord = {
  id: number
  updatedAt: Date
  height: number
  weight: number
  bmi: number
  bloodPressure: string
  heartRate: number
  respiratoryRate: number
  temperature: number
  spo2: number
  symptoms: string
  updatedBy: string
  status: "draft" | "confirmed"
  bloodType?: string
} & HealthLists

export type Vitals = {
  height: string
  weight: string
  bpSys: string
  bpDia: string
  heartRate: string
  respiratoryRate: string
  temperature: string
  spo2: string
}

export type HealthForm = Vitals & { bloodType: string; symptoms: SymptomEntry[]; lists: HealthLists }

export type PatientDefaults = { bloodType: string; lists: HealthLists }

type Row = Record<string, unknown>

const emptyLists = (): HealthLists =>
  Object.fromEntries(LIST_FIELDS.map((f) => [f.key, []])) as unknown as HealthLists

export const EMPTY_VITALS: Vitals = {
  height: "",
  weight: "",
  bpSys: "",
  bpDia: "",
  heartRate: "",
  respiratoryRate: "",
  temperature: "",
  spo2: "",
}

export function emptyForm(): HealthForm {
  return { ...EMPTY_VITALS, bloodType: PATIENT_BLOOD_TYPE_UNSET, symptoms: [createEmptySymptomEntry()], lists: emptyLists() }
}

export const EMPTY_PATIENT_DEFAULTS: PatientDefaults = { bloodType: PATIENT_BLOOD_TYPE_UNSET, lists: emptyLists() }

function toArray(value: unknown): string[] {
  const clean = (list: unknown[]) =>
    list.filter((item): item is string => typeof item === "string").map((s) => s.trim()).filter(Boolean)
  if (Array.isArray(value)) return clean(value)
  if (typeof value === "string" && value.trim()) {
    const raw = value.trim()
    // JSON-array strings stored in DB blobs, e.g. '["A","B"]'
    if (raw.startsWith("[") && raw.endsWith("]")) {
      try {
        const parsed: unknown = JSON.parse(raw)
        if (Array.isArray(parsed)) return clean(parsed)
      } catch {
        // fall back to the raw string
      }
    }
    return [raw]
  }
  return []
}

function pickList(obj: Row, ...keys: (string | undefined)[]): string[] {
  for (const key of keys) {
    if (!key) continue
    const list = toArray(obj[key])
    if (list.length) return list
  }
  return []
}

/** A JSON column: object, JSON string, or the camelCase variant; unreadable → {}. */
function blob(row: Row, snake: string, camel: string): Row {
  try {
    const v = row[snake]
    if (typeof v === "string") return JSON.parse(v) as Row
    return (v as Row) || (row[camel] as Row) || {}
  } catch {
    return {}
  }
}

/** Each list from the row's own field, else from its allergy / medical-history blob. */
function listsOf(row: Row): HealthLists {
  const blobs = { allergic: blob(row, "allergic_info", "allergicInfo"), history: blob(row, "medical_history", "medicalHistory") }
  const lists = emptyLists()
  for (const f of LIST_FIELDS) {
    const own = pickList(row, f.key, f.alias)
    lists[f.key] = own.length ? own : pickList(blobs[f.blob], f.key, f.alias)
  }
  return lists
}

function withDefaults(lists: HealthLists, defaults: HealthLists): HealthLists {
  const out = emptyLists()
  for (const f of LIST_FIELDS) out[f.key] = lists[f.key]?.length ? lists[f.key] : defaults[f.key]
  return out
}

/** The patient's blood type and lists (`patientInfo` of GET health-info), used when a record has none. */
export function patientDefaults(patientInfo: Row): PatientDefaults {
  return {
    bloodType: normalizePatientBloodTypeForSelect(String(patientInfo.blood_type ?? "")),
    lists: listsOf(patientInfo),
  }
}

function statusOf(s: unknown): HealthRecord["status"] {
  const raw = String(s ?? "").toLowerCase()
  return raw === "confirmed" || raw === "signed" ? "confirmed" : "draft"
}

/** One MEDICAL_RECORD row of the history (snake_case model JSON). */
export function toHealthRecord(row: Row): HealthRecord {
  const height = Number(row.height) || 0
  const weight = Number(row.weight) || 0
  const [sys, dia] = String(row.blood_pressure || "0/0").split("/")
  return {
    id: Number(row.id),
    updatedAt: new Date(String(row.time || row.updatedAt || row.createdAt || "") || Date.now()),
    height,
    weight,
    bmi: height > 0 ? weight / ((height / 100) ** 2) : 0,
    bloodPressure: `${sys}/${dia}`,
    heartRate: Number(row.heart_rate) || 0,
    respiratoryRate: Number(row.respiratory_rate) || 0,
    temperature: Number(row.temperature) || 0,
    spo2: Number(row.spo2) || 0,
    symptoms: String(row.condition || ""),
    status: statusOf(row.status),
    updatedBy: "Patient",
    bloodType: normalizePatientBloodTypeForSelect(row.blood_type || row.bloodType || ""),
    ...listsOf(row),
  }
}

/** Form for the latest record (`healthInfo` of GET health-info). */
export function formFromLatest(info: Row, patientInfo: Row, defaults: PatientDefaults): HealthForm {
  const str = (v: unknown) => (v == null ? "" : String(v))
  const [bpSys, bpDia] = String(info.blood_pressure || "0/0").split("/")
  return {
    height: str(info.height),
    weight: str(info.weight),
    bpSys,
    bpDia,
    heartRate: str(info.heart_rate),
    respiratoryRate: str(info.respiratory_rate),
    temperature: str(info.temperature),
    spo2: str(info.spo2),
    symptoms: parseHealthInfoSymptoms(String(info.currentSymptoms ?? info.condition ?? "")),
    lists: withDefaults(listsOf(info), defaults.lists),
    bloodType: normalizePatientBloodTypeForSelect(String(info.blood_type ?? info.bloodType ?? patientInfo.blood_type ?? "")),
  }
}

/** Form for a history row the user clicked. */
export function formFromRecord(record: HealthRecord, defaults: PatientDefaults): HealthForm {
  const [bpSys, bpDia] = record.bloodPressure.split("/")
  return {
    height: record.height.toString(),
    weight: record.weight.toString(),
    bpSys,
    bpDia,
    heartRate: record.heartRate.toString(),
    respiratoryRate: record.respiratoryRate.toString(),
    temperature: record.temperature.toString(),
    spo2: record.spo2.toString(),
    symptoms: parseHealthInfoSymptoms(record.symptoms),
    lists: withDefaults(record, defaults.lists),
    // Records rarely carry a blood type ("__unset__" after normalizing): fall back to the patient's.
    bloodType:
      record.bloodType && record.bloodType !== PATIENT_BLOOD_TYPE_UNSET ? record.bloodType : defaults.bloodType,
  }
}

/** Form when the patient has no record yet: empty vitals, the patient's blood type and lists. */
export function formFromDefaults(defaults: PatientDefaults): HealthForm {
  return { ...emptyForm(), bloodType: defaults.bloodType || PATIENT_BLOOD_TYPE_UNSET, lists: defaults.lists }
}

export function bmiOf(height: string, weight: string): string {
  const h = parseFloat(height)
  const w = parseFloat(weight)
  if (!h || !w || h <= 0) return "N/A"
  return (w / ((h / 100) ** 2)).toFixed(1)
}

/** Body of create / update health info. */
export function toHealthInfoPayload(form: HealthForm) {
  const int = (v: string) => (v ? parseInt(v, 10) : undefined)
  const float = (v: string) => (v ? parseFloat(v) : undefined)
  const bloodType = bloodTypeForApiPayload(form.bloodType)
  return {
    height: float(form.height),
    weight: float(form.weight),
    bloodPressureSys: int(form.bpSys),
    bloodPressureDia: int(form.bpDia),
    heartRate: int(form.heartRate),
    respiratoryRate: int(form.respiratoryRate),
    temperature: float(form.temperature),
    spo2: int(form.spo2),
    ...(bloodType !== undefined ? { bloodType } : {}),
    currentSymptoms: serializeSymptomEntries(form.symptoms),
    ...form.lists,
    updatedBy: "Doctor",
  }
}
