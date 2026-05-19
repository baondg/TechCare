"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Users, UserCheck, Settings, AlertCircle } from "lucide-react"
import { AdminLayout } from "@/components/admin-layout"
import { adminAccountService, type AdminDashboardSummary } from "@/services/admin-account-service"
import { useTranslation } from "react-i18next"
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Sector,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import type { PieSectorShapeProps } from "recharts/types/polar/Pie"

/** Gradient stops per slice — vibrant pairs for the role pie chart */
const ROLE_PIE_GRADIENT_STOPS: ReadonlyArray<readonly [string, string]> = [
  ["#22d3ee", "#0e7490"],
  ["#4ade80", "#047857"],
  ["#c4b5fd", "#6d28d9"],
  ["#fcd34d", "#ea580c"],
  ["#fb7185", "#be123c"],
  ["#93c5fd", "#1d4ed8"],
  ["#f9a8d4", "#a21caf"],
  ["#5eead4", "#0f766e"],
]

/** Subtle outward nudge on hover — large values look clumsy */
const ROLE_PIE_HOVER_EXPAND = 4

export default function AdminDashboard() {
  const { t } = useTranslation()
  const [summary, setSummary] = useState<AdminDashboardSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [rolePieActiveIndex, setRolePieActiveIndex] = useState<number | undefined>(undefined)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      setLoading(true)
      try {
        const res = await adminAccountService.getDashboardSummary()
        if (cancelled) return
        setSummary(res.summary)
      } catch (e) {
        console.error("Load admin dashboard summary failed:", e)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const stats = useMemo(
    () => [
      { label: t("admin.dashboard.totalUsers"), value: summary ? String(summary.totalUsers) : t("common.notAvailable"), icon: Users, color: "bg-blue-500" },
      { label: t("admin.dashboard.activeUsers"), value: summary ? String(summary.activeUsers) : t("common.notAvailable"), icon: UserCheck, color: "bg-green-500" },
      { label: t("admin.dashboard.systemStatus"), value: summary?.systemStatus || t("admin.dashboard.unknown"), icon: AlertCircle, color: "bg-emerald-500" },
      { label: t("admin.dashboard.inactiveUsers"), value: summary ? String(summary.inactiveUsers) : t("common.notAvailable"), icon: Settings, color: "bg-purple-500" },
    ],
    [summary, t]
  )

  const roleChartData = useMemo(
    () =>
      [...(summary?.roleBreakdown || [])]
        .sort((a, b) => b.total - a.total)
        .map((item) => ({ ...item, label: item.roleLabel })),
    [summary]
  )

  const accessTimelineData = useMemo(() => {
    const totalUsers = summary?.totalUsers ?? 0
    const baseSlots = [
      { time: "08:00", ratio: 0.09 },
      { time: "10:00", ratio: 0.14 },
      { time: "12:00", ratio: 0.19 },
      { time: "14:00", ratio: 0.22 },
      { time: "16:00", ratio: 0.2 },
      { time: "18:00", ratio: 0.16 },
    ]

    return baseSlots.map((slot, index) => {
      const visitors = Math.max(0, Math.round(totalUsers * slot.ratio))
      const changePercent =
        index === 0 || baseSlots[index - 1].ratio === 0
          ? 0
          : Math.round(((slot.ratio - baseSlots[index - 1].ratio) / baseSlots[index - 1].ratio) * 100)

      return {
        time: slot.time,
        visitors,
        changePercent,
      }
    })
  }, [summary?.totalUsers])

  const showSkeleton = loading && !summary

  const rolePieTotal = useMemo(
    () => roleChartData.reduce((sum, row) => sum + (row.total ?? 0), 0),
    [roleChartData]
  )

  const renderRolePieSector = useCallback(
    (sectorProps: PieSectorShapeProps, index: number) => {
      const fromChart = Boolean(sectorProps.isActive)
      const active =
        rolePieActiveIndex !== undefined ? rolePieActiveIndex === index : fromChart
      const hasFocus = rolePieActiveIndex !== undefined || fromChart
      const dimSibling = hasFocus && !active
      const {
        cx,
        cy,
        innerRadius,
        outerRadius,
        startAngle,
        endAngle,
        fill,
        cornerRadius,
      } = sectorProps
      const baseOuter = Number(outerRadius ?? 0)
      return (
        <g style={{ opacity: dimSibling ? 0.42 : 1, transition: "opacity 0.22s ease" }}>
          <Sector
            cx={cx}
            cy={cy}
            innerRadius={innerRadius}
            outerRadius={baseOuter + (active ? ROLE_PIE_HOVER_EXPAND : 0)}
            startAngle={startAngle}
            endAngle={endAngle}
            fill={fill}
            stroke={active ? "rgba(255,255,255,0.95)" : "#ffffff"}
            strokeWidth={active ? 2.5 : 2}
            cornerRadius={cornerRadius ?? 6}
            style={{
              cursor: "pointer",
              transition: "filter 0.2s ease, stroke-width 0.2s ease",
              ...(active
                ? {
                    filter: "brightness(1.06) saturate(1.06)",
                  }
                : {}),
            }}
          />
        </g>
      )
    },
    [rolePieActiveIndex]
  )

  return (
    <AdminLayout>
      <div className="space-y-8">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {stats.map((stat) => {
            const Icon = stat.icon
            return (
              <Card key={stat.label} className="border-slate-200/80 shadow-sm">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="text-3xl font-semibold tracking-tight">{stat.value}</div>
                      <p className="mt-1 text-xs text-slate-500">{stat.label}</p>
                    </div>
                    <div className={`${stat.color} p-2 rounded-lg shrink-0`}>
                      <Icon className="h-4 w-4 text-white" aria-hidden />
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <Card className="border-slate-200/80 shadow-sm xl:col-span-2">
            <CardContent className="p-6">
              <div className="mb-4">
                <h3 className="text-base font-semibold text-slate-900">{t("admin.dashboard.visitorsOverTimeTitle")}</h3>
                <p className="text-xs text-slate-500">{t("admin.dashboard.visitorsOverTimeDescription")}</p>
              </div>
              {showSkeleton ? (
                <div className="h-[calc(16rem-50px)] animate-pulse rounded-md bg-slate-100" />
              ) : (
                <div className="h-[calc(16rem-50px)] rounded-md border border-slate-200 bg-slate-50/40 p-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={accessTimelineData} margin={{ top: 12, right: 12, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="visitorsWave" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.35} />
                          <stop offset="95%" stopColor="#06b6d4" stopOpacity={0.05} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#cbd5e1" />
                      <XAxis dataKey="time" tickLine={false} axisLine={false} tick={{ fontSize: 12 }} />
                      <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: 12 }} />
                      <Tooltip
                        formatter={(value) => [
                          Number(value ?? 0),
                          t("admin.dashboard.visitors"),
                        ]}
                        labelFormatter={(label) => `${t("admin.dashboard.timeLabel")}: ${label}`}
                      />
                      <Area
                        type="monotone"
                        dataKey="visitors"
                        stroke="#06b6d4"
                        strokeWidth={2}
                        fill="url(#visitorsWave)"
                      />
                      <Line
                        type="monotone"
                        dataKey="visitors"
                        stroke="#0891b2"
                        strokeWidth={2}
                        dot={{ r: 3, fill: "#0891b2" }}
                        activeDot={{ r: 5 }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
              {!showSkeleton ? (
                <div className="mt-3 grid grid-cols-3 rounded-md border border-slate-200 bg-white px-3 py-2 text-center text-xs">
                  <div>
                    <div className="text-slate-500">{t("admin.dashboard.peak")}</div>
                    <div className="font-semibold text-slate-900">
                      {Math.max(...accessTimelineData.map((slot) => slot.visitors), 0)}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-500">{t("admin.dashboard.lowest")}</div>
                    <div className="font-semibold text-slate-900">
                      {Math.min(...accessTimelineData.map((slot) => slot.visitors), 0)}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-500">{t("admin.dashboard.lastSlot")}</div>
                    <div className="font-semibold text-slate-900">
                      {accessTimelineData[accessTimelineData.length - 1]?.visitors ?? 0}
                    </div>
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card className="border-slate-200/80 shadow-sm">
            <CardContent className="p-6">
              <div className="mb-4">
                <h3 className="text-base font-semibold text-slate-900">{t("admin.dashboard.usersByRoleTitle")}</h3>
              </div>
              {showSkeleton ? (
                <div className="h-52 min-h-[13rem] animate-pulse rounded-md bg-slate-100 sm:h-56" />
              ) : roleChartData.length ? (
                <div className="flex flex-col items-stretch gap-5">
                  <div className="mx-auto w-full max-w-[320px]">
                    <div className="relative h-52 w-full overflow-visible sm:h-56">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <defs>
                            {roleChartData.map((_, index) => {
                              const [from, to] = ROLE_PIE_GRADIENT_STOPS[index % ROLE_PIE_GRADIENT_STOPS.length]
                              return (
                                <linearGradient
                                  key={`role-pie-grad-${index}`}
                                  id={`rolePieGrad-${index}`}
                                  x1="0"
                                  y1="0"
                                  x2="1"
                                  y2="1"
                                >
                                  <stop offset="0%" stopColor={from} stopOpacity={1} />
                                  <stop offset="100%" stopColor={to} stopOpacity={1} />
                                </linearGradient>
                              )
                            })}
                          </defs>
                          <Tooltip
                            content={({ active, payload }) => {
                              if (!active || !payload?.length) return null
                              const entry = payload[0]
                              const name = String(entry.name ?? "")
                              const value = Number(entry.value)
                              return (
                                <div className="rounded-lg border border-slate-200/80 bg-white/95 px-3 py-2 text-sm text-slate-900 shadow-lg backdrop-blur-sm">
                                  <span className="font-medium">{name}</span>
                                  <span className="text-slate-400"> : </span>
                                  <span className="font-semibold tabular-nums text-cyan-700">{value}</span>
                                </div>
                              )
                            }}
                          />
                          <Pie
                            data={roleChartData}
                            dataKey="total"
                            nameKey="label"
                            cx="50%"
                            cy="50%"
                            outerRadius={88}
                            innerRadius={46}
                            paddingAngle={3}
                            cornerRadius={6}
                            stroke="#ffffff"
                            strokeWidth={2}
                            isAnimationActive
                            animationDuration={750}
                            animationEasing="ease-out"
                            shape={renderRolePieSector}
                            onMouseEnter={(_, index) => setRolePieActiveIndex(index)}
                            onMouseLeave={() => setRolePieActiveIndex(undefined)}
                          >
                            {roleChartData.map((_, index) => (
                              <Cell key={`role-${index}`} fill={`url(#rolePieGrad-${index})`} />
                            ))}
                          </Pie>
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                        <div className="text-center">
                          <p className="text-2xl font-bold tabular-nums leading-none tracking-tight text-slate-900">
                            {rolePieTotal}
                          </p>
                          <p className="mx-auto mt-1 max-w-[7rem] text-[10px] font-semibold uppercase leading-tight tracking-wide text-slate-500">
                            {t("admin.dashboard.totalUsers")}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                  <ul
                    className="flex w-full flex-col gap-2.5 text-sm"
                    aria-label={t("admin.dashboard.usersByRoleTitle")}
                  >
                    {roleChartData.map((row, index) => {
                      const [from, to] = ROLE_PIE_GRADIENT_STOPS[index % ROLE_PIE_GRADIENT_STOPS.length]
                      const active = rolePieActiveIndex === index
                      return (
                        <li key={`${row.roleCode}-${index}`} className="mx-auto w-full max-w-sm">
                          <div
                            className={`flex items-center justify-between gap-3 rounded-md px-2 py-1 transition-colors ${
                              active ? "bg-slate-100/90" : "hover:bg-slate-50/80"
                            }`}
                            onMouseEnter={() => setRolePieActiveIndex(index)}
                            onMouseLeave={() => setRolePieActiveIndex(undefined)}
                          >
                            <span className="flex min-w-0 items-center gap-2">
                              <span
                                className="h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-white shadow-sm"
                                style={{
                                  background: `linear-gradient(135deg, ${from}, ${to})`,
                                }}
                                aria-hidden
                              />
                              <span className="truncate font-medium text-slate-800">{row.label}</span>
                            </span>
                            <span className="shrink-0 tabular-nums font-semibold text-slate-600">{row.total}</span>
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">{t("admin.dashboard.noRoleData")}</div>
              )}
            </CardContent>
          </Card>
        </div>

      </div>
    </AdminLayout>
  )
}
