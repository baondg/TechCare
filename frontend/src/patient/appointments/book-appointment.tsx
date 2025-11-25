"use client"

import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { ChevronLeft, ChevronRight, Check, Calendar } from "lucide-react"
import { PatientLayout } from "@/components/patient-layout"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"

type ViewMode = "month" | "week" | "day"

interface TimeSlot {
  time: string
  doctor: string
  department: string
  room: string
  available: boolean
}

export default function BookAppointmentPage() {
  const navigate = useNavigate()
  const [currentDate, setCurrentDate] = useState(new Date(2025, 9)) // October 2025
  const [selectedDate, setSelectedDate] = useState(17)
  const [viewMode, setViewMode] = useState<ViewMode>("month")
  const [selectedDepartment, setSelectedDepartment] = useState("Cardiology")
  const [showNotification, setShowNotification] = useState(false)
  const [selectedSlot, setSelectedSlot] = useState<TimeSlot | null>(null)

  const departments = ["Cardiology", "Orthopedics", "Dermatology", "Ophthalmology"]

  // Mock time slots data
  const timeSlots: TimeSlot[] = [
    { time: "11:00", doctor: "Dr. Trang Thanh Nghia", department: "Cardiology", room: "Room A1-102", available: true },
    { time: "11:30", doctor: "Dr. Nguyen Duc Dung", department: "Orthopedics", room: "Room B1-102", available: true },
    { time: "11:30", doctor: "Dr. Nguyen Thi Van Anh", department: "Dermatology", room: "Room JA-04", available: false },
    { time: "11:30", doctor: "Dr. Tran Tien Minh", department: "Ophthalmology", room: "Room A1-102", available: true },
    { time: "11:40", doctor: "Dr. Trang Thanh Nghia", department: "Cardiology", room: "Room A1-102", available: true },
    { time: "11:40", doctor: "Dr. Nguyen Duc Dung", department: "Orthopedics", room: "Room B1-102", available: false },
    { time: "11:40", doctor: "Dr. Nguyen Thi Van Anh", department: "Dermatology", room: "Room JA-04", available: true },
    { time: "11:40", doctor: "Dr. Tran Tien Minh", department: "Ophthalmology", room: "Room A1-102", available: true },
    { time: "11:50", doctor: "Dr. Trang Thanh Nghia", department: "Cardiology", room: "Room A1-102", available: true },
    { time: "12:00", doctor: "Dr. Nguyen Duc Dung", department: "Orthopedics", room: "Room B1-102", available: true },
    { time: "13:00", doctor: "Dr. Nguyen Thi Van Anh", department: "Dermatology", room: "Room JA-04", available: true },
    { time: "13:10", doctor: "Dr. Tran Tien Minh", department: "Ophthalmology", room: "Room A1-102", available: true },
  ]

  const getDaysInMonth = () => {
    const year = currentDate.getFullYear()
    const month = currentDate.getMonth()
    const firstDay = new Date(year, month, 1).getDay()
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const daysInPrevMonth = new Date(year, month, 0).getDate()

    const days = []

    // Previous month days
    for (let i = firstDay - 1; i >= 0; i--) {
      days.push({
        day: daysInPrevMonth - i,
        isCurrentMonth: false,
        date: new Date(year, month - 1, daysInPrevMonth - i)
      })
    }

    // Current month days
    for (let i = 1; i <= daysInMonth; i++) {
      days.push({
        day: i,
        isCurrentMonth: true,
        date: new Date(year, month, i)
      })
    }

    // Next month days
    const remainingDays = 42 - days.length
    for (let i = 1; i <= remainingDays; i++) {
      days.push({
        day: i,
        isCurrentMonth: false,
        date: new Date(year, month + 1, i)
      })
    }

    return days
  }

  const getWeekNumber = (date: Date) => {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
    const dayNum = d.getUTCDay() || 7
    d.setUTCDate(d.getUTCDate() + 4 - dayNum)
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
    return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
  }

  const handlePrevMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1))
  }

  const handleNextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1))
  }

  const handleBookSlot = (slot: TimeSlot) => {
    if (!slot.available) return
    setSelectedSlot(slot)
    setShowNotification(true)
  }

  const handleConfirmBooking = () => {
    console.log("Booking confirmed:", selectedSlot)
    setShowNotification(false)
    navigate("/patient/appointments")
  }

  const days = getDaysInMonth()
  const monthName = currentDate.toLocaleString("default", { month: "long", year: "numeric" })

  // Group days into weeks
  const weeks = []
  for (let i = 0; i < days.length; i += 7) {
    weeks.push(days.slice(i, i + 7))
  }

  return (
    <PatientLayout>
      <div className="space-y-6">
        {/* Header Section */}
        <div>
          <h2 className="text-3xl font-bold">Book Appointment</h2>
          <p className="text-muted-foreground mt-1">Select a date and available time slot</p>
        </div>

        {/* Calendar and Time Slots Side by Side */}
        <div className="flex gap-6">
          {/* Calendar Section - Left Side */}
          <Card className="p-6 w-[500px] shrink-0">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-semibold">{monthName}</h3>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handlePrevMonth}
                >
                  <ChevronLeft className="w-5 h-5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleNextMonth}
                >
                  <ChevronRight className="w-5 h-5" />
                </Button>
              </div>
            </div>

            {/* View Mode Selector */}
            <div className="flex gap-2 mb-6">
              <Button
                variant={viewMode === "month" ? "default" : "outline"}
                size="sm"
                onClick={() => setViewMode("month")}
              >
                Month
              </Button>
              <Button
                variant={viewMode === "week" ? "default" : "outline"}
                size="sm"
                onClick={() => setViewMode("week")}
              >
                Week
              </Button>
              <Button
                variant={viewMode === "day" ? "default" : "outline"}
                size="sm"
                onClick={() => setViewMode("day")}
              >
                Day
              </Button>
            </div>

            {/* Calendar Grid */}
            <div>
              <div className="grid grid-cols-8 gap-2 mb-2">
                <div className="text-xs text-muted-foreground text-center font-medium"></div>
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
                  <div key={day} className="text-xs text-muted-foreground text-center font-medium">
                    {day}
                  </div>
                ))}
              </div>

              {weeks.map((week, weekIndex) => {
                const weekNumber = getWeekNumber(week[0].date)
                const isSelectedWeek = week.some(d => d.day === selectedDate && d.isCurrentMonth)
                
                return (
                  <div key={weekIndex} className="grid grid-cols-8 gap-2 mb-2">
                    <div className="flex items-center justify-center text-xs text-muted-foreground font-medium">
                      {weekNumber}
                    </div>
                    {week.map((dayObj, dayIndex) => {
                      const isSelected = dayObj.day === selectedDate && dayObj.isCurrentMonth
                      return (
                        <button
                          key={dayIndex}
                          onClick={() => dayObj.isCurrentMonth && setSelectedDate(dayObj.day)}
                          className={`
                            aspect-square flex items-center justify-center rounded-lg text-sm font-medium transition-colors
                            ${!dayObj.isCurrentMonth ? "text-muted-foreground/30" : ""}
                            ${isSelected ? "bg-primary text-primary-foreground font-bold" : "hover:bg-accent"}
                            ${isSelectedWeek && !isSelected ? "bg-primary/5" : ""}
                          `}
                        >
                          {dayObj.day}
                        </button>
                      )
                    })}
                  </div>
                )
              })}
            </div>

            <div className="mt-4 text-xs text-muted-foreground text-center">
              Week {getWeekNumber(weeks.find(w => w.some(d => d.day === selectedDate && d.isCurrentMonth))?.[0].date || new Date())}
            </div>
          </Card>

          {/* Time Slots Section - Right Side */}
          <Card className="flex-1 p-6 flex flex-col">
            <div className="mb-4">
              <h3 className="text-xl font-semibold mb-4">
                Available Slots - {selectedDate} {currentDate.toLocaleString("default", { month: "long" })}
              </h3>
              
              {/* Department Tabs */}
              <div className="flex gap-3 border-b">
                {departments.map((dept) => (
                  <button
                    key={dept}
                    onClick={() => setSelectedDepartment(dept)}
                    className={`
                      px-4 py-2 font-medium transition-colors border-b-2
                      ${selectedDepartment === dept
                        ? "text-primary border-primary"
                        : "text-muted-foreground border-transparent hover:text-foreground"
                      }
                    `}
                  >
                    {dept}
                  </button>
                ))}
              </div>
            </div>

            {/* Scrollable Time Slots List */}
            <div className="flex-1 overflow-y-auto pr-2">
              <div className="space-y-3">
                {timeSlots.filter(slot => slot.department === selectedDepartment).map((slot, index) => (
                  <button
                    key={index}
                    onClick={() => handleBookSlot(slot)}
                    disabled={!slot.available}
                    className={`
                      w-full p-4 rounded-lg border text-left transition-all flex items-center justify-between
                      ${slot.available
                        ? "border-border hover:border-primary hover:shadow-md cursor-pointer bg-card hover:bg-accent/50"
                        : "border-border bg-muted/50 opacity-60 cursor-not-allowed"
                      }
                    `}
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <div className="text-xl font-bold text-primary">{slot.time}</div>
                        <span
                          className={`
                            text-xs px-2 py-1 rounded font-medium
                            ${slot.available ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300" : "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300"}
                          `}
                        >
                          {slot.available ? "Available" : "Booked"}
                        </span>
                      </div>
                      <div className="text-sm font-semibold mb-1">{slot.doctor}</div>
                      <div className="text-xs text-muted-foreground">{slot.room}</div>
                    </div>
                    {slot.available && (
                      <div className="ml-4">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                          <ChevronRight className="w-4 h-4 text-primary" />
                        </div>
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>
          </Card>
        </div>
      </div>

      {/* Notification Modal */}
      {showNotification && selectedSlot && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="max-w-md w-full p-8 shadow-xl">
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <Check className="w-8 h-8 text-primary" />
              </div>
              <h3 className="text-2xl font-bold mb-2">Confirmation</h3>
              <p className="text-muted-foreground">Are you sure to book this appointment?</p>
            </div>

            <div className="bg-muted rounded-lg p-4 mb-6">
              <ul className="space-y-2 text-sm">
                <li className="flex items-start">
                  <span className="text-primary mr-2">•</span>
                  <span>{selectedSlot.doctor}</span>
                </li>
                <li className="flex items-start">
                  <span className="text-primary mr-2">•</span>
                  <span>Department of {selectedSlot.department}</span>
                </li>
                <li className="flex items-start">
                  <span className="text-primary mr-2">•</span>
                  <span>{selectedSlot.room}</span>
                </li>
                <li className="flex items-start">
                  <span className="text-primary mr-2">•</span>
                  <span>At {selectedSlot.time}</span>
                </li>
              </ul>
            </div>

            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setShowNotification(false)}
              >
                Cancel
              </Button>
              <Button
                className="flex-1 bg-primary hover:bg-primary/90"
                onClick={handleConfirmBooking}
              >
                Confirm
              </Button>
            </div>
          </Card>
        </div>
      )}
    </PatientLayout>
  )
}
