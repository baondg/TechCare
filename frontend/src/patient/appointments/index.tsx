"use client"

import { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { Calendar, Search, Clock, User, Plus } from "lucide-react"
import { PatientLayout } from "@/components/patient-layout"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { appointmentService, type Appointment } from "@/services/appointment-service"
import { useAuth } from "@/contexts/AuthContext"
import { format, parseISO } from "date-fns"

export default function AppointmentsPage() {
  const navigate = useNavigate()
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
      setAppointments(data)
    } catch (error) {
      console.error("Failed to load appointments", error)
    } finally {
      setLoading(false)
    }
  }

  const filterAppointments = () => {
    let filtered = [...appointments]

    if (startDate) {
      // Assuming startDate format is dd/mm/yyyy
      const [day, month, year] = startDate.split('/')
      if (day && month && year) {
        const start = new Date(`${year}-${month}-${day}`)
        filtered = filtered.filter(app => new Date(app.date) >= start)
      }
    }

    if (endDate) {
      const [day, month, year] = endDate.split('/')
      if (day && month && year) {
        const end = new Date(`${year}-${month}-${day}`)
        filtered = filtered.filter(app => new Date(app.date) <= end)
      }
    }

    setFilteredAppointments(filtered)
  }

  const handleBookAppointment = () => {
    navigate("/patient/appointments/book-appointment")
  }

  const handleReschedule = (id: number) => {
    console.log("Reschedule appointment:", id)
    navigate("/patient/appointments/book-appointment", { state: { rescheduleId: id } })
  }

  const handleCancel = async (id: number) => {
    if (confirm("Are you sure you want to cancel this appointment?")) {
      try {
        await appointmentService.updateAppointment(id, { status: 'Cancelled' })
        loadAppointments()
      } catch (error) {
        console.error("Failed to cancel appointment", error)
      }
    }
  }

  return (
    <PatientLayout>
      <div className="space-y-8">
        {/* Header Section */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="h-12 text-4xl font-bold bg-linear-to-r from-[#06b6d4] via-[#0891b2] to-[#06b6d4] bg-clip-text text-transparent mb-2">
              My Appointments
            </h2>
            <p className="text-slate-600 text-lg">Manage your hospital visits and consultations</p>
          </div>
          <Button onClick={handleBookAppointment} className="btn-gradient hover:border-none h-14 px-8 text-base shadow-lg">
            <Plus className="h-5 w-5 mr-2" />
            Book Appointment
          </Button>
        </div>

        {/* Filters Section */}
        <Card className="card-feature border-slate-200/60">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="relative flex-1 max-w-xs">
                <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-slate-400" />
                <Input
                  type="text"
                  placeholder="dd/mm/yyyy"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="pl-10 h-12 text-base"
                />
              </div>
              <span className="text-slate-400">to</span>
              <div className="relative flex-1 max-w-xs">
                <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-slate-400" />
                <Input
                  type="text"
                  placeholder="dd/mm/yyyy"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="pl-10 h-12 text-base"
                />
              </div>
              <Button variant="outline" className="h-12 px-6 border-slate-200 text-slate-600 hover:bg-slate-50">
                <Search className="w-5 h-5 mr-2" />
                Filter
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Appointments List */}
        <div className="space-y-4">
          {loading ? (
            <div className="text-center py-8 text-slate-500">Loading appointments...</div>
          ) : filteredAppointments.length === 0 ? (
            <div className="text-center py-8 text-slate-500">No appointments found.</div>
          ) : (
            filteredAppointments.map((appointment) => (
              <Card key={appointment.id} className="card-feature border-slate-200/60 overflow-hidden transition-all duration-300 hover:shadow-md">
                <CardContent className="p-0">
                  <div className="flex flex-col md:flex-row">
                    {/* Date Column */}
                    <div className="bg-slate-50 p-6 flex flex-col items-center justify-center min-w-[150px] border-b md:border-b-0 md:border-r border-slate-100">
                      <span className="text-3xl font-bold text-slate-700">
                        {format(parseISO(appointment.date), 'dd')}
                      </span>
                      <span className="text-lg font-medium text-slate-500 uppercase">
                        {format(parseISO(appointment.date), 'MMM')}
                      </span>
                      <span className="text-sm text-slate-400 mt-1">
                        {format(parseISO(appointment.date), 'yyyy')}
                      </span>
                    </div>

                    {/* Details Column */}
                    <div className="flex-1 p-6">
                      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-4">
                        <div>
                          <h3 className="text-xl font-bold text-slate-800 mb-1">
                            {appointment.department} Consultation
                          </h3>
                          <div className="flex items-center text-slate-500">
                            <User className="w-4 h-4 mr-2" />
                            {appointment.doctor}
                          </div>
                        </div>
                        <div className={`mt-2 md:mt-0 px-4 py-1.5 rounded-full text-sm font-medium ${
                          appointment.status === "Pending"
                            ? "bg-yellow-50 text-yellow-700 border border-yellow-100"
                            : appointment.status === "Confirmed"
                            ? "bg-cyan-50 text-cyan-700 border border-cyan-100"
                            : appointment.status === "Done"
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-100"
                            : appointment.status === "Rejected"
                            ? "bg-orange-50 text-orange-700 border border-orange-100"
                            : "bg-red-50 text-red-700 border border-red-100"
                        }`}>
                          {appointment.status}
                        </div>
                      </div>

                      <div className="flex items-center text-slate-500 mb-6">
                        <Clock className="w-4 h-4 mr-2" />
                        {appointment.time.substring(0, 5)}
                        {appointment.room && (
                          <span className="ml-4 flex items-center">
                            <span className="w-1.5 h-1.5 rounded-full bg-slate-300 mr-4" />
                            Room {appointment.room}
                          </span>
                        )}
                      </div>

                      <div className="flex gap-3">
                        {(appointment.status === "Pending" || appointment.status === "Confirmed") ? (
                          <>
                            <Button 
                              variant="outline" 
                              className="border-cyan-200 text-cyan-700 hover:bg-cyan-50 hover:text-cyan-800"
                              onClick={() => handleReschedule(appointment.id)}
                            >
                              Reschedule
                            </Button>
                            <Button 
                              variant="outline" 
                              className="border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800"
                              onClick={() => handleCancel(appointment.id)}
                            >
                              Cancel
                            </Button>
                          </>
                        ) : appointment.status === "Done" ? (
                          <Button 
                            className="bg-cyan-600 hover:bg-cyan-700 text-white border-none"
                            onClick={() => navigate("/patient/feedback", { state: { appointmentId: appointment.id } })}
                          >
                            Give Feedback
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>
    </PatientLayout>
  )
}