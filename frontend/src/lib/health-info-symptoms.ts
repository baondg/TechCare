import type { SymptomInput } from "@/types/ai-types"
import { formatSymptomCheckerBlock, mergeHealthInfoSymptomText } from "@/lib/symptom-checker-persist-health"

export type SymptomSeverity = SymptomInput["severity"]
export type SymptomDuration = SymptomInput["duration"]

export type SymptomEntry = {
  id: string
  name: string
  severity: SymptomSeverity | ""
  duration: SymptomDuration | ""
}

export const SYMPTOM_SEVERITY_VALUES: readonly SymptomSeverity[] = ["mild", "moderate", "severe"] as const
export const SYMPTOM_DURATION_VALUES: readonly SymptomDuration[] = [
  "less24h",
  "1to3days",
  "3to7days",
  "moreThanWeek",
] as const

const DURATION_LABEL_EN: Record<SymptomDuration, string> = {
  less24h: "< 24h",
  "1to3days": "1-3 days",
  "3to7days": "3-7 days",
  moreThanWeek: "> 1 week",
}

function newEntryId(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `sym-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export function createEmptySymptomEntry(): SymptomEntry {
  return { id: newEntryId(), name: "", severity: "", duration: "" }
}

function parseSeverity(raw: string): SymptomSeverity | "" {
  const s = raw.trim().toLowerCase()
  if (s === "mild" || s === "moderate" || s === "severe") return s
  return ""
}

function parseDuration(raw: string): SymptomDuration | "" {
  const t = raw.trim()
  const byKey = SYMPTOM_DURATION_VALUES.find((k) => k.toLowerCase() === t.toLowerCase())
  if (byKey) return byKey
  const byLabel = (Object.entries(DURATION_LABEL_EN) as [SymptomDuration, string][]).find(
    ([, label]) => label.toLowerCase() === t.toLowerCase()
  )
  if (byLabel?.[0]) return byLabel[0]
  // Legacy labels from symptom-checker (en-dash)
  const normalized = t.replace(/\u2013/g, "-")
  const byLegacy = (Object.entries(DURATION_LABEL_EN) as [SymptomDuration, string][]).find(
    ([, label]) => label.toLowerCase() === normalized.toLowerCase()
  )
  return byLegacy?.[0] ?? ""
}

/** Parse stored Health Info symptom text into editable rows. */
export function parseHealthInfoSymptoms(text: string): SymptomEntry[] {
  const cleaned = (text || "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => {
      if (!line) return false
      if (/^\[Symptom checker - .+\]$/i.test(line)) return false
      if (/^\[Symptom checker \u2014 .+\]$/i.test(line)) return false
      if (/^Demo vitals\s+[-\u2013\u2014]\s+routine tracking$/i.test(line)) return false
      return true
    })

  const entries: SymptomEntry[] = []
  for (const line of cleaned) {
    const structured = line.match(/^-\s*(.+?):\s*([^;]+);\s*(.+)$/)
    if (structured) {
      entries.push({
        id: newEntryId(),
        name: structured[1].trim(),
        severity: parseSeverity(structured[2]),
        duration: parseDuration(structured[3]),
      })
      continue
    }
    if (line.startsWith("- ")) {
      entries.push({ id: newEntryId(), name: line.slice(2).trim(), severity: "", duration: "" })
      continue
    }
    entries.push({ id: newEntryId(), name: line, severity: "", duration: "" })
  }

  return entries.length > 0 ? entries : [createEmptySymptomEntry()]
}

export function serializeSymptomEntries(entries: SymptomEntry[]): string {
  const filled = entries
    .map((e) => ({
      name: e.name.trim(),
      severity: e.severity,
      duration: e.duration,
    }))
    .filter((e) => e.name)

  if (!filled.length) return ""

  return formatSymptomCheckerBlock(
    filled.map((e) => ({
      name: e.name,
      severity: e.severity || "moderate",
      duration: e.duration || "1to3days",
    }))
  )
}

export function mergeSymptomEntryLists(existingText: string, entries: SymptomEntry[]): string {
  const block = serializeSymptomEntries(entries)
  if (!block) return existingText
  return mergeHealthInfoSymptomText(existingText, block)
}
