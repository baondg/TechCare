"use client"

import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Calendar, Pill, Activity, Clock, ChevronRight, User } from "lucide-react"
import { Link } from "react-router-dom";
import { CollapsibleSection } from "@/components/collapsible-section"
import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { doctorService, type Prescription, type DoctorAppointment } from "@/services/doctor-service";

function appointmentStatusLabel(status: string | undefined): string {
  const s = String(status || "").trim()
  if (/^pending$/i.test(s)) return "Upcoming"
  return s || "Upcoming"
}

export default function ViewingPatientDashboard() {
  const { patientId } = useParams<{ patientId: string }>()
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([])
  const [appointments, setAppointments] = useState<DoctorAppointment[]>([])
  const [openPrescriptions, setOpenPrescriptions] = useState<number[]>([])

  useEffect(() => {
    const loadPrescriptions = async () => {
      if (!patientId) return
      try {
        const res = await doctorService.getPrescriptions(patientId)
        const rows = res.prescriptions || []
        setPrescriptions(rows)
        if (rows.length > 0) setOpenPrescriptions([rows[0].id])
      } catch (error) {
        console.error("Load prescriptions failed:", error)
      }
    }
    void loadPrescriptions()
  }, [patientId])

  useEffect(() => {
    const loadAppointments = async () => {
      if (!patientId) return
      try {
        const res = await doctorService.getAppointments()
        const numericPatientId = Number(String(patientId).replace(/^OP0*/i, ""))
        const rows = (res.appointments || []).filter((a) => Number(a.patientId) === numericPatientId)
        setAppointments(rows)
      } catch (error) {
        console.error("Load appointments failed:", error)
      }
    }
    void loadAppointments()
  }, [patientId])

  const togglePrescription = (id: number) => {
    setOpenPrescriptions((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    )
  }

  const activePrescriptions = useMemo(() => prescriptions, [prescriptions])

  return (
    <div>
      <div className="relative space-y-8 pb-12">
        {/* Quick Stats Cards */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          <Link to="/patient/medical-record">
            <Card className="card-feature card-feature-hover cursor-pointer h-full group border-r border-white/40 sticky top-16 bg-white/80 backdrop-blur-xl shadow-[4px_0_20px_rgba(0,0,0,0.05)] z-40">
              <CardContent className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="card-icon-wrapper">
                    <Activity className="h-7 w-7" />
                  </div>
                  <ChevronRight className="h-5 w-5 text-slate-400 group-hover:text-cyan-500 transition-colors" />
                </div>
                <h3 className="text-sm font-medium text-slate-500 mb-1"></h3>
                <div className="text-2xl font-bold text-slate-900 mb-1"></div>
                <p className="text-sm text-slate-600"></p>
              </CardContent>
            </Card>
          </Link>

          <Card className="col-span-3 card-feature card-feature-hover cursor-pointer h-full group border-r border-white/40 sticky top-16 bg-white/80 backdrop-blur-xl shadow-[4px_0_20px_rgba(0,0,0,0.05)] z-40">
            <CardContent className="p-6">
              <div className="flex items-center justify-between" />
            </CardContent>
          </Card>
        </div>

        {/* Upcoming Appointments Section */}
        <CollapsibleSection 
          title="Upcoming Appointments" 
          description="Your scheduled visits" 
          defaultOpen={true}
        >
          <div className="space-y-4">
            {appointments.length === 0 && (
              <Card className="card-feature-group transition-all duration-300 hover:shadow-lg ">
                <CardContent className="p-6 text-sm text-slate-500">
                  No appointments found for this patient.
                </CardContent>
              </Card>
            )}
            {appointments.slice(0, 5).map((apt) => (
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
                          {apt.patientName || "Patient"}
                        </p>
                        <p className="text-sm text-slate-500 flex items-center gap-2 mt-1">
                          <Clock className="h-4 w-4" />
                          {apt.date} {String(apt.time).slice(0, 5)}
                        </p>
                      </div>
                    </div>
                    <div className="text-sm text-slate-600">{appointmentStatusLabel(apt.status)}</div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <Button className="w-full mt-6 btn-gradient transition-transform duration-500" asChild>
            <Link to="/nurse/appointments" className="flex items-center justify-center gap-2">
              View All Appointments
              <ChevronRight className="h-4 w-4" />
            </Link>
          </Button>
        </CollapsibleSection>

        {/* Two Column Layout */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Active Medications */}
          <CollapsibleSection
            title="Active Prescriptions"
            description="Currently prescribed medications"
            icon={<Pill className="h-5 w-5" />}
            defaultOpen={true}
          >
            <div className="space-y-4">
              {activePrescriptions.length === 0 && (
                <Card className="card-feature-group">
                  <CardContent className="p-4 text-sm text-slate-500">
                    No prescriptions found for this patient.
                  </CardContent>
                </Card>
              )}
              {activePrescriptions.map((rx) => {
                const isOpen = openPrescriptions.includes(rx.id)
                const dateLabel = rx.createdAt
                  ? new Date(rx.createdAt).toLocaleString("vi-VN")
                  : String(rx.id)

                return (
                  <Card key={rx.id} className="card-feature-group">
                    <CardContent className="p-4 space-y-3">
                      <button
                        onClick={() => togglePrescription(rx.id)}
                        className="w-full flex items-center justify-between text-left"
                      >
                        <div>
                          <p className="font-semibold text-slate-900">
                            Prescription # {dateLabel}
                          </p>
                          <p className="text-sm text-slate-500">
                            {rx.doctorName}
                          </p>
                        </div>

                        <ChevronRight
                          className={`h-4 w-4 transition-transform ${
                            isOpen ? "rotate-90" : ""
                          }`}
                        />
                      </button>

                      {isOpen && (
                        <div className="pt-2 space-y-2 border-t">
                          {rx.medications.map((med, i) => (
                            <div
                              key={i}
                              className="flex items-center justify-between text-sm"
                            >
                              <div>
                                <p className="font-medium">{med.name}</p>
                                <p className="text-slate-500">
                                  {med.unit || "-"} | {med.usage || "-"} | {med.note || "-"}
                                </p>
                              </div>
                              <span className="text-xs px-2 py-1 rounded-full bg-slate-100">
                                {med.quantity || "-"}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          </CollapsibleSection>
        </div>
      </div>

      <style>{`
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
        
        .animate-shimmer {
          animation: shimmer 2s infinite;
        }

        @keyframes gradient {
          0%, 100% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
        }
        
        .animate-gradient {
          background-size: 200% 200%;
          animation: gradient 3s ease infinite;
        }
      `}</style>
    </div>
  )
}
