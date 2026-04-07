"use client"

import { useEffect, useMemo, useState } from "react"
import { Plus, RefreshCcw, X, Clock, UserRound, Stethoscope, ChevronLeft, ChevronRight, CalendarRange } from "lucide-react"
import { isSameDay, format, startOfMonth, endOfMonth } from "date-fns"
import { Link } from "react-router-dom"
import { NurseLayout } from "@/components/nurse-layout"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { appointmentService, type ClinicRoomOption, type DoctorOption, type NurseOpenSlot } from "@/services/appointment-service"
import { getMyWorkShifts } from "@/services/work-shift-service"
import { PATIENT_IN_DEPARTMENT_OPTIONS } from "@/lib/patient-departments"

function doctorDepartmentsList(d: DoctorOption): string[] {
  if (d.departments?.length) {
    return d.departments.map((x) => String(x).trim()).filter(Boolean)
  }
  const one = String(d.department || "").trim()
  return one ? [one] : []
}

function doctorWorksInDepartment(d: DoctorOption, dept: string): boolean {
  const norm = dept.trim().toLowerCase()
  if (!norm) return true
  return doctorDepartmentsList(d).some((x) => x.toLowerCase() === norm)
}

function newRowId() {
  return globalThis.crypto?.randomUUID?.() ?? `row-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

type SlotDraftRow = {
  id: string
  department: string
  doctorId: string
  roomId: string
  date: string
  start: string
  end: string
}

function newDraftRow(dateYmd: string): SlotDraftRow {
  return {
    id: newRowId(),
    department: "",
    doctorId: "",
    roomId: "",
    date: dateYmd,
    start: "",
    end: "",
  }
}

function matchDepartmentOption(dbName: string): string {
  const raw = String(dbName || "").trim()
  if (!raw) return PATIENT_IN_DEPARTMENT_OPTIONS[0] ?? ""
  const low = raw.toLowerCase()
  const exact = PATIENT_IN_DEPARTMENT_OPTIONS.find((o) => o.toLowerCase() === low)
  if (exact) return exact
  const inc = PATIENT_IN_DEPARTMENT_OPTIONS.find(
    (o) => low.includes(o.toLowerCase()) || o.toLowerCase().includes(low)
  )
  return inc ?? PATIENT_IN_DEPARTMENT_OPTIONS[0] ?? "Outpatient"
}

function extractTimeHm(isoLike: string): string {
  const m = /\d{4}-\d{2}-\d{2}[ T](\d{2}):(\d{2})/.exec(String(isoLike || ""))
  if (!m) return ""
  return `${m[1]}:${m[2]}`
}

function extractDateYmd(isoLike: string): string {
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(String(isoLike || "").trim())
  return m ? m[1] : ""
}

function normalizeSlotTimeDisplay(t: string): string {
  const s = String(t || "").trim()
  const m = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(s)
  if (!m) return s
  const h = Number(m[1])
  const mi = Number(m[2])
  if (!Number.isFinite(h) || !Number.isFinite(mi)) return s
  return `${String(h).padStart(2, "0")}:${String(mi).padStart(2, "0")}`
}

export default function NurseAppointmentsPage() {
  const [listDepartmentFilter, setListDepartmentFilter] = useState<string>("all")
  const [listTimeFilter, setListTimeFilter] = useState<string>("all")

  const [doctorOptions, setDoctorOptions] = useState<DoctorOption[]>([])
  const [roomOptions, setRoomOptions] = useState<ClinicRoomOption[]>([])
  const [slots, setSlots] = useState<NurseOpenSlot[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [shiftFillLoading, setShiftFillLoading] = useState(false)
  const [message, setMessage] = useState<string>("")

  const [createDepartment, setCreateDepartment] = useState<string>("")
  const [selectedDoctorId, setSelectedDoctorId] = useState<string>("")
  const [slotDate, setSlotDate] = useState("")
  const [slotStartTime, setSlotStartTime] = useState("")
  const [slotEndTime, setSlotEndTime] = useState("")
  const [selectedRoomId, setSelectedRoomId] = useState<string>("")
  const [selectedSlotId, setSelectedSlotId] = useState<number | null>(null)

  const [draftRows, setDraftRows] = useState<SlotDraftRow[]>(() => [newDraftRow(format(new Date(), "yyyy-MM-dd"))])

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
      const monthStart = format(startOfMonth(viewDate), "yyyy-MM-dd")
      const monthEnd = format(endOfMonth(viewDate), "yyyy-MM-dd")
      const [doctors, rooms, openSlots] = await Promise.all([
        appointmentService.getDoctors(),
        appointmentService.getClinicRooms(),
        appointmentService.getOpenSlots({
          startDate: monthStart,
          endDate: monthEnd,
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
  }, [viewDate])

  useEffect(() => {
    if (selectedSlotId) return
    const ymd = format(selectedDate, "yyyy-MM-dd")
    setDraftRows((rows) => (rows.length ? rows.map((r) => ({ ...r, date: ymd })) : [newDraftRow(ymd)]))
  }, [selectedDate, selectedSlotId])

  const resetForm = () => {
    setSelectedSlotId(null)
    setCreateDepartment("")
    setSelectedDoctorId("")
    setSelectedRoomId("")
    setSlotDate("")
    setSlotStartTime("")
    setSlotEndTime("")
    setDraftRows([newDraftRow(format(selectedDate, "yyyy-MM-dd"))])
  }

  const handleCreateOrUpdate = async () => {
    if (!selectedSlotId) return
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
    setSaving(true)
    setMessage("")
    try {
      await appointmentService.updateOpenSlot(selectedSlotId, {
        date: slotDate,
        time: normalizedStart,
        roomId: selectedRoomId ? Number(selectedRoomId) : undefined,
      })
      setMessage("Slot rescheduled successfully.")
      resetForm()
      await load()
    } catch (e: any) {
      setMessage(e?.message || "Operation failed")
    } finally {
      setSaving(false)
    }
  }

  const handleCreateAllDrafts = async () => {
    setSaving(true)
    setMessage("")
    let created = 0
    try {
      const toMinutes = (t: string) => {
        const [h, m] = t.split(":").map(Number)
        return h * 60 + m
      }
      const toHHMM = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`

      for (const row of draftRows) {
        const ns = normalizeHalfHourTime(row.start)
        const ne = row.end ? normalizeHalfHourTime(row.end) : null
        if (!row.date || !ns) {
          setMessage("Each row needs date and valid start time (HH:mm, :00 or :30).")
          setSaving(false)
          return
        }
        if (row.end && !ne) {
          setMessage("Invalid end time on one of the rows.")
          setSaving(false)
          return
        }
        if (!row.doctorId) {
          setMessage("Select a doctor on every row.")
          setSaving(false)
          return
        }
        const startMin = toMinutes(ns)
        const endMin = ne ? toMinutes(ne) : startMin + 30
        if (endMin <= startMin) {
          setMessage("Each row: end time must be after start time.")
          setSaving(false)
          return
        }
        for (let m = startMin; m < endMin; m += 30) {
          await appointmentService.createOpenSlot({
            doctorId: Number(row.doctorId),
            roomId: row.roomId ? Number(row.roomId) : undefined,
            date: row.date,
            time: toHHMM(m),
          })
          created += 1
        }
      }
      setMessage(`Created ${created} slot(s) from ${draftRows.length} row(s).`)
      setDraftRows([newDraftRow(format(selectedDate, "yyyy-MM-dd"))])
      await load()
    } catch (e: any) {
      setMessage(e?.message || "Bulk create failed")
    } finally {
      setSaving(false)
    }
  }

  const handleFillFromWorkShift = async () => {
    const ymd = format(selectedDate, "yyyy-MM-dd")
    setShiftFillLoading(true)
    setMessage("")
    try {
      const res = await getMyWorkShifts({ startDate: ymd, endDate: ymd })
      const dayShifts = (res.shifts || []).filter((s) => extractDateYmd(s.startTime) === ymd)
      if (!dayShifts.length) {
        setMessage("No work shifts on this date for your account.")
        return
      }
      const rows: SlotDraftRow[] = dayShifts.map((s) => ({
        id: newRowId(),
        department: matchDepartmentOption(s.departmentName),
        doctorId: String(s.doctorId),
        roomId: String(s.roomId),
        date: ymd,
        start: extractTimeHm(s.startTime),
        end: extractTimeHm(s.endTime),
      }))
      setDraftRows(rows)
      setMessage(`Filled ${rows.length} row(s) from work shifts. Adjust if needed, then Create all.`)
    } catch (e: any) {
      setMessage(e?.message || "Failed to load work shifts")
    } finally {
      setShiftFillLoading(false)
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

  const doctorsForCreate = useMemo(() => {
    if (!createDepartment) return doctorOptions
    return doctorOptions.filter((d) => doctorWorksInDepartment(d, createDepartment))
  }, [doctorOptions, createDepartment])

  const departmentsForCreate = useMemo(() => {
    if (selectedSlotId) return [...PATIENT_IN_DEPARTMENT_OPTIONS]
    if (!selectedDoctorId) return [...PATIENT_IN_DEPARTMENT_OPTIONS]
    const doc = doctorOptions.find((d) => String(d.id) === selectedDoctorId)
    if (!doc) return [...PATIENT_IN_DEPARTMENT_OPTIONS]
    return PATIENT_IN_DEPARTMENT_OPTIONS.filter((opt) => doctorWorksInDepartment(doc, opt))
  }, [selectedDoctorId, doctorOptions, selectedSlotId])

  useEffect(() => {
    if (selectedSlotId) return
    if (!selectedDoctorId) return
    const doc = doctorOptions.find((d) => String(d.id) === selectedDoctorId)
    if (!doc) return
    const opts = PATIENT_IN_DEPARTMENT_OPTIONS.filter((opt) => doctorWorksInDepartment(doc, opt))
    if (opts.length !== 1) return
    if (!createDepartment || !doctorWorksInDepartment(doc, createDepartment)) {
      setCreateDepartment(opts[0])
    }
  }, [selectedDoctorId, doctorOptions, selectedSlotId, createDepartment])

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

  const updateDraftRow = (id: string, patch: Partial<SlotDraftRow>) => {
    setDraftRows((rows) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  }

  const doctorsForDraftRow = (department: string) => {
    if (!department) return doctorOptions
    return doctorOptions.filter((d) => doctorWorksInDepartment(d, department))
  }

  const visibleSlots = useMemo(
    () =>
      slots.filter((s) => {
        const inSelectedDate = isSameDay(new Date(`${s.date}T00:00:00`), selectedDate)
        if (!inSelectedDate) return false
        if (listDepartmentFilter !== "all") {
          if (String(s.department || "").trim().toLowerCase() !== listDepartmentFilter.trim().toLowerCase()) {
            return false
          }
        }
        if (listTimeFilter !== "all") {
          const slotT = normalizeHalfHourTime(normalizeSlotTimeDisplay(String(s.time || "")))
          if (!slotT || slotT !== listTimeFilter) return false
        }
        return true
      }),
    [slots, selectedDate, listDepartmentFilter, listTimeFilter]
  )

  return (
    <NurseLayout>
      <div className="space-y-6">
        <Card className="card-feature border-slate-200/60">
          <CardContent className="p-4 space-y-4">
            <h3 className="text-sm font-semibold text-slate-800">
              {selectedSlotId ? "Reschedule slot" : "Create slots"}
            </h3>

            {selectedSlotId ? (
              <>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6 xl:items-end">
                  <div className="col-span-2 sm:col-span-1 xl:col-span-1">
                    <label className="text-xs text-slate-600 mb-0.5 block">Department</label>
                    <Select
                      value={createDepartment || undefined}
                      onValueChange={(value) => {
                        setCreateDepartment(value)
                        if (selectedSlotId) return
                        if (selectedDoctorId) {
                          const doc = doctorOptions.find((x) => String(x.id) === selectedDoctorId)
                          if (doc && !doctorWorksInDepartment(doc, value)) {
                            setSelectedDoctorId("")
                          }
                        }
                      }}
                    >
                      <SelectTrigger className="h-9 text-sm">
                        <SelectValue placeholder="Select" />
                      </SelectTrigger>
                      <SelectContent>
                        {departmentsForCreate.map((d) => (
                          <SelectItem key={`create-${d}`} value={d}>
                            {d}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-2 sm:col-span-2 xl:col-span-1">
                    <label className="text-xs text-slate-600 mb-0.5 block">Doctor</label>
                    <Select value={selectedDoctorId} onValueChange={setSelectedDoctorId} disabled>
                      <SelectTrigger className="h-9 text-sm">
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
                    <label className="text-xs text-slate-600 mb-0.5 block">Date</label>
                    <Input type="date" value={slotDate} onChange={(e) => setSlotDate(e.target.value)} className="h-9 text-sm" />
                  </div>
                  <div>
                    <label className="text-xs text-slate-600 mb-0.5 block">Room</label>
                    <Select value={selectedRoomId || undefined} onValueChange={setSelectedRoomId}>
                      <SelectTrigger className="h-9 text-sm">
                        <SelectValue placeholder="Room" />
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
                    <label className="text-xs text-slate-600 mb-0.5 block">Start</label>
                    <Input
                      type="text"
                      inputMode="numeric"
                      placeholder="HH:mm"
                      list="nurse-start-time-options"
                      value={slotStartTime}
                      onChange={(e) => setSlotStartTime(formatTimeMask(e.target.value))}
                      onBlur={() => handleTimeFieldBlur("start")}
                      className="h-9 text-sm"
                    />
                    <datalist id="nurse-start-time-options">
                      {halfHourOptions.map((time) => (
                        <option key={`start-${time}`} value={time} />
                      ))}
                    </datalist>
                  </div>
                  <div>
                    <label className="text-xs text-slate-600 mb-0.5 block">End</label>
                    <Input
                      type="text"
                      inputMode="numeric"
                      placeholder="HH:mm"
                      list="nurse-end-time-options"
                      value={slotEndTime}
                      onChange={(e) => setSlotEndTime(formatTimeMask(e.target.value))}
                      onBlur={() => handleTimeFieldBlur("end")}
                      className="h-9 text-sm"
                    />
                    <datalist id="nurse-end-time-options">
                      {halfHourOptions.map((time) => (
                        <option key={`end-${time}`} value={time} />
                      ))}
                    </datalist>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button className="btn-gradient h-9 px-4 text-sm" onClick={handleCreateOrUpdate} disabled={saving}>
                    Reschedule
                  </Button>
                  <Button variant="outline" className="h-9 px-4 text-sm" onClick={resetForm} disabled={saving}>
                    <RefreshCcw className="mr-1.5 h-4 w-4" />
                    Clear
                  </Button>
                  <Button
                    variant="outline"
                    className="h-9 border-red-200 px-4 text-sm text-red-700 hover:bg-red-50"
                    onClick={handleDelete}
                    disabled={saving || !selectedSlotId}
                  >
                    <X className="mr-1.5 h-4 w-4" />
                    Cancel slot
                  </Button>
                  <span className="text-[11px] text-slate-500 xl:ml-1">Times: HH:mm, minutes 00 or 30 only.</span>
                </div>
              </>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    className="h-9 gap-2 text-sm"
                    disabled={shiftFillLoading || saving}
                    onClick={() => void handleFillFromWorkShift()}
                  >
                    <CalendarRange className="h-4 w-4" />
                    {shiftFillLoading ? "Loading shifts…" : "Create slots from work shift"}
                  </Button>
                  <p className="text-[11px] text-slate-500">
                    Uses your <span className="font-medium">WORK_SHIFT</span> for the day selected on the calendar. Each shift becomes one
                    row; edit then <span className="font-medium">Create all</span>.
                  </p>
                </div>

                <div className="space-y-3 rounded-lg border border-slate-200/80 bg-slate-50/40 p-3">
                  <Label className="text-xs font-semibold text-slate-700">Slot rows</Label>
                  {draftRows.map((row) => (
                    <div
                      key={row.id}
                      className="grid grid-cols-1 gap-2 rounded-md border border-slate-200 bg-white p-2 sm:grid-cols-2 lg:grid-cols-12 lg:items-end"
                    >
                      <div className="lg:col-span-2">
                        <span className="mb-0.5 block text-[10px] font-medium text-slate-500">Department</span>
                        <Select
                          value={row.department || undefined}
                          onValueChange={(v) => {
                            updateDraftRow(row.id, { department: v, doctorId: "" })
                          }}
                        >
                          <SelectTrigger className="h-9 text-sm">
                            <SelectValue placeholder="Department" />
                          </SelectTrigger>
                          <SelectContent>
                            {PATIENT_IN_DEPARTMENT_OPTIONS.map((d) => (
                              <SelectItem key={`${row.id}-d-${d}`} value={d}>
                                {d}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="lg:col-span-3">
                        <span className="mb-0.5 block text-[10px] font-medium text-slate-500">Doctor</span>
                        <Select
                          value={row.doctorId || undefined}
                          onValueChange={(id) => updateDraftRow(row.id, { doctorId: id })}
                        >
                          <SelectTrigger className="h-9 text-sm">
                            <SelectValue placeholder="Doctor" />
                          </SelectTrigger>
                          <SelectContent>
                            {doctorsForDraftRow(row.department).map((d) => {
                              const fullName = `${d.firstName || ""} ${d.lastName || ""}`.trim() || d.username
                              return (
                                <SelectItem key={`${row.id}-doc-${d.id}`} value={String(d.id)}>
                                  Dr. {fullName}
                                </SelectItem>
                              )
                            })}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="lg:col-span-2">
                        <span className="mb-0.5 block text-[10px] font-medium text-slate-500">Date</span>
                        <Input
                          type="date"
                          className="h-9 text-sm"
                          value={row.date}
                          onChange={(e) => updateDraftRow(row.id, { date: e.target.value })}
                        />
                      </div>
                      <div className="lg:col-span-2">
                        <span className="mb-0.5 block text-[10px] font-medium text-slate-500">Room</span>
                        <Select
                          value={row.roomId || undefined}
                          onValueChange={(v) => updateDraftRow(row.id, { roomId: v })}
                        >
                          <SelectTrigger className="h-9 text-sm">
                            <SelectValue placeholder="Room" />
                          </SelectTrigger>
                          <SelectContent>
                            {roomOptions.map((room) => (
                              <SelectItem key={`${row.id}-r-${room.id}`} value={String(room.id)}>
                                {room.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="lg:col-span-1">
                        <span className="mb-0.5 block text-[10px] font-medium text-slate-500">Start</span>
                        <Input
                          className="h-9 text-sm"
                          placeholder="HH:mm"
                          value={row.start}
                          onChange={(e) => updateDraftRow(row.id, { start: formatTimeMask(e.target.value) })}
                          onBlur={() => {
                            const n = normalizeHalfHourTime(row.start)
                            if (n) updateDraftRow(row.id, { start: n })
                          }}
                          list={`draft-start-${row.id}`}
                        />
                        <datalist id={`draft-start-${row.id}`}>
                          {halfHourOptions.map((t) => (
                            <option key={t} value={t} />
                          ))}
                        </datalist>
                      </div>
                      <div className="lg:col-span-1">
                        <span className="mb-0.5 block text-[10px] font-medium text-slate-500">End</span>
                        <Input
                          className="h-9 text-sm"
                          placeholder="HH:mm"
                          value={row.end}
                          onChange={(e) => updateDraftRow(row.id, { end: formatTimeMask(e.target.value) })}
                          onBlur={() => {
                            const n = normalizeHalfHourTime(row.end)
                            if (n) updateDraftRow(row.id, { end: n })
                          }}
                          list={`draft-end-${row.id}`}
                        />
                        <datalist id={`draft-end-${row.id}`}>
                          {halfHourOptions.map((t) => (
                            <option key={t} value={t} />
                          ))}
                        </datalist>
                      </div>
                      <div className="flex items-end justify-end lg:col-span-1">
                        <button
                          type="button"
                          className="rounded-md p-2 text-red-600 transition hover:bg-red-100 disabled:opacity-40"
                          disabled={draftRows.length <= 1}
                          onClick={() => setDraftRows((rows) => rows.filter((r) => r.id !== row.id))}
                          aria-label="Remove row"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-1 gap-2"
                    onClick={() => setDraftRows((r) => [...r, newDraftRow(format(selectedDate, "yyyy-MM-dd"))])}
                  >
                    <Plus className="h-4 w-4" />
                    Add row
                  </Button>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Button className="btn-gradient h-9 px-4 text-sm" onClick={() => void handleCreateAllDrafts()} disabled={saving}>
                    <Plus className="mr-1.5 h-4 w-4" />
                    Create all
                  </Button>
                  <Button variant="outline" className="h-9 px-4 text-sm" onClick={resetForm} disabled={saving}>
                    <RefreshCcw className="mr-1.5 h-4 w-4" />
                    Clear
                  </Button>
                  <span className="text-[11px] text-slate-500">Each row expands to 30-minute open slots from Start to End.</span>
                </div>
              </>
            )}

            {message ? <p className="text-sm text-slate-700">{message}</p> : null}
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
              <div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-end sm:justify-between">
                <h3 className="text-xl font-bold text-slate-900 shrink-0">Slots on {format(selectedDate, "MMMM d, yyyy")}</h3>
                <div className="flex flex-wrap items-end gap-2 sm:justify-end">
                  <div className="min-w-[140px]">
                    <label className="mb-0.5 block text-xs text-slate-600">Department</label>
                    <Select value={listDepartmentFilter} onValueChange={setListDepartmentFilter}>
                      <SelectTrigger className="h-9 text-sm">
                        <SelectValue placeholder="All" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All</SelectItem>
                        {PATIENT_IN_DEPARTMENT_OPTIONS.map((d) => (
                          <SelectItem key={`list-dept-${d}`} value={d}>
                            {d}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="min-w-[120px]">
                    <label className="mb-0.5 block text-xs text-slate-600">Time</label>
                    <Select value={listTimeFilter} onValueChange={setListTimeFilter}>
                      <SelectTrigger className="h-9 text-sm">
                        <SelectValue placeholder="All" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All</SelectItem>
                        {halfHourOptions.map((t) => (
                          <SelectItem key={`list-time-${t}`} value={t}>
                            {t}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
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
