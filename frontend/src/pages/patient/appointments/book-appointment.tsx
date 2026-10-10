"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import { ChevronLeft, ChevronRight, Calendar, Clock, Loader2 } from "lucide-react"
import { PatientLayout } from "@/components/patient-layout"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { appointmentService, type DoctorOption, type NurseOpenSlot } from "@/services/appointment-service"
import { useAuth } from "@/contexts/auth-context"
import { usePauseableToast } from "@/hooks/use-pauseable-toast"
import { PauseableCornerToastPortal } from "@/components/pauseable-corner-toast"
import { format, isSameDay, startOfDay } from "date-fns"

/** Fade-in + display duration from `usePauseableToast(2600)` (see usePauseableToast). */
const BOOK_SUCCESS_NAV_DELAY_MS = 300 + 2600

interface TimeSlot {
  id: number
  doctorId: number
  time: string
  doctor: string
  department: string
  room: string
  available: boolean
}

export default function BookAppointmentPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user } = useAuth()
  const { toast, isExiting, showSuccess, showError, onMouseEnter, onMouseLeave } = usePauseableToast(2600)
  const successNavTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const rescheduleFromAppointmentId = useMemo(() => {
    const s = location.state as { rescheduleId?: number } | null | undefined
    const n = Number(s?.rescheduleId)
    return Number.isFinite(n) && n > 0 ? n : undefined
  }, [location.state])
  
  // viewDate controls the month currently being viewed in the calendar
  const [viewDate, setViewDate] = useState(new Date())
  
  // selectedDate is the specific date selected for the appointment
  const [selectedDate, setSelectedDate] = useState(new Date())
  
  const [selectedDepartment, setSelectedDepartment] = useState("")
  const [bookingSlotId, setBookingSlotId] = useState<number | null>(null)
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

  const loadOpenSlots = useCallback(async () => {
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
  }, [selectedDate])

  useEffect(() => {
    void loadOpenSlots()
  }, [loadOpenSlots])

  useEffect(() => {
    return () => {
      if (successNavTimerRef.current) {
        clearTimeout(successNavTimerRef.current)
        successNavTimerRef.current = null
      }
    }
  }, [])

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

  const bookSlot = async (slot: TimeSlot) => {
    if (!slot.available || !user?.id) return
    if (!Number.isFinite(slot.doctorId) || slot.doctorId <= 0) {
      showError("Invalid doctor for this slot. Please refresh and try again.")
      return
    }

    setBookingSlotId(slot.id)
    try {
      const formattedDate = format(selectedDate, "yyyy-MM-dd")
      const formattedTime = `${slot.time}:00`

      await appointmentService.createAppointment({
        doctorId: slot.doctorId,
        doctor: slot.doctor,
        doctorId: slot.doctorId,
        department: slot.department,
        date: formattedDate,
        time: formattedTime,
        room: slot.room === "Room -" ? "" : slot.room,
        symptoms: checkedSymptom === "yes" ? "Patient reported symptoms" : "No symptoms reported",
        notes: "Booked via web portal",
        ...(rescheduleFromAppointmentId
          ? { rescheduleFromAppointmentId: rescheduleFromAppointmentId }
          : {}),
      })

      await loadOpenSlots()
      showSuccess(
        "Booking successful. Your visit is saved as Awaiting doctor until your doctor accepts it — you will get a notification when they respond."
      )
      if (successNavTimerRef.current) clearTimeout(successNavTimerRef.current)
      successNavTimerRef.current = setTimeout(() => {
        successNavTimerRef.current = null
        navigate("/patient/appointments", { replace: true })
      }, BOOK_SUCCESS_NAV_DELAY_MS)
    } catch (error: unknown) {
      console.error("Booking failed:", error)
      showError(
        error instanceof Error ? error.message : "Failed to book appointment. Please try again."
      )
    } finally {
      setBookingSlotId(null)
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
    const now = new Date()
    return openSlots
      .filter((slot) => {
        if (!slot?.date || !slot?.time) return false
        if (String(slot.status || "").toLowerCase() !== "open") return false
        const sameDate = isSameDay(new Date(`${slot.date}T00:00:00`), startOfDay(selectedDate))
        if (!sameDate) return false
        const slotDateTime = new Date(`${slot.date}T${String(slot.time).slice(0, 5)}:00`)
        if (Number.isNaN(slotDateTime.getTime())) return false
        if (slotDateTime <= now) return false
        return (slot.department || "").trim().toLowerCase() === selectedDepartmentLabel.trim().toLowerCase()
      })
      .map((slot) => {
        const name = String(slot.doctorName || "").trim()
        const doctorLabel = name
          ? /^dr\.?\s/i.test(name)
            ? name
            : `Dr. ${name}`
          : "Dr."
        return {
          id: slot.id,
          doctorId: Number(slot.doctorId),
          time: String(slot.time || "").slice(0, 5),
          doctor: doctorLabel,
          department: slot.department || selectedDepartmentLabel,
          room: slot.roomName || "",
          available: true,
        }
      })
  }, [selectedDepartmentLabel, openSlots, selectedDate])

  return (
    <PatientLayout>
      <div className="space-y-8">
        {rescheduleFromAppointmentId ? (
          <div
            className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
            role="status"
          >
            You are rescheduling an appointment. Choose a new date and time slot, then use Select on a slot to
            book. Your previous booking will be released and your doctors will be notified.
          </div>
        ) : null}

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
                      id="checked-symptom-yes"
                      name="checkedSymptom"
                      value="yes"
                      aria-label="Checked symptom yes"
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
                      id="checked-symptom-no"
                      name="checkedSymptom"
                      value="no"
                      aria-label="Checked symptom no"
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
                {doctorSlots.map((slot) => {
                  const booking = bookingSlotId === slot.id
                  return (
                    <div
                      key={slot.id}
                      className={`
                        group w-full rounded-xl border bg-white text-left transition-colors duration-200
                        ${slot.available
                          ? "border-slate-200 hover:border-cyan-500 hover:border-2 focus-within:border-cyan-500"
                          : "border-slate-200 opacity-50 cursor-not-allowed bg-slate-50"
                        }
                      `}
                    >
                      <div className="flex items-center justify-between gap-4 p-5">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-3 mb-3">
                            <div className="flex items-center gap-2">
                              <Clock className="h-5 w-5 text-cyan-600 shrink-0" />
                              <span className="text-2xl font-bold text-cyan-600">{slot.time}</span>
                            </div>
                            <span
                              className={`text-xs px-3 py-1 rounded-full font-semibold shrink-0 ${
                                slot.available
                                  ? "bg-green-100 text-green-700"
                                  : "bg-red-100 text-red-700"
                              }`}
                            >
                              {slot.available ? "Available" : "Booked"}
                            </span>
                          </div>
                          <p className="font-semibold text-slate-900 mb-1">{slot.doctor}</p>
                          <p className="text-sm text-slate-600">
                            {slot.room ? `Room ${slot.room}` : "Room -"}
                          </p>
                        </div>

                        {slot.available ? (
                          <div className="shrink-0 self-center flex justify-end">
                            <Button
                              type="button"
                              size="lg"
                              className={`btn-gradient shadow-md transition-opacity duration-200 [@media(hover:none)]:opacity-100 [@media(hover:none)]:pointer-events-auto ${
                                booking
                                  ? "opacity-100 pointer-events-auto"
                                  : "opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto focus-visible:opacity-100 focus-visible:pointer-events-auto"
                              }`}
                              disabled={booking}
                              onClick={(e) => {
                                e.stopPropagation()
                                void bookSlot(slot)
                              }}
                            >
                              {booking ? (
                                <>
                                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                  Booking…
                                </>
                              ) : (
                                "Select"
                              )}
                            </Button>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  )
                })}
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

      <PauseableCornerToastPortal
        toast={toast}
        isExiting={isExiting}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
      />
    </PatientLayout>
  )
}
