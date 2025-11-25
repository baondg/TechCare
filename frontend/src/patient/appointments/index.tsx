"use client"

import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { Calendar, Search } from "lucide-react"
import { PatientLayout } from "@/components/patient-layout"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
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

  // Mock data - replace with API call
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
    {
      id: "4",
      title: "General Checkup",
      doctor: "Dr. Trang Thanh Nghia",
      department: "Cardiology",
      date: "27/9/25",
      time: "10:00",
      status: "Done"
    },
    {
      id: "5",
      title: "General Checkup",
      doctor: "Dr. Trang Thanh Nghia",
      department: "Cardiology",
      date: "21/9/25",
      time: "10:00",
      status: "Done"
    },
    {
      id: "6",
      title: "General Checkup",
      doctor: "Dr. Trang Thanh Nghia",
      department: "Cardiology",
      date: "1/9/25",
      time: "10:00",
      status: "Done"
    }
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
      <div className="space-y-6">
        {/* Header Section */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold">Appointments</h2>
            <p className="text-muted-foreground mt-1">Manage your hospital visits</p>
          </div>
          <Button 
            onClick={handleBookAppointment} 
            className="text-white font-semibold px-8 py-6 text-base shadow-lg"
            style={{ backgroundColor: '#06b6d4' }}
          >
            
            <span className="text-xl mr-2">+</span>
            Book Appointment
          </Button>
        </div>

        {/* Filters Section */}
        <Card className="p-6">
          <div className="flex items-center gap-4">
            <div className="relative flex-1 max-w-xs">
              <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <Input
                type="text"
                placeholder="dd/mm/yyyy"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="pl-10"
              />
            </div>
            <span className="text-muted-foreground">—</span>
            <div className="relative flex-1 max-w-xs">
              <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <Input
                type="text"
                placeholder="dd/mm/yyyy"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="pl-10"
              />
            </div>
            <Button 
              className="text-white font-semibold shadow-lg"
              style={{ backgroundColor: '#06b6d4' }}
            >
              <Search className="w-4 h-4 mr-2" />
              Search
            </Button>
          </div>
        </Card>

        {/* Appointments List */}
        <div className="space-y-4">
          {appointments.map((appointment) => (
            <Card
              key={appointment.id}
              className="p-6 hover:shadow-md transition-shadow"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-6">
                  <div className="w-14 h-14 bg-primary/10 rounded-lg flex items-center justify-center shrink-0">
                    <Calendar className="w-7 h-7 text-primary" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold mb-1">
                      {appointment.title} -{" "}
                      <span
                        className={
                          appointment.status === "Upcoming"
                            ? "text-orange-500"
                            : "text-green-600"
                        }
                      >
                        {appointment.status}
                      </span>
                    </h3>
                    <p className="text-muted-foreground mb-1">
                      {appointment.doctor} - {appointment.department}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {appointment.date} • {appointment.time}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  {appointment.status === "Upcoming" ? (
                    <>
                      <Button
                        variant="outline"
                        onClick={() => handleReschedule(appointment.id)}
                      >
                        Reschedule
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => handleCancel(appointment.id)}
                      >
                        Cancel
                      </Button>
                    </>
                  ) : (
                    <Button
                      variant="outline"
                      onClick={() => handleFeedback(appointment.id)}
                    >
                      Feedback
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </PatientLayout>
  )
}
