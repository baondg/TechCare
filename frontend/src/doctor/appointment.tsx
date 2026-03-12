"use client"

import { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { Calendar, Search, Clock, User, CheckCircle, XCircle } from "lucide-react"
import { DoctorLayout } from "@/components/doctor-layout"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { appointmentService, type Appointment } from "@/services/appointment-service"
import { useAuth } from "@/contexts/AuthContext"
import { format, parseISO } from "date-fns"

export default function DoctorAppointmentsPage() {
  const { user } = useAuth()

  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [filteredAppointments, setFilteredAppointments] = useState<Appointment[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadAppointments()
  }, [])

  useEffect(() => {
    filterAppointments()
  }, [startDate, endDate, appointments])

  const loadAppointments = async () => {
    try {
      setLoading(true)
      const data = await appointmentService.getAppointments()
      
      // lß╗ìc appointment theo doctor hiß╗çn tß║íi
      const doctorAppointments = data.filter(
        (app) => app.doctor === user?.username
      )

      setAppointments(doctorAppointments)
    } catch (error) {
      console.error("Failed to load appointments", error)
    } finally {
      setLoading(false)
    }
  }

  const filterAppointments = () => {
    let filtered = [...appointments]

    if (startDate) {
      const [day, month, year] = startDate.split("/")
      if (day && month && year) {
        const start = new Date(`${year}-${month}-${day}`)
        filtered = filtered.filter(app => new Date(app.date) >= start)
      }
    }

    if (endDate) {
      const [day, month, year] = endDate.split("/")
      if (day && month && year) {
        const end = new Date(`${year}-${month}-${day}`)
        filtered = filtered.filter(app => new Date(app.date) <= end)
      }
    }

    setFilteredAppointments(filtered)
  }

  const handleAccept = async (id: number) => {
    try {
      await appointmentService.updateAppointment(id, { status: "Confirmed" })
      loadAppointments()
    } catch (error) {
      console.error("Accept failed", error)
    }
  }

  const handleReject = async (id: number) => {
    if (!confirm("Reject this appointment?")) return
    try {
      await appointmentService.updateAppointment(id, { status: "Rejected" })
      loadAppointments()
    } catch (error) {
      console.error("Reject failed", error)
    }
  }

  return (
    <DoctorLayout>
      <div className="space-y-8">
        {/* HEADER */}
        <div>
          <h2 className="text-3xl font-bold bg-linear-to-r from-[#06b6d4] via-[#0891b2] to-[#06b6d4] bg-clip-text text-transparent mb-2">
            My Appointments
          </h2>
          <p className="text-slate-600 text-lg">
            Review and manage patient appointments
          </p>
        </div>

        {/* FILTER */}
        <Card className="card-feature border-slate-200/60">
          <CardContent className="p-6 flex items-center gap-4">
            <div className="relative max-w-xs">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <Input
                type="text"
                placeholder="dd/mm/yyyy"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="pl-10 h-12"
              />
            </div>

            <span className="text-slate-400">to</span>

            <div className="relative max-w-xs">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <Input
                type="text"
                placeholder="dd/mm/yyyy"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="pl-10 h-12"
              />
            </div>

            <Button variant="outline">
              <Search className="w-5 h-5 mr-2" />
              Filter
            </Button>
          </CardContent>
        </Card>

        {/* LIST */}
        <div className="space-y-4">
          {loading ? (
            <div className="text-center py-8 text-slate-500">
              Loading appointments...
            </div>
          ) : filteredAppointments.length === 0 ? (
            <div className="text-center py-8 text-slate-500">
              No appointments found.
            </div>
          ) : (
            filteredAppointments.map((appointment) => (
              <Card key={appointment.id} className="card-feature border-slate-200/60">
                <CardContent className="p-6">
                  <div className="flex flex-col md:flex-row justify-between gap-6">

                    {/* LEFT */}
                    <div>
                      <h3 className="text-xl font-bold text-slate-800 mb-2">
                        {appointment.department}
                      </h3>

                      <div className="flex items-center text-slate-600 mb-2">
                        <User className="w-4 h-4 mr-2" />
                        Patient: {appointment.patient}
                      </div>

                      <div className="flex items-center text-slate-500">
                        <Clock className="w-4 h-4 mr-2" />
                        {format(parseISO(appointment.date), "dd MMM yyyy")} ΓÇö{" "}
                        {appointment.time.substring(0, 5)}
                      </div>

                      {appointment.room && (
                        <p className="text-sm text-slate-500 mt-1">
                          Room {appointment.room}
                        </p>
                      )}
                    </div>

                    {/* RIGHT */}
                    <div className="flex flex-col items-end gap-3">

                      {/* STATUS BADGE */}
                      <div
                        className={`px-4 py-1.5 rounded-full text-sm font-medium
                          ${
                            appointment.status === "Pending"
                              ? "bg-yellow-50 text-yellow-700 border border-yellow-100"
                              : appointment.status === "Confirmed"
                              ? "bg-cyan-50 text-cyan-700 border border-cyan-100"
                              : appointment.status === "Done"
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-100"
                              : "bg-red-50 text-red-700 border border-red-100"
                          }`}
                      >
                        {appointment.status}
                      </div>

                      {/* ACTION BUTTONS */}
                      {appointment.status === "Pending" && (
                        <div className="flex gap-2">
                          <Button
                            className="bg-cyan-600 hover:bg-cyan-700 text-white"
                            onClick={() => handleAccept(appointment.id)}
                          >
                            <CheckCircle className="w-4 h-4 mr-2" />
                            Accept
                          </Button>

                          <Button
                            variant="outline"
                            className="border-red-200 text-red-700 hover:bg-red-50"
                            onClick={() => handleReject(appointment.id)}
                          >
                            <XCircle className="w-4 h-4 mr-2" />
                            Reject
                          </Button>
                        </div>
                      )}
                    </div>

                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>
    </DoctorLayout>
  )
}
