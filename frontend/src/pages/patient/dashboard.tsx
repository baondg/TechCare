"use client"

import { useEffect, useMemo, useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Calendar, Pill, Activity, Clock, TrendingUp, ChevronRight, User, TestTube } from "lucide-react"
import { Link } from "react-router-dom"
import { PatientLayout } from "@/components/patient-layout"
import { CollapsibleSection } from "@/components/collapsible-section"
import { appointmentService, type PatientDashboardSummary } from "@/services/appointment-service"

export default function PatientDashboard() {
  const [dashboard, setDashboard] = useState<PatientDashboardSummary | null>(null)

  useEffect(() => {
    const load = async () => {
      try {
        const data = await appointmentService.getPatientDashboardSummary()
        setDashboard(data)
      } catch (error) {
        console.error("Load patient dashboard failed:", error)
      }
    }
    load()
  }, [])

  const nextAppointment = dashboard?.summary?.nextAppointment || null
  const diagnosis = dashboard?.summary?.currentDiagnosis || null
  const activePrescriptionCount = dashboard?.summary?.activePrescriptions ?? 0
  const labResultsCount = dashboard?.summary?.labResults ?? 0
  const prescriptionGroups = dashboard?.activePrescriptionsList ?? []
  const upcomingAppointments = dashboard?.upcomingAppointments || []

  const nextApptLabel = useMemo(() => {
    if (!nextAppointment) return "—"
    return `${nextAppointment.date} ${String(nextAppointment.time).slice(0, 5)}`
  }, [nextAppointment])

  return (
    <PatientLayout>
      <div className="relative space-y-8 pb-12">
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          <Link to="/patient/appointments">
            <Card className="card-feature card-feature-hover cursor-pointer h-full group border-r border-white/40 sticky top-16 bg-white/80 backdrop-blur-xl shadow-[4px_0_20px_rgba(0,0,0,0.05)] z-40">
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-1">
                  <div className="card-icon-wrapper h-12 w-12">
                    <Calendar className="h-5 w-5" />
                  </div>
                  <ChevronRight className="h-5 w-5 text-slate-400 group-hover:text-cyan-500 transition-colors" />
                </div>
                <h3 className="text-sm font-medium text-slate-500 mb-1">Next Appointment</h3>
                <div className="text-lg font-bold text-slate-900 mb-1">{nextApptLabel}</div>
                <p className="text-sm text-slate-600">{nextAppointment ? `Dr. ${nextAppointment.doctor}` : "No upcoming appointment"}</p>
              </CardContent>
            </Card>
          </Link>

          <Link to="/patient/records">
            <Card className="card-feature card-feature-hover cursor-pointer h-full group border-r border-white/40 sticky top-16 bg-white/80 backdrop-blur-xl shadow-[4px_0_20px_rgba(0,0,0,0.05)] z-40">
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-1">
                  <div className="card-icon-wrapper h-12 w-12">
                    <Activity className="h-5 w-5" />
                  </div>
                  <ChevronRight className="h-5 w-5 text-slate-400 group-hover:text-cyan-500 transition-colors" />
                </div>
                <h3 className="text-sm font-medium text-slate-500 mb-1">Current Diagnosis</h3>
                <div className="text-xl font-bold text-slate-900 mb-1">{diagnosis?.interpretation || "—"}</div>
                <p className="text-sm text-slate-600">{diagnosis?.icd10 || "No diagnosis yet"}</p>
              </CardContent>
            </Card>
          </Link>

          <Link to="/patient/records?tab=prescriptions">
            <Card className="card-feature card-feature-hover cursor-pointer h-full group">
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-1">
                  <div className="card-icon-wrapper h-12 w-12">
                    <Pill className="h-5 w-5" />
                  </div>
                  <ChevronRight className="h-5 w-5 text-slate-400 group-hover:text-cyan-500" />
                </div>
                <h3 className="text-sm font-medium text-slate-500 mb-1">Prescriptions</h3>
                <div className="text-xl font-bold text-slate-900 mb-1">{activePrescriptionCount}</div>
                <p className="text-sm text-slate-600">Available prescriptions</p>
              </CardContent>
            </Card>
          </Link>

          <Link to="/patient/records?tab=lab-results">
            <Card className="card-feature card-feature-hover cursor-pointer h-full group">
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-1">
                  <div className="card-icon-wrapper h-12 w-12">
                    <TestTube className="h-5 w-5" />
                  </div>
                  <ChevronRight className="h-5 w-5 text-slate-400 group-hover:text-cyan-500" />
                </div>
                <h3 className="text-sm font-medium text-slate-500 mb-1">Lab Results</h3>
                <div className="text-xl font-bold text-slate-900 mb-1">{labResultsCount || "—"}</div>
                <p className="text-sm text-slate-600">Available results</p>
              </CardContent>
            </Card>
          </Link>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <CollapsibleSection
            title="Active Medications"
            icon={<Pill className="h-5 w-5" />}
            defaultOpen={true}
          >
            <div className="space-y-6">
              {prescriptionGroups.length === 0 && (
                <Card className="card-feature-group">
                  <CardContent className="p-4 text-sm text-slate-500">No active medications.</CardContent>
                </Card>
              )}
              {prescriptionGroups.map((rx) => {
                const dateLabel = (() => {
                  try {
                    const d = new Date(rx.prescribedAt)
                    return Number.isNaN(d.getTime()) ? String(rx.prescribedAt) : d.toLocaleString("vi-VN")
                  } catch {
                    return String(rx.prescribedAt)
                  }
                })()
                return (
                  <Card className="card-feature-group border border-slate-200/80" key={rx.id}>
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
                        <Pill className="h-4 w-4 text-cyan-600 shrink-0" />
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                            Prescription
                          </p>
                          <p className="text-sm font-medium text-slate-800">{dateLabel}</p>
                          {rx.doctorName?.trim() ? (
                            <p className="text-xs text-slate-500 mt-0.5">Prescribed by {rx.doctorName.trim()}</p>
                          ) : null}
                        </div>
                      </div>
                      <div className="space-y-2">
                        {rx.medications.map((med) => (
                          <div
                            key={med.id}
                            className="flex items-center justify-between rounded-lg bg-slate-50/80 px-3 py-2.5"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-linear-to-br from-purple-50 to-purple-100">
                                <Pill className="h-5 w-5 text-purple-600" />
                              </div>
                              <div className="min-w-0">
                                <p className="font-semibold text-slate-900 truncate">{med.name}</p>
                                <p className="text-sm text-slate-600 line-clamp-2">
                                  {med.frequency || "—"}
                                  {med.duration ? ` · ${med.duration} day(s)` : ""}
                                </p>
                              </div>
                            </div>
                            <span className="inline-flex shrink-0 items-center px-2.5 py-1 rounded-full text-xs font-medium bg-white text-slate-700 border border-slate-200 ml-2">
                              Qty: {med.quantity || "—"}
                            </span>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>

            <Button variant="outline" size="sm" className="w-full mt-4 btn-gradient transition-transform duration-500" asChild>
              <Link to="/patient/records?tab=prescriptions">View All Medications</Link>
            </Button>
          </CollapsibleSection>

          <CollapsibleSection
            title="Recovery Progress"
            icon={<TrendingUp className="h-5 w-5" />}
            defaultOpen={true}
          >
            <Card className="card-feature-group">
              <CardContent className="p-4 text-sm text-slate-500">—</CardContent>
            </Card>
          </CollapsibleSection>
        </div>

        <CollapsibleSection
          title="Upcoming Appointments"
          description="Your scheduled visits"
          defaultOpen={true}
        >
          <div className="space-y-4">
            {upcomingAppointments.length === 0 && (
              <Card className="card-feature-group transition-all duration-300 hover:shadow-lg ">
                <CardContent className="p-6 text-sm text-slate-500">No upcoming appointments.</CardContent>
              </Card>
            )}
            {upcomingAppointments.map((apt) => (
              <Card key={apt.id} className="card-feature-group transition-all duration-300 hover:shadow-lg ">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4 flex-1">
                      <div className="icon-feature-card">
                        <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-linear-to-br from-cyan-50 to-cyan-100">
                          <Calendar className="h-7 w-7" />
                        </div>
                      </div>
                      <div className="flex-1">
                        <p className="text-xl font-semibold mb-1">{apt.department || "Consultation"}</p>
                        <p className="text-sm text-slate-600 flex items-center gap-2">
                          <User className="h-4 w-4" />
                          Dr. {apt.doctor}
                        </p>
                        <p className="text-sm text-slate-500 flex items-center gap-2 mt-1">
                          <Clock className="h-4 w-4" />
                          {apt.date} {String(apt.time).slice(0, 5)} {apt.room ? `• Room ${apt.room}` : ""}
                        </p>
                      </div>
                    </div>
                    <div className="text-sm text-slate-600">{apt.status}</div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <Button className="w-full mt-6 btn-gradient transition-transform duration-500" asChild>
            <Link to="/patient/appointments" className="flex items-center justify-center gap-2">
              View All Appointments
              <ChevronRight className="h-4 w-4" />
            </Link>
          </Button>
        </CollapsibleSection>
      </div>

      <style>{`
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
        .animate-shimmer {
          animation: shimmer 2s infinite;
        }
      `}</style>
    </PatientLayout>
  )
}
