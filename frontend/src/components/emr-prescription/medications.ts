import type { MedicineOption, Prescription as ApiPrescription } from "@/services/doctor-service"

export type Medication = {
  name: string
  quantity: string
  unit: string
  /** Days of use (PRESCRIPTION_DETAIL.duration). */
  duration: string
  usage: string
  note?: string
}

export type UiPrescription = {
  /** "new" for the unsaved draft. */
  id: string
  /** ISO from the API; "" for the draft. */
  createdAt: string
  date: string
  doctor: string
  medications: Medication[]
  byt?: ApiPrescription["byt"]
  isDraft?: boolean
}

export const DEFAULT_DURATION = "7"

/** DB unit label, lower-cased ("tablet", "vial", "ml"…); "tablet" when missing. */
export function normalizeMedicationUnit(raw: string | null | undefined): string {
  return String(raw || "").trim().toLowerCase() || "tablet"
}

export const emptyMed = (): Medication => ({
  name: "",
  quantity: "",
  unit: "tablet",
  duration: DEFAULT_DURATION,
  usage: "",
  note: "",
})

export const isEmptyMedication = (med: Medication) => !med.name && !med.quantity && !med.usage && !med.note

export function resolveLocaleTag(lang: string | undefined): string {
  return lang?.toLowerCase().startsWith("vi") ? "vi-VN" : "en-US"
}

export function formatDt(iso: string, localeTag: string) {
  try {
    return new Date(iso).toLocaleString(localeTag)
  } catch {
    return iso
  }
}

export function formatHistoryTableDate(iso: string, localeTag: string, notAvailable: string) {
  if (!iso) return notAvailable
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return iso
    const date = d.toLocaleDateString(localeTag, { day: "2-digit", month: "2-digit", year: "2-digit" })
    const time = d.toLocaleTimeString(localeTag, { hour: "2-digit", minute: "2-digit", hour12: false })
    return `${date} ${time}`
  } catch {
    return iso
  }
}

export function formatGenderVi(g: string | null | undefined): string {
  const s = String(g ?? "").trim().toUpperCase()
  if (s === "M" || s === "MALE") return "Nam"
  if (s === "F" || s === "FEMALE") return "Nữ"
  if (!s) return ""
  return g ?? ""
}

export function formatDiagnosisLine(d: { icd10?: string; interpretation?: string } | null | undefined, fallback: string): string {
  if (!d) return fallback
  const parts = [d.icd10, d.interpretation].map((s) => String(s ?? "").trim()).filter(Boolean)
  return parts.length > 0 ? parts.join(" — ") : fallback
}

export function toUiPrescription(p: ApiPrescription, localeTag: string): UiPrescription {
  return {
    id: String(p.id),
    createdAt: p.createdAt,
    date: formatDt(p.createdAt, localeTag),
    doctor: p.doctorName,
    byt: p.byt,
    medications: (p.medications || []).map((m) => ({
      name: m.name,
      quantity: m.quantity || "",
      unit: normalizeMedicationUnit(m.unit),
      duration: m.duration != null && String(m.duration).trim() !== "" ? String(m.duration).trim() : DEFAULT_DURATION,
      usage: m.usage || "",
      note: m.note || "",
    })),
    isDraft: false,
  }
}

// ── Draft rows: the last row is always the blank one where the next medicine is typed. ──

const isLast = (meds: Medication[], index: number) => index === meds.length - 1

/** Typing a name into the blank last row adds a new blank row. */
export function setMedicationField(meds: Medication[], index: number, field: keyof Medication, value: string): Medication[] {
  const updated = meds.map((m, i) => (i === index ? { ...m, [field]: value } : m))
  return isLast(meds, index) && field === "name" && value.trim() !== "" ? [...updated, emptyMed()] : updated
}

/** A catalogue pick sets the name and the catalogue unit. */
export function applyPickedMedicine(meds: Medication[], index: number, m: MedicineOption): Medication[] {
  const updated = meds.map((old, i) => (i === index ? { ...old, name: m.name, unit: normalizeMedicationUnit(m.unit) } : old))
  return isLast(meds, index) && m.name.trim() !== "" ? [...updated, emptyMed()] : updated
}

export function removeMedication(meds: Medication[], index: number): Medication[] {
  return isLast(meds, index) ? meds : meds.filter((_, i) => i !== index)
}

/** Leaving an emptied row (not the blank last one) removes it. */
export function dropRowIfEmpty(meds: Medication[], index: number): Medication[] {
  return !isLast(meds, index) && isEmptyMedication(meds[index]) ? meds.filter((_, i) => i !== index) : meds
}

export function draftFrom(meds: Medication[]): Medication[] {
  return [
    ...meds.map((m) => ({
      name: m.name || "",
      quantity: m.quantity || "",
      unit: m.unit || "tablet",
      duration: m.duration?.trim() || DEFAULT_DURATION,
      usage: m.usage || "",
      note: m.note || "",
    })),
    emptyMed(),
  ]
}

export type AiSuggestion = {
  name?: string
  quantity?: string | number
  unit?: string
  duration?: string | number | null
  usage?: string
  note?: string
}

/** AI suggestions as draft rows; a missing or < 1 day duration becomes the default. */
export function draftFromSuggestions(suggestions: AiSuggestion[]): Medication[] {
  return [
    ...suggestions.map((s) => {
      const durRaw = s.duration != null ? String(s.duration).trim() : ""
      return {
        name: s.name || "",
        quantity: String(s.quantity || ""),
        unit: normalizeMedicationUnit(s.unit),
        duration: durRaw !== "" && Number.parseInt(durRaw, 10) >= 1 ? durRaw : DEFAULT_DURATION,
        usage: s.usage || "",
        note: s.note || "",
      }
    }),
    emptyMed(),
  ]
}

export type SavedMedication = { name: string; quantity: string; unit: string; duration: string; usage: string; note?: string }

/** Lines to save, or the message for the first problem. */
export function validateDraft(meds: Medication[]): { lines: SavedMedication[] } | { error: string } {
  const lines = meds
    .filter((m) => !isEmptyMedication(m))
    .map((m) => ({
      name: m.name.trim(),
      quantity: m.quantity.trim(),
      unit: m.unit,
      duration: String(m.duration ?? "").trim() || DEFAULT_DURATION,
      usage: String(m.usage ?? "").trim(),
      ...(m.note?.trim() ? { note: m.note.trim() } : {}),
    }))
  if (lines.length === 0 || !lines.some((m) => m.name)) return { error: "Add at least one medication with a name" }
  const invalid = lines.findIndex((m) => !m.name || !m.quantity || !m.usage)
  if (invalid !== -1) return { error: `Please complete Medication, Qty, and Usage on row ${invalid + 1}` }
  return { lines }
}

/** MEDICAL_PRESCRIPTION.duration: the longest line, in whole days (unreadable lines count as 7). */
export function prescriptionDuration(lines: SavedMedication[]): number {
  return Math.max(
    ...lines.map((m) => {
      const n = parseInt(String(m.duration), 10)
      return Number.isFinite(n) && n >= 1 ? n : 7
    }),
    1,
  )
}

/** Medications of the selected prescription (the draft's filled rows when it is the draft). */
export function medicationsToExport(rx: UiPrescription | null, draft: Medication[]): Medication[] {
  if (!rx) return []
  if (rx.isDraft) return draft.filter((m) => !isEmptyMedication(m) && m.name.trim())
  return (rx.medications || []).filter((m) => m.name?.trim())
}
