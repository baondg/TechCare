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

<<<<<<< HEAD
<<<<<<< HEAD
=======
>>>>>>> 9d41cd19 (TC-2801: Fix the FE branch and modify gitignore)
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
<<<<<<< HEAD
=======
  const appointments: Appointment[] = [
    {
      id: "1",
      title: "Follow Up",
      doctor: "Dr. Trang Thanh Nghia",
      department: "Cardiology",
      date: "10/10/25",
      time: "14:30",
      status: "Upcoming"
    },
    {
      id: "2",
      title: "General Checkup",
      doctor: "Dr. Trang Thanh Nghia",
      department: "Cardiology",
      date: "2/10/25",
      time: "10:00",
      status: "Done"
    },
    {
      id: "3",
      title: "General Checkup",
      doctor: "Dr. Trang Thanh Nghia",
      department: "Cardiology",
      date: "1/10/25",
      time: "10:00",
      status: "Done"
    },
  ]
>>>>>>> 3a5e23be (upgrade UI for all patient portal)
=======
>>>>>>> 9d41cd19 (TC-2801: Fix the FE branch and modify gitignore)

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
<<<<<<< HEAD
=======
  }

  const handleFeedback = (id: number) => {
    console.log("Provide feedback for appointment:", id)
    navigate("/patient/feedback", { state: { appointmentId: id } })
>>>>>>> 9d41cd19 (TC-2801: Fix the FE branch and modify gitignore)
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
<<<<<<< HEAD
<<<<<<< HEAD
                  className="pl-10 h-12 text-base"
                />
              </div>
              <span className="text-slate-400">to</span>
=======
                  className="custom-input pl-10 h-12"
                />
              </div>
              <span className="text-slate-400 font-semibold">—</span>
>>>>>>> 3a5e23be (upgrade UI for all patient portal)
=======
                  className="pl-10 h-12 text-base"
                />
              </div>
              <span className="text-slate-400">to</span>
>>>>>>> 9d41cd19 (TC-2801: Fix the FE branch and modify gitignore)
              <div className="relative flex-1 max-w-xs">
                <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-slate-400" />
                <Input
                  type="text"
                  placeholder="dd/mm/yyyy"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
<<<<<<< HEAD
<<<<<<< HEAD
                  className="pl-10 h-12 text-base"
                />
              </div>
              <Button variant="outline" className="h-12 px-6 border-slate-200 text-slate-600 hover:bg-slate-50">
                <Search className="w-5 h-5 mr-2" />
                Filter
=======
                  className="custom-input pl-10 h-12"
                />
              </div>
              <Button className="btn-gradient h-12 px-6 shadow-md">
                <Search className="w-4 h-4 mr-2" />
                Search
>>>>>>> 3a5e23be (upgrade UI for all patient portal)
=======
                  className="pl-10 h-12 text-base"
                />
              </div>
              <Button variant="outline" className="h-12 px-6 border-slate-200 text-slate-600 hover:bg-slate-50">
                <Search className="w-5 h-5 mr-2" />
                Filter
>>>>>>> 9d41cd19 (TC-2801: Fix the FE branch and modify gitignore)
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Appointments List */}
        <div className="space-y-4">
<<<<<<< HEAD
<<<<<<< HEAD
=======
>>>>>>> 9d41cd19 (TC-2801: Fix the FE branch and modify gitignore)
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
<<<<<<< HEAD
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
=======
          {appointments.map((appointment) => (
            <Card key={appointment.id} className="card-feature-group transition-all duration-300 hover:shadow-lg">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-6">
                    <div className="card-icon-wrapper h-16 w-16 shrink-0">
                      <Calendar className="w-8 h-8 text-background" />
=======
>>>>>>> 9d41cd19 (TC-2801: Fix the FE branch and modify gitignore)
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
                          appointment.status === "Upcoming" 
                            ? "bg-cyan-50 text-cyan-700 border border-cyan-100" 
                            : appointment.status === "Done"
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-100"
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
                        {appointment.status === "Upcoming" ? (
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
                            onClick={() => handleFeedback(appointment.id)}
                          >
                            Give Feedback
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  </div>
<<<<<<< HEAD

                  <div className="flex items-center gap-3">
                    {appointment.status === "Upcoming" ? (
                      <>
                        <Button
                          variant="outline"
                          onClick={() => handleReschedule(appointment.id)}
                          className="btn-outline"
                        >
                          Reschedule
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => handleCancel(appointment.id)}
                          className="hover:bg-red-50 hover:text-red-600 hover:border-red-300"
                        >
                          Cancel
                        </Button>
                      </>
                    ) : (
                      <Button
                        variant="outline"
                        onClick={() => handleFeedback(appointment.id)}
                        className="btn-outline"
                      >
                        Feedback
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}

          {appointments.length === 0 && (
            <Card className="card-feature">
              <CardContent className="py-16 text-center">
                <Calendar className="h-20 w-20 text-slate-300 mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-slate-900 mb-2">No appointments found</h3>
                <p className="text-slate-600 mb-6">Start by booking your first appointment</p>
                <Button onClick={handleBookAppointment} className="btn-gradient">
                  <Plus className="h-4 w-4 mr-2" />
                  Book Appointment
                </Button>
              </CardContent>
            </Card>
>>>>>>> 3a5e23be (upgrade UI for all patient portal)
=======
                </CardContent>
              </Card>
            ))
>>>>>>> 9d41cd19 (TC-2801: Fix the FE branch and modify gitignore)
          )}
        </div>
      </div>
    </PatientLayout>
  )
}