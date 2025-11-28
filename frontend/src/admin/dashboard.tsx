"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Users, UserCheck, Settings, AlertCircle } from "lucide-react"
import { AdminLayout } from "@/components/admin-layout"

export default function AdminDashboard() {
  const stats = [
    { label: "Total Users", value: "156", icon: Users, color: "bg-blue-500" },
    { label: "Active Users", value: "142", icon: UserCheck, color: "bg-green-500" },
    { label: "System Status", value: "Healthy", icon: AlertCircle, color: "bg-emerald-500" },
    { label: "Config Updates", value: "12", icon: Settings, color: "bg-purple-500" },
  ]

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
                <span className="text-green-600 font-semibold">Connected</span>
              </div>
              <div className="flex justify-between">
                <span>API Gateway</span>
                <span className="text-green-600 font-semibold">Running</span>
              </div>
              <div className="flex justify-between">
                <span>AI Services</span>
                <span className="text-green-600 font-semibold">Active</span>
              </div>
              <div className="flex justify-between">
                <span>Server Uptime</span>
                <span className="text-green-600 font-semibold">99.8%</span>
              </div>
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
              <div className="flex justify-between text-sm">
                <span>User 'Dr. Sarah' created</span>
                <span className="text-muted-foreground">2 hours ago</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>System config updated</span>
                <span className="text-muted-foreground">5 hours ago</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>User 'John Nurse' deactivated</span>
                <span className="text-muted-foreground">1 day ago</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  )
}
