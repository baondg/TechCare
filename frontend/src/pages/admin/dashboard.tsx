"use client"

import { useEffect, useMemo, useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Users, UserCheck, Settings, AlertCircle } from "lucide-react"
import { AdminLayout } from "@/components/admin-layout"
import { adminAccountService, type AdminDashboardSummary } from "@/services/admin-account-service"

export default function AdminDashboard() {
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
      { label: "Total Users", value: summary ? String(summary.totalUsers) : "—", icon: Users, color: "bg-blue-500" },
      { label: "Active Users", value: summary ? String(summary.activeUsers) : "—", icon: UserCheck, color: "bg-green-500" },
      { label: "System Status", value: summary?.systemStatus || "Unknown", icon: AlertCircle, color: "bg-emerald-500" },
      { label: "Inactive Users", value: summary ? String(summary.inactiveUsers) : "—", icon: Settings, color: "bg-purple-500" },
    ],
    [summary]
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
                    <div className="text-2xl font-bold">{stat.value}</div>
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
                <span>Database Connection</span>
                <span className={`font-semibold ${summary ? "text-green-600" : "text-amber-600"}`}>
                  {summary ? "Connected" : "Checking"}
                </span>
              </div>
              <div className="flex justify-between">
                <span>API Gateway</span>
                <span className={`font-semibold ${summary ? "text-green-600" : "text-amber-600"}`}>
                  {summary ? "Running" : "Checking"}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Account Services</span>
                <span className={`font-semibold ${summary ? "text-green-600" : "text-amber-600"}`}>
                  {summary ? "Active" : "Checking"}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Dashboard Data</span>
                <span className={`font-semibold ${loading ? "text-amber-600" : "text-green-600"}`}>
                  {loading ? "Loading..." : "Up to date"}
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
                <div className="text-sm text-muted-foreground">No role data.</div>
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
                    {item.createdTime ? String(item.createdTime).replace("T", " ").slice(0, 16) : "—"}
                  </span>
                </div>
              ))}
              {!summary?.recentActivity?.length ? (
                <div className="text-sm text-muted-foreground">No recent activity.</div>
              ) : null}
            </div>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  )
}
