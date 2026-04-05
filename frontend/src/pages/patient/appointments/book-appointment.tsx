"use client"

import { useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { ChevronLeft, ChevronRight, Check, Calendar, Clock } from "lucide-react"
import { PatientLayout } from "@/components/patient-layout"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { appointmentService, type DoctorOption, type NurseOpenSlot } from "@/services/appointment-service"
import { useAuth } from "@/contexts/AuthContext"
import { format, isSameDay, startOfDay } from "date-fns"

interface TimeSlot {
  id: number
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
  
  const [selectedDepartment, setSelectedDepartment] = useState("")
  const [showNotification, setShowNotification] = useState(false)
  const [selectedSlot, setSelectedSlot] = useState<TimeSlot | null>(null)
  const [checkedSymptom, setCheckedSymptom] = useState<"yes" | "no" | null>(null)
  const [doctors, setDoctors] = useState<DoctorOption[]>([])
  const [openSlots, setOpenSlots] = useState<NurseOpenSlot[]>([])
  const [loadingSlots, setLoadingSlots] = useState(false)

  useEffect(() => {
    const loadDoctors = async () => {
      try {
        const data = await appointmentService.getDoctors()
        setDoctors(data)
      } catch (error) {
        console.error("Load doctors failed:", error)
      }
    }
    loadDoctors()
  }, [])

  useEffect(() => {
    const loadOpenSlots = async () => {
      setLoadingSlots(true)
      try {
        const date = format(selectedDate, "yyyy-MM-dd")
        const data = await appointmentService.getOpenSlots({
          startDate: date,
          endDate: date,
        })
        setOpenSlots(data || [])
      } catch (error) {
        console.error("Load open slots failed:", error)
        setOpenSlots([])
      } finally {
        setLoadingSlots(false)
      }
    }
    void loadOpenSlots()
  }, [selectedDate])

  const specialtyGroups = useMemo(() => {
    const unique = new Map<string, string>()
    for (const d of doctors) {
      const fromSet = d.departments?.length
        ? d.departments
        : d.department
          ? [d.department]
          : []
      const labels = fromSet.length > 0 ? fromSet.map((x) => String(x).trim()).filter(Boolean) : ["General Medicine"]
      for (const label of labels) {
        const value = label.toLowerCase().replace(/\s+/g, "-")
        if (!unique.has(value)) unique.set(value, label)
      }
    }
    return Array.from(unique.entries()).map(([value, label]) => ({ value, label }))
  }, [doctors])

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
        room: selectedSlot.room === "Room -" ? "" : selectedSlot.room,
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

  const selectedDepartmentLabel =
    specialtyGroups.find((s) => s.value === selectedDepartment)?.label
    ?? (selectedDepartment === "outpatient" ? "Outpatient" : undefined)

  const doctorSlots = useMemo(() => {
    if (!selectedDepartmentLabel) return []
    return openSlots
      .filter((slot) => {
        if (!slot?.date || !slot?.time) return false
        if (String(slot.status || "").toLowerCase() !== "open") return false
        const sameDate = isSameDay(new Date(`${slot.date}T00:00:00`), startOfDay(selectedDate))
        if (!sameDate) return false
        return (slot.department || "").trim().toLowerCase() === selectedDepartmentLabel.trim().toLowerCase()
      })
      .map((slot) => ({
        id: slot.id,
        time: String(slot.time || "").slice(0, 5),
        doctor: `Dr. ${slot.doctorName}`.trim(),
        department: slot.department || selectedDepartmentLabel,
        room: slot.roomName || "",
        available: true,
      }))
  }, [selectedDepartmentLabel, openSlots, selectedDate])

  return (
    <PatientLayout>
      <div className="space-y-8">

        {/* Calendar and Time Slots */}
        <div className="grid gap-6 lg:grid-cols-5 lg:min-h-[calc(100vh-170px)]">
          {/* Calendar Section */}
          <Card className="card-feature lg:col-span-2 p-6 flex flex-col h-full lg:overflow-hidden">
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

            {/* Calendar Grid */}
            <div className="flex-1 overflow-y-auto pr-1">
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
                          disabled={isPast}
                          onClick={() => {
                            setSelectedDate(dayObj.date)
                            if (!dayObj.isCurrentMonth) {
                              setViewDate(new Date(dayObj.date.getFullYear(), dayObj.date.getMonth(), 1))
                            }
                          }}
                          className={`
                            aspect-square flex items-center justify-center rounded-lg text-sm font-semibold transition-all duration-300
                            ${isPast ? "text-slate-300 cursor-not-allowed" : ""}
                            ${isSelected 
                              ? "bg-linear-to-br from-[#06b6d4] to-[#0891b2] text-white shadow-lg scale-110" 
                              : isSelectedWeek && !isPast
                                ? "bg-cyan-50 text-cyan-700 hover:bg-cyan-100" 
                                : !isPast ? (dayObj.isCurrentMonth ? "hover:bg-slate-100 text-slate-700" : "text-slate-500 hover:bg-slate-100") : ""
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

            <div className="mt-4 text-center p-3 bg-linear-to-r from-cyan-50 to-blue-50 rounded-xl">
              <p className="text-sm text-slate-600">
                <span className="font-semibold">Week {getWeekNumber(weeks.find(w => w.some(d => isSameDay(d.date, selectedDate)))?.[0].date || new Date())}</span>
              </p>
            </div>
          </Card>

          {/* Time Slots Section */}
          <Card className="card-feature lg:col-span-3 p-6 flex flex-col h-full lg:overflow-hidden">

            {/* Question Section */}
            <div className="mb-4 p-4 rounded-xl bg-linear-to-br from-cyan-50 to-blue-50 border border-cyan-100">
              <p className="font-semibold text-slate-900 mb-3 flex items-center gap-2 text-sm">
                <Calendar className="h-5 w-5 text-cyan-600" />
                Have you checked your symptoms?
              </p>

              <div className="space-y-3">
                <label className="flex items-center justify-between gap-3 p-3 rounded-lg border-2 cursor-pointer transition-all hover:bg-white
                  ${checkedSymptom === 'yes' ? 'border-cyan-500 bg-white shadow-md' : 'border-transparent bg-white/50'}">
                  <div className="flex items-center gap-3 min-w-0">
                    <input
                      type="radio"
                      name="checkedSymptom"
                      value="yes"
                      checked={checkedSymptom === "yes"}
                      onChange={() => { setCheckedSymptom("yes"); setSelectedDepartment("") }}
                      className="w-4 h-4 text-cyan-600 shrink-0"
                    />
                    <span className="font-medium text-slate-700 text-sm">Yes, I know which department</span>
                  </div>
                  <div className="w-56 shrink-0">
                    <Select
                      value={checkedSymptom === "yes" ? selectedDepartment : ""}
                      onValueChange={setSelectedDepartment}
                      disabled={checkedSymptom !== "yes"}
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder="Select specialty" />
                      </SelectTrigger>
                      <SelectContent>
                        {specialtyGroups.map(group => (
                          <SelectItem key={group.value} value={group.value}>{group.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </label>

                <label className="flex items-center justify-between gap-3 p-3 rounded-lg border-2 cursor-pointer transition-all hover:bg-white
                  ${checkedSymptom === 'no' ? 'border-cyan-500 bg-white shadow-md' : 'border-transparent bg-white/50'}">
                  <div className="flex items-center gap-3 min-w-0">
                    <input
                      type="radio"
                      name="checkedSymptom"
                      value="no"
                      checked={checkedSymptom === "no"}
                      onChange={() => { setCheckedSymptom("no"); setSelectedDepartment("outpatient") }}
                      className="w-4 h-4 text-cyan-600 shrink-0"
                    />
                    <span className="font-medium text-slate-700 text-sm">No, not yet</span>
                  </div>
                  <span className="w-56 shrink-0 h-9 px-3 inline-flex items-center rounded-md border bg-slate-100 text-slate-700 text-sm">
                    Outpatient
                  </span>
                </label>
              </div>
            </div>

            {/* Time Slots List Window */}
            <div className="h-[460px] rounded-xl border border-slate-200 bg-white p-3 overflow-y-auto">
              {checkedSymptom !== null && selectedDepartment ? (
                <div className="space-y-3 pr-2">
                {doctorSlots.map((slot) => (
                  <button
                    key={slot.id}
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
                        <p className="text-sm text-slate-600">{slot.room ? `Room ${slot.room}` : "Room -"}</p>
                      </div>
                      {slot.available && (
                        <div className="card-icon-wrapper h-12 w-12">
                          <ChevronRight className="h-6 w-6" />
                        </div>
                      )}
                    </div>
                  </button>
                ))}
                {loadingSlots ? (
                  <div className="text-center py-12 text-slate-500">
                    <p>Loading available slots...</p>
                  </div>
                ) : doctorSlots.length === 0 && (
                  <div className="text-center py-12 text-slate-500">
                    <Calendar className="h-16 w-16 mx-auto mb-4 text-slate-300" />
                    <p>No available slots for this selection</p>
                  </div>
                )}
                </div>
              ) : (
                <div className="h-full flex items-center justify-center text-slate-500 text-sm text-center px-6">
                  Select Yes/No and specialty to view available appointment slots.
                </div>
              )}
            </div>
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
                  <span className="text-cyan-600 font-bold">•</span>
                  <span className="text-slate-900 font-medium">{selectedSlot.doctor}</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-cyan-600 font-bold">•</span>
                  <span className="text-slate-700">Department of {selectedSlot.department}</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-cyan-600 font-bold">•</span>
                  <span className="text-slate-700">{selectedSlot.room ? `Room ${selectedSlot.room}` : "Room -"}</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-cyan-600 font-bold">•</span>
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
