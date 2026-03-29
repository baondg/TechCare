"use client"

import { useState, useMemo } from "react"
import { Calendar, Search, Clock, User, XCircle, ArrowRightFromLine } from "lucide-react"
import { DoctorLayout } from "@/components/doctor-layout"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { format, parseISO } from "date-fns"
import { useDoctorAppointments } from "@/hooks/useDoctorAppointments"

type AppointmentUiStatus = "Done" | "Upcoming" | "Confirmed" | "Cancelled"

const normalizeAppointmentStatus = (status?: string): AppointmentUiStatus => {
  const value = String(status || "").trim().toLowerCase()
  if (value === "done" || value === "completed") return "Done"
  if (value === "confirmed") return "Confirmed"
  if (value === "cancelled" || value === "canceled" || value === "rejected") return "Cancelled"
  return "Upcoming"
}

export default function DoctorAppointmentsPage() {
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")

  const { appointments, loading, reject } = useDoctorAppointments()

  const filteredAppointments = useMemo(() => {
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
    return filtered
  }, [appointments, startDate, endDate])

  const handleReject = async (id: number) => {
    if (!window.confirm("Take over this appointment?")) return
    await reject(id)
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
            filteredAppointments.map((appointment) => {
              const uiStatus = normalizeAppointmentStatus(appointment.status)
              return (
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
                        Patient: {appointment.patientName || "Unknown patient"}
                      </div>

                      <div className="flex items-center text-slate-500">
                        <Clock className="w-4 h-4 mr-2" />
                        {format(parseISO(appointment.date), "dd MMM yyyy")} —{" "}
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
                      </div>

                      {/* ACTION BUTTONS */}
                      {uiStatus === "Upcoming" && (
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            className="border-red-200 text-red-700 hover:bg-red-50"
                            onClick={() => handleReject(appointment.id)}
                          >
                            <ArrowRightFromLine className="w-4 h-4 mr-2" />
                            Cover
                          </Button>
                        </div>
                      )}
                    </div>

                  </div>
                </CardContent>
              </Card>
            )})
          )}
        </div>
      </div>
    </DoctorLayout>
  )
}
