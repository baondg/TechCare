"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { CalendarDays, FileText, FlaskConical, Pill } from "lucide-react"
import { Link } from "react-router-dom";
import { DoctorLayout } from "@/components/doctor-layout"
import { useEffect, useMemo, useState } from "react"
import { doctorService, type DoctorAppointment, type DoctorDashboardSummary } from "@/services/doctor-service"
import {
  rangeForScheduleTab,
  ScheduleDashboardTabs,
  ScheduleDayPickerField,
  ScheduleMonthPickerField,
  ScheduleWeekPickerField,
  type ScheduleTab,
  startOfWeekMonday,
  toLocalIsoDate,
} from "@/components/schedule-dashboard-controls"

type AppointmentUiStatus = "Done" | "Upcoming" | "Confirmed" | "Cancelled"

const normalizeAppointmentStatus = (status?: string): AppointmentUiStatus => {
  const value = String(status || "").trim().toLowerCase()
  if (value === "done" || value === "completed") return "Done"
  if (value === "confirmed") return "Confirmed"
  if (value === "cancelled" || value === "canceled" || value === "rejected") return "Cancelled"
  return "Upcoming"
}

export default function DoctorDashboard() {
  const [appointments, setAppointments] = useState<DoctorAppointment[]>([])
  const [appointmentsLoading, setAppointmentsLoading] = useState(false)
  const [dashboardSummary, setDashboardSummary] = useState<DoctorDashboardSummary | null>(null)
  const [scheduleTab, setScheduleTab] = useState<ScheduleTab>("day")

  const [dayKey, setDayKey] = useState(() => toLocalIsoDate(new Date()))
  const [weekStartKey, setWeekStartKey] = useState(() => toLocalIsoDate(startOfWeekMonday(new Date())))
  const [monthKey, setMonthKey] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
  })

  useEffect(() => {
    const { startDate, endDate } = rangeForScheduleTab(scheduleTab, dayKey, weekStartKey, monthKey)
    const loadAppointments = async () => {
      setAppointmentsLoading(true)
      try {
        const res = await doctorService.getAppointments({ startDate, endDate })
        setAppointments(res.appointments || [])
      } catch (error) {
        console.error("Load doctor appointments failed:", error)
      } finally {
        setAppointmentsLoading(false)
      }
    }

    void loadAppointments()
  }, [scheduleTab, dayKey, weekStartKey, monthKey])

  useEffect(() => {
    const loadSummary = async () => {
      try {
        const res = await doctorService.getDashboardSummary()
        setDashboardSummary(res)
      } catch (error) {
        console.error("Load doctor dashboard summary failed:", error)
      }
    }

    void loadSummary()
  }, [])

  const scheduleItems = useMemo(() => {
    return [...appointments].sort((a, b) => {
      const da = String(a.date || "").slice(0, 10).localeCompare(String(b.date || "").slice(0, 10))
      if (da !== 0) return da
      return String(a.time || "").localeCompare(String(b.time || ""))
    })
  }, [appointments])

  return (
    <DoctorLayout>
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Appointments today</CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <div className="flex items-center justify-between gap-2">
                <div className="text-2xl font-bold">{dashboardSummary?.summary?.appointmentsToday ?? 0}</div>
                <CalendarDays className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Diagnoses today</CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <div className="flex items-center justify-between gap-2">
                <div className="text-2xl font-bold">{dashboardSummary?.summary?.diagnosesToday ?? 0}</div>
                <FileText className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Prescriptions today</CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <div className="flex items-center justify-between gap-2">
                <div className="text-2xl font-bold">{dashboardSummary?.summary?.prescriptionsToday ?? 0}</div>
                <Pill className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Lab tests today</CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <div className="flex items-center justify-between gap-2">
                <div className="text-2xl font-bold">{dashboardSummary?.summary?.labTestsToday ?? 0}</div>
                <FlaskConical className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="card-feature border-slate-200/60">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Schedule</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 p-6 pt-0">
            <ScheduleDashboardTabs scheduleTab={scheduleTab} onScheduleTabChange={setScheduleTab}>
              <ScheduleDayPickerField dayKey={dayKey} setDayKey={setDayKey} />
              <ScheduleWeekPickerField weekStartKey={weekStartKey} setWeekStartKey={setWeekStartKey} />
              <ScheduleMonthPickerField monthKey={monthKey} setMonthKey={setMonthKey} />
            </ScheduleDashboardTabs>

            <div className="space-y-4 border-t border-slate-200/70 pt-4">
              {appointmentsLoading && (
                <div className="text-sm text-muted-foreground p-3">Loading appointments…</div>
              )}
              {!appointmentsLoading &&
                scheduleItems.map((apt) => {
                  const uiStatus = normalizeAppointmentStatus(apt.status)
                  const dateLabel = String(apt.date || "").slice(0, 10)
                  return (
                    <div key={apt.id} className="flex items-center justify-between p-4 border rounded-lg">
                      <div className="flex items-center gap-4">
                        <div className="flex w-28 shrink-0 flex-col text-sm">
                          <span className="font-medium">{dateLabel}</span>
                          <span className="text-muted-foreground">{String(apt.time || "").slice(0, 5)}</span>
                        </div>
                        <div>
                          <p className="font-medium">
                            {apt.patientId ? (
                              <Link
                                to={`/doctor/medical_records/${apt.patientId}/dashboard`}
                                className="text-cyan-700 hover:underline"
                              >
                                {apt.patientName || `Patient #${apt.patientId}`}
                              </Link>
                            ) : (
                              apt.patientName || "Unknown patient"
                            )}
                          </p>
                          <p className="text-sm text-muted-foreground">{apt.department || "General consultation"}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-xs px-2 py-1 rounded-full ${
                            uiStatus === "Done"
                              ? "bg-green-100 text-green-700"
                              : uiStatus === "Upcoming"
                                ? "bg-blue-100 text-blue-700"
                                : uiStatus === "Cancelled"
                                  ? "bg-yellow-100 text-yellow-700"
                                  : "bg-gray-100 text-gray-700"
                          }`}
                        >
                          {uiStatus}
                        </span>
                        {apt.patientId ? (
                          <Button variant="outline" size="sm" asChild>
                            <Link to={`/doctor/medical_records/${apt.patientId}/dashboard`}>View EMR</Link>
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  )
                })}
              {!appointmentsLoading && scheduleItems.length === 0 && (
                <div className="text-sm text-muted-foreground p-3">No appointments in the selected range.</div>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-6 md:grid-cols-2">
          <Card className="card-feature border-slate-200/60">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Recent patients</CardTitle>
            </CardHeader>
            <CardContent className="p-6 pt-0">
            <div className="space-y-3">
              {(dashboardSummary?.recentPatients || []).map((patient) => (
                <div key={patient.patientId} className="flex items-center justify-between p-3 border rounded-lg">
                  <div>
                    <p className="font-medium">
                      <Link
                        to={`/doctor/medical_records/${patient.patientId}/dashboard`}
                        className="text-cyan-700 hover:underline"
                      >
                        {patient.patientName}
                      </Link>
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Last visit: {patient.lastTime ? new Date(patient.lastTime).toLocaleString("en-US") : "—"}
                    </p>
                  </div>
                  <Button variant="ghost" size="sm" asChild>
                    <Link to={`/doctor/medical_records/${patient.patientId}/dashboard`}>View EMR</Link>
                  </Button>
                </div>
              ))}
              {(dashboardSummary?.recentPatients?.length || 0) === 0 && (
                <div className="text-sm text-muted-foreground p-3">No recent patients.</div>
              )}
            </div>
            </CardContent>
          </Card>

          <Card className="card-feature border-slate-200/60">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Notes</CardTitle>
            </CardHeader>
            <CardContent className="p-6 pt-0">
            <div className="text-sm text-muted-foreground p-3">—</div>
            </CardContent>
          </Card>
        </div>
      </div>
    </DoctorLayout>
  )
}
