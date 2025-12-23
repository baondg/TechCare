"use client"

import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { Calendar, Search, Clock, User, Plus } from "lucide-react"
import { PatientLayout } from "@/components/patient-layout"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"

interface Appointment {
  id: string
  title: string
  doctor: string
  department: string
  date: string
  time: string
  status: "Upcoming" | "Done"
}

export default function AppointmentsPage() {
  const navigate = useNavigate()
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")

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

  const handleBookAppointment = () => {
    navigate("/patient/appointments/book-appointment")
  }

  const handleReschedule = (id: string) => {
    console.log("Reschedule appointment:", id)
    navigate("/patient/appointments/book-appointment", { state: { rescheduleId: id } })
  }

  const handleCancel = (id: string) => {
    console.log("Cancel appointment:", id)
  }

  const handleFeedback = (id: string) => {
    console.log("Provide feedback for appointment:", id)
    navigate("/patient/feedback", { state: { appointmentId: id } })
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
                  className="custom-input pl-10 h-12"
                />
              </div>
              <span className="text-slate-400 font-semibold">—</span>
              <div className="relative flex-1 max-w-xs">
                <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-slate-400" />
                <Input
                  type="text"
                  placeholder="dd/mm/yyyy"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="custom-input pl-10 h-12"
                />
              </div>
              <Button className="btn-gradient h-12 px-6 shadow-md">
                <Search className="w-4 h-4 mr-2" />
                Search
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Appointments List */}
        <div className="space-y-4">
          {appointments.map((appointment) => (
            <Card key={appointment.id} className="card-feature-group transition-all duration-300 hover:shadow-lg">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-6">
                    <div className="card-icon-wrapper h-16 w-16 shrink-0">
                      <Calendar className="w-8 h-8 text-background" />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-slate-900 mb-2">
                        {appointment.title}
                        {" "}-{" "}
                        <span className={
                          appointment.status === "Upcoming"
                            ? "text-amber-600"
                            : "text-green-600"
                        }>
                          {appointment.status}
                        </span>
                      </h3>
                      <div className="flex items-center gap-4 text-slate-600">
                        <span className="flex items-center gap-2">
                          <User className="h-4 w-4" />
                          {appointment.doctor}
                        </span>
                        <span>•</span>
                        <span>{appointment.department}</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-slate-500 mt-2">
                        <Clock className="h-4 w-4" />
                        {appointment.date} • {appointment.time}
                      </div>
                    </div>
                  </div>

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
          )}
        </div>
      </div>
    </PatientLayout>
  )
}