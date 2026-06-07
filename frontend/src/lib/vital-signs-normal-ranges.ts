/** Typical adult reference ranges for health trend charts (resting / room air). */
export const VITAL_CHART_NORMAL_RANGES = {
  systolic: { min: 90, max: 120 },
  diastolic: { min: 60, max: 80 },
  spo2: { min: 95, max: 100 },
  respiratoryRate: { min: 12, max: 20 },
  heartRate: { min: 60, max: 100 },
  bmi: { min: 18.5, max: 24.9 },
} as const

export type VitalChartNormalMetric = keyof typeof VITAL_CHART_NORMAL_RANGES
export type VitalNormalBounds = { min: number; max: number }

export const VITAL_IN_RANGE_COLOR = { stroke: "#16a34a", fill: "#22c55e" }
export const VITAL_OUT_RANGE_COLOR = { stroke: "#dc2626", fill: "#ef4444" }
export const VITAL_NEUTRAL_LINE = "#94a3b8"

export function isWithinNormalRange(value: number, range: VitalNormalBounds): boolean {
  return Number.isFinite(value) && value >= range.min && value <= range.max
}

export function vitalStatusColor(inRange: boolean) {
  return inRange ? VITAL_IN_RANGE_COLOR : VITAL_OUT_RANGE_COLOR
}
