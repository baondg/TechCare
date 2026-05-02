import type { LabTestDetail } from "@/services/doctor-service"

export type LabMetricEvalContext = { gender: string | null }

export type LabMetricEvalResult = {
  status: "normal" | "abnormal" | "unknown"
  referenceText: string
  abnormal: boolean
}

type RefRange = {
  min?: number
  max?: number
  note?: string
}

/** Same normalization as PDF export / lab pages (strip diacritics, keep +). */
export function normalizeLabMetricKey(raw: string): string {
  return String(raw || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9+]/g, "")
}

/**
 * Map noisy `index` labels from TEST_DETAIL to the canonical keys used in reference tables.
 * Example: "Protein T" → proteint → proteintp; "Natri" → natri → na+.
 */
const LAB_KEY_ALIASES: Record<string, string> = {
  proteint: "proteintp",
  proteintoanphan: "proteintp",
  totalprotein: "proteintp",
  protein: "proteintp",
  natri: "na+",
  sodium: "na+",
  sodiu: "na+",
  kali: "k+",
  potassium: "k+",
  canxi: "calci",
  calcium: "calci",
  clo: "cl",
  chloride: "cl",
  chlorid: "cl",
}

export function resolveLabMetricKey(normalized: string): string {
  return LAB_KEY_ALIASES[normalized] ?? normalized
}

function parseFirstNumeric(raw: string): number | null {
  const s = String(raw || "")
    .trim()
    .replace(/,/g, ".")
    .replace(/^<=|^>=|^≤|^≥|^<|^>|^=/i, "")
    .trim()
  const m = s.match(/-?\d+(\.\d+)?/)
  if (!m) return null
  const n = Number(m[0])
  return Number.isFinite(n) ? n : null
}

/** Parses a number from textual `TEST_DETAIL.result` (no DB numeric column). */
export function parseLabNumericValue(detail: LabTestDetail): number | null {
  return parseFirstNumeric(detail.result ?? "")
}

export function getLabReferenceRange(indexName: string, ctx: LabMetricEvalContext): RefRange | null {
  const key = resolveLabMetricKey(normalizeLabMetricKey(indexName))
  const sex = String(ctx.gender || "").toUpperCase()

  if (key === "glucose" || key === "glucozo") return { min: 3.9, max: 5.6, note: "mmol/L" }
  if (key === "aciduric") return sex === "F" ? { min: 150, max: 360, note: "umol/L" } : { min: 210, max: 420, note: "umol/L" }
  if (key === "bilirubintp") return { min: 5, max: 21, note: "umol/L" }
  if (key === "bilirubintt") return { min: 0, max: 5, note: "umol/L" }
  if (key === "bilirubingt") return { min: 0, max: 16, note: "umol/L" }
  if (key === "proteintp") return { min: 64, max: 83, note: "g/L" }
  if (key === "albumin") return { min: 35, max: 50, note: "g/L" }
  if (key === "globulin") return { min: 20, max: 35, note: "g/L" }
  if (key === "tyleag" || key === "ag") return { min: 1.1, max: 2.5 }
  if (key === "hdlcho") return sex === "F" ? { min: 1.3, note: "mmol/L" } : { min: 1.0, note: "mmol/L" }
  if (key === "ldlcho") return { min: 0, max: 3.4, note: "mmol/L" }
  if (key === "na+") return { min: 135, max: 145, note: "mmol/L" }
  if (key === "k+") return { min: 3.5, max: 5.1, note: "mmol/L" }
  if (key === "cl") return { min: 98, max: 107, note: "mmol/L" }
  if (key === "calci") return { min: 2.1, max: 2.6, note: "mmol/L" }
  if (key === "calciionhoa") return { min: 1.12, max: 1.32, note: "mmol/L" }
  if (key === "ggt") return sex === "F" ? { min: 6, max: 42, note: "U/L" } : { min: 10, max: 71, note: "U/L" }
  if (key === "amylase") return { min: 30, max: 110, note: "U/L" }
  if (key === "sat") return sex === "F" ? { min: 9, max: 30, note: "umol/L" } : { min: 11, max: 30, note: "umol/L" }
  if (key === "magie") return { min: 0.66, max: 1.07, note: "mmol/L" }

  return null
}

export function evaluateLabMetric(detail: LabTestDetail, ctx: LabMetricEvalContext): LabMetricEvalResult {
  const ref = getLabReferenceRange(detail.itemIndex, ctx)
  const value = parseLabNumericValue(detail)
  if (!ref || value === null || Number.isNaN(value)) {
    return { status: "unknown", referenceText: "N/A", abnormal: false }
  }

  const low = ref.min !== undefined && value < ref.min
  const high = ref.max !== undefined && value > ref.max
  const abnormal = low || high
  const status = abnormal ? "abnormal" : "normal"

  const minText = ref.min !== undefined ? String(ref.min) : "-∞"
  const maxText = ref.max !== undefined ? String(ref.max) : "+∞"
  const referenceText = `${minText} - ${maxText}${ref.note ? ` ${ref.note}` : ""}`

  return { status, referenceText, abnormal }
}
