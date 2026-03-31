"use client"

import { useEffect, useMemo, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
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
        <div>
          <h2 className="text-3xl font-bold text-foreground">Admin Dashboard</h2>
          <p className="text-muted-foreground mt-2">System overview and management</p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-4 gap-4">
          {stats.map((stat) => {
            const Icon = stat.icon
            return (
              <Card key={stat.label}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">{stat.label}</CardTitle>
                  <div className={`${stat.color} p-2 rounded-lg`}>
                    <Icon className="h-4 w-4 text-white" />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stat.value}</div>
                </CardContent>
              </Card>
            )
          })}
        </div>

        {/* System Health */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5" />
              System Health
            </CardTitle>
            <CardDescription>Current system performance metrics</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
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

        {/* Role Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Role Breakdown
            </CardTitle>
            <CardDescription>Total accounts by role from ACCOUNT table</CardDescription>
          </CardHeader>
          <CardContent>
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

        {/* Recent Activity */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Recent Activity
            </CardTitle>
            <CardDescription>Latest system modifications</CardDescription>
          </CardHeader>
          <CardContent>
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
