import type { SymptomInput } from "@/types/ai-types"

export const COMMON_SYMPTOM_KEYS = [
  "fever",
  "cough",
  "soreThroat",
  "shortnessOfBreath",
  "chestPain",
  "headache",
  "fatigue",
  "nausea",
] as const

export type CommonSymptomKey = (typeof COMMON_SYMPTOM_KEYS)[number]

export const COMMON_SYMPTOM_API_NAMES: Record<CommonSymptomKey, string> = {
  fever: "Fever",
  cough: "Cough",
  soreThroat: "Sore Throat",
  shortnessOfBreath: "Shortness of Breath",
  chestPain: "Chest Pain",
  headache: "Headache",
  fatigue: "Fatigue",
  nausea: "Nausea",
}

export const SYMPTOM_SEVERITY_VALUES = ["mild", "moderate", "severe"] as const
export const SYMPTOM_DURATION_VALUES = [
  "less24h",
  "1to3days",
  "3to7days",
  "moreThanWeek",
] as const

export type SymptomSeverity = (typeof SYMPTOM_SEVERITY_VALUES)[number]
export type SymptomDuration = (typeof SYMPTOM_DURATION_VALUES)[number]

export type SelectedSymptomInput = {
  name: string
  severity: SymptomSeverity
  duration: SymptomDuration
}

export const MIN_CUSTOM_SYMPTOM_LENGTH = 2
export const MAX_SYMPTOM_NAME_LENGTH = 80

const FUZZY_MAX_DISTANCE = 2

export function isCommonSymptomKey(id: string): id is CommonSymptomKey {
  return (COMMON_SYMPTOM_KEYS as readonly string[]).includes(id)
}

/** Strip diacritics and lowercase for alias / fuzzy matching. */
export function stripForSymptomMatch(value: string): string {
  return String(value || "")
    .normalize("NFC")
    .replace(/đ/gi, "d")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9+\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

/** Clean display / storage text (keeps diacritics). */
export function normalizeSymptomText(raw: string): string {
  return String(raw || "")
    .normalize("NFC")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, MAX_SYMPTOM_NAME_LENGTH)
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length
  const rows = a.length + 1
  const cols = b.length + 1
  const matrix: number[][] = Array.from({ length: rows }, () => Array(cols).fill(0))
  for (let i = 0; i < rows; i++) matrix[i][0] = i
  for (let j = 0; j < cols; j++) matrix[0][j] = j
  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      )
    }
  }
  return matrix[rows - 1][cols - 1]
}

/** Normalized alias -> canonical preset key (EN + VI variants). */
export const SYMPTOM_ALIASES: Record<string, CommonSymptomKey> = {
  fever: "fever",
  sot: "fever",
  hot: "fever",
  cough: "cough",
  ho: "cough",
  coughing: "cough",
  sorethroat: "soreThroat",
  sore: "soreThroat",
  throatpain: "soreThroat",
  dauhong: "soreThroat",
  shortnessofbreath: "shortnessOfBreath",
  shortofbreath: "shortnessOfBreath",
  breathless: "shortnessOfBreath",
  dyspnea: "shortnessOfBreath",
  khot: "shortnessOfBreath",
  "kho tho": "shortnessOfBreath",
  chestpain: "chestPain",
  chest: "chestPain",
  daunguc: "chestPain",
  "dau nguc": "chestPain",
  headache: "headache",
  headpain: "headache",
  "dau dau": "headache",
  daudau: "headache",
  fatigue: "fatigue",
  tired: "fatigue",
  tiredness: "fatigue",
  exhaustion: "fatigue",
  "met moi": "fatigue",
  metmoi: "fatigue",
  nausea: "nausea",
  vomit: "nausea",
  vomiting: "nausea",
  "buon non": "nausea",
  buonnon: "nausea",
}

const PRESET_MATCH_LABELS: Record<CommonSymptomKey, string> = {
  fever: "fever",
  cough: "cough",
  soreThroat: "sore throat",
  shortnessOfBreath: "shortness of breath",
  chestPain: "chest pain",
  headache: "headache",
  fatigue: "fatigue",
  nausea: "nausea",
}

export type SymptomResolveResult =
  | { kind: "preset"; key: CommonSymptomKey; cleaned: string }
  | { kind: "suggest"; key: CommonSymptomKey; cleaned: string; score: number }
  | { kind: "custom"; cleaned: string }

function resolveAlias(matchKey: string): CommonSymptomKey | null {
  if (isCommonSymptomKey(matchKey)) return matchKey
  return SYMPTOM_ALIASES[matchKey] ?? null
}

function findFuzzyPresetKey(
  matchKey: string
): { key: CommonSymptomKey; score: number } | null {
  let bestKey: CommonSymptomKey | null = null
  let bestScore = Number.POSITIVE_INFINITY

  const candidates: Array<{ key: CommonSymptomKey; label: string }> = []
  for (const key of COMMON_SYMPTOM_KEYS) {
    candidates.push({ key, label: PRESET_MATCH_LABELS[key] })
  }
  for (const [alias, key] of Object.entries(SYMPTOM_ALIASES)) {
    candidates.push({ key, label: alias })
  }

  for (const { key, label } of candidates) {
    const dist = levenshtein(matchKey, label)
    const lenOk = Math.abs(matchKey.length - label.length) <= 3
    if (dist > 0 && dist <= FUZZY_MAX_DISTANCE && lenOk && dist < bestScore) {
      bestScore = dist
      bestKey = key
    }
  }

  if (bestKey == null) return null
  return { key: bestKey, score: bestScore }
}

export function resolveSymptomText(raw: string): SymptomResolveResult {
  const cleaned = normalizeSymptomText(raw)
  if (!cleaned) return { kind: "custom", cleaned: "" }

  const matchKey = stripForSymptomMatch(cleaned)
  if (!matchKey) return { kind: "custom", cleaned }

  const aliasHit = resolveAlias(matchKey)
  if (aliasHit) {
    return { kind: "preset", key: aliasHit, cleaned }
  }

  const fuzzyHit = findFuzzyPresetKey(matchKey)
  if (fuzzyHit) {
    return { kind: "suggest", key: fuzzyHit.key, cleaned, score: fuzzyHit.score }
  }

  return { kind: "custom", cleaned }
}

export function symptomApiName(id: string): string {
  if (isCommonSymptomKey(id)) return COMMON_SYMPTOM_API_NAMES[id]
  const preset = resolveAlias(stripForSymptomMatch(id))
  if (preset) return COMMON_SYMPTOM_API_NAMES[preset]
  return normalizeSymptomText(id)
}

function symptomDedupeKey(name: string): string {
  if (isCommonSymptomKey(name)) return `preset:${name}`
  const alias = resolveAlias(stripForSymptomMatch(name))
  if (alias) return `preset:${alias}`
  return `custom:${stripForSymptomMatch(name)}`
}

function isValidSeverity(value: string): value is SymptomSeverity {
  return (SYMPTOM_SEVERITY_VALUES as readonly string[]).includes(value)
}

function isValidDuration(value: string): value is SymptomDuration {
  return (SYMPTOM_DURATION_VALUES as readonly string[]).includes(value)
}

/** Normalize and dedupe symptoms for the AI API payload. */
export function normalizeSymptomsForAi(items: SelectedSymptomInput[]): SymptomInput[] {
  const byKey = new Map<string, SymptomInput>()

  for (const item of items) {
    if (!isValidSeverity(item.severity) || !isValidDuration(item.duration)) continue
    const name = symptomApiName(item.name)
    if (!name || name.length < MIN_CUSTOM_SYMPTOM_LENGTH) continue
    const key = symptomDedupeKey(item.name)
    byKey.set(key, {
      name,
      severity: item.severity,
      duration: item.duration,
    })
  }

  return [...byKey.values()]
}
