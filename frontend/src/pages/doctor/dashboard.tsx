"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Calendar, FileText, FlaskConical, Pill } from "lucide-react"
import { Link } from "react-router-dom";
import { DoctorLayout } from "@/components/doctor-layout"
import { CollapsibleSection } from "@/components/collapsible-section"
import { useEffect, useMemo, useState } from "react"
import { doctorService, type DoctorAppointment, type DoctorDashboardSummary } from "@/services/doctor-service"

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
  const [dashboardSummary, setDashboardSummary] = useState<DoctorDashboardSummary | null>(null)

  useEffect(() => {
    const loadAppointments = async () => {
      try {
        const res = await doctorService.getAppointments()
        setAppointments(res.appointments || [])
      } catch (error) {
        console.error("Load doctor appointments failed:", error)
      }
    }

    void loadAppointments()
  }, [])

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

  const todayAppointments = useMemo(() => {
    const todayIso = new Date().toISOString().slice(0, 10)
    return appointments.filter((apt) => String(apt.date || "").slice(0, 10) === todayIso)
  }, [appointments])

  const scheduleItems = appointments

  return (
    <DoctorLayout>
      <div className="space-y-6">
        <div>
        </div>

        <CollapsibleSection title="Overview Statistics" description="Today's performance metrics" defaultOpen={true}>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Appointments</CardTitle>
                <Calendar className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{todayAppointments.length}</div>
                <p className="text-xs text-muted-foreground">Today</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Diagnoses</CardTitle>
                <FileText className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{dashboardSummary?.summary?.diagnosesToday ?? 0}</div>
                <p className="text-xs text-muted-foreground">Today</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Prescriptions</CardTitle>
                <Pill className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{dashboardSummary?.summary?.prescriptionsToday ?? 0}</div>
                <p className="text-xs text-muted-foreground">Today</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Lab Tests</CardTitle>
                <FlaskConical className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{dashboardSummary?.summary?.labTestsToday ?? 0}</div>
                <p className="text-xs text-muted-foreground">Today</p>
              </CardContent>
            </Card>
          </div>
        </CollapsibleSection>

        <CollapsibleSection
          title="Today's Schedule"
          description="Your appointments from database"
          defaultOpen={true}
        >
          <div className="space-y-4">
            {scheduleItems.slice(0, 6).map((apt) => {
              const uiStatus = normalizeAppointmentStatus(apt.status)
              return (
              <div key={apt.id} className="flex items-center justify-between p-4 border rounded-lg">
                <div className="flex items-center gap-4">
                  <div className="text-sm font-medium w-20">{String(apt.time || "").slice(0, 5)}</div>
                  <div>
                    <p className="font-medium">{apt.patientName || "Unknown patient"}</p>
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
                  <Button variant="outline" size="sm" asChild>
                    <Link to={`/doctor/medical_records/${apt.patientId}/dashboard`}>View</Link>
                  </Button>
                </div>
              </div>
            )})}
            {scheduleItems.length === 0 && (
              <div className="text-sm text-muted-foreground p-3">No appointments found.</div>
            )}
          </div>
        </CollapsibleSection>

        <div className="grid gap-6 md:grid-cols-2">
          <CollapsibleSection title="Recent Patients" description="Patients you've seen recently" defaultOpen={true}>
            <div className="space-y-3">
              {(dashboardSummary?.recentPatients || []).map((patient) => (
                <div key={patient.patientId} className="flex items-center justify-between p-3 border rounded-lg">
                  <div>
                    <p className="font-medium">{patient.patientName}</p>
                    <p className="text-sm text-muted-foreground">
                      Last visit: {patient.lastTime ? new Date(patient.lastTime).toLocaleString("vi-VN") : "—"}
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
          </CollapsibleSection>

          <CollapsibleSection title="AI Insights" description="Intelligent recommendations" defaultOpen={true}>
            <div className="text-sm text-muted-foreground p-3">—</div>
          </CollapsibleSection>
        </div>
      </div>
    </DoctorLayout>
  )
}
