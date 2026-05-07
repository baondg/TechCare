"use client"

import { useEffect, useMemo, useState } from "react"
import { Plus, RefreshCcw, X, Clock, UserRound, Stethoscope, ChevronLeft, ChevronRight, CalendarRange } from "lucide-react"
import { isSameDay, format, startOfMonth, endOfMonth, eachDayOfInterval, parseISO } from "date-fns"
import { Link } from "react-router-dom"
import { NurseLayout } from "@/components/nurse-layout"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { YmdEnglishDatePicker } from "@/components/ymd-english-date-picker"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { appointmentService, type ClinicRoomOption, type DoctorOption, type NurseOpenSlot } from "@/services/appointment-service"
import { getMyWorkShifts } from "@/services/work-shift-service"

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

/** Map a label from DB/work-shift onto the canonical DEPARTMENT.name list from the API. */
function matchDepartmentOption(dbName: string, options: string[]): string {
  const raw = String(dbName || "").trim()
  if (!raw) return options[0] ?? ""
  const low = raw.toLowerCase()
  const exact = options.find((o) => o.toLowerCase() === low)
  if (exact) return exact
  const inc = options.find((o) => low.includes(o.toLowerCase()) || o.toLowerCase().includes(low))
  return inc ?? raw
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

function addThirtyMinutes(hhmm: string): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || "").trim())
  if (!m) return ""
  const h = Number(m[1])
  const mi = Number(m[2])
  if (!Number.isFinite(h) || !Number.isFinite(mi)) return ""
  const total = h * 60 + mi + 30
  const outH = Math.floor((total % (24 * 60)) / 60)
  const outM = total % 60
  return `${String(outH).padStart(2, "0")}:${String(outM).padStart(2, "0")}`
}

function extractErrorMessage(err: unknown): string {
  const fallback = "Operation failed"
  if (!err) return fallback
  if (err instanceof Error) {
    const raw = String(err.message || "").trim()
    if (!raw) return fallback
    try {
      const parsed = JSON.parse(raw) as { message?: string }
      if (parsed?.message) return String(parsed.message)
    } catch {
      // keep raw
    }
    return raw
  }
  return fallback
}

export default function NurseAppointmentsPage() {
  const [listDepartmentFilter, setListDepartmentFilter] = useState<string>("all")
  const [listDoctorFilter, setListDoctorFilter] = useState<string>("all")

  const [doctorOptions, setDoctorOptions] = useState<DoctorOption[]>([])
  /** Names from DEPARTMENT table (GET /api/appointments/departments) */
  const [departmentNames, setDepartmentNames] = useState<string[]>([])
  const [roomOptions, setRoomOptions] = useState<ClinicRoomOption[]>([])
  const [slots, setSlots] = useState<NurseOpenSlot[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [shiftFillLoading, setShiftFillLoading] = useState(false)
  const [shiftRangeOpen, setShiftRangeOpen] = useState(false)
  const [shiftRangeStart, setShiftRangeStart] = useState("")
  const [shiftRangeEnd, setShiftRangeEnd] = useState("")
  const [pickedSlotStatus, setPickedSlotStatus] = useState<NurseOpenSlot["status"] | null>(null)
  const [message, setMessage] = useState<string>("")

  const [createDepartment, setCreateDepartment] = useState<string>("")
  const [selectedDoctorId, setSelectedDoctorId] = useState<string>("")
  const [slotDate, setSlotDate] = useState("")
  const [slotStartTime, setSlotStartTime] = useState("")
  const [slotEndTime, setSlotEndTime] = useState("")
  const [selectedRoomId, setSelectedRoomId] = useState<string>("")
  const [selectedSlotId, setSelectedSlotId] = useState<number | null>(null)
  const [selectedSlotIds, setSelectedSlotIds] = useState<number[]>([])

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
      const [doctors, rooms, openSlots, deptRows] = await Promise.all([
        appointmentService.getDoctors(),
        appointmentService.getClinicRooms(),
        appointmentService.getOpenSlots({
          startDate: monthStart,
          endDate: monthEnd,
        }),
        appointmentService.getDepartments(),
      ])
      setDoctorOptions(doctors || [])
      setRoomOptions(rooms || [])
      setSlots(openSlots || [])
      setDepartmentNames((deptRows || []).map((d) => String(d.name || "").trim()).filter(Boolean))
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
    setPickedSlotStatus(null)
    setCreateDepartment("")
    setSelectedDoctorId("")
    setSelectedRoomId("")
    setSlotDate("")
    setSlotStartTime("")
    setSlotEndTime("")
    setDraftRows([newDraftRow(format(selectedDate, "yyyy-MM-dd"))])
    setSelectedSlotIds([])
  }

  const handleCreateOrUpdate = async () => {
    const targetIds = selectedSlotIds.length
      ? [...selectedSlotIds]
      : selectedSlotId
        ? [selectedSlotId]
        : []
    if (!targetIds.length) return

    const isBulk = targetIds.length > 1
    const normalizedStart = normalizeHalfHourTime(slotStartTime)
    const normalizedEnd = slotEndTime ? normalizeHalfHourTime(slotEndTime) : null

    if (!isBulk) {
      if (!slotDate || !normalizedStart) {
        setMessage("Please select date and time.")
        return
      }
      if (slotEndTime && !normalizedEnd) {
        setMessage("Invalid time. Use HH:mm with 30-minute steps (e.g. 09:00, 09:30).")
        return
      }
    } else if (!selectedDoctorId) {
      setMessage("Bulk edit requires selecting a replacement doctor.")
      return
    }

    setSaving(true)
    setMessage("")
    try {
      if (isBulk) {
        const selected = slots.filter((s) => targetIds.includes(s.id))
        const failures: string[] = []
        let updated = 0
        for (const s of selected) {
          const slotTime = normalizeSlotTimeDisplay(String(s.time || ""))
          try {
            await appointmentService.updateOpenSlot(s.id, {
              date: s.date,
              time: slotTime,
              roomId: s.roomId != null ? Number(s.roomId) : undefined,
              doctorId: Number(selectedDoctorId),
            })
            updated += 1
          } catch (e) {
            failures.push(`- ${s.date} ${slotTime}-${addThirtyMinutes(slotTime)}: ${extractErrorMessage(e)}`)
          }
        }
        if (!failures.length) {
          setMessage(`Updated ${updated} slot(s) successfully.`)
        } else {
          setMessage(
            `Updated ${updated}/${selected.length} slot(s).\nFailed slots:\n${failures.join("\n")}`
          )
        }
      } else {
        const startTime = normalizedStart
        if (!startTime) {
          setMessage("Please select date and time.")
          return
        }
        for (const id of targetIds) {
          await appointmentService.updateOpenSlot(id, {
            date: slotDate,
            time: startTime,
            roomId: selectedRoomId ? Number(selectedRoomId) : undefined,
            doctorId: selectedDoctorId ? Number(selectedDoctorId) : undefined,
          })
        }
        setMessage(`Slot${targetIds.length > 1 ? "s" : ""} rescheduled successfully.`)
      }
      resetForm()
      await load()
    } catch (e: any) {
      setMessage(extractErrorMessage(e))
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

  const openShiftRangeDialog = () => {
    const ymd = format(selectedDate, "yyyy-MM-dd")
    setShiftRangeStart(ymd)
    setShiftRangeEnd(ymd)
    setShiftRangeOpen(true)
  }

  const applyShiftRangeFromWorkShifts = async () => {
    if (!shiftRangeStart || !shiftRangeEnd) {
      setMessage("Please select start and end dates.")
      return
    }
    if (shiftRangeEnd < shiftRangeStart) {
      setMessage("End date must be on or after the start date.")
      return
    }
    setShiftFillLoading(true)
    setMessage("")
    try {
      const res = await getMyWorkShifts({ startDate: shiftRangeStart, endDate: shiftRangeEnd })
      const allShifts = res.shifts || []
      const days = eachDayOfInterval({
        start: parseISO(shiftRangeStart),
        end: parseISO(shiftRangeEnd),
      })
      const rows: SlotDraftRow[] = []
      for (const d of days) {
        const ymd = format(d, "yyyy-MM-dd")
        const dayShifts = allShifts.filter((s) => extractDateYmd(s.startTime) === ymd)
        for (const s of dayShifts) {
          rows.push({
            id: newRowId(),
            department: matchDepartmentOption(s.departmentName, departmentNames),
            doctorId: String(s.doctorId),
            roomId: String(s.roomId),
            date: ymd,
            start: extractTimeHm(s.startTime),
            end: extractTimeHm(s.endTime),
          })
        }
      }
      if (!rows.length) {
        setMessage("No work shifts in this date range for your account.")
      } else {
        setDraftRows(rows)
        setMessage(
          `Filled ${rows.length} row(s) from work shifts (${shiftRangeStart} → ${shiftRangeEnd}). Review then Create all.`
        )
      }
      setShiftRangeOpen(false)
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
    setSelectedSlotIds([s.id])
    setPickedSlotStatus(s.status)
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
    if (selectedSlotId) return [...departmentNames]
    if (!selectedDoctorId) return [...departmentNames]
    const doc = doctorOptions.find((d) => String(d.id) === selectedDoctorId)
    if (!doc) return [...departmentNames]
    return departmentNames.filter((opt) => doctorWorksInDepartment(doc, opt))
  }, [selectedDoctorId, doctorOptions, selectedSlotId, departmentNames])

  useEffect(() => {
    if (selectedSlotId) return
    if (!selectedDoctorId) return
    const doc = doctorOptions.find((d) => String(d.id) === selectedDoctorId)
    if (!doc) return
    const opts = departmentNames.filter((opt) => doctorWorksInDepartment(doc, opt))
    if (opts.length !== 1) return
    if (!createDepartment || !doctorWorksInDepartment(doc, createDepartment)) {
      setCreateDepartment(opts[0])
    }
  }, [selectedDoctorId, doctorOptions, selectedSlotId, createDepartment, departmentNames])

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
        if (listDoctorFilter !== "all") {
          if (String(s.doctorName || "").trim() !== listDoctorFilter) {
            return false
          }
        }
        return true
      }),
    [slots, selectedDate, listDepartmentFilter, listDoctorFilter]
  )

  const selectedSlotsSummary = useMemo(() => {
    const selected = slots
      .filter((s) => selectedSlotIds.includes(s.id))
      .map((s) => {
        const start = normalizeSlotTimeDisplay(String(s.time || ""))
        return {
          id: s.id,
          date: s.date,
          start,
          end: addThirtyMinutes(start),
          doctorName: s.doctorName,
          department: s.department,
          status: s.status,
        }
      })
      .sort((a, b) => `${a.date} ${a.start}`.localeCompare(`${b.date} ${b.start}`))
    return selected
  }, [slots, selectedSlotIds])

  const dayDoctorOptions = useMemo(() => {
    const names = slots
      .filter((s) => isSameDay(new Date(`${s.date}T00:00:00`), selectedDate))
      .map((s) => String(s.doctorName || "").trim())
      .filter(Boolean)
    return Array.from(new Set(names)).sort((a, b) => a.localeCompare(b))
  }, [slots, selectedDate])

  useEffect(() => {
    if (selectedSlotId || selectedSlotIds.length === 0) return
    const first = slots.find((s) => s.id === selectedSlotIds[0])
    if (!first) return
    setSelectedSlotId(first.id)
    setPickedSlotStatus(first.status)
    setCreateDepartment(String(first.department || ""))
    setSelectedDoctorId(String(first.doctorId))
    setSelectedRoomId(first.roomId != null ? String(first.roomId) : "")
    setSlotDate(String(first.date || ""))
    setSlotStartTime(String(first.time || ""))
    setSlotEndTime("")
  }, [selectedSlotId, selectedSlotIds, slots])

  useEffect(() => {
    if (selectedSlotIds.length > 0) return
    setSelectedSlotId(null)
    setPickedSlotStatus(null)
  }, [selectedSlotIds.length])

  const isEditingSlots = Boolean(selectedSlotId)

  return (
    <NurseLayout>
      <div className="space-y-6">
        <Card className="card-feature border-slate-200/60">
          <CardContent className="p-4 space-y-4">
            <h3 className="text-sm font-semibold text-slate-800">
              {selectedSlotIds.length || selectedSlotId ? "Edit slots" : "Create slots"}
            </h3>

            {selectedSlotId ? (
              <>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6 xl:items-end">
                  <div className="col-span-2 sm:col-span-1 xl:col-span-1">
                    <label htmlFor="edit-department" className="text-xs text-slate-600 mb-0.5 block">Department</label>
                    <Select
                      disabled={isEditingSlots}
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
                      <SelectTrigger id="edit-department" name="department" aria-label="Department" className="h-9 text-sm">
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
                    <label htmlFor="edit-doctor" className="text-xs text-slate-600 mb-0.5 block">Doctor</label>
                    <Select value={selectedDoctorId} onValueChange={setSelectedDoctorId}>
                      <SelectTrigger id="edit-doctor" name="doctor" aria-label="Doctor" className="h-9 text-sm">
                        <SelectValue placeholder="Select doctor" />
                      </SelectTrigger>
                      <SelectContent>
                        {doctorsForCreate.map((d) => {
                          const fullName = `${d.lastName || ""} ${d.firstName || ""}`.trim() || d.username
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
                    <label htmlFor="edit-date" className="text-xs text-slate-600 mb-0.5 block">Date</label>
                    <YmdEnglishDatePicker
                      id="edit-date"
                      name="date"
                      aria-label="Date"
                      value={slotDate}
                      onChange={setSlotDate}
                      className="h-9 w-full min-w-0"
                      disabled={isEditingSlots}
                      placeholder="Pick date"
                      allowTyping
                    />
                  </div>
                  <div>
                    <label htmlFor="edit-room" className="text-xs text-slate-600 mb-0.5 block">Room</label>
                    <Select disabled={isEditingSlots} value={selectedRoomId || undefined} onValueChange={setSelectedRoomId}>
                      <SelectTrigger id="edit-room" name="room" aria-label="Room" className="h-9 text-sm">
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
                    <label htmlFor="edit-start-time" className="text-xs text-slate-600 mb-0.5 block">Start</label>
                    <Input
                      id="edit-start-time"
                      name="startTime"
                      aria-label="Start time"
                      type="text"
                      inputMode="numeric"
                      placeholder="HH:mm"
                      list="nurse-start-time-options"
                      value={slotStartTime}
                      onChange={(e) => setSlotStartTime(formatTimeMask(e.target.value))}
                      onInput={(e) => setSlotStartTime(formatTimeMask((e.target as HTMLInputElement).value))}
                      onBlur={() => handleTimeFieldBlur("start")}
                      className="h-9 text-sm"
                      disabled={isEditingSlots}
                    />
                    <datalist id="nurse-start-time-options">
                      {halfHourOptions.map((time) => (
                        <option key={`start-${time}`} value={time} />
                      ))}
                    </datalist>
                  </div>
          <div>
                    <label htmlFor="edit-end-time" className="text-xs text-slate-600 mb-0.5 block">End</label>
                    <Input
                      id="edit-end-time"
                      name="endTime"
                      aria-label="End time"
                      type="text"
                      inputMode="numeric"
                      placeholder="HH:mm"
                      list="nurse-end-time-options"
                      value={slotEndTime}
                      onChange={(e) => setSlotEndTime(formatTimeMask(e.target.value))}
                      onInput={(e) => setSlotEndTime(formatTimeMask((e.target as HTMLInputElement).value))}
                      onBlur={() => handleTimeFieldBlur("end")}
                      className="h-9 text-sm"
                      disabled={isEditingSlots}
                    />
                    <datalist id="nurse-end-time-options">
                      {halfHourOptions.map((time) => (
                        <option key={`end-${time}`} value={time} />
                      ))}
                    </datalist>
                  </div>
                </div>
                {pickedSlotStatus === "booked" ? (
                  <p className="text-xs text-amber-800 rounded-md border border-amber-200 bg-amber-50/80 px-3 py-2">
                    Booked slot: changing the doctor notifies the patient. To move date or time, use another open slot or cancel and recreate.
                  </p>
                ) : null}
                <div className="flex flex-wrap items-center gap-2">
                  <Button className="btn-gradient h-9 px-4 text-sm" onClick={handleCreateOrUpdate} disabled={saving}>
                    {selectedSlotIds.length > 1 ? `Edit selected (${selectedSlotIds.length})` : pickedSlotStatus === "booked" ? "Save changes" : "Reschedule"}
            </Button>
                  <Button variant="outline" className="h-9 px-4 text-sm" onClick={resetForm} disabled={saving}>
                    <RefreshCcw className="mr-1.5 h-4 w-4" />
                    Clear
            </Button>
            <Button
              variant="outline"
                    className="h-9 border-red-200 px-4 text-sm text-red-700 hover:bg-red-50"
                    onClick={handleDelete}
                    disabled={saving || !selectedSlotId || pickedSlotStatus === "booked"}
            >
                    <X className="mr-1.5 h-4 w-4" />
                    Cancel slot
            </Button>
                  <span className="text-[11px] text-slate-500 xl:ml-1">
                    Edit mode: only doctor can be changed (doctors in this department). Times stay fixed.
                  </span>
                </div>
                {selectedSlotsSummary.length > 1 ? (
                  <div className="rounded-md border border-slate-200 bg-slate-50 p-2">
                    <div className="text-xs font-semibold text-slate-700 mb-1">
                      Selected slots ({selectedSlotsSummary.length})
                    </div>
                    <div className="max-h-28 overflow-auto space-y-1 text-xs text-slate-700">
                      {selectedSlotsSummary.map((s) => (
                        <div key={`sel-${s.id}`} className="rounded border bg-white px-2 py-1">
                          {s.date} | {s.start}-{s.end} | {s.department || "—"} | {s.doctorName || "—"} | {s.status}
                        </div>
                      ))}
          </div>
                  </div>
                ) : null}
              </>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    className="h-9 gap-2 text-sm"
                    disabled={shiftFillLoading || saving}
                    onClick={() => openShiftRangeDialog()}
                  >
                    <CalendarRange className="h-4 w-4" />
                    Create slots from work shift
                  </Button>
                  <p className="text-[11px] text-slate-500">
                    Choose a date range; each shift in your <span className="font-medium">WORK_SHIFT</span> becomes one row per day. Review
                    then <span className="font-medium">Create all</span>.
                  </p>
        </div>

                <div className="space-y-3 rounded-lg border border-slate-200/80 bg-slate-50/40 p-3">
                  <Label className="text-xs font-semibold text-slate-700">Slot rows</Label>
                  {draftRows.map((row, rowIndex) => {
                    const isFirstRow = rowIndex === 0
                    const fieldId = (field: "department" | "doctor" | "date" | "room" | "start" | "end") =>
                      isFirstRow ? `draft-${field}-first` : `draft-${field}-${row.id}`
                    return (
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
                          <SelectTrigger id={fieldId("department")} name={isFirstRow ? "draftDepartmentFirst" : `draftDepartment-${row.id}`} aria-label={isFirstRow ? "Draft department first row" : `Draft department ${row.id}`} className="h-9 text-sm">
                            <SelectValue placeholder="Department" />
                          </SelectTrigger>
                          <SelectContent>
                            {departmentNames.map((d) => (
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
                          <SelectTrigger id={fieldId("doctor")} name={isFirstRow ? "draftDoctorFirst" : `draftDoctor-${row.id}`} aria-label={isFirstRow ? "Draft doctor first row" : `Draft doctor ${row.id}`} className="h-9 text-sm">
                            <SelectValue placeholder="Doctor" />
                          </SelectTrigger>
                          <SelectContent>
                            {doctorsForDraftRow(row.department).map((d) => {
                              const fullName = `${d.lastName || ""} ${d.firstName || ""}`.trim() || d.username
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
                        <YmdEnglishDatePicker
                          id={fieldId("date")}
                          name={isFirstRow ? "draftDateFirst" : `draftDate-${row.id}`}
                          aria-label={isFirstRow ? "Draft date first row" : `Draft date ${row.id}`}
                          value={row.date}
                          onChange={(ymd) => updateDraftRow(row.id, { date: ymd })}
                          className="h-9 w-full min-w-0"
                          placeholder="Pick date"
                          allowTyping
                />
              </div>
                      <div className="lg:col-span-2">
                        <span className="mb-0.5 block text-[10px] font-medium text-slate-500">Room</span>
                        <Select
                          value={row.roomId || undefined}
                          onValueChange={(v) => updateDraftRow(row.id, { roomId: v })}
                        >
                          <SelectTrigger id={fieldId("room")} name={isFirstRow ? "draftRoomFirst" : `draftRoom-${row.id}`} aria-label={isFirstRow ? "Draft room first row" : `Draft room ${row.id}`} className="h-9 text-sm">
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
                          id={fieldId("start")}
                          name={isFirstRow ? "draftStartFirst" : `draftStart-${row.id}`}
                          aria-label={isFirstRow ? "Draft start time first row" : `Draft start time ${row.id}`}
                          className="h-9 text-sm"
                          placeholder="HH:mm"
                          value={row.start}
                          onChange={(e) => updateDraftRow(row.id, { start: formatTimeMask(e.target.value) })}
                          onInput={(e) => updateDraftRow(row.id, { start: formatTimeMask((e.target as HTMLInputElement).value) })}
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
                          id={fieldId("end")}
                          name={isFirstRow ? "draftEndFirst" : `draftEnd-${row.id}`}
                          aria-label={isFirstRow ? "Draft end time first row" : `Draft end time ${row.id}`}
                          className="h-9 text-sm"
                          placeholder="HH:mm"
                          value={row.end}
                          onChange={(e) => updateDraftRow(row.id, { end: formatTimeMask(e.target.value) })}
                          onInput={(e) => updateDraftRow(row.id, { end: formatTimeMask((e.target as HTMLInputElement).value) })}
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
                    )
                  })}
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

            {message ? <p className="text-sm text-slate-700 whitespace-pre-line">{message}</p> : null}
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
                    <label htmlFor="list-department-filter" className="mb-0.5 block text-xs text-slate-600">Department</label>
                    <Select value={listDepartmentFilter} onValueChange={setListDepartmentFilter}>
                      <SelectTrigger id="list-department-filter" name="listDepartmentFilter" aria-label="Department filter" className="h-9 text-sm">
                        <SelectValue placeholder="All" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All</SelectItem>
                        {departmentNames.map((d) => (
                          <SelectItem key={`list-dept-${d}`} value={d}>
                            {d}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="min-w-[180px]">
                    <label htmlFor="list-doctor-filter" className="mb-0.5 block text-xs text-slate-600">Doctor</label>
                    <Select value={listDoctorFilter} onValueChange={setListDoctorFilter}>
                      <SelectTrigger id="list-doctor-filter" name="listDoctorFilter" aria-label="Doctor filter" className="h-9 text-sm">
                        <SelectValue placeholder="All" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All</SelectItem>
                        {dayDoctorOptions.map((name) => (
                          <SelectItem key={`list-doc-${name}`} value={name}>
                            {name}
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
                      <th className="text-left p-3 text-sm font-semibold text-slate-700">
                        <input
                          type="checkbox"
                          checked={visibleSlots.length > 0 && visibleSlots.every((s) => selectedSlotIds.includes(s.id))}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedSlotIds(Array.from(new Set([...selectedSlotIds, ...visibleSlots.map((s) => s.id)])))
                            } else {
                              const vis = new Set(visibleSlots.map((s) => s.id))
                              setSelectedSlotIds((ids) => ids.filter((id) => !vis.has(id)))
                            }
                          }}
                        />
                      </th>
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
                      <tr><td colSpan={7} className="p-8 text-center text-slate-500">Loading slots...</td></tr>
                    ) : visibleSlots.length === 0 ? (
                      <tr><td colSpan={7} className="p-8 text-center text-slate-500">No slots on this day</td></tr>
                    ) : (
                      visibleSlots.map((slot) => (
                        <tr
                          key={slot.id}
                          onClick={() => pickSlot(slot)}
                          className={`border-t cursor-pointer hover:bg-slate-50 ${selectedSlotId === slot.id ? "bg-cyan-50" : selectedSlotIds.includes(slot.id) ? "bg-cyan-50/40" : ""}`}
                        >
                          <td className="p-3 text-sm">
                            <input
                              type="checkbox"
                              checked={selectedSlotIds.includes(slot.id)}
                              onClick={(e) => e.stopPropagation()}
                              onChange={(e) => {
                                setSelectedSlotIds((ids) =>
                                  e.target.checked ? Array.from(new Set([...ids, slot.id])) : ids.filter((id) => id !== slot.id)
                                )
                              }}
                            />
                          </td>
                          <td className="p-3 text-sm">
                            <div className="flex items-center gap-2"><Clock className="w-4 h-4 text-slate-400" />{slot.time}</div>
                          </td>
                          <td className="p-3 text-sm">
                            <div className="flex items-center gap-2"><Stethoscope className="w-4 h-4 text-slate-400" />{slot.doctorName}</div>
                          </td>
                          <td className="p-3 text-sm">{slot.department || "-"}</td>
                          <td className="p-3 text-sm">{slot.roomName || "-"}</td>
                          <td className="p-3 text-sm">
                            {slot.patientUserId != null ? (
                              <Link
                                to={`/nurse/medical_records/OP${String(slot.patientUserId).padStart(9, "0")}/profile`}
                                className="inline-flex items-center gap-2 text-cyan-700 hover:underline"
                              >
                                <UserRound className="w-4 h-4 text-slate-400" />
                                {slot.patientName || `Patient #${slot.patientUserId}`}
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

      <Dialog open={shiftRangeOpen} onOpenChange={setShiftRangeOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Work shift date range</DialogTitle>
            <p className="text-sm text-muted-foreground">
              Load all shifts you are assigned to between these dates into slot rows (one row per shift block per day).
            </p>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid gap-1.5">
              <label htmlFor="shift-range-start" className="text-xs font-medium text-slate-600">Start date</label>
              <YmdEnglishDatePicker
                id="shift-range-start"
                name="shiftRangeStart"
                aria-label="Shift range start date"
                value={shiftRangeStart}
                onChange={setShiftRangeStart}
                className="h-9 w-full"
                placeholder="Start date"
                allowTyping
              />
            </div>
            <div className="grid gap-1.5">
              <label htmlFor="shift-range-end" className="text-xs font-medium text-slate-600">End date</label>
              <YmdEnglishDatePicker
                id="shift-range-end"
                name="shiftRangeEnd"
                aria-label="Shift range end date"
                value={shiftRangeEnd}
                onChange={setShiftRangeEnd}
                className="h-9 w-full"
                placeholder="End date"
                allowTyping
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => setShiftRangeOpen(false)} disabled={shiftFillLoading}>
              Cancel
            </Button>
            <Button
              type="button"
              className="btn-gradient"
              disabled={shiftFillLoading}
              onClick={() => void applyShiftRangeFromWorkShifts()}
            >
              {shiftFillLoading ? "Loading…" : "Load rows"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </NurseLayout>
  )
}
