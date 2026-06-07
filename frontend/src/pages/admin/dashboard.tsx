"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { Card, CardContent } from "@/components/ui/card"
import { MessageSquareText } from "lucide-react"
import { AdminLayout } from "@/components/admin-layout"
import { adminAccountService, type AdminDashboardSummary } from "@/services/admin-account-service"
import { useTranslation } from "react-i18next"
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Sector,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import type { PieSectorShapeProps } from "recharts/types/polar/Pie"

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

const ROLE_PIE_HOVER_EXPAND = 4
const COMPACT_CHART_HEIGHT = 132

function formatSignupLabel(dateStr: string): string {
  const parts = dateStr.split("-")
  if (parts.length !== 3) return dateStr
  return `${parts[2]}/${parts[1]}`
}

function formatRelativeTime(iso: string | null, locale: string): string {
  if (!iso) return "—"
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return "—"
  const diffSec = Math.round((Date.now() - then) / 1000)
  const rtf = new Intl.RelativeTimeFormat(locale.startsWith("vi") ? "vi" : "en", { numeric: "auto" })
  if (Math.abs(diffSec) < 60) return rtf.format(-diffSec, "second")
  const diffMin = Math.round(diffSec / 60)
  if (Math.abs(diffMin) < 60) return rtf.format(-diffMin, "minute")
  const diffHr = Math.round(diffMin / 60)
  if (Math.abs(diffHr) < 24) return rtf.format(-diffHr, "hour")
  const diffDay = Math.round(diffHr / 24)
  return rtf.format(-diffDay, "day")
}

function ChartSkeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-slate-100 ${className ?? "h-32"}`} />
}

export default function AdminDashboard() {
  const { t, i18n } = useTranslation()
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
    return baseSlots.map((slot) => ({
      time: slot.time,
      visitors: Math.max(0, Math.round(totalUsers * slot.ratio)),
    }))
  }, [summary?.totalUsers])

  const accountStatusData = useMemo(
    () => [
      { name: t("admin.dashboard.activeUsers"), value: summary?.activeUsers ?? 0, fill: "#22c55e" },
      { name: t("admin.dashboard.inactiveUsers"), value: summary?.inactiveUsers ?? 0, fill: "#a855f7" },
    ],
    [summary?.activeUsers, summary?.inactiveUsers, t]
  )

  const signupsChartData = useMemo(
    () =>
      (summary?.signupsByDay ?? []).map((row) => ({
        date: row.date,
        label: formatSignupLabel(row.date),
        count: row.count,
      })),
    [summary?.signupsByDay]
  )

  const feedbackStats = summary?.feedbackStats ?? { total: 0, pending: 0, averageRating: 0 }
  const recentActivity = summary?.recentActivity ?? []

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
      const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill, cornerRadius } = sectorProps
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
              ...(active ? { filter: "brightness(1.06) saturate(1.06)" } : {}),
            }}
          />
        </g>
      )
    },
    [rolePieActiveIndex]
  )

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {/* Visitors Over Time — compact */}
          <Card className="border-slate-200/80 shadow-sm">
            <CardContent className="p-4">
              <div className="mb-2">
                <h3 className="text-sm font-semibold text-slate-900">{t("admin.dashboard.visitorsOverTimeTitle")}</h3>
                <p className="text-[11px] text-slate-500">{t("admin.dashboard.visitorsOverTimeDescription")}</p>
                <p className="text-[10px] italic text-slate-400">{t("admin.dashboard.visitorsEstimatedNote")}</p>
              </div>
              {showSkeleton ? (
                <ChartSkeleton className="h-32" />
              ) : (
                <>
                  <div className="h-32 w-full min-w-0 rounded-md border border-slate-200 bg-slate-50/40 p-1">
                    <ResponsiveContainer width="100%" height={COMPACT_CHART_HEIGHT} minWidth={0}>
                      <AreaChart data={accessTimelineData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                        <defs>
                          <linearGradient id="visitorsWave" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.35} />
                            <stop offset="95%" stopColor="#06b6d4" stopOpacity={0.05} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#cbd5e1" />
                        <XAxis dataKey="time" tickLine={false} axisLine={false} tick={{ fontSize: 10 }} />
                        <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: 10 }} width={28} />
                        <Tooltip
                          formatter={(value) => [Number(value ?? 0), t("admin.dashboard.visitors")]}
                          labelFormatter={(label) => `${t("admin.dashboard.timeLabel")}: ${label}`}
                        />
                        <Area
                          type="monotone"
                          dataKey="visitors"
                          stroke="#06b6d4"
                          strokeWidth={2}
                          fill="url(#visitorsWave)"
                          dot={{ r: 2.5, fill: "#0891b2" }}
                          activeDot={{ r: 4 }}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="mt-2 grid grid-cols-3 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-center text-[11px]">
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
                </>
              )}
            </CardContent>
          </Card>

          {/* Users by Role */}
          <Card className="border-slate-200/80 shadow-sm">
            <CardContent className="p-4">
              <div className="mb-2">
                <h3 className="text-sm font-semibold text-slate-900">{t("admin.dashboard.usersByRoleTitle")}</h3>
              </div>
              {showSkeleton ? (
                <ChartSkeleton className="h-40" />
              ) : roleChartData.length ? (
                <div className="flex flex-col gap-3">
                  <div className="relative mx-auto h-36 w-full max-w-[200px]">
                    <ResponsiveContainer width="100%" height={144} minWidth={0}>
                      <PieChart>
                        <defs>
                          {roleChartData.map((_, index) => {
                            const [from, to] = ROLE_PIE_GRADIENT_STOPS[index % ROLE_PIE_GRADIENT_STOPS.length]
                            return (
                              <linearGradient key={`role-pie-grad-${index}`} id={`rolePieGrad-${index}`} x1="0" y1="0" x2="1" y2="1">
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
                            return (
                              <div className="rounded-lg border border-slate-200/80 bg-white/95 px-2 py-1 text-xs shadow-lg">
                                <span className="font-medium">{String(entry.name ?? "")}</span>
                                <span className="text-slate-400"> : </span>
                                <span className="font-semibold text-cyan-700">{Number(entry.value)}</span>
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
                          outerRadius={58}
                          innerRadius={32}
                          paddingAngle={3}
                          cornerRadius={4}
                          stroke="#ffffff"
                          strokeWidth={2}
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
                        <p className="text-lg font-bold tabular-nums text-slate-900">{rolePieTotal}</p>
                        <p className="text-[9px] font-semibold uppercase tracking-wide text-slate-500">
                          {t("admin.dashboard.totalUsers")}
                        </p>
                      </div>
                    </div>
                  </div>
                  <ul className="max-h-24 space-y-1 overflow-y-auto text-xs" aria-label={t("admin.dashboard.usersByRoleTitle")}>
                    {roleChartData.map((row, index) => {
                      const [from, to] = ROLE_PIE_GRADIENT_STOPS[index % ROLE_PIE_GRADIENT_STOPS.length]
                      return (
                        <li key={`${row.roleCode}-${index}`} className="flex items-center justify-between gap-2 rounded px-1 py-0.5 hover:bg-slate-50">
                          <span className="flex min-w-0 items-center gap-1.5">
                            <span
                              className="h-2 w-2 shrink-0 rounded-full"
                              style={{ background: `linear-gradient(135deg, ${from}, ${to})` }}
                              aria-hidden
                            />
                            <span className="truncate text-slate-800">{row.label}</span>
                          </span>
                          <span className="shrink-0 font-semibold tabular-nums text-slate-600">{row.total}</span>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">{t("admin.dashboard.noRoleData")}</p>
              )}
            </CardContent>
          </Card>

          {/* Account status */}
          <Card className="border-slate-200/80 shadow-sm">
            <CardContent className="p-4">
              <div className="mb-2">
                <h3 className="text-sm font-semibold text-slate-900">{t("admin.dashboard.accountStatusTitle")}</h3>
                <p className="text-[11px] text-slate-500">{t("admin.dashboard.activeVsInactive")}</p>
              </div>
              {showSkeleton ? (
                <ChartSkeleton className="h-32" />
              ) : (
                <>
                  <div className="h-32 w-full min-w-0">
                    <ResponsiveContainer width="100%" height={COMPACT_CHART_HEIGHT} minWidth={0}>
                      <BarChart data={accountStatusData} layout="vertical" margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                        <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10 }} />
                        <YAxis type="category" dataKey="name" width={72} tick={{ fontSize: 10 }} />
                        <Tooltip formatter={(value) => [Number(value ?? 0), ""]} />
                        <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={22}>
                          {accountStatusData.map((entry, index) => (
                            <Cell key={`status-${index}`} fill={entry.fill} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="mt-2 flex justify-between text-[11px] text-slate-600">
                    <span>
                      {t("admin.dashboard.active")}: <strong>{summary?.activeUsers ?? 0}</strong>
                    </span>
                    <span>
                      {t("admin.dashboard.inactiveUsers")}: <strong>{summary?.inactiveUsers ?? 0}</strong>
                    </span>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Feedback overview */}
          <Card className="border-slate-200/80 shadow-sm">
            <CardContent className="p-4">
              <div className="mb-3 flex items-start justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">{t("admin.dashboard.feedbackOverviewTitle")}</h3>
                </div>
                <MessageSquareText className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
              </div>
              {showSkeleton ? (
                <ChartSkeleton className="h-28" />
              ) : (
                <div className="space-y-3">
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-md border border-slate-200 bg-slate-50/60 px-2 py-2">
                      <p className="text-[10px] text-slate-500">{t("admin.dashboard.feedbackTotal")}</p>
                      <p className="text-lg font-bold tabular-nums text-slate-900">{feedbackStats.total}</p>
                    </div>
                    <div className="rounded-md border border-amber-200 bg-amber-50/80 px-2 py-2">
                      <p className="text-[10px] text-amber-700">{t("admin.dashboard.feedbackPending")}</p>
                      <p className="text-lg font-bold tabular-nums text-amber-900">{feedbackStats.pending}</p>
                    </div>
                    <div className="rounded-md border border-cyan-200 bg-cyan-50/80 px-2 py-2">
                      <p className="text-[10px] text-cyan-700">{t("admin.dashboard.feedbackAvgRating")}</p>
                      <p className="text-lg font-bold tabular-nums text-cyan-900">
                        {feedbackStats.averageRating > 0 ? feedbackStats.averageRating.toFixed(1) : "—"}
                      </p>
                    </div>
                  </div>
                  <Link
                    to="/admin/feedback"
                    className="block text-center text-xs font-medium text-[#0086C4] hover:underline"
                  >
                    {t("admin.dashboard.viewAllFeedback")}
                  </Link>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* Signups 7 days */}
          <Card className="border-slate-200/80 shadow-sm">
            <CardContent className="p-4">
              <div className="mb-2">
                <h3 className="text-sm font-semibold text-slate-900">{t("admin.dashboard.signupsLast7DaysTitle")}</h3>
                <p className="text-[11px] text-slate-500">{t("admin.dashboard.signupsLast7DaysDescription")}</p>
              </div>
              {showSkeleton ? (
                <ChartSkeleton className="h-44" />
              ) : (
                <div className="h-44 w-full min-w-0 rounded-md border border-slate-200 bg-slate-50/40 p-2">
                  <ResponsiveContainer width="100%" height={168} minWidth={0}>
                    <BarChart data={signupsChartData} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#cbd5e1" />
                      <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
                      <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: 11 }} width={28} />
                      <Tooltip
                        formatter={(value) => [Number(value ?? 0), t("admin.dashboard.newAccounts")]}
                        labelFormatter={(_, payload) => {
                          const row = payload?.[0]?.payload as { date?: string } | undefined
                          return row?.date ?? ""
                        }}
                      />
                      <Bar dataKey="count" fill="#0086C4" radius={[4, 4, 0, 0]} maxBarSize={40} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Recent activity */}
          <Card className="border-slate-200/80 shadow-sm">
            <CardContent className="p-4">
              <div className="mb-3">
                <h3 className="text-sm font-semibold text-slate-900">{t("admin.dashboard.recentActivityTitle")}</h3>
              </div>
              {showSkeleton ? (
                <ChartSkeleton className="h-44" />
              ) : recentActivity.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("admin.dashboard.noRecentActivity")}</p>
              ) : (
                <ul className="max-h-44 space-y-2 overflow-y-auto pr-1">
                  {recentActivity.map((item) => {
                    const enabled = item.status === "Enabled"
                    return (
                      <li
                        key={item.id}
                        className="flex items-start justify-between gap-2 rounded-md border border-slate-100 bg-slate-50/50 px-3 py-2 text-sm"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-slate-800">{item.message}</p>
                          <p className="mt-0.5 text-[11px] text-slate-500">
                            {formatRelativeTime(item.createdTime, i18n.language)}
                          </p>
                        </div>
                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                            enabled
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-slate-200 text-slate-600"
                          }`}
                        >
                          {item.status}
                        </span>
                      </li>
                    )
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </AdminLayout>
  )
}
