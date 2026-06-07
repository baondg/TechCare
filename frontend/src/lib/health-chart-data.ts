import type { HealthChartPoint } from "@/components/patient-health-charts"

/** Compact local date label for chart X-axis (DD-MM). */
export function formatHealthChartAxisLabel(date: Date): string {
  const day = String(date.getDate()).padStart(2, "0")
  const month = String(date.getMonth() + 1).padStart(2, "0")
  return `${day}-${month}`
}

type HealthRecordLike = {
  updatedAt: Date
  bloodPressure: string
  heartRate: number
  respiratoryRate: number
  spo2: number
  bmi: number
  weight: number
  height: number
}

/** Build sorted chart points from health info records. */
export function buildHealthChartData(records: HealthRecordLike[]): HealthChartPoint[] {
  return [...records]
    .sort((a, b) => a.updatedAt.getTime() - b.updatedAt.getTime())
    .map((r) => {
      const [sys, dia] = r.bloodPressure.split("/").map(Number)
      const d = r.updatedAt
      return {
        time: formatHealthChartAxisLabel(d),
        timeFull: d.toLocaleString("vi-VN"),
        heartRate: r.heartRate,
        respiratoryRate: r.respiratoryRate,
        spo2: r.spo2,
        systolic: sys,
        diastolic: dia,
        bmi: r.bmi,
        weight: r.weight,
        height: r.height,
      }
    })
}
