import type { LabTestDetail } from "@/services/doctor-service"
import { buildLabDetailMap, normalizeLabMetricKey, resolveLabMetricKey } from "@/lib/lab-metric-eval"

export type BloodTestMetricDef = {
  label: string
  keys: string[]
  refMale?: string
  refFemale?: string
  refCommon?: string
}

export const BLOOD_TEST_LEFT: BloodTestMetricDef[] = [
  { label: "Urê", keys: ["ure", "urea"], refCommon: "2.5 - 7.5 mmol/L" },
  { label: "Glucose", keys: ["glucose", "glucozo"], refCommon: "3.9 - 6.4 mmol/L" },
  { label: "Creatinin", keys: ["creatinin", "creatinine"], refMale: "62 - 120 umol/L", refFemale: "53 - 100 umol/L" },
  { label: "Acid Uric", keys: ["aciduric", "uricacid"], refMale: "180 - 420 umol/L", refFemale: "150 - 360 umol/L" },
  { label: "Bilirubin T.P", keys: ["bilirubintp", "totalbilirubin"], refCommon: "≤ 17 umol/L" },
  { label: "Bilirubin T.T", keys: ["bilirubintt", "directbilirubin"], refCommon: "≤ 4.3 umol/L" },
  { label: "Bilirubin G.T", keys: ["bilirubingt", "indirectbilirubin"], refCommon: "≤ 12.7 umol/L" },
  { label: "Protein T.P", keys: ["proteintp"], refCommon: "65 - 82 g/L" },
  { label: "Albumin", keys: ["albumin"], refCommon: "35 - 50 g/L" },
  { label: "Globulin", keys: ["globulin"], refCommon: "24 - 38 g/L" },
  { label: "Tỷ lệ A/G", keys: ["tyleag", "ag"], refCommon: "1.3 - 1.8" },
  { label: "Cholesterol TP", keys: ["totalcholesterol"], refCommon: "≤ 5.2 mmol/L" },
  { label: "Triglyceride", keys: ["triglycerides"], refCommon: "≤ 1.7 mmol/L" },
  { label: "HDL-cho", keys: ["hdlcho", "hdlcholesterol"], refCommon: "≥ 0.9 mmol/L" },
  { label: "LDL-cho", keys: ["ldlcho", "ldlcholesterol"], refCommon: "≤ 3.4 mmol/L" },
  { label: "Na+", keys: ["na+", "sodiumna+"], refCommon: "135 - 145 mmol/L" },
  { label: "K+", keys: ["k+", "potassiumk+"], refCommon: "3.5 - 5.0 mmol/L" },
  { label: "Cl-", keys: ["cl", "chloridecl"], refCommon: "98 - 106 mmol/L" },
  { label: "Calci", keys: ["calci"], refCommon: "2.15 - 2.6 mmol/L" },
  { label: "Calci ion hoá", keys: ["calciionhoa"], refCommon: "1.17 - 1.29 mmol/L" },
]

export const BLOOD_TEST_RIGHT: BloodTestMetricDef[] = [
  { label: "Sắt", keys: ["sat"], refMale: "11 - 27 umol/L", refFemale: "7 - 26 umol/L" },
  { label: "Magiê", keys: ["magie"], refCommon: "0.8 - 1.00 mmol/L" },
  { label: "AST (GOT)", keys: ["astgot", "ast"], refCommon: "≤ 37 U/L" },
  { label: "ALT (GPT)", keys: ["altgpt", "alt"], refCommon: "≤ 40 U/L" },
  { label: "Amylase", keys: ["amylase"], refCommon: "30 - 110 U/L" },
  { label: "CK", keys: ["ck"], refMale: "24 - 190 U/L", refFemale: "24 - 167 U/L" },
  { label: "CK-MB", keys: ["ckmb"], refCommon: "≤ 24 U/L" },
  { label: "LDH", keys: ["ldh"], refCommon: "230 - 460 U/L" },
  { label: "GGT", keys: ["ggt"], refMale: "11 - 50 U/L", refFemale: "7 - 32 U/L" },
  { label: "pH động mạch", keys: ["arterialph"], refCommon: "7.35 - 7.45" },
  { label: "pCO₂", keys: ["pco2"], refCommon: "35 - 45 mmHg" },
  { label: "pO₂", keys: ["po2"], refCommon: "80 - 100 mmHg" },
]

export function getAllBloodTestMetricDefs(): BloodTestMetricDef[] {
  return [...BLOOD_TEST_LEFT, ...BLOOD_TEST_RIGHT]
}

export function getMappedCanonicalKeys(): Set<string> {
  const keys = new Set<string>()
  for (const def of getAllBloodTestMetricDefs()) {
    for (const k of def.keys) {
      keys.add(resolveLabMetricKey(normalizeLabMetricKey(k)))
    }
  }
  return keys
}

/** DB rows not covered by the standard blood-chemistry form (shown after form rows). */
export function getUnmappedLabDetails(details: LabTestDetail[]): LabTestDetail[] {
  const mapped = getMappedCanonicalKeys()
  const seen = new Set<string>()
  const out: LabTestDetail[] = []
  for (const d of details || []) {
    const raw = normalizeLabMetricKey(d.itemIndex)
    if (!raw || raw === "summary") continue
    const canonical = resolveLabMetricKey(raw)
    if (mapped.has(canonical) || seen.has(canonical)) continue
    seen.add(canonical)
    out.push(d)
  }
  return out
}

/**
 * Order lab rows: standard form sequence first, then any extra DB indices.
 * Includes rows that exist in DB; does not insert empty placeholders.
 */
export function orderLabDetailsForDisplay(details: LabTestDetail[]): LabTestDetail[] {
  const map = buildLabDetailMap(details || [])
  const ordered: LabTestDetail[] = []
  const used = new Set<string>()

  for (const def of getAllBloodTestMetricDefs()) {
    const match = def.keys
      .map((k) => map.get(resolveLabMetricKey(normalizeLabMetricKey(k))))
      .find(Boolean)
    if (!match) continue
    const canonical = resolveLabMetricKey(normalizeLabMetricKey(match.itemIndex))
    if (used.has(canonical)) continue
    used.add(canonical)
    ordered.push(match)
  }

  for (const d of getUnmappedLabDetails(details || [])) {
    const canonical = resolveLabMetricKey(normalizeLabMetricKey(d.itemIndex))
    if (used.has(canonical)) continue
    used.add(canonical)
    ordered.push(d)
  }

  return ordered
}

export function chooseBloodTestRef(def: BloodTestMetricDef, gender: string): string {
  const g = String(gender || "").toUpperCase()
  if (g === "M") return def.refMale || def.refCommon || ""
  if (g === "F") return def.refFemale || def.refCommon || ""
  return def.refCommon || def.refMale || def.refFemale || ""
}
