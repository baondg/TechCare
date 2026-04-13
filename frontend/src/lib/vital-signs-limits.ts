export type VitalNumericField =
  | "bpSys"
  | "bpDia"
  | "spo2"
  | "temperature"
  | "height"
  | "weight"
  | "respiratoryRate"
  | "heartRate"

const LIMITS: Record<
  VitalNumericField,
  { min: number; max: number; label: string; unit: string; note: string; decimals?: number }
> = {
  bpSys: { min: 40, max: 250, label: "Systolic blood pressure", unit: "mmHg", note: "Top number" },
  bpDia: { min: 30, max: 150, label: "Diastolic blood pressure", unit: "mmHg", note: "Bottom number" },
  spo2: { min: 50, max: 100, label: "SpO₂", unit: "%", note: "Cannot exceed 100%" },
  temperature: {
    min: 34.0,
    max: 42.5,
    label: "Body temperature",
    unit: "°C",
    note: "Below 35 °C is hypothermia",
    decimals: 1,
  },
  height: { min: 30, max: 250, label: "Height", unit: "cm", note: "Suitable for children and adults" },
  weight: { min: 1, max: 300, label: "Weight", unit: "kg", note: "Needed for medication dosing" },
  respiratoryRate: {
    min: 8,
    max: 60,
    label: "Respiratory rate",
    unit: "breaths/min",
    note: "Breaths per minute",
  },
  heartRate: { min: 30, max: 220, label: "Heart rate", unit: "bpm", note: "Beats per minute" },
}

function parseUserNumber(raw: string): "empty" | "invalid" | { n: number } {
  const t = raw.trim().replace(",", ".")
  if (t === "") return "empty"
  const n = Number(t)
  if (!Number.isFinite(n)) return "invalid"
  return { n }
}

function formatBound(field: VitalNumericField, value: number): string {
  const dec = LIMITS[field].decimals
  if (dec != null) return value.toFixed(dec)
  return String(value)
}

/** `null` = empty or in range */
export function vitalNumericError(field: VitalNumericField, raw: string): string | null {
  const parsed = parseUserNumber(raw)
  if (parsed === "empty") return null
  if (parsed === "invalid") return "Invalid value."
  const { min, max, label, unit, note } = LIMITS[field]
  const { n } = parsed
  if (n < min || n > max) {
    const minStr = formatBound(field, min)
    const maxStr = formatBound(field, max)
    return `${label} must be between ${minStr} and ${maxStr} ${unit}. Note: ${note}.`
  }
  return null
}

/** English copy for bottom-left pauseable toast (e.g. prescription page pattern). */
export function formatVitalValidationErrorToast(messages: string[]): string {
  const lead =
    "Save unsuccessful. One or more vital values are invalid—correct the fields with red warnings below."
  if (messages.length === 0) return lead
  return `${lead} ${messages.join(" ")}`
}

export function vitalMainFormErrorMessages(state: {
  height: string
  weight: string
  bpSys: string
  bpDia: string
  heartRate: string
  respiratoryRate: string
  temperature: string
  spo2: string
}): string[] {
  const out: string[] = []
  const push = (m: string | null) => {
    if (m) out.push(m)
  }
  push(vitalNumericError("height", state.height))
  push(vitalNumericError("weight", state.weight))
  push(vitalNumericError("bpSys", state.bpSys))
  push(vitalNumericError("bpDia", state.bpDia))
  push(vitalNumericError("heartRate", state.heartRate))
  push(vitalNumericError("respiratoryRate", state.respiratoryRate))
  push(vitalNumericError("temperature", state.temperature))
  push(vitalNumericError("spo2", state.spo2))
  return out
}
