"use client"

import { useEffect, useMemo, useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Users, UserCheck, Settings, AlertCircle } from "lucide-react"
import { AdminLayout } from "@/components/admin-layout"
import { adminAccountService, type AdminDashboardSummary } from "@/services/admin-account-service"
import { useTranslation } from "react-i18next"

export default function AdminDashboard() {
  const { t } = useTranslation()
  const [summary, setSummary] = useState<AdminDashboardSummary | null>(null)
  const [loading, setLoading] = useState(true)

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

  return (
    <AdminLayout>
      <div className="space-y-8">
        <div className="grid grid-cols-4 gap-4">
          {stats.map((stat) => {
            const Icon = stat.icon
            return (
              <Card key={stat.label}>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="text-2xl font-bold">{stat.value}</div>
                      <p className="text-xs text-slate-500 mt-1">{stat.label}</p>
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

        <Card>
          <CardContent className="space-y-4 p-6">
            <div className="space-y-2">
              <div className="flex justify-between">
                <span>{t("admin.dashboard.databaseConnection")}</span>
                <span className={`font-semibold ${summary ? "text-green-600" : "text-amber-600"}`}>
                  {summary ? t("admin.dashboard.connected") : t("admin.dashboard.checking")}
                </span>
              </div>
              <div className="flex justify-between">
                <span>{t("admin.dashboard.apiGateway")}</span>
                <span className={`font-semibold ${summary ? "text-green-600" : "text-amber-600"}`}>
                  {summary ? t("admin.dashboard.running") : t("admin.dashboard.checking")}
                </span>
              </div>
              <div className="flex justify-between">
                <span>{t("admin.dashboard.accountServices")}</span>
                <span className={`font-semibold ${summary ? "text-green-600" : "text-amber-600"}`}>
                  {summary ? t("admin.dashboard.active") : t("admin.dashboard.checking")}
                </span>
              </div>
              <div className="flex justify-between">
                <span>{t("admin.dashboard.dashboardData")}</span>
                <span className={`font-semibold ${loading ? "text-amber-600" : "text-green-600"}`}>
                  {loading ? t("common.loading") : t("admin.dashboard.upToDate")}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="space-y-3">
              {(summary?.roleBreakdown || []).map((row) => (
                <div key={row.roleCode} className="flex justify-between text-sm">
                  <span>{row.roleLabel}</span>
                  <span className="font-semibold">{row.total}</span>
                </div>
              ))}
              {!summary?.roleBreakdown?.length ? (
                <div className="text-sm text-muted-foreground">{t("admin.dashboard.noRoleData")}</div>
              ) : null}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="space-y-3">
              {(summary?.recentActivity || []).map((item) => (
                <div key={item.id} className="flex justify-between text-sm gap-3">
                  <span className="truncate">{item.message}</span>
                  <span className="text-muted-foreground whitespace-nowrap">
                    {item.createdTime ? String(item.createdTime).replace("T", " ").slice(0, 16) : t("common.notAvailable")}
                  </span>
                </div>
              ))}
              {!summary?.recentActivity?.length ? (
                <div className="text-sm text-muted-foreground">{t("admin.dashboard.noRecentActivity")}</div>
              ) : null}
            </div>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  )
}
