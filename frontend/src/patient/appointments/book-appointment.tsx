"use client"

import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
<<<<<<< HEAD
import { ChevronLeft, ChevronRight, Check, Calendar, Clock, Loader2 } from "lucide-react"
import { PatientLayout } from "@/components/patient-layout"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  appointmentService,
  type Doctor,
  type BookedSlot,
} from "@/services/appointment-service"
import { useAuth } from "@/contexts/AuthContext"
import { format, isSameDay } from "date-fns"
=======
<<<<<<< HEAD
import { ChevronLeft, ChevronRight, Check, Calendar, Clock, Loader2 } from "lucide-react"
import { PatientLayout } from "@/components/patient-layout"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  appointmentService,
  type Doctor,
  type BookedSlot,
} from "@/services/appointment-service"
import { useAuth } from "@/contexts/AuthContext"
import { format, isSameDay } from "date-fns"
=======
import { ChevronLeft, ChevronRight, Check, Calendar, Clock } from "lucide-react"
import { PatientLayout } from "@/components/patient-layout"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
<<<<<<< HEAD
>>>>>>> 3a5e23be (upgrade UI for all patient portal)
=======
import { appointmentService } from "@/services/appointment-service"
import { useAuth } from "@/contexts/AuthContext"
import { format, isSameDay, startOfDay } from "date-fns"
>>>>>>> 9d41cd19 (TC-2801: Fix the FE branch and modify gitignore)
>>>>>>> backend

type ViewMode = "month" | "week" | "day"

interface TimeSlot {
  time: string
  doctor: string        // doctor username (sent to backend)
  doctorLabel: string   // display name
  department: string
  room: string
  available: boolean
}

// Standard consultation times
const SLOT_TIMES = [
  "08:00", "08:30", "09:00", "09:30", "10:00", "10:30",
  "11:00", "11:30", "13:00", "13:30", "14:00", "14:30",
  "15:00", "15:30", "16:00",
]

export default function BookAppointmentPage() {
  const navigate = useNavigate()
<<<<<<< HEAD
<<<<<<< HEAD
  const { user } = useAuth()

  const [viewDate, setViewDate] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState(new Date())
=======
  const [currentDate, setCurrentDate] = useState(new Date(2025, 9))
  const [selectedDate, setSelectedDate] = useState(17)
>>>>>>> 3a5e23be (upgrade UI for all patient portal)
=======
  const { user } = useAuth()

  const [viewDate, setViewDate] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState(new Date())
<<<<<<< HEAD
=======
  
>>>>>>> 9d41cd19 (TC-2801: Fix the FE branch and modify gitignore)
>>>>>>> backend
  const [viewMode, setViewMode] = useState<ViewMode>("month")
  const [selectedDepartment, setSelectedDepartment] = useState("")
  const [showNotification, setShowNotification] = useState(false)
  const [selectedSlot, setSelectedSlot] = useState<TimeSlot | null>(null)
  const [checkedSymptom, setCheckedSymptom] = useState<"yes" | "no" | null>(null)
<<<<<<< HEAD
  const [booking, setBooking] = useState(false)
=======
<<<<<<< HEAD
  const [booking, setBooking] = useState(false)

  // Real data from the API
  const [doctors, setDoctors] = useState<Doctor[]>([])
  const [bookedSlots, setBookedSlots] = useState<BookedSlot[]>([])
  const [loadingDoctors, setLoadingDoctors] = useState(true)
=======
>>>>>>> backend

  // Real data from the API
  const [doctors, setDoctors] = useState<Doctor[]>([])
  const [bookedSlots, setBookedSlots] = useState<BookedSlot[]>([])
  const [loadingDoctors, setLoadingDoctors] = useState(true)

  // ── Fetch doctors on mount ──
  useEffect(() => {
    appointmentService.getDoctors()
      .then((d) => setDoctors(d))
      .catch(() => setDoctors([]))
      .finally(() => setLoadingDoctors(false))
  }, [])

  // ── Fetch booked slots whenever selected date changes ──
  useEffect(() => {
    const dateStr = format(selectedDate, "yyyy-MM-dd")
    appointmentService.getBookedSlots(dateStr)
      .then((s) => setBookedSlots(s))
      .catch(() => setBookedSlots([]))
  }, [selectedDate])

  // ── Derive departments from real doctors ──
  const departments = Array.from(
    new Set(
      doctors
        .map((d) => d.department)
        .filter(Boolean) as string[]
    )
  ).sort()

  // ── Build time slots from real doctors + booked data ──
  const buildTimeSlots = (): TimeSlot[] => {
    if (!selectedDepartment) return []

<<<<<<< HEAD
    const dept =
      selectedDepartment === "outpatient" ? "General Medicine" : selectedDepartment

=======
    // Outpatient / General Medicine
    { time: "07:30", doctor: "Dr. Vo Van Tong", department: "General Medicine", room: "Room G1-001", available: true },
    { time: "10:00", doctor: "Dr. Vo Van Tong", department: "General Medicine", room: "Room G1-001", available: false },
    { time: "13:00", doctor: "Dr. Phan Thi Quat", department: "General Medicine", room: "Room G1-002", available: true },
  ]
>>>>>>> 3a5e23be (upgrade UI for all patient portal)

  // ── Fetch doctors on mount ──
  useEffect(() => {
    appointmentService.getDoctors()
      .then((d) => setDoctors(d))
      .catch(() => setDoctors([]))
      .finally(() => setLoadingDoctors(false))
  }, [])

  // ── Fetch booked slots whenever selected date changes ──
  useEffect(() => {
    const dateStr = format(selectedDate, "yyyy-MM-dd")
    appointmentService.getBookedSlots(dateStr)
      .then((s) => setBookedSlots(s))
      .catch(() => setBookedSlots([]))
  }, [selectedDate])

  // ── Derive departments from real doctors ──
  const departments = Array.from(
    new Set(
      doctors
        .map((d) => d.department)
        .filter(Boolean) as string[]
    )
  ).sort()

  // ── Build time slots from real doctors + booked data ──
  const buildTimeSlots = (): TimeSlot[] => {
    if (!selectedDepartment) return []

    const dept =
      selectedDepartment === "outpatient" ? "General Medicine" : selectedDepartment

>>>>>>> backend
    const deptDoctors = doctors.filter(
      (d) => (d.department || "").toLowerCase() === dept.toLowerCase()
    )

    if (deptDoctors.length === 0) return []

    const slots: TimeSlot[] = []

    for (const doc of deptDoctors) {
      const fullName =
        [doc.firstName, doc.lastName].filter(Boolean).join(" ") || doc.username

      for (const time of SLOT_TIMES) {
        const isBooked = bookedSlots.some(
          (bs) =>
            bs.doctor === doc.username &&
            bs.time.substring(0, 5) === time
        )

        slots.push({
          time,
          doctor: doc.username,
          doctorLabel: `Dr. ${fullName}`,
          department: dept,
          room: `Room ${doc.id}01`,
          available: !isBooked,
        })
      }
    }

    // Sort by time then doctor
    slots.sort((a, b) => a.time.localeCompare(b.time) || a.doctor.localeCompare(b.doctor))
    return slots
  }

  const filteredSlots = buildTimeSlots()

  // ── Calendar helpers ──
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

<<<<<<< HEAD
  const handlePrevMonth = () => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1))
  const handleNextMonth = () => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1))
=======
<<<<<<< HEAD
  const handlePrevMonth = () => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1))
  const handleNextMonth = () => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1))
=======
  const handlePrevMonth = () => {
    setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1))
  }

  const handleNextMonth = () => {
    setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1))
  }
>>>>>>> 9d41cd19 (TC-2801: Fix the FE branch and modify gitignore)
>>>>>>> backend

  const handleBookSlot = (slot: TimeSlot) => {
    if (!slot.available) return
    setSelectedSlot(slot)
    setShowNotification(true)
  }

  const handleConfirmBooking = async () => {
    if (!selectedSlot || !user?.id) return
<<<<<<< HEAD
    setBooking(true)
=======
<<<<<<< HEAD
    setBooking(true)

    try {
      await appointmentService.createAppointment({
        doctor: selectedSlot.doctor,
        department: selectedSlot.department,
        date: format(selectedDate, "yyyy-MM-dd"),
        time: `${selectedSlot.time}:00`,
        room: selectedSlot.room,
        symptoms: checkedSymptom === "yes" ? "Patient reported symptoms" : "No symptoms reported",
        notes: "Booked via web portal",
      })
      setShowNotification(false)
      navigate("/patient/appointments")
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Failed to book appointment"
      alert(msg)
    } finally {
      setBooking(false)
=======
>>>>>>> backend

    try {
      await appointmentService.createAppointment({
        doctor: selectedSlot.doctor,
        department: selectedSlot.department,
        date: format(selectedDate, "yyyy-MM-dd"),
        time: `${selectedSlot.time}:00`,
        room: selectedSlot.room,
        symptoms: checkedSymptom === "yes" ? "Patient reported symptoms" : "No symptoms reported",
        notes: "Booked via web portal",
      })
      setShowNotification(false)
      navigate("/patient/appointments")
<<<<<<< HEAD
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Failed to book appointment"
      alert(msg)
    } finally {
      setBooking(false)
=======
    } catch (error: any) {
      console.error("Booking failed:", error)
      alert(error.message || "Failed to book appointment. Please try again.")
>>>>>>> 9d41cd19 (TC-2801: Fix the FE branch and modify gitignore)
>>>>>>> backend
    }
  }

  const days = getDaysInMonth()
<<<<<<< HEAD
<<<<<<< HEAD
  const monthName = viewDate.toLocaleString("en-US", { month: "long", year: "numeric" })
  const weeks: typeof days[] = []
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7))
<<<<<<< HEAD
=======
=======
  const monthName = currentDate.toLocaleString("en-US", { month: "long", year: "numeric" })
=======
  const monthName = viewDate.toLocaleString("en-US", { month: "long", year: "numeric" })
>>>>>>> 9d41cd19 (TC-2801: Fix the FE branch and modify gitignore)
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
>>>>>>> 3a5e23be (upgrade UI for all patient portal)
>>>>>>> backend

  return (
    <PatientLayout>
      <div className="space-y-8">
<<<<<<< HEAD
        {/* Header */}
=======
<<<<<<< HEAD
        {/* Header */}
=======
        {/* Header với gradient */}
>>>>>>> 3a5e23be (upgrade UI for all patient portal)
>>>>>>> backend
        <div>
          <h2 className="text-4xl font-bold bg-linear-to-r from-[#06b6d4] via-[#0891b2] to-[#06b6d4] bg-clip-text text-transparent mb-2">
            Book Appointment
          </h2>
          <p className="text-slate-600 text-lg">Select your preferred date and time slot</p>
        </div>

<<<<<<< HEAD
        {/* Calendar + Time Slots */}
        <div className="grid gap-6 lg:grid-cols-5">
          {/* ── Calendar ── */}
=======
<<<<<<< HEAD
        {/* Calendar + Time Slots */}
        <div className="grid gap-6 lg:grid-cols-5">
          {/* ── Calendar ── */}
=======
        {/* Calendar and Time Slots */}
        <div className="grid gap-6 lg:grid-cols-5">
          {/* Calendar Section */}
>>>>>>> 3a5e23be (upgrade UI for all patient portal)
>>>>>>> backend
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

<<<<<<< HEAD
            {/* View Mode */}
            <div className="flex gap-2 mb-6 p-1 bg-slate-100 rounded-xl">
              {(["month", "week", "day"] as ViewMode[]).map((mode) => (
=======
<<<<<<< HEAD
            {/* View Mode */}
            <div className="flex gap-2 mb-6 p-1 bg-slate-100 rounded-xl">
              {(["month", "week", "day"] as ViewMode[]).map((mode) => (
=======
            {/* View Mode Selector */}
            <div className="flex gap-2 mb-6 p-1 bg-slate-100 rounded-xl">
              {(["month", "week", "day"] as ViewMode[]).map(mode => (
>>>>>>> 3a5e23be (upgrade UI for all patient portal)
>>>>>>> backend
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
<<<<<<< HEAD
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                  <div key={d} className="text-xs text-slate-600 text-center font-semibold">{d}</div>
=======
<<<<<<< HEAD
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                  <div key={d} className="text-xs text-slate-600 text-center font-semibold">{d}</div>
=======
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(day => (
                  <div key={day} className="text-xs text-slate-600 text-center font-semibold">{day}</div>
>>>>>>> 3a5e23be (upgrade UI for all patient portal)
>>>>>>> backend
                ))}
              </div>

              {weeks.map((week, wi) => {
                const weekNumber = getWeekNumber(week[0].date)
<<<<<<< HEAD
                const isSelectedWeek = week.some((d) => isSameDay(d.date, selectedDate))

                return (
                  <div key={wi} className="grid grid-cols-8 gap-2 mb-2">
                    <div className="flex items-center justify-center text-xs text-slate-500 font-semibold bg-slate-50 rounded">
                      {weekNumber}
                    </div>
                    {week.map((dayObj, di) => {
=======
<<<<<<< HEAD
                const isSelectedWeek = week.some((d) => isSameDay(d.date, selectedDate))

=======
                const isSelectedWeek = week.some(d => isSameDay(d.date, selectedDate))
                
>>>>>>> 9d41cd19 (TC-2801: Fix the FE branch and modify gitignore)
                return (
<<<<<<< HEAD
                  <div key={wi} className="grid grid-cols-8 gap-2 mb-2">
=======
                  <div key={weekIndex} className="grid grid-cols-8 gap-2 mb-2">
>>>>>>> 3a5e23be (upgrade UI for all patient portal)
                    <div className="flex items-center justify-center text-xs text-slate-500 font-semibold bg-slate-50 rounded">
                      {weekNumber}
                    </div>
<<<<<<< HEAD
                    {week.map((dayObj, di) => {
=======
                    {week.map((dayObj, dayIndex) => {
>>>>>>> 9d41cd19 (TC-2801: Fix the FE branch and modify gitignore)
>>>>>>> backend
                      const isSelected = isSameDay(dayObj.date, selectedDate)
                      const today = new Date()
                      today.setHours(0, 0, 0, 0)
                      const isPast = dayObj.date < today
<<<<<<< HEAD

                      return (
                        <button
                          key={di}
=======
<<<<<<< HEAD

                      return (
                        <button
                          key={di}
=======
                      
                      return (
                        <button
                          key={dayIndex}
>>>>>>> 9d41cd19 (TC-2801: Fix the FE branch and modify gitignore)
>>>>>>> backend
                          disabled={isPast || !dayObj.isCurrentMonth}
                          onClick={() => dayObj.isCurrentMonth && setSelectedDate(dayObj.date)}
                          className={`
                            aspect-square flex items-center justify-center rounded-lg text-sm font-semibold transition-all duration-300
<<<<<<< HEAD
<<<<<<< HEAD
                            ${!dayObj.isCurrentMonth || isPast ? "text-slate-300 cursor-not-allowed" : ""}
                            ${isSelected
                              ? "bg-linear-to-br from-[#06b6d4] to-[#0891b2] text-white shadow-lg scale-110"
<<<<<<< HEAD
                              : isSelectedWeek && !isPast
                                ? "bg-cyan-50 text-cyan-700 hover:bg-cyan-100"
=======
                              : isSelectedWeek && !isPast
                                ? "bg-cyan-50 text-cyan-700 hover:bg-cyan-100"
                                : !isPast && dayObj.isCurrentMonth ? "hover:bg-slate-100 text-slate-700" : ""
=======
                            ${!dayObj.isCurrentMonth ? "text-slate-300" : ""}
=======
                            ${!dayObj.isCurrentMonth || isPast ? "text-slate-300 cursor-not-allowed" : ""}
>>>>>>> 9d41cd19 (TC-2801: Fix the FE branch and modify gitignore)
                            ${isSelected 
                              ? "bg-linear-to-br from-[#06b6d4] to-[#0891b2] text-white shadow-lg scale-110" 
                              : isSelectedWeek && !isPast
                                ? "bg-cyan-50 text-cyan-700 hover:bg-cyan-100" 
<<<<<<< HEAD
                                : "hover:bg-slate-100 text-slate-700"
>>>>>>> 3a5e23be (upgrade UI for all patient portal)
=======
>>>>>>> backend
                                : !isPast && dayObj.isCurrentMonth ? "hover:bg-slate-100 text-slate-700" : ""
>>>>>>> 9d41cd19 (TC-2801: Fix the FE branch and modify gitignore)
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
<<<<<<< HEAD
                <span className="font-semibold">
                  Week {getWeekNumber(weeks.find((w) => w.some((d) => isSameDay(d.date, selectedDate)))?.[0].date || new Date())}
                </span>
=======
<<<<<<< HEAD
<<<<<<< HEAD
                <span className="font-semibold">
                  Week {getWeekNumber(weeks.find((w) => w.some((d) => isSameDay(d.date, selectedDate)))?.[0].date || new Date())}
                </span>
=======
                <span className="font-semibold">Week {getWeekNumber(weeks.find(w => w.some(d => d.day === selectedDate && d.isCurrentMonth))?.[0].date || new Date())}</span>
>>>>>>> 3a5e23be (upgrade UI for all patient portal)
=======
                <span className="font-semibold">Week {getWeekNumber(weeks.find(w => w.some(d => isSameDay(d.date, selectedDate)))?.[0].date || new Date())}</span>
>>>>>>> 9d41cd19 (TC-2801: Fix the FE branch and modify gitignore)
>>>>>>> backend
              </p>
            </div>
          </Card>

<<<<<<< HEAD
          {/* ── Time Slots ── */}
=======
<<<<<<< HEAD
          {/* ── Time Slots ── */}
          <Card className="card-feature lg:col-span-3 p-6 flex flex-col">
            <div className="mb-6">
              <h3 className="text-2xl font-bold text-slate-900 mb-1">Available Slots</h3>
              <p className="text-slate-600">{format(selectedDate, "MMMM d, yyyy")}</p>
            </div>

            {/* Symptom Question */}
=======
          {/* Time Slots Section */}
>>>>>>> backend
          <Card className="card-feature lg:col-span-3 p-6 flex flex-col">
            <div className="mb-6">
              <h3 className="text-2xl font-bold text-slate-900 mb-1">Available Slots</h3>
              <p className="text-slate-600">{format(selectedDate, "MMMM d, yyyy")}</p>
            </div>

<<<<<<< HEAD
            {/* Symptom Question */}
=======
            {/* Question Section */}
>>>>>>> 3a5e23be (upgrade UI for all patient portal)
>>>>>>> backend
            <div className="mb-6 p-5 rounded-xl bg-linear-to-br from-cyan-50 to-blue-50 border border-cyan-100">
              <p className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
                <Calendar className="h-5 w-5 text-cyan-600" />
                Have you checked your symptoms?
              </p>
<<<<<<< HEAD
=======
<<<<<<< HEAD
              <div className="space-y-3">
                <label className={`flex items-center gap-3 p-3 rounded-lg border-2 cursor-pointer transition-all hover:bg-white ${checkedSymptom === "yes" ? "border-cyan-500 bg-white shadow-md" : "border-transparent bg-white/50"}`}>
                  <input type="radio" name="checkedSymptom" value="yes" checked={checkedSymptom === "yes"} onChange={() => { setCheckedSymptom("yes"); setSelectedDepartment("") }} className="w-4 h-4 text-cyan-600" />
                  <span className="font-medium text-slate-700">Yes, I know which department</span>
                </label>
                <label className={`flex items-center gap-3 p-3 rounded-lg border-2 cursor-pointer transition-all hover:bg-white ${checkedSymptom === "no" ? "border-cyan-500 bg-white shadow-md" : "border-transparent bg-white/50"}`}>
                  <input type="radio" name="checkedSymptom" value="no" checked={checkedSymptom === "no"} onChange={() => { setCheckedSymptom("no"); setSelectedDepartment("outpatient") }} className="w-4 h-4 text-cyan-600" />
=======

>>>>>>> backend
              <div className="space-y-3">
                <label className={`flex items-center gap-3 p-3 rounded-lg border-2 cursor-pointer transition-all hover:bg-white ${checkedSymptom === "yes" ? "border-cyan-500 bg-white shadow-md" : "border-transparent bg-white/50"}`}>
                  <input type="radio" name="checkedSymptom" value="yes" checked={checkedSymptom === "yes"} onChange={() => { setCheckedSymptom("yes"); setSelectedDepartment("") }} className="w-4 h-4 text-cyan-600" />
                  <span className="font-medium text-slate-700">Yes, I know which department</span>
                </label>
<<<<<<< HEAD
                <label className={`flex items-center gap-3 p-3 rounded-lg border-2 cursor-pointer transition-all hover:bg-white ${checkedSymptom === "no" ? "border-cyan-500 bg-white shadow-md" : "border-transparent bg-white/50"}`}>
                  <input type="radio" name="checkedSymptom" value="no" checked={checkedSymptom === "no"} onChange={() => { setCheckedSymptom("no"); setSelectedDepartment("outpatient") }} className="w-4 h-4 text-cyan-600" />
=======

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
>>>>>>> 3a5e23be (upgrade UI for all patient portal)
>>>>>>> backend
                  <span className="font-medium text-slate-700">No, not yet</span>
                </label>
              </div>
            </div>

            {/* Department Selection */}
            {checkedSymptom !== null && (
              <div className="mb-6">
<<<<<<< HEAD
=======
<<<<<<< HEAD
>>>>>>> backend
                {loadingDoctors ? (
                  <div className="flex items-center gap-2 text-slate-500 text-sm">
                    <Loader2 className="h-4 w-4 animate-spin" /> Loading departments…
                  </div>
                ) : (
                  <Select value={selectedDepartment} onValueChange={setSelectedDepartment}>
                    <SelectTrigger className="custom-select h-12">
                      <SelectValue placeholder="Select specialty" />
                    </SelectTrigger>
                    <SelectContent>
                      {checkedSymptom === "no" && (
                        <SelectItem value="outpatient">Outpatient (General Medicine)</SelectItem>
                      )}
                      {checkedSymptom === "yes" &&
                        departments.map((dept) => (
                          <SelectItem key={dept} value={dept}>
                            {dept}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                )}
<<<<<<< HEAD
=======
=======
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
>>>>>>> 3a5e23be (upgrade UI for all patient portal)
>>>>>>> backend
              </div>
            )}

            {/* Time Slots List */}
            {checkedSymptom !== null && selectedDepartment && (
              <div className="flex-1 overflow-y-auto space-y-3 pr-2">
<<<<<<< HEAD
                {filteredSlots.length === 0 ? (
=======
<<<<<<< HEAD
                {filteredSlots.length === 0 ? (
                  <div className="text-center py-12 text-slate-500">
                    <Calendar className="h-16 w-16 mx-auto mb-4 text-slate-300" />
                    <p>No doctors available in this department yet</p>
                  </div>
                ) : (
                  filteredSlots.map((slot, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleBookSlot(slot)}
                      disabled={!slot.available}
                      className={`card-feature-group w-full p-5 rounded-xl text-left transition-all duration-300 ${
                        slot.available ? "cursor-pointer hover:shadow-lg hover:scale-[1.02]" : "opacity-50 cursor-not-allowed bg-slate-50"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-4 mb-3">
                            <div className="flex items-center gap-2">
                              <Clock className="h-5 w-5 text-cyan-600" />
                              <span className="text-2xl font-bold text-cyan-600">{slot.time}</span>
                            </div>
                            <span className={`text-xs px-3 py-1 rounded-full font-semibold ${
                              slot.available ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                            }`}>
                              {slot.available ? "Available" : "Booked"}
                            </span>
                          </div>
                          <p className="font-semibold text-slate-900 mb-1">{slot.doctorLabel}</p>
                          <p className="text-sm text-slate-600">{slot.room}</p>
                        </div>
                        {slot.available && (
                          <div className="card-icon-wrapper h-12 w-12">
                            <ChevronRight className="h-6 w-6" />
                          </div>
                        )}
                      </div>
                    </button>
                  ))
=======
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
>>>>>>> backend
                  <div className="text-center py-12 text-slate-500">
                    <Calendar className="h-16 w-16 mx-auto mb-4 text-slate-300" />
                    <p>No doctors available in this department yet</p>
                  </div>
<<<<<<< HEAD
                ) : (
                  filteredSlots.map((slot, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleBookSlot(slot)}
                      disabled={!slot.available}
                      className={`card-feature-group w-full p-5 rounded-xl text-left transition-all duration-300 ${
                        slot.available ? "cursor-pointer hover:shadow-lg hover:scale-[1.02]" : "opacity-50 cursor-not-allowed bg-slate-50"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-4 mb-3">
                            <div className="flex items-center gap-2">
                              <Clock className="h-5 w-5 text-cyan-600" />
                              <span className="text-2xl font-bold text-cyan-600">{slot.time}</span>
                            </div>
                            <span className={`text-xs px-3 py-1 rounded-full font-semibold ${
                              slot.available ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                            }`}>
                              {slot.available ? "Available" : "Booked"}
                            </span>
                          </div>
                          <p className="font-semibold text-slate-900 mb-1">{slot.doctorLabel}</p>
                          <p className="text-sm text-slate-600">{slot.room}</p>
                        </div>
                        {slot.available && (
                          <div className="card-icon-wrapper h-12 w-12">
                            <ChevronRight className="h-6 w-6" />
                          </div>
                        )}
                      </div>
                    </button>
                  ))
=======
>>>>>>> 3a5e23be (upgrade UI for all patient portal)
>>>>>>> backend
                )}
              </div>
            )}
          </Card>
        </div>
      </div>

<<<<<<< HEAD
      {/* ── Confirmation Modal ── */}
=======
<<<<<<< HEAD
      {/* ── Confirmation Modal ── */}
=======
      {/* Confirmation Modal */}
>>>>>>> 3a5e23be (upgrade UI for all patient portal)
>>>>>>> backend
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
<<<<<<< HEAD
                  <span className="text-slate-900 font-medium">{selectedSlot.doctorLabel}</span>
=======
<<<<<<< HEAD
                  <span className="text-slate-900 font-medium">{selectedSlot.doctorLabel}</span>
=======
                  <span className="text-slate-900 font-medium">{selectedSlot.doctor}</span>
>>>>>>> 3a5e23be (upgrade UI for all patient portal)
>>>>>>> backend
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-cyan-600 font-bold">•</span>
                  <span className="text-slate-700">Department of {selectedSlot.department}</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-cyan-600 font-bold">•</span>
                  <span className="text-slate-700">{selectedSlot.room}</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-cyan-600 font-bold">•</span>
<<<<<<< HEAD
                  <span className="text-slate-700">
                    {format(selectedDate, "MMMM d, yyyy")} at {selectedSlot.time}
                  </span>
=======
<<<<<<< HEAD
                  <span className="text-slate-700">
                    {format(selectedDate, "MMMM d, yyyy")} at {selectedSlot.time}
                  </span>
=======
                  <span className="text-slate-700">At {selectedSlot.time}</span>
>>>>>>> 3a5e23be (upgrade UI for all patient portal)
>>>>>>> backend
                </li>
              </ul>
            </div>

            <div className="flex gap-3">
              <Button variant="outline" className="flex-1 h-12" onClick={() => setShowNotification(false)}>
                Cancel
              </Button>
<<<<<<< HEAD
              <Button className="flex-1 h-12 btn-gradient" onClick={handleConfirmBooking} disabled={booking}>
                {booking && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
=======
<<<<<<< HEAD
              <Button className="flex-1 h-12 btn-gradient" onClick={handleConfirmBooking} disabled={booking}>
                {booking && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
=======
              <Button className="flex-1 h-12 btn-gradient" onClick={handleConfirmBooking}>
>>>>>>> 3a5e23be (upgrade UI for all patient portal)
>>>>>>> backend
                Confirm Booking
              </Button>
            </div>
          </Card>
        </div>
      )}
    </PatientLayout>
  )
}
