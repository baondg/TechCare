"use client"

import type { ReactNode } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Activity } from "lucide-react"
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import type { TooltipContentProps } from "recharts"
import { useTranslation } from "react-i18next"
import {
  isWithinNormalRange,
  VITAL_CHART_NORMAL_RANGES,
  VITAL_IN_RANGE_COLOR,
  VITAL_NEUTRAL_LINE,
  VITAL_OUT_RANGE_COLOR,
  vitalStatusColor,
  type VitalNormalBounds,
} from "@/lib/vital-signs-normal-ranges"

export type HealthChartPoint = {
  time: string
  timeFull: string
  heartRate: number
  respiratoryRate: number
  spo2: number
  systolic: number
  diastolic: number
  bmi: number
  weight: number
  height: number
}

const CHART_HEIGHT = 240
const CHART_MARGIN = { top: 12, right: 12, left: -8, bottom: 4 }
const AXIS_TICK = { fontSize: 11, fill: "#64748b" }
const NORMAL_RANGE_STROKE = "#3b82f6"
const NORMAL_RANGE_FILL = "#93c5fd"

function VitalNormalRange({
  min,
  max,
  fill = NORMAL_RANGE_FILL,
  stroke = NORMAL_RANGE_STROKE,
}: {
  min: number
  max: number
  fill?: string
  stroke?: string
}) {
  return (
    <>
      <ReferenceArea y1={min} y2={max} fill={fill} fillOpacity={0.35} strokeOpacity={0} />
      <ReferenceLine y={min} stroke={stroke} strokeDasharray="5 5" strokeWidth={1} />
      <ReferenceLine y={max} stroke={stroke} strokeDasharray="5 5" strokeWidth={1} />
    </>
  )
}

function renderVitalDot(range: VitalNormalBounds, dataKey: string) {
  return (props: { cx?: number; cy?: number; payload?: ChartPayload }) => {
    const { cx, cy, payload } = props
    if (cx == null || cy == null || !payload) return null
    const raw = payload[dataKey]
    const value = typeof raw === "number" ? raw : Number(raw)
    if (!Number.isFinite(value)) return null
    const colors = vitalStatusColor(isWithinNormalRange(value, range))
    return <circle cx={cx} cy={cy} r={3.5} fill={colors.fill} stroke={colors.stroke} strokeWidth={1.5} />
  }
}

type ChartPayload = { timeFull?: string; [key: string]: unknown }

function computeStats(data: HealthChartPoint[], key: keyof HealthChartPoint) {
  const values = data
    .map((row) => row[key])
    .filter((v): v is number => typeof v === "number" && Number.isFinite(v))
  if (!values.length) return { peak: 0, lowest: 0, latest: 0 }
  return {
    peak: Math.max(...values),
    lowest: Math.min(...values),
    latest: values[values.length - 1] ?? 0,
  }
}

function ChartStatsRow({
  peak,
  lowest,
  latest,
  peakLabel,
  lowestLabel,
  latestLabel,
  unit = "",
  format = (n: number) => String(n),
  latestInRange = null,
  seriesLabel,
}: {
  peak: number
  lowest: number
  latest: number
  peakLabel: string
  lowestLabel: string
  latestLabel: string
  unit?: string
  format?: (n: number) => string
  latestInRange?: boolean | null
  seriesLabel?: string
}) {
  const latestClass =
    latestInRange === null
      ? "text-slate-900"
      : latestInRange
        ? "text-green-600"
        : "text-red-600"

  const cols = seriesLabel ? "grid-cols-4" : "grid-cols-3"

  return (
    <div className={`grid ${cols} rounded-md border border-slate-200 bg-white px-2 py-1.5 text-center text-[11px]`}>
      {seriesLabel ? (
        <div className="flex items-center justify-start text-left font-medium text-slate-600">
          {seriesLabel}
        </div>
      ) : null}
      <div>
        <div className="text-slate-500">{peakLabel}</div>
        <div className="font-semibold tabular-nums text-slate-900">
          {format(peak)}
          {unit}
        </div>
      </div>
      <div>
        <div className="text-slate-500">{lowestLabel}</div>
        <div className="font-semibold tabular-nums text-slate-900">
          {format(lowest)}
          {unit}
        </div>
      </div>
      <div>
        <div className="text-slate-500">{latestLabel}</div>
        <div className={`font-semibold tabular-nums ${latestClass}`}>
          {format(latest)}
          {unit}
        </div>
      </div>
    </div>
  )
}

function formatBloodPressurePair(sys: number, dia: number) {
  return `${sys}/${dia}`
}

function BloodPressureStatsFooter({
  sysStats,
  diaStats,
  statLabels,
  sysLatestInRange,
  diaLatestInRange,
}: {
  sysStats: { peak: number; lowest: number; latest: number }
  diaStats: { peak: number; lowest: number; latest: number }
  statLabels: { peak: string; lowest: string; latest: string }
  sysLatestInRange: boolean
  diaLatestInRange: boolean
}) {
  const latestInRange = sysLatestInRange && diaLatestInRange
  const latestClass = latestInRange ? "text-green-600" : "text-red-600"

  return (
    <div className="mt-2 grid grid-cols-3 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-center text-[11px]">
      <div>
        <div className="text-slate-500">{statLabels.peak}</div>
        <div className="font-semibold tabular-nums text-slate-900">
          {formatBloodPressurePair(sysStats.peak, diaStats.peak)} mmHg
        </div>
      </div>
      <div>
        <div className="text-slate-500">{statLabels.lowest}</div>
        <div className="font-semibold tabular-nums text-slate-900">
          {formatBloodPressurePair(sysStats.lowest, diaStats.lowest)} mmHg
        </div>
      </div>
      <div>
        <div className="text-slate-500">{statLabels.latest}</div>
        <div className={`font-semibold tabular-nums ${latestClass}`}>
          {formatBloodPressurePair(sysStats.latest, diaStats.latest)} mmHg
        </div>
      </div>
    </div>
  )
}

function MetricTrendCard({
  title,
  description,
  children,
  stats,
  statLabels,
  unit,
  format,
  latestInRange = null,
  chartsOnly = false,
  footer,
}: {
  title: string
  description: string
  children: ReactNode
  stats?: { peak: number; lowest: number; latest: number }
  statLabels?: { peak: string; lowest: string; latest: string }
  unit?: string
  format?: (n: number) => string
  latestInRange?: boolean | null
  chartsOnly?: boolean
  footer?: ReactNode
}) {
  if (chartsOnly) {
    return (
      <div className="h-60 w-full min-w-0 rounded-md border border-slate-200/80 bg-slate-50/40 p-2 shadow-sm">
        {children}
      </div>
    )
  }

  return (
    <Card className="border-slate-200/80 shadow-sm">
      <CardContent className="p-4">
        <div className="mb-3">
          <h3 className="text-base font-semibold text-slate-900">{title}</h3>
          <p className="text-xs text-slate-500">{description}</p>
        </div>
        <div className="h-60 w-full min-w-0 rounded-md border border-slate-200 bg-slate-50/40 p-2">
          {children}
        </div>
        {footer ??
          (stats && statLabels ? (
            <ChartStatsRow
              peak={stats.peak}
              lowest={stats.lowest}
              latest={stats.latest}
              peakLabel={statLabels.peak}
              lowestLabel={statLabels.lowest}
              latestLabel={statLabels.latest}
              unit={unit}
              format={format}
              latestInRange={latestInRange}
            />
          ) : null)}
      </CardContent>
    </Card>
  )
}

function HealthChartsEmptyState() {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/50 px-6 py-16 text-center">
      <Activity className="mb-3 h-10 w-10 text-slate-300" aria-hidden />
      <p className="font-medium text-slate-600">{t("patient.healthInfo.charts.emptyTitle")}</p>
      <p className="mt-1 max-w-sm text-sm text-slate-500">
        {t("patient.healthInfo.charts.emptyDescription")}
      </p>
    </div>
  )
}

function HealthMetricTooltip({
  active,
  payload,
  label,
  unit = "",
  range,
}: Partial<TooltipContentProps<number, string>> & { unit?: string; range?: VitalNormalBounds }) {
  if (!active || !payload?.length) return null
  const row = payload[0]?.payload as ChartPayload | undefined
  const timeLabel = row?.timeFull ?? label
  return (
    <div className="rounded-lg border border-slate-200/80 bg-white/95 px-3 py-2 text-sm shadow-lg backdrop-blur-sm">
      <p className="mb-1.5 text-xs font-medium text-slate-500">{timeLabel}</p>
      <ul className="space-y-1">
        {payload.map((entry) => {
          const value = typeof entry.value === "number" ? entry.value : Number(entry.value)
          const inRange = range && Number.isFinite(value) ? isWithinNormalRange(value, range) : null
          const dotColor =
            inRange === null ? "#64748b" : inRange ? VITAL_IN_RANGE_COLOR.fill : VITAL_OUT_RANGE_COLOR.fill
          const valueClass =
            inRange === null ? "text-slate-900" : inRange ? "text-green-600" : "text-red-600"
          return (
            <li key={String(entry.dataKey)} className="flex items-center justify-between gap-4">
              <span className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: dotColor }} aria-hidden />
                <span className="text-slate-700">{entry.name}</span>
              </span>
              <span className={`font-semibold tabular-nums ${valueClass}`}>
                {entry.value}
                {unit}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function BloodPressureTooltip({ active, payload, label }: Partial<TooltipContentProps<number, string>>) {
  const { t } = useTranslation()
  if (!active || !payload?.length) return null
  const row = payload[0]?.payload as ChartPayload | undefined
  const systolic = payload.find((p) => p.dataKey === "systolic")?.value
  const diastolic = payload.find((p) => p.dataKey === "diastolic")?.value
  const sysValue = typeof systolic === "number" ? systolic : Number(systolic)
  const diaValue = typeof diastolic === "number" ? diastolic : Number(diastolic)
  const sysInRange = Number.isFinite(sysValue)
    ? isWithinNormalRange(sysValue, VITAL_CHART_NORMAL_RANGES.systolic)
    : null
  const diaInRange = Number.isFinite(diaValue)
    ? isWithinNormalRange(diaValue, VITAL_CHART_NORMAL_RANGES.diastolic)
    : null
  const sysColors = sysInRange === null ? null : vitalStatusColor(sysInRange)
  const diaColors = diaInRange === null ? null : vitalStatusColor(diaInRange)
  return (
    <div className="rounded-lg border border-slate-200/80 bg-white/95 px-3 py-2 text-sm shadow-lg backdrop-blur-sm">
      <p className="mb-2 text-xs font-medium text-slate-500">{row?.timeFull ?? label}</p>
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-6">
          <span className="flex items-center gap-2 text-slate-700">
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: sysColors?.fill ?? "#64748b" }}
              aria-hidden
            />
            {t("patient.healthInfo.charts.systolic")}
          </span>
          <span
            className={`font-semibold tabular-nums ${sysInRange === null ? "text-slate-900" : sysInRange ? "text-green-600" : "text-red-600"}`}
          >
            {systolic} mmHg
          </span>
        </div>
        <div className="flex items-center justify-between gap-6">
          <span className="flex items-center gap-2 text-slate-700">
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: diaColors?.fill ?? "#64748b" }}
              aria-hidden
            />
            {t("patient.healthInfo.charts.diastolic")}
          </span>
          <span
            className={`font-semibold tabular-nums ${diaInRange === null ? "text-slate-900" : diaInRange ? "text-green-600" : "text-red-600"}`}
          >
            {diastolic} mmHg
          </span>
        </div>
      </div>
    </div>
  )
}

export function PatientHealthChartsHeader({ selectedCount }: { selectedCount: number }) {
  const { t } = useTranslation()
  return (
    <CardHeader className="pb-3">
      <CardTitle className="text-sm font-semibold text-slate-900">
        {t("patient.healthInfo.charts.title")}
        {selectedCount > 0 && (
          <span className="ml-2 text-xs font-normal text-slate-500">
            {t("patient.healthInfo.charts.selectedCount", { count: selectedCount })}
          </span>
        )}
      </CardTitle>
      <p className="text-[11px] text-slate-500">{t("patient.healthInfo.charts.description")}</p>
      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-slate-500">
        <span className="inline-flex items-center gap-1.5">
          <span
            className="inline-block h-0 w-4 border-t border-dashed border-blue-500"
            aria-hidden
          />
          {t("patient.healthInfo.charts.normalRangeLegend")}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-full bg-green-500" aria-hidden />
          {t("patient.healthInfo.charts.inRangeLegend")}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-full bg-red-500" aria-hidden />
          {t("patient.healthInfo.charts.outOfRangeLegend")}
        </span>
      </div>
    </CardHeader>
  )
}

export function PatientHealthChartsPanel({
  chartData,
  chartsOnly = false,
}: {
  chartData: HealthChartPoint[]
  chartsOnly?: boolean
}) {
  const { t } = useTranslation()

  if (chartData.length === 0) {
    return <HealthChartsEmptyState />
  }

  const statLabels = {
    peak: t("patient.healthInfo.charts.peak"),
    lowest: t("patient.healthInfo.charts.lowest"),
    latest: t("patient.healthInfo.charts.latest"),
  }

  const bpSysStats = computeStats(chartData, "systolic")
  const bpDiaStats = computeStats(chartData, "diastolic")
  const spo2Stats = computeStats(chartData, "spo2")
  const respStats = computeStats(chartData, "respiratoryRate")
  const hrStats = computeStats(chartData, "heartRate")
  const bmiStats = computeStats(chartData, "bmi")
  const weightStats = computeStats(chartData, "weight")

  const cardProps = chartsOnly ? { chartsOnly: true as const } : {}

  const bpSysLatestInRange = isWithinNormalRange(bpSysStats.latest, VITAL_CHART_NORMAL_RANGES.systolic)
  const bpDiaLatestInRange = isWithinNormalRange(bpDiaStats.latest, VITAL_CHART_NORMAL_RANGES.diastolic)
  const spo2LatestInRange = isWithinNormalRange(spo2Stats.latest, VITAL_CHART_NORMAL_RANGES.spo2)
  const respLatestInRange = isWithinNormalRange(respStats.latest, VITAL_CHART_NORMAL_RANGES.respiratoryRate)
  const hrLatestInRange = isWithinNormalRange(hrStats.latest, VITAL_CHART_NORMAL_RANGES.heartRate)
  const bmiLatestInRange = isWithinNormalRange(bmiStats.latest, VITAL_CHART_NORMAL_RANGES.bmi)

  const sysLineColor = vitalStatusColor(bpSysLatestInRange).stroke
  const diaLineColor = vitalStatusColor(bpDiaLatestInRange).stroke
  const spo2LineColor = vitalStatusColor(spo2LatestInRange).stroke
  const respLineColor = vitalStatusColor(respLatestInRange).stroke
  const hrLineColor = vitalStatusColor(hrLatestInRange).stroke
  const bmiLineColor = vitalStatusColor(bmiLatestInRange).stroke

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <MetricTrendCard
        title={t("patient.healthInfo.charts.bloodPressure.title")}
        description={t("patient.healthInfo.charts.bloodPressure.description")}
        footer={
          <BloodPressureStatsFooter
            sysStats={bpSysStats}
            diaStats={bpDiaStats}
            statLabels={statLabels}
            sysLatestInRange={bpSysLatestInRange}
            diaLatestInRange={bpDiaLatestInRange}
          />
        }
        {...cardProps}
      >
        <ResponsiveContainer width="100%" height={CHART_HEIGHT} minWidth={0}>
          <LineChart data={chartData} margin={CHART_MARGIN}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#cbd5e1" />
            <XAxis dataKey="time" tickLine={false} axisLine={false} tick={AXIS_TICK} />
            <YAxis domain={[60, 135]} tickLine={false} axisLine={false} tick={AXIS_TICK} width={36} />
            <Tooltip content={<BloodPressureTooltip />} />
            <VitalNormalRange
              min={VITAL_CHART_NORMAL_RANGES.systolic.min}
              max={VITAL_CHART_NORMAL_RANGES.systolic.max}
            />
            <VitalNormalRange
              min={VITAL_CHART_NORMAL_RANGES.diastolic.min}
              max={VITAL_CHART_NORMAL_RANGES.diastolic.max}
            />
            <Line
              type="monotone"
              dataKey="systolic"
              stroke={sysLineColor}
              strokeWidth={2}
              dot={renderVitalDot(VITAL_CHART_NORMAL_RANGES.systolic, "systolic")}
              activeDot={{ r: 5 }}
              name={t("patient.healthInfo.charts.systolic")}
            />
            <Line
              type="monotone"
              dataKey="diastolic"
              stroke={diaLineColor}
              strokeWidth={2}
              dot={renderVitalDot(VITAL_CHART_NORMAL_RANGES.diastolic, "diastolic")}
              activeDot={{ r: 5 }}
              name={t("patient.healthInfo.charts.diastolic")}
            />
          </LineChart>
        </ResponsiveContainer>
      </MetricTrendCard>

      <MetricTrendCard
        title={t("patient.healthInfo.charts.spo2.title")}
        description={t("patient.healthInfo.charts.spo2.description")}
        stats={spo2Stats}
        statLabels={statLabels}
        unit="%"
        latestInRange={spo2LatestInRange}
        {...cardProps}
      >
        <ResponsiveContainer width="100%" height={CHART_HEIGHT} minWidth={0}>
          <LineChart data={chartData} margin={CHART_MARGIN}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#cbd5e1" />
            <XAxis dataKey="time" tickLine={false} axisLine={false} tick={AXIS_TICK} />
            <YAxis domain={[80, 100]} tickLine={false} axisLine={false} tick={AXIS_TICK} width={36} />
            <Tooltip content={<HealthMetricTooltip unit="%" range={VITAL_CHART_NORMAL_RANGES.spo2} />} />
            <VitalNormalRange
              min={VITAL_CHART_NORMAL_RANGES.spo2.min}
              max={VITAL_CHART_NORMAL_RANGES.spo2.max}
            />
            <Line
              type="monotone"
              dataKey="spo2"
              stroke={spo2LineColor}
              strokeWidth={2}
              dot={renderVitalDot(VITAL_CHART_NORMAL_RANGES.spo2, "spo2")}
              activeDot={{ r: 5 }}
              name={t("patient.healthInfo.charts.series.spo2")}
            />
          </LineChart>
        </ResponsiveContainer>
      </MetricTrendCard>

      <MetricTrendCard
        title={t("patient.healthInfo.charts.respiratory.title")}
        description={t("patient.healthInfo.charts.respiratory.description")}
        stats={respStats}
        statLabels={statLabels}
        unit=" /min"
        latestInRange={respLatestInRange}
        {...cardProps}
      >
        <ResponsiveContainer width="100%" height={CHART_HEIGHT} minWidth={0}>
          <LineChart data={chartData} margin={CHART_MARGIN}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#cbd5e1" />
            <XAxis dataKey="time" tickLine={false} axisLine={false} tick={AXIS_TICK} />
            <YAxis domain={[10, 30]} tickLine={false} axisLine={false} tick={AXIS_TICK} width={36} />
            <Tooltip
              content={
                <HealthMetricTooltip unit=" /min" range={VITAL_CHART_NORMAL_RANGES.respiratoryRate} />
              }
            />
            <VitalNormalRange
              min={VITAL_CHART_NORMAL_RANGES.respiratoryRate.min}
              max={VITAL_CHART_NORMAL_RANGES.respiratoryRate.max}
            />
            <Line
              type="monotone"
              dataKey="respiratoryRate"
              stroke={respLineColor}
              strokeWidth={2}
              dot={renderVitalDot(VITAL_CHART_NORMAL_RANGES.respiratoryRate, "respiratoryRate")}
              activeDot={{ r: 5 }}
              name={t("patient.healthInfo.charts.series.respiratoryRate")}
            />
          </LineChart>
        </ResponsiveContainer>
      </MetricTrendCard>

      <MetricTrendCard
        title={t("patient.healthInfo.charts.heartRate.title")}
        description={t("patient.healthInfo.charts.heartRate.description")}
        stats={hrStats}
        statLabels={statLabels}
        unit=" bpm"
        latestInRange={hrLatestInRange}
        {...cardProps}
      >
        <ResponsiveContainer width="100%" height={CHART_HEIGHT} minWidth={0}>
          <LineChart data={chartData} margin={CHART_MARGIN}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#cbd5e1" />
            <XAxis dataKey="time" tickLine={false} axisLine={false} tick={AXIS_TICK} />
            <YAxis domain={[40, 120]} tickLine={false} axisLine={false} tick={AXIS_TICK} width={36} />
            <Tooltip
              content={<HealthMetricTooltip unit=" bpm" range={VITAL_CHART_NORMAL_RANGES.heartRate} />}
            />
            <VitalNormalRange
              min={VITAL_CHART_NORMAL_RANGES.heartRate.min}
              max={VITAL_CHART_NORMAL_RANGES.heartRate.max}
            />
            <Line
              type="monotone"
              dataKey="heartRate"
              stroke={hrLineColor}
              strokeWidth={2}
              dot={renderVitalDot(VITAL_CHART_NORMAL_RANGES.heartRate, "heartRate")}
              activeDot={{ r: 5 }}
              name={t("patient.healthInfo.charts.series.heartRate")}
            />
          </LineChart>
        </ResponsiveContainer>
      </MetricTrendCard>

      <MetricTrendCard
        title={t("patient.healthInfo.charts.bmi.title")}
        description={t("patient.healthInfo.charts.bmi.description")}
        stats={bmiStats}
        statLabels={statLabels}
        format={(n) => n.toFixed(1)}
        latestInRange={bmiLatestInRange}
        {...cardProps}
      >
        <ResponsiveContainer width="100%" height={CHART_HEIGHT} minWidth={0}>
          <LineChart data={chartData} margin={CHART_MARGIN}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#cbd5e1" />
            <XAxis dataKey="time" tickLine={false} axisLine={false} tick={AXIS_TICK} />
            <YAxis domain={[15, 40]} tickLine={false} axisLine={false} tick={AXIS_TICK} width={36} />
            <Tooltip content={<HealthMetricTooltip range={VITAL_CHART_NORMAL_RANGES.bmi} />} />
            <VitalNormalRange
              min={VITAL_CHART_NORMAL_RANGES.bmi.min}
              max={VITAL_CHART_NORMAL_RANGES.bmi.max}
            />
            <Line
              type="monotone"
              dataKey="bmi"
              stroke={bmiLineColor}
              strokeWidth={2}
              dot={renderVitalDot(VITAL_CHART_NORMAL_RANGES.bmi, "bmi")}
              activeDot={{ r: 5 }}
              name={t("patient.healthInfo.charts.series.bmi")}
            />
          </LineChart>
        </ResponsiveContainer>
      </MetricTrendCard>

      <MetricTrendCard
        title={t("patient.healthInfo.charts.weight.title")}
        description={t("patient.healthInfo.charts.weight.description")}
        stats={weightStats}
        statLabels={statLabels}
        unit=" kg"
        {...cardProps}
      >
        <ResponsiveContainer width="100%" height={CHART_HEIGHT} minWidth={0}>
          <LineChart data={chartData} margin={CHART_MARGIN}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#cbd5e1" />
            <XAxis dataKey="time" tickLine={false} axisLine={false} tick={AXIS_TICK} />
            <YAxis domain={[30, 120]} tickLine={false} axisLine={false} tick={AXIS_TICK} width={36} />
            <Tooltip content={<HealthMetricTooltip unit=" kg" />} />
            <Line
              type="monotone"
              dataKey="weight"
              stroke={VITAL_NEUTRAL_LINE}
              strokeWidth={2}
              dot={{ r: 3.5, fill: VITAL_NEUTRAL_LINE }}
              activeDot={{ r: 5 }}
              name={t("patient.healthInfo.charts.series.weight")}
            />
          </LineChart>
        </ResponsiveContainer>
      </MetricTrendCard>
    </div>
  )
}
