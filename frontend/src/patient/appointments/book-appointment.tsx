"use client"

import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { ChevronLeft, ChevronRight, Check, Calendar, Clock } from "lucide-react"
import { PatientLayout } from "@/components/patient-layout"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { appointmentService } from "@/services/appointment-service"
import { useAuth } from "@/contexts/AuthContext"
import { format, isSameDay, startOfDay } from "date-fns"

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
  const { user } = useAuth()
  
  // viewDate controls the month currently being viewed in the calendar
  const [viewDate, setViewDate] = useState(new Date())
  
  // selectedDate is the specific date selected for the appointment
  const [selectedDate, setSelectedDate] = useState(new Date())
  
  const [viewMode, setViewMode] = useState<ViewMode>("month")
  const [selectedDepartment, setSelectedDepartment] = useState("")
  const [showNotification, setShowNotification] = useState(false)
  const [selectedSlot, setSelectedSlot] = useState<TimeSlot | null>(null)
  const [checkedSymptom, setCheckedSymptom] = useState<"yes" | "no" | null>(null)

  const specialtyGroups = [
    { value: "outpatinent", label: "Outpatient Department" },
    { value: "ophthalmology", label: "Ophthalmology" },
    { value: "otolaryngology", label: "Otolaryngology" },
    { value: "dermatology", label: "Dermatology" },
    { value: "cardiology", label: "Cardiology" },
    { value: "orthopedics", label: "Orthopedics" },
  ]

  const timeSlots: TimeSlot[] = [
    // Cardiology
    { time: "08:00", doctor: "Dr. Trang Thanh Nghia", department: "Cardiology", room: "Room A1-102", available: true },
    { time: "09:30", doctor: "Dr. Le Van Tim", department: "Cardiology", room: "Room A1-104", available: true },
    { time: "11:00", doctor: "Dr. Trang Thanh Nghia", department: "Cardiology", room: "Room A1-102", available: true },
    { time: "11:40", doctor: "Dr. Trang Thanh Nghia", department: "Cardiology", room: "Room A1-102", available: true },
    { time: "14:00", doctor: "Dr. Le Van Tim", department: "Cardiology", room: "Room A1-104", available: false },
    
    // Orthopedics
    { time: "08:30", doctor: "Dr. Nguyen Duc Dung", department: "Orthopedics", room: "Room B1-102", available: true },
    { time: "10:00", doctor: "Dr. Pham Van Xuong", department: "Orthopedics", room: "Room B1-105", available: true },
    { time: "11:30", doctor: "Dr. Nguyen Duc Dung", department: "Orthopedics", room: "Room B1-102", available: true },
    { time: "11:40", doctor: "Dr. Nguyen Duc Dung", department: "Orthopedics", room: "Room B1-102", available: false },
    { time: "15:30", doctor: "Dr. Pham Van Xuong", department: "Orthopedics", room: "Room B1-105", available: true },

    // Dermatology
    { time: "09:00", doctor: "Dr. Nguyen Thi Van Anh", department: "Dermatology", room: "Room JA-04", available: true },
    { time: "10:30", doctor: "Dr. Tran Thi Da", department: "Dermatology", room: "Room JA-05", available: true },
    { time: "11:30", doctor: "Dr. Nguyen Thi Van Anh", department: "Dermatology", room: "Room JA-04", available: false },
    { time: "14:30", doctor: "Dr. Tran Thi Da", department: "Dermatology", room: "Room JA-05", available: true },

    // Ophthalmology
    { time: "08:15", doctor: "Dr. Tran Tien Minh", department: "Ophthalmology", room: "Room A1-102", available: true },
    { time: "10:45", doctor: "Dr. Le Thi Mat", department: "Ophthalmology", room: "Room A1-103", available: true },
    { time: "11:30", doctor: "Dr. Tran Tien Minh", department: "Ophthalmology", room: "Room A1-102", available: true },
    { time: "16:00", doctor: "Dr. Le Thi Mat", department: "Ophthalmology", room: "Room A1-103", available: false },

    // Otolaryngology (ENT)
    { time: "09:15", doctor: "Dr. Hoang Van Tai", department: "Otolaryngology", room: "Room C1-201", available: true },
    { time: "13:30", doctor: "Dr. Hoang Van Tai", department: "Otolaryngology", room: "Room C1-201", available: true },
    { time: "15:00", doctor: "Dr. Nguyen Thi Mui", department: "Otolaryngology", room: "Room C1-202", available: true },

    // Outpatient / General Medicine
    { time: "07:30", doctor: "Dr. Vo Van Tong", department: "General Medicine", room: "Room G1-001", available: true },
    { time: "10:00", doctor: "Dr. Vo Van Tong", department: "General Medicine", room: "Room G1-001", available: false },
    { time: "13:00", doctor: "Dr. Phan Thi Quat", department: "General Medicine", room: "Room G1-002", available: true },
  ]

  const getDaysInMonth = () => {
    const year = viewDate.getFullYear()
    const month = viewDate.getMonth()
    const firstDay = new Date(year, month, 1).getDay()
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const daysInPrevMonth = new Date(year, month, 0).getDate()

    const days = []
    for (let i = firstDay - 1; i >= 0; i--) {
      days.push({ day: daysInPrevMonth - i, isCurrentMonth: false, date: new Date(year, month - 1, daysInPrevMonth - i) })
    }
    for (let i = 1; i <= daysInMonth; i++) {
      days.push({ day: i, isCurrentMonth: true, date: new Date(year, month, i) })
    }
    const remainingDays = 42 - days.length
    for (let i = 1; i <= remainingDays; i++) {
      days.push({ day: i, isCurrentMonth: false, date: new Date(year, month + 1, i) })
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
    setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1))
  }

  const handleNextMonth = () => {
    setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1))
  }

  const handleBookSlot = (slot: TimeSlot) => {
    if (!slot.available) return
    setSelectedSlot(slot)
    setShowNotification(true)
  }

  const handleConfirmBooking = async () => {
    if (!selectedSlot || !user?.id) return

    try {
      const formattedDate = format(selectedDate, 'yyyy-MM-dd')
      
      // Format time to HH:mm:ss
      const formattedTime = `${selectedSlot.time}:00`

      await appointmentService.createAppointment({
        doctor: selectedSlot.doctor,
        department: selectedSlot.department,
        date: formattedDate,
        time: formattedTime,
        room: selectedSlot.room,
        symptoms: checkedSymptom === 'yes' ? 'Patient reported symptoms' : 'No symptoms reported',
        notes: 'Booked via web portal'
      })

      setShowNotification(false)
      navigate("/patient/appointments")
    } catch (error: any) {
      console.error("Booking failed:", error)
      alert(error.message || "Failed to book appointment. Please try again.")
    }
  }

  const days = getDaysInMonth()
  const monthName = viewDate.toLocaleString("en-US", { month: "long", year: "numeric" })
  const weeks = []
  for (let i = 0; i < days.length; i += 7) {
    weeks.push(days.slice(i, i + 7))
  }

  const departmentMap: Record<string, string> = {
    cardiology: "Cardiology",
    orthopedics: "Orthopedics",
    dermatology: "Dermatology",
    ophthalmology: "Ophthalmology",
    otolaryngology: "Otolaryngology",
    outpatinent: "General Medicine",
  }

  const filteredSlots = timeSlots.filter(slot => {
    if (!selectedDepartment) return false
    return slot.department === (departmentMap[selectedDepartment] || selectedDepartment)
  })

  return (
    <PatientLayout>
      <div className="space-y-8">
        {/* Header vß╗¢i gradient */}
        <div>
          <h2 className="text-4xl font-bold bg-linear-to-r from-[#06b6d4] via-[#0891b2] to-[#06b6d4] bg-clip-text text-transparent mb-2">
            Book Appointment
          </h2>
          <p className="text-slate-600 text-lg">Select your preferred date and time slot</p>
        </div>

        {/* Calendar and Time Slots */}
        <div className="grid gap-6 lg:grid-cols-5">
          {/* Calendar Section */}
          <Card className="card-feature lg:col-span-2 p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-2xl font-bold text-slate-900">{monthName}</h3>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="icon" onClick={handlePrevMonth} className="hover:bg-cyan-50">
                  <ChevronLeft className="w-5 h-5" />
                </Button>
                <Button variant="ghost" size="icon" onClick={handleNextMonth} className="hover:bg-cyan-50">
                  <ChevronRight className="w-5 h-5" />
                </Button>
              </div>
            </div>

            {/* View Mode Selector */}
            <div className="flex gap-2 mb-6 p-1 bg-slate-100 rounded-xl">
              {(["month", "week", "day"] as ViewMode[]).map(mode => (
                <Button
                  key={mode}
                  variant={viewMode === mode ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setViewMode(mode)}
                  className={viewMode === mode ? "btn-gradient flex-1" : "flex-1"}
                >
                  {mode.charAt(0).toUpperCase() + mode.slice(1)}
                </Button>
              ))}
            </div>

            {/* Calendar Grid */}
            <div>
              <div className="grid grid-cols-8 gap-2 mb-3">
                <div className="text-xs text-slate-500 text-center font-semibold">Week</div>
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(day => (
                  <div key={day} className="text-xs text-slate-600 text-center font-semibold">{day}</div>
                ))}
              </div>

              {weeks.map((week, weekIndex) => {
                const weekNumber = getWeekNumber(week[0].date)
                const isSelectedWeek = week.some(d => isSameDay(d.date, selectedDate))
                
                return (
                  <div key={weekIndex} className="grid grid-cols-8 gap-2 mb-2">
                    <div className="flex items-center justify-center text-xs text-slate-500 font-semibold bg-slate-50 rounded">
                      {weekNumber}
                    </div>
                    {week.map((dayObj, dayIndex) => {
                      const isSelected = isSameDay(dayObj.date, selectedDate)
                      const today = new Date()
                      today.setHours(0, 0, 0, 0)
                      const isPast = dayObj.date < today
                      
                      return (
                        <button
                          key={dayIndex}
                          disabled={isPast || !dayObj.isCurrentMonth}
                          onClick={() => dayObj.isCurrentMonth && setSelectedDate(dayObj.date)}
                          className={`
                            aspect-square flex items-center justify-center rounded-lg text-sm font-semibold transition-all duration-300
                            ${!dayObj.isCurrentMonth || isPast ? "text-slate-300 cursor-not-allowed" : ""}
                            ${isSelected 
                              ? "bg-linear-to-br from-[#06b6d4] to-[#0891b2] text-white shadow-lg scale-110" 
                              : isSelectedWeek && !isPast
                                ? "bg-cyan-50 text-cyan-700 hover:bg-cyan-100" 
                                : !isPast && dayObj.isCurrentMonth ? "hover:bg-slate-100 text-slate-700" : ""
                            }
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

            <div className="mt-6 text-center p-3 bg-linear-to-r from-cyan-50 to-blue-50 rounded-xl">
              <p className="text-sm text-slate-600">
                <span className="font-semibold">Week {getWeekNumber(weeks.find(w => w.some(d => isSameDay(d.date, selectedDate)))?.[0].date || new Date())}</span>
              </p>
            </div>
          </Card>

          {/* Time Slots Section */}
          <Card className="card-feature lg:col-span-3 p-6 flex flex-col">
            <div className="mb-6">
              <h3 className="text-2xl font-bold text-slate-900 mb-1">
                Available Slots
              </h3>
              <p className="text-slate-600">
                {format(selectedDate, "MMMM d, yyyy")}
              </p>
            </div>

            {/* Question Section */}
            <div className="mb-6 p-5 rounded-xl bg-linear-to-br from-cyan-50 to-blue-50 border border-cyan-100">
              <p className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
                <Calendar className="h-5 w-5 text-cyan-600" />
                Have you checked your symptoms?
              </p>

              <div className="space-y-3">
                <label className="flex items-center gap-3 p-3 rounded-lg border-2 cursor-pointer transition-all hover:bg-white
                  ${checkedSymptom === 'yes' ? 'border-cyan-500 bg-white shadow-md' : 'border-transparent bg-white/50'}">
                  <input
                    type="radio"
                    name="checkedSymptom"
                    value="yes"
                    checked={checkedSymptom === "yes"}
                    onChange={() => { setCheckedSymptom("yes"); setSelectedDepartment("") }}
                    className="w-4 h-4 text-cyan-600"
                  />
                  <span className="font-medium text-slate-700">Yes, I know which department</span>
                </label>

                <label className="flex items-center gap-3 p-3 rounded-lg border-2 cursor-pointer transition-all hover:bg-white
                  ${checkedSymptom === 'no' ? 'border-cyan-500 bg-white shadow-md' : 'border-transparent bg-white/50'}">
                  <input
                    type="radio"
                    name="checkedSymptom"
                    value="no"
                    checked={checkedSymptom === "no"}
                    onChange={() => { setCheckedSymptom("no"); setSelectedDepartment("outpatinent") }}
                    className="w-4 h-4 text-cyan-600"
                  />
                  <span className="font-medium text-slate-700">No, not yet</span>
                </label>
              </div>
            </div>

            {/* Department Selection */}
            {checkedSymptom !== null && (
              <div className="mb-6">
                <Select value={selectedDepartment} onValueChange={setSelectedDepartment}>
                  <SelectTrigger className="custom-select h-12">
                    <SelectValue placeholder="Select specialty" />
                  </SelectTrigger>
                  <SelectContent>
                    {checkedSymptom === "no" && (
                      <SelectItem value="outpatinent">Outpatient Department</SelectItem>
                    )}
                    {checkedSymptom === "yes" && specialtyGroups.map(group => (
                      <SelectItem key={group.value} value={group.value}>{group.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Time Slots List */}
            {checkedSymptom !== null && selectedDepartment && (
              <div className="flex-1 overflow-y-auto space-y-3 pr-2">
                {filteredSlots.map((slot, index) => (
                  <button
                    key={index}
                    onClick={() => handleBookSlot(slot)}
                    disabled={!slot.available}
                    className={`
                      card-feature-group w-full p-5 rounded-xl text-left transition-all duration-300
                      ${slot.available
                        ? "cursor-pointer hover:shadow-lg hover:scale-[1.02]"
                        : "opacity-50 cursor-not-allowed bg-slate-50"
                      }
                    `}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-4 mb-3">
                          <div className="flex items-center gap-2">
                            <Clock className="h-5 w-5 text-cyan-600" />
                            <span className="text-2xl font-bold text-cyan-600">{slot.time}</span>
                          </div>
                          <span className={`text-xs px-3 py-1 rounded-full font-semibold ${
                            slot.available 
                              ? "bg-green-100 text-green-700" 
                              : "bg-red-100 text-red-700"
                          }`}>
                            {slot.available ? "Available" : "Booked"}
                          </span>
                        </div>
                        <p className="font-semibold text-slate-900 mb-1">{slot.doctor}</p>
                        <p className="text-sm text-slate-600">{slot.room}</p>
                      </div>
                      {slot.available && (
                        <div className="card-icon-wrapper h-12 w-12">
                          <ChevronRight className="h-6 w-6" />
                        </div>
                      )}
                    </div>
                  </button>
                ))}
                {filteredSlots.length === 0 && (
                  <div className="text-center py-12 text-slate-500">
                    <Calendar className="h-16 w-16 mx-auto mb-4 text-slate-300" />
                    <p>No available slots for this selection</p>
                  </div>
                )}
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* Confirmation Modal */}
      {showNotification && selectedSlot && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <Card className="max-w-md w-full p-8 shadow-2xl animate-in fade-in zoom-in duration-300">
            <div className="text-center mb-6">
              <div className="card-icon-wrapper h-20 w-20 mx-auto mb-4">
                <Check className="h-10 w-10" />
              </div>
              <h3 className="text-3xl font-bold text-slate-900 mb-2">Confirm Booking</h3>
              <p className="text-slate-600">Review your appointment details</p>
            </div>

            <div className="bg-linear-to-br from-cyan-50 to-blue-50 rounded-xl p-5 mb-6 border border-cyan-100">
              <ul className="space-y-3">
                <li className="flex items-start gap-3">
                  <span className="text-cyan-600 font-bold">ΓÇó</span>
                  <span className="text-slate-900 font-medium">{selectedSlot.doctor}</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-cyan-600 font-bold">ΓÇó</span>
                  <span className="text-slate-700">Department of {selectedSlot.department}</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-cyan-600 font-bold">ΓÇó</span>
                  <span className="text-slate-700">{selectedSlot.room}</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-cyan-600 font-bold">ΓÇó</span>
                  <span className="text-slate-700">At {selectedSlot.time}</span>
                </li>
              </ul>
            </div>

            <div className="flex gap-3">
              <Button variant="outline" className="flex-1 h-12" onClick={() => setShowNotification(false)}>
                Cancel
              </Button>
              <Button className="flex-1 h-12 btn-gradient" onClick={handleConfirmBooking}>
                Confirm Booking
              </Button>
            </div>
          </Card>
        </div>
      )}
    </PatientLayout>
  )
}
