"use client"

<<<<<<< HEAD
import { useEffect, useState } from "react"
import { useParams } from "react-router-dom"
import { Card, CardContent } from "@/components/ui/card"
import {
  Calendar,
  Pill,
  Activity,
  Clock,
  ChevronRight,
  User,
  Loader2,
} from "lucide-react"
import { CollapsibleSection } from "@/components/collapsible-section"
import {
  doctorService,
  type Diagnosis,
  type Prescription,
  type DoctorAppointment,
  type HealthInfo,
} from "@/services/doctor-service"

export default function ViewingPatientDashboard() {
  const { patientId } = useParams()
  const pid = Number(patientId)

  const [latestDiagnosis, setLatestDiagnosis] = useState<Diagnosis | null>(null)
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([])
  const [appointments, setAppointments] = useState<DoctorAppointment[]>([])
  const [healthInfo, setHealthInfo] = useState<HealthInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [openPrescriptions, setOpenPrescriptions] = useState<number[]>([])

  useEffect(() => {
    if (!pid) return
    let cancelled = false
    const load = async () => {
      const [diagRes, rxRes, apptRes, hiRes] = await Promise.all([
        doctorService.getDiagnoses(pid).catch(() => ({ success: false, diagnoses: [] as Diagnosis[] })),
        doctorService.getPrescriptions(pid).catch(() => ({ success: false, prescriptions: [] as Prescription[] })),
        doctorService.getAppointments().catch(() => ({ success: false, appointments: [] as DoctorAppointment[] })),
        doctorService.getHealthInfo(pid).catch(() => ({ success: false, healthInfo: null as HealthInfo | null })),
      ])
      if (cancelled) return
      const diags = diagRes.diagnoses || []
      setLatestDiagnosis(diags.length > 0 ? diags[0] : null)
      setPrescriptions(rxRes.prescriptions || [])
      const allAppts = apptRes.appointments || []
      setAppointments(allAppts.filter(a => a.patientId === pid))
      setHealthInfo(hiRes.healthInfo || null)
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [pid])

  const togglePrescription = (id: number) => {
    setOpenPrescriptions((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    )
  }

  // Upcoming appointments (status Pending or Confirmed, date >= today)
  const upcomingAppointments = appointments.filter((a) => {
    const apptDate = new Date(a.date)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    return apptDate >= today && (a.status === "Pending" || a.status === "Confirmed")
  })

  const activePrescriptions = prescriptions.filter((rx) => rx.status === "Active")

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-slate-500">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        Loading dashboard…
      </div>
    )
  }

  return (
    <div>
      <div className="relative space-y-8 pb-12">
        {/* Quick Stats Cards */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {/* Current Diagnosis Card */}
          <Card className="card-feature card-feature-hover cursor-pointer h-full group border-r border-white/40 sticky top-16 bg-white/80 backdrop-blur-xl shadow-[4px_0_20px_rgba(0,0,0,0.05)] z-40">
            <CardContent className="p-6">
              <div className="flex items-start justify-between mb-4">
                <div className="card-icon-wrapper">
                  <Activity className="h-7 w-7" />
                </div>
                <ChevronRight className="h-5 w-5 text-slate-400 group-hover:text-cyan-500 transition-colors" />
              </div>
              <h3 className="text-sm font-medium text-slate-500 mb-1">
                Current Diagnosis
              </h3>
              {latestDiagnosis ? (
                <>
                  <div className="text-2xl font-bold text-slate-900 mb-1">
                    {latestDiagnosis.icd10 || "—"}
                  </div>
                  <p className="text-sm text-slate-600">
                    {latestDiagnosis.interpretation || latestDiagnosis.complaint || "—"}
                  </p>
                </>
              ) : (
                <p className="text-sm text-slate-400 mt-2">No diagnosis recorded</p>
              )}
            </CardContent>
          </Card>

          {/* Vital Signs Summary */}
          <Card className="col-span-3 card-feature card-feature-hover cursor-pointer h-full group border-r border-white/40 sticky top-16 bg-white/80 backdrop-blur-xl shadow-[4px_0_20px_rgba(0,0,0,0.05)] z-40">
            <CardContent className="p-6">
              <div className="flex items-start justify-between mb-3">
                <div className="card-icon-wrapper">
                  <Activity className="h-7 w-7" />
                </div>
              </div>
              <h3 className="text-sm font-medium text-slate-500 mb-3">
                Latest Vital Signs
              </h3>
              {healthInfo ? (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <p className="text-xs text-slate-500">Blood Pressure</p>
                    <p className="text-lg font-semibold">
                      {healthInfo.bloodPressureSys ?? "—"}/{healthInfo.bloodPressureDia ?? "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Heart Rate</p>
                    <p className="text-lg font-semibold">
                      {healthInfo.heartRate ?? "—"} <span className="text-xs text-slate-400">bpm</span>
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Temperature</p>
                    <p className="text-lg font-semibold">
                      {healthInfo.temperature ?? "—"} <span className="text-xs text-slate-400">°C</span>
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">SpO2</p>
                    <p className="text-lg font-semibold">
                      {healthInfo.spo2 ?? "—"} <span className="text-xs text-slate-400">%</span>
                    </p>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-slate-400">No health info recorded</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Upcoming Appointments Section */}
        <CollapsibleSection
          title="Upcoming Appointments"
          description="Scheduled visits for this patient"
          defaultOpen={true}
        >
          {upcomingAppointments.length === 0 ? (
            <p className="text-sm text-slate-400 py-4">No upcoming appointments</p>
          ) : (
            <div className="space-y-4">
              {upcomingAppointments.map((appt) => (
                <Card
                  key={appt.id}
                  className="card-feature-group transition-all duration-300 hover:shadow-lg"
                >
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4 flex-1">
                        <div className="icon-feature-card">
                          <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-linear-to-br from-cyan-50 to-cyan-100">
                            <Calendar className="h-7 w-7" />
                          </div>
                        </div>
                        <div className="flex-1">
                          <p className="text-xl font-semibold mb-1">
                            {appt.department || "Appointment"}
                          </p>
                          <p className="text-sm text-slate-600 flex items-center gap-2">
                            <User className="h-4 w-4" />
                            Dr. {appt.doctor}
                          </p>
                          <p className="text-sm text-slate-500 flex items-center gap-2 mt-1">
                            <Clock className="h-4 w-4" />
                            {new Date(appt.date).toLocaleDateString("en-GB", {
                              day: "2-digit",
                              month: "short",
                              year: "numeric",
                            })}{" "}
                            — {appt.time?.substring(0, 5)}
                          </p>
                          {appt.room && (
                            <p className="text-xs text-slate-400 mt-1">
                              Room {appt.room}
                            </p>
                          )}
                        </div>
                      </div>
                      <div
                        className={`px-3 py-1 rounded-full text-xs font-medium ${
                          appt.status === "Confirmed"
                            ? "bg-cyan-50 text-cyan-700 border border-cyan-100"
                            : "bg-yellow-50 text-yellow-700 border border-yellow-100"
                        }`}
                      >
                        {appt.status}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CollapsibleSection>

        {/* Active Prescriptions */}
        <CollapsibleSection
          title="Active Prescriptions"
          description="Currently prescribed medications"
          icon={<Pill className="h-5 w-5" />}
          defaultOpen={true}
        >
          {activePrescriptions.length === 0 ? (
            <p className="text-sm text-slate-400 py-4">No active prescriptions</p>
          ) : (
            <div className="space-y-4">
              {activePrescriptions.map((rx) => {
                const isOpen = openPrescriptions.includes(rx.id)

                return (
                  <Card key={rx.id} className="card-feature-group">
                    <CardContent className="p-4 space-y-3">
                      {/* Prescription header */}
                      <button
                        onClick={() => togglePrescription(rx.id)}
                        className="w-full flex items-center justify-between text-left"
                      >
                        <div>
                          <p className="font-semibold text-slate-900">
                            Prescription ·{" "}
                            {new Date(rx.createdAt).toLocaleDateString("en-CA")}
                          </p>
                          <p className="text-sm text-slate-500">
                            {rx.doctorName} — {rx.department}
                          </p>
                        </div>

                        <ChevronRight
                          className={`h-4 w-4 transition-transform ${
                            isOpen ? "rotate-90" : ""
                          }`}
                        />
                      </button>

                      {/* Medications */}
                      {isOpen && (
                        <div className="pt-2 space-y-2 border-t">
                          {rx.medications.map((med, i) => (
                            <div
                              key={med.id ?? i}
                              className="flex items-center justify-between text-sm"
                            >
                              <div>
                                <p className="font-medium">{med.name}</p>
                                <p className="text-slate-500">{med.frequency}</p>
                              </div>
                              <span className="text-xs px-2 py-1 rounded-full bg-slate-100">
                                {med.quantity}
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
          )}
        </CollapsibleSection>
      </div>
    </div>
=======
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Calendar, Pill, Activity, Clock, TrendingUp ,ChevronRight,User } from "lucide-react"
import { Link } from "react-router-dom";
import { CollapsibleSection } from "@/components/collapsible-section"
import { useState } from "react";

export default function ViewingPatientDashboard() {
  const prescriptions = [
    {
      id: "RX001",
      date: "2025-12-10",
      doctor: "Dr. Sarah Johnson",
      status: "Active",
      medications: [
        {
          name: "Amoxicillin 500mg",
          usage: "3 times daily",
          duration: "7 days",
        },
        {
          name: "Paracetamol 500mg",
          usage: "As needed",
          duration: "PRN",
        },
      ],
    },
    {
      id: "RX002",
      date: "2025-12-05",
      doctor: "Dr. Michael Chen",
      status: "Active",
      medications: [
        {
          name: "Vitamin D3 1000 IU",
          usage: "Once daily",
          duration: "30 days",
        },
      ],
    },
  ]

  const [openPrescriptions, setOpenPrescriptions] = useState<string[]>([])

  const togglePrescription = (id: string) => {
    setOpenPrescriptions(prev =>
      prev.includes(id)
        ? prev.filter(x => x !== id)
        : [...prev, id]
    )
  }

  return (
    <div>
      <div className="relative space-y-8 pb-12">
        {/* Header Section với gradient text */}

        {/* Quick Stats Cards - Design mới với gradient border */}
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
                <h3 className="text-sm font-medium text-slate-500 mb-1">Current Diagnosis</h3>
                <div className="text-2xl font-bold text-slate-900 mb-1">J06.9</div>
                <p className="text-sm text-slate-600">Acute Upper Respiratory</p>
              </CardContent>
            </Card>
          </Link>

          <Card className="col-span-3 card-feature card-feature-hover cursor-pointer h-full group border-r border-white/40 sticky top-16 bg-white/80 backdrop-blur-xl shadow-[4px_0_20px_rgba(0,0,0,0.05)] z-40">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-start justify-between">
                    <div className="card-icon-wrapper">
                      <TrendingUp className="h-7 w-7" />
                    </div>
                    <ChevronRight className="absolute top-6 right-6 h-5 w-5 text-slate-400 group-hover:text-cyan-500 transition-colors" />
                  </div>
                  <h3 className="text-sm font-medium text-slate-500">
                    Recovery Progress
                  </h3>
                  <p className="text-xl font-semibold text-slate-900">
                    Estimated full recovery in 5-7 days
                  </p>
                </div>
              </div>

              {/* Progress bar */}
              <div className="space-y-3">
                <div className="flex justify-between text-sm font-medium">
                  <span>Overall Recovery</span>
                  <span className="text-cyan-600">75%</span>
                </div>

                <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full bg-linear-to-r from-cyan-400 to-cyan-600"
                    style={{ width: "75%" }}
                  />
                </div>

                <p className="text-sm text-slate-600">
                  Based on your current treatment and recovery trend, you are responding
                  very well.
                </p>
              </div>
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
            <Card className="card-feature-group transition-all duration-300 hover:shadow-lg ">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4 flex-1">
                    <div className="icon-feature-card">
                      <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-linear-to-br from-cyan-50 to-cyan-100">
                        <Calendar className="h-7 w-7" />
                      </div>
                    </div>
                    <div className="flex-1">
                      <p className="text-xl font-semibold mb-1">Follow-up Visit</p>
                      <p className="text-sm text-slate-600 flex items-center gap-2">
                        <User className="h-4 w-4" />
                        Dr. Sarah Johnson - Cardiology
                      </p>
                      <p className="text-sm text-slate-500 flex items-center gap-2 mt-1">
                        <Clock className="h-4 w-4" />
                        Tomorrow, 10:00 AM
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="btn-outline">
                      Modify appointment
                    </Button>
                    <Button variant="outline" size="sm" className="hover:bg-red-50 hover:text-red-600 hover:border-red-300">
                      Cancel
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <Button className="w-full mt-6 btn-gradient transition-transform duration-500" asChild>
            <Link to="/patient/appointments" className="flex items-center justify-center gap-2">
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
              {prescriptions.map(rx => {
                const isOpen = openPrescriptions.includes(rx.id)

                return (
                  <Card key={rx.id} className="card-feature-group">
                    <CardContent className="p-4 space-y-3">
                      {/* Prescription header */}
                      <button
                        onClick={() => togglePrescription(rx.id)}
                        className="w-full flex items-center justify-between text-left"
                      >
                        <div>
                          <p className="font-semibold text-slate-900">
                            Prescription · {rx.date}
                          </p>
                          <p className="text-sm text-slate-500">
                            {rx.doctor}
                          </p>
                        </div>

                        <ChevronRight
                          className={`h-4 w-4 transition-transform ${
                            isOpen ? "rotate-90" : ""
                          }`}
                        />
                      </button>

                      {/* Medications */}
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
                                  {med.usage}
                                </p>
                              </div>
                              <span className="text-xs px-2 py-1 rounded-full bg-slate-100">
                                {med.duration}
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
<<<<<<< HEAD
    </>
>>>>>>> 0d84f273 (Add doctor portal)
=======
    </div>
>>>>>>> eca8cbaa (add some page in doctor portal)
  )
}
