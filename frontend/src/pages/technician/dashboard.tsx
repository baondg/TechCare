"use client"

import { useCallback, useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  ClipboardList,
  FlaskConical,
  AlertCircle,
  UserRound,
  Loader2,
} from "lucide-react"
import { TechnicianLayout } from "@/components/technician-layout"
import { doctorService, type DoctorDashboardSummary } from "@/services/doctor-service"

function formatPatientPath(patientId: number) {
  return `/technician/medical_records/${patientId}/lab`
}

export default function TechnicianDashboard() {
  const [summary, setSummary] = useState<DoctorDashboardSummary | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await doctorService.getDashboardSummary()
      setSummary(res)
    } catch (e) {
      console.error(e)
      setSummary(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const stats = summary?.summary
  const queue = summary?.todaysSchedule ?? []
  const recent = summary?.recentPatients ?? []

  return (
    <TechnicianLayout>
      <div className="space-y-8 max-w-6xl mx-auto">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card className="border-cyan-100 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Lab tests today</CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <div className="flex items-start justify-between gap-2">
                {loading ? (
                  <Loader2 className="h-6 w-6 animate-spin text-cyan-600" />
                ) : (
                  <div className="text-2xl font-bold text-slate-900">{stats?.labTestsToday ?? 0}</div>
                )}
                <FlaskConical className="h-4 w-4 shrink-0 text-cyan-600" aria-hidden />
              </div>
            </CardContent>
          </Card>

          <Card className="border-amber-100 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Appointments today</CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <div className="flex items-start justify-between gap-2">
                {loading ? (
                  <Loader2 className="h-6 w-6 animate-spin text-amber-600" />
                ) : (
                  <div className="text-2xl font-bold text-slate-900">{stats?.appointmentsToday ?? 0}</div>
                )}
                <AlertCircle className="h-4 w-4 shrink-0 text-amber-600" aria-hidden />
              </div>
            </CardContent>
          </Card>

          <Card className="border-emerald-100 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Diagnoses today</CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <div className="flex items-start justify-between gap-2">
                {loading ? (
                  <Loader2 className="h-6 w-6 animate-spin text-emerald-600" />
                ) : (
                  <div className="text-2xl font-bold text-slate-900">{stats?.diagnosesToday ?? 0}</div>
                )}
                <ClipboardList className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-200 shadow-sm opacity-90">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Recent patients</CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <div className="flex items-start justify-between gap-2">
                {loading ? (
                  <Loader2 className="h-6 w-6 animate-spin text-slate-500" />
                ) : (
                  <div className="text-2xl font-bold text-slate-900">{recent.length}</div>
                )}
                <UserRound className="h-4 w-4 shrink-0 text-slate-500" aria-hidden />
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 lg:grid-cols-5">
          <Card className="lg:col-span-3 border-slate-200 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Today lab queue</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 p-6 pt-0">
              {loading && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-8 justify-center">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading...
                </div>
              )}
              {!loading && queue.length === 0 && (
                <p className="text-sm text-muted-foreground py-8 text-center">
                  No lab records for today.
                </p>
              )}
              {!loading &&
                queue.map((row) => (
                  <div
                    key={row.id}
                    className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-lg border border-slate-100 bg-slate-50/50 px-4 py-3"
                  >
                    <div className="space-y-1 min-w-0">
                      <p className="font-medium text-slate-900 truncate">
                        <Link
                          to={formatPatientPath(row.patientId)}
                          className="text-cyan-700 hover:underline"
                        >
                          {row.patientName || `Patient #${row.patientId}`}
                        </Link>
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {row.department || "Lab Test"} ·{" "}
                        {row.time
                          ? `${String(row.time).slice(0, 5)} ${row.date || ""}`
                          : row.date || ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span
                        className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                          row.status === "Done"
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-amber-100 text-amber-800"
                        }`}
                      >
                        {row.status === "Done" ? "Completed" : "Pending"}
                      </span>
                      <Button size="sm" variant="outline" asChild>
                        <Link to={formatPatientPath(row.patientId)}>Open Lab</Link>
                      </Button>
                    </div>
                  </div>
                ))}
            </CardContent>
          </Card>

          <Card className="lg:col-span-2 border-slate-200 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Recently handled</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 p-6 pt-0">
              {loading && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-6 justify-center">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading...
                </div>
              )}
              {!loading && recent.length === 0 && (
                <p className="text-sm text-muted-foreground py-6 text-center">No data yet.</p>
              )}
              {!loading &&
                recent.map((p) => (
                  <div
                    key={p.patientId}
                    className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 px-3 py-2.5"
                  >
                    <div className="min-w-0">
                      <Link
                        to={formatPatientPath(p.patientId)}
                        className="font-medium text-cyan-700 hover:underline truncate block"
                      >
                        {p.patientName}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        {p.lastTime
                          ? new Date(p.lastTime).toLocaleString("vi-VN")
                          : "—"}
                      </p>
                    </div>
                    <Button size="sm" variant="ghost" className="shrink-0" asChild>
                      <Link to={formatPatientPath(p.patientId)}>Open</Link>
                    </Button>
                  </div>
                ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </TechnicianLayout>
  )
}
