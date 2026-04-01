"use client"

import { useEffect, useMemo, useState, type KeyboardEvent } from "react"
import { Calendar, Plus, RefreshCcw, X, Clock, UserRound, Stethoscope, ChevronLeft, ChevronRight } from "lucide-react"
import { isSameDay, format } from "date-fns"
import { Link } from "react-router-dom"
import { NurseLayout } from "@/components/nurse-layout"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { appointmentService, type ClinicRoomOption, type DoctorOption, type NurseOpenSlot } from "@/services/appointment-service"

export default function NurseAppointmentsPage() {
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")
  const [searchDepartment, setSearchDepartment] = useState<string>("all")
  const [doctorOptions, setDoctorOptions] = useState<DoctorOption[]>([])
  const [roomOptions, setRoomOptions] = useState<ClinicRoomOption[]>([])
  const [slots, setSlots] = useState<NurseOpenSlot[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string>("")

  const [createDepartment, setCreateDepartment] = useState<string>("")
  const [selectedDoctorId, setSelectedDoctorId] = useState<string>("")
  const [slotDate, setSlotDate] = useState("")
  const [slotStartTime, setSlotStartTime] = useState("")
  const [slotEndTime, setSlotEndTime] = useState("")
  const [selectedRoomId, setSelectedRoomId] = useState<string>("")
  const [selectedSlotId, setSelectedSlotId] = useState<number | null>(null)

  const [viewDate, setViewDate] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState(new Date())

  const getDaysInMonth = () => {
    const year = viewDate.getFullYear()
    const month = viewDate.getMonth()
    const firstDay = new Date(year, month, 1).getDay()
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const daysInPrevMonth = new Date(year, month, 0).getDate()

    const days: { day: number; isCurrentMonth: boolean; date: Date }[] = []
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

  const monthName = viewDate.toLocaleString("en-US", { month: "long", year: "numeric" })
  const days = getDaysInMonth()
  const weeks = Array.from({ length: 6 }, (_, i) => days.slice(i * 7, i * 7 + 7))
  const halfHourOptions = useMemo(() => {
    const options: string[] = []
    for (let hour = 0; hour < 24; hour += 1) {
      for (const minute of [0, 30]) {
        options.push(`${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`)
      }
    }
    return options
  }, [])

  const formatTimeMask = (rawInput: string) => {
    const digits = String(rawInput || "").replace(/\D/g, "").slice(0, 4)
    if (!digits) return ""
    if (digits.length <= 2) return digits
    return `${digits.slice(0, 2)}:${digits.slice(2)}`
  }

  const normalizeHalfHourTime = (value: string): string | null => {
    const normalized = String(value || "").trim()
    const match = normalized.match(/^([01]?\d|2[0-3]):([0-5]\d)$/)
    if (!match) return null
    const hour = Number(match[1])
    const minute = Number(match[2])
    if (minute !== 0 && minute !== 30) return null
    return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`
  }

  const load = async () => {
    setLoading(true)
    try {
      const [doctors, rooms, openSlots] = await Promise.all([
        appointmentService.getDoctors(),
        appointmentService.getClinicRooms(),
        appointmentService.getOpenSlots({
          startDate: startDate || undefined,
          endDate: endDate || undefined,
        }),
      ])
      setDoctorOptions(doctors || [])
      setRoomOptions(rooms || [])
      setSlots(openSlots || [])
    } catch (e: any) {
      setMessage(e?.message || "Failed to load appointment slots")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const resetForm = () => {
    setSelectedSlotId(null)
    setCreateDepartment("")
    setSelectedDoctorId("")
    setSelectedRoomId("")
    setSlotDate("")
    setSlotStartTime("")
    setSlotEndTime("")
  }

  const handleCreateOrUpdate = async () => {
    const normalizedStart = normalizeHalfHourTime(slotStartTime)
    const normalizedEnd = slotEndTime ? normalizeHalfHourTime(slotEndTime) : null

    if (!slotDate || !normalizedStart) {
      setMessage("Please select date and time.")
      return
    }
    if (slotEndTime && !normalizedEnd) {
      setMessage("Invalid time. Use HH:mm with 30-minute steps (e.g. 09:00, 09:30).")
      return
    }
    if (!selectedSlotId && !selectedDoctorId) {
      setMessage("Please select doctor.")
      return
    }
    setSaving(true)
    setMessage("")
    try {
      if (selectedSlotId) {
        await appointmentService.updateOpenSlot(selectedSlotId, {
          date: slotDate,
          time: normalizedStart,
          roomId: selectedRoomId ? Number(selectedRoomId) : undefined,
        })
        setMessage("Slot rescheduled successfully.")
      } else {
        const toMinutes = (t: string) => {
          const [h, m] = t.split(":").map(Number)
          return h * 60 + m
        }
        const toHHMM = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`
        const startMin = toMinutes(normalizedStart)
        const endMin = normalizedEnd ? toMinutes(normalizedEnd) : startMin + 30
        if (endMin <= startMin) {
          setMessage("End time must be greater than start time.")
          setSaving(false)
          return
        }
        const createJobs: Promise<any>[] = []
        for (let m = startMin; m < endMin; m += 30) {
          createJobs.push(
            appointmentService.createOpenSlot({
              doctorId: Number(selectedDoctorId),
                          roomId: selectedRoomId ? Number(selectedRoomId) : undefined,
              date: slotDate,
              time: toHHMM(m),
            })
          )
        }
        await Promise.all(createJobs)
        setMessage(`Created ${createJobs.length} slot(s) successfully.`)
      }
      resetForm()
      await load()
    } catch (e: any) {
      setMessage(e?.message || "Operation failed")
    } finally {
      setSaving(false)
    }
  }

  const handleTimeFieldBlur = (field: "start" | "end") => {
    const current = field === "start" ? slotStartTime : slotEndTime
    if (!current) return
    const normalized = normalizeHalfHourTime(current)
    if (!normalized) {
      setMessage("Invalid time. Allowed values are HH:mm with minutes 00 or 30.")
      return
    }
    if (field === "start") setSlotStartTime(normalized)
    else setSlotEndTime(normalized)
  }

  const handleDelete = async () => {
    if (!selectedSlotId) return
    if (!window.confirm("Cancel this open slot?")) return
    setSaving(true)
    setMessage("")
    try {
      await appointmentService.deleteOpenSlot(selectedSlotId)
      setMessage("Slot cancelled successfully.")
      resetForm()
      await load()
    } catch (e: any) {
      setMessage(e?.message || "Failed to cancel slot")
    } finally {
      setSaving(false)
    }
  }

  const pickSlot = (s: NurseOpenSlot) => {
    setSelectedSlotId(s.id)
    setCreateDepartment(String(s.department || ""))
    setSelectedDoctorId(String(s.doctorId))
    setSelectedRoomId(s.roomId != null ? String(s.roomId) : "")
    setSlotDate(String(s.date || ""))
    setSlotStartTime(String(s.time || ""))
    setSlotEndTime("")
    const picked = new Date(`${s.date}T00:00:00`)
    if (!Number.isNaN(picked.getTime())) {
      setSelectedDate(picked)
      setViewDate(picked)
    }
  }

  const handleFilterEnter = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault()
      void load()
    }
  }

  const handleDepartmentFilterEnter = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "Enter") {
      e.preventDefault()
      void load()
    }
  }

  const departmentOptions = useMemo(() => {
    const map = new Map<string, string>()
    doctorOptions.forEach((d) => {
      const value = String(d.department || "").trim()
      if (!value) return
      map.set(value.toLowerCase(), value)
    })
    return Array.from(map.values()).sort((a, b) => a.localeCompare(b))
  }, [doctorOptions])

  const doctorsForCreate = useMemo(() => {
    if (!createDepartment) return doctorOptions
    return doctorOptions.filter((d) => String(d.department || "").trim().toLowerCase() === createDepartment.trim().toLowerCase())
  }, [doctorOptions, createDepartment])

  useEffect(() => {
    if (selectedSlotId) return
    if (!selectedDoctorId || selectedRoomId) return
    const doctor = doctorOptions.find((d) => String(d.id) === selectedDoctorId)
    const doctorRoomName = String(doctor?.room || "").trim()
    if (!doctorRoomName) return
    const matchedRoom = roomOptions.find((r) => String(r.name || "").trim().toLowerCase() === doctorRoomName.toLowerCase())
    if (matchedRoom) {
      setSelectedRoomId(String(matchedRoom.id))
    }
  }, [selectedDoctorId, selectedSlotId, selectedRoomId, doctorOptions, roomOptions])

  const visibleSlots = useMemo(
    () =>
      slots.filter((s) => {
        const inSelectedDate = isSameDay(new Date(`${s.date}T00:00:00`), selectedDate)
        if (!inSelectedDate) return false
        if (searchDepartment === "all") return true
        return String(s.department || "").trim().toLowerCase() === searchDepartment.trim().toLowerCase()
      }),
    [slots, selectedDate, searchDepartment]
  )

  return (
    <NurseLayout>
      <div className="space-y-8">
        <Card className="card-feature border-slate-200/60">
          <CardContent className="p-6">
            <h3 className="text-base font-semibold text-slate-800 mb-4">Search Slots</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
              <div className="relative">
                <label className="text-sm text-slate-600 mb-1 block">Start date</label>
                <Calendar className="absolute left-3 top-[38px] w-5 h-5 text-slate-400" />
                <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} onKeyDown={handleFilterEnter} className="pl-10 h-11 text-base" />
              </div>

              <div className="relative">
                <label className="text-sm text-slate-600 mb-1 block">End date</label>
                <Calendar className="absolute left-3 top-[38px] w-5 h-5 text-slate-400" />
                <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} onKeyDown={handleFilterEnter} className="pl-10 h-11 text-base" />
              </div>

              <div>
                <label className="text-sm text-slate-600 mb-1 block">Department</label>
                <Select value={searchDepartment} onValueChange={setSearchDepartment}>
                  <SelectTrigger className="h-11" onKeyDown={handleDepartmentFilterEnter}>
                    <SelectValue placeholder="All departments" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All departments</SelectItem>
                    {departmentOptions.map((department) => (
                      <SelectItem key={`search-${department}`} value={department}>
                        {department}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <p className="mt-2 text-xs text-slate-500">Press Enter in date fields to apply filter.</p>
          </CardContent>
        </Card>

        <Card className="card-feature border-slate-200/60">
          <CardContent className="p-6">
            <h3 className="text-base font-semibold text-slate-800 mb-4">{selectedSlotId ? "Reschedule Slot" : "Create Slots"}</h3>
            <div className="grid grid-cols-1 md:grid-cols-6 gap-3 items-end">
              <div>
                <label className="text-sm text-slate-600 mb-1 block">Department</label>
                <Select
                  value={createDepartment || undefined}
                  onValueChange={(value) => {
                    setCreateDepartment(value)
                    if (!selectedSlotId) {
                      setSelectedDoctorId("")
                    }
                  }}
                >
                  <SelectTrigger className="h-11">
                    <SelectValue placeholder="Select department" />
                  </SelectTrigger>
                  <SelectContent>
                    {departmentOptions.map((department) => (
                      <SelectItem key={`create-${department}`} value={department}>
                        {department}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm text-slate-600 mb-1 block">Doctor</label>
                <Select value={selectedDoctorId} onValueChange={setSelectedDoctorId} disabled={!!selectedSlotId}>
                  <SelectTrigger className="h-11">
                    <SelectValue placeholder="Select doctor" />
                  </SelectTrigger>
                  <SelectContent>
                    {doctorsForCreate.map((d) => {
                      const fullName = `${d.firstName || ""} ${d.lastName || ""}`.trim() || d.username
                      return (
                        <SelectItem key={d.id} value={String(d.id)}>
                          {`Dr. ${fullName}`}
                        </SelectItem>
                      )
                    })}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm text-slate-600 mb-1 block">Date</label>
                <Input type="date" value={slotDate} onChange={(e) => setSlotDate(e.target.value)} className="h-11" />
              </div>

              <div>
                <label className="text-sm text-slate-600 mb-1 block">Room</label>
                <Select value={selectedRoomId || undefined} onValueChange={setSelectedRoomId}>
                  <SelectTrigger className="h-11">
                    <SelectValue placeholder="Select room" />
                  </SelectTrigger>
                  <SelectContent>
                    {roomOptions.map((room) => (
                      <SelectItem key={room.id} value={String(room.id)}>
                        {room.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm text-slate-600 mb-1 block">Start time</label>
                <Input
                  type="text"
                  inputMode="numeric"
                  placeholder="__:__"
                  list="nurse-start-time-options"
                  value={slotStartTime}
                  onChange={(e) => setSlotStartTime(formatTimeMask(e.target.value))}
                  onBlur={() => handleTimeFieldBlur("start")}
                  className="h-11"
                />
                <datalist id="nurse-start-time-options">
                  {halfHourOptions.map((time) => (
                    <option key={`start-${time}`} value={time} />
                  ))}
                </datalist>
              </div>

              <div>
                <label className="text-sm text-slate-600 mb-1 block">End time</label>
                <Input
                  type="text"
                  inputMode="numeric"
                  placeholder="__:__"
                  list="nurse-end-time-options"
                  value={slotEndTime}
                  onChange={(e) => setSlotEndTime(formatTimeMask(e.target.value))}
                  onBlur={() => handleTimeFieldBlur("end")}
                  className="h-11"
                />
                <datalist id="nurse-end-time-options">
                  {halfHourOptions.map((time) => (
                    <option key={`end-${time}`} value={time} />
                  ))}
                </datalist>
              </div>
            </div>
            <p className="mt-2 text-xs text-slate-500">Time format: HH:mm, only 30-minute steps (00 or 30).</p>

            <div className="mt-4 flex flex-wrap gap-3">
              <Button className="btn-gradient h-11 px-6" onClick={handleCreateOrUpdate} disabled={saving}>
                <Plus className="w-5 h-5 mr-2" />
                {selectedSlotId ? "Reschedule Slot" : "Create Slot"}
              </Button>
              <Button variant="outline" className="h-11 px-6" onClick={resetForm} disabled={saving}>
                <RefreshCcw className="w-5 h-5 mr-2" />
                Clear
              </Button>
              <Button
                variant="outline"
                className="h-11 px-6 border-red-200 text-red-700 hover:bg-red-50"
                onClick={handleDelete}
                disabled={saving || !selectedSlotId}
              >
                <X className="w-5 h-5 mr-2" />
                Cancel Slot
              </Button>
            </div>
            {message ? <p className="mt-3 text-sm text-slate-700">{message}</p> : null}
          </CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-5">
          <Card className="card-feature lg:col-span-2 p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-2xl font-bold text-slate-900">{monthName}</h3>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="icon" onClick={() => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1))} className="hover:bg-cyan-50">
                  <ChevronLeft className="w-5 h-5" />
                </Button>
                <Button variant="ghost" size="icon" onClick={() => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1))} className="hover:bg-cyan-50">
                  <ChevronRight className="w-5 h-5" />
                </Button>
              </div>
            </div>

            <div>
              <div className="grid grid-cols-7 gap-2 mb-3">
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
                  <div key={day} className="text-xs text-slate-600 text-center font-semibold">{day}</div>
                ))}
              </div>
              {weeks.map((week, weekIndex) => (
                <div key={weekIndex} className="grid grid-cols-7 gap-2 mb-2">
                  {week.map((dayObj, dayIndex) => {
                    const isSelected = isSameDay(dayObj.date, selectedDate)
                    return (
                      <button
                        key={dayIndex}
                        onClick={() => {
                          setSelectedDate(dayObj.date)
                          if (!dayObj.isCurrentMonth) {
                            setViewDate(new Date(dayObj.date.getFullYear(), dayObj.date.getMonth(), 1))
                          }
                          setSlotDate(format(dayObj.date, "yyyy-MM-dd"))
                        }}
                        className={`aspect-square flex items-center justify-center rounded-lg text-sm font-semibold transition-all duration-300 ${
                          !dayObj.isCurrentMonth
                            ? "text-slate-300"
                            : isSelected
                              ? "bg-linear-to-br from-[#06b6d4] to-[#0891b2] text-white shadow-lg scale-110"
                              : "hover:bg-slate-100 text-slate-700"
                        }`}
                      >
                        {dayObj.day}
                      </button>
                    )
                  })}
                </div>
              ))}
            </div>
          </Card>

          <Card className="card-feature lg:col-span-3 p-0">
            <CardContent className="p-0">
              <div className="p-4 border-b">
                <h3 className="text-xl font-bold text-slate-900">Slots on {format(selectedDate, "MMMM d, yyyy")}</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-cyan-50">
                      <th className="text-left p-3 text-sm font-semibold text-slate-700">Time</th>
                      <th className="text-left p-3 text-sm font-semibold text-slate-700">Doctor</th>
                      <th className="text-left p-3 text-sm font-semibold text-slate-700">Department</th>
                      <th className="text-left p-3 text-sm font-semibold text-slate-700">Room</th>
                      <th className="text-left p-3 text-sm font-semibold text-slate-700">Patient</th>
                      <th className="text-left p-3 text-sm font-semibold text-slate-700">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr><td colSpan={6} className="p-8 text-center text-slate-500">Loading slots...</td></tr>
                    ) : visibleSlots.length === 0 ? (
                      <tr><td colSpan={6} className="p-8 text-center text-slate-500">No slots on this day</td></tr>
                    ) : (
                      visibleSlots.map((slot) => (
                        <tr
                          key={slot.id}
                          onClick={() => slot.status !== "booked" && pickSlot(slot)}
                          className={`border-t ${selectedSlotId === slot.id ? "bg-cyan-50" : ""} ${slot.status !== "booked" ? "cursor-pointer hover:bg-slate-50" : ""}`}
                        >
                          <td className="p-3 text-sm">
                            <div className="flex items-center gap-2"><Clock className="w-4 h-4 text-slate-400" />{slot.time}</div>
                          </td>
                          <td className="p-3 text-sm">
                            <div className="flex items-center gap-2"><Stethoscope className="w-4 h-4 text-slate-400" />{slot.doctorName}</div>
                          </td>
                          <td className="p-3 text-sm">{slot.department || "-"}</td>
                          <td className="p-3 text-sm">{slot.roomName || "-"}</td>
                          <td className="p-3 text-sm">
                            {slot.patientId ? (
                              <Link to={`/nurse/patients/${slot.patientId}/profile`} className="inline-flex items-center gap-2 text-cyan-700 hover:underline">
                                <UserRound className="w-4 h-4 text-slate-400" />
                                {slot.patientName || `Patient #${slot.patientId}`}
                              </Link>
                            ) : slot.patientName ? (
                              <span className="inline-flex items-center gap-2"><UserRound className="w-4 h-4 text-slate-400" />{slot.patientName}</span>
                            ) : "-"}
                          </td>
                          <td className="p-3 text-sm">
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                              slot.status === "open"
                                ? "bg-green-100 text-green-700"
                                : slot.status === "booked"
                                  ? "bg-blue-100 text-blue-700"
                                  : "bg-slate-200 text-slate-600"
                            }`}>
                              {slot.status === "open" ? "Open" : slot.status === "booked" ? "Booked" : "Cancelled"}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </NurseLayout>
  )
}

