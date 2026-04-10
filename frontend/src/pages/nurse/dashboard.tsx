"use client"

import { useEffect, useMemo, useState } from "react"
import { format } from "date-fns"
import { Link } from "react-router-dom"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { NurseLayout } from "@/components/nurse-layout"
import { appointmentService, type NurseOpenSlot } from "@/services/appointment-service"
import { CalendarDays, Clock3, FolderKanban, Stethoscope, UserRound } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Calendar as CalendarPicker } from "@/components/ui/calendar"
import { enUS } from "date-fns/locale"

type ScheduleTab = "day" | "week" | "month"

function toLocalIsoDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

function parseIsoDateLocal(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number)
  return new Date(y, m - 1, d)
}

/** Monday as first day of week (ISO-style week). */
function startOfWeekMonday(d: Date): Date {
  const date = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const day = date.getDay()
  const diff = day === 0 ? -6 : 1 - day
  date.setDate(date.getDate() + diff)
  return date
}

function endOfWeekFromMonday(monday: Date): Date {
  return new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6)
}

function rangeForScheduleTab(
  tab: ScheduleTab,
  dayKey: string,
  weekStartKey: string,
  monthKey: string
): { startDate: string; endDate: string } {
  if (tab === "day") {
    return { startDate: dayKey, endDate: dayKey }
  }
  if (tab === "week") {
    const mon = parseIsoDateLocal(weekStartKey)
    return { startDate: weekStartKey, endDate: toLocalIsoDate(endOfWeekFromMonday(mon)) }
  }
  const [y, m] = monthKey.split("-").map(Number)
  const first = new Date(y, m - 1, 1)
  const last = new Date(y, m, 0)
  return { startDate: toLocalIsoDate(first), endDate: toLocalIsoDate(last) }
}

function formatDayButtonLabel(iso: string) {
  return parseIsoDateLocal(iso).toLocaleDateString("en-US", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  })
}

function formatWeekButtonLabel(weekStartIso: string) {
  const start = parseIsoDateLocal(weekStartIso)
  const end = endOfWeekFromMonday(start)
  const opt = { month: "short" as const, day: "numeric" as const, year: "numeric" as const }
  return `${start.toLocaleDateString("en-US", opt)} – ${end.toLocaleDateString("en-US", opt)}`
}

function formatMonthButtonLabel(monthKeyStr: string) {
  const [y, m] = monthKeyStr.split("-").map(Number)
  if (!y || !m) return monthKeyStr
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" })
}

function badgeClass(status: NurseOpenSlot["status"]) {
  if (status === "open") return "bg-green-100 text-green-700"
  if (status === "booked") return "bg-blue-100 text-blue-700"
  return "bg-slate-200 text-slate-600"
}

export default function NurseDashboard() {
  const [todaySlots, setTodaySlots] = useState<NurseOpenSlot[]>([])
  const [rangeSlots, setRangeSlots] = useState<NurseOpenSlot[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  const today = useMemo(() => new Date(), [])
  const todayKey = useMemo(() => format(today, "yyyy-MM-dd"), [today])

  const [scheduleTab, setScheduleTab] = useState<ScheduleTab>("day")
  const [dayKey, setDayKey] = useState(() => toLocalIsoDate(new Date()))
  const [weekStartKey, setWeekStartKey] = useState(() => toLocalIsoDate(startOfWeekMonday(new Date())))
  const [monthKey, setMonthKey] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
  })
  const [dayPickerOpen, setDayPickerOpen] = useState(false)
  const [weekPickerOpen, setWeekPickerOpen] = useState(false)
  const [monthPickerOpen, setMonthPickerOpen] = useState(false)

  const monthViewDate = useMemo(() => {
    const [y, m] = monthKey.split("-").map(Number)
    return new Date(y, m - 1, 1)
  }, [monthKey])

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      setError("")
      try {
        const todayData = await appointmentService.getOpenSlots({ startDate: todayKey, endDate: todayKey })
        setTodaySlots(todayData || [])
      } catch (e: any) {
        setError(e?.message || "Failed to load dashboard data")
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [todayKey])

  useEffect(() => {
    const { startDate, endDate } = rangeForScheduleTab(scheduleTab, dayKey, weekStartKey, monthKey)
    const loadRange = async () => {
      setLoading(true)
      setError("")
      try {
        const data = await appointmentService.getOpenSlots({ startDate, endDate })
        setRangeSlots(data || [])
      } catch (e: any) {
        setError(e?.message || "Failed to load schedule")
        setRangeSlots([])
      } finally {
        setLoading(false)
      }
    }
    void loadRange()
  }, [scheduleTab, dayKey, weekStartKey, monthKey])

  const stats = useMemo(() => {
    const totalToday = todaySlots.length
    const openToday = todaySlots.filter((s) => s.status === "open").length
    const bookedToday = todaySlots.filter((s) => s.status === "booked").length
    const cancelledToday = todaySlots.filter((s) => s.status === "cancelled").length
    const departments = new Set(todaySlots.map((s) => String(s.department || "").trim()).filter(Boolean))
    const doctors = new Set(todaySlots.map((s) => String(s.doctorName || "").trim()).filter(Boolean))
    return {
      totalToday,
      openToday,
      bookedToday,
      cancelledToday,
      departments: departments.size,
      doctors: doctors.size,
    }
  }, [todaySlots])

  const nextOpenSlot = useMemo(() => {
    const nowKey = format(new Date(), "HH:mm")
    return todaySlots
      .filter((s) => s.status === "open" && s.time >= nowKey)
      .sort((a, b) => a.time.localeCompare(b.time))[0]
  }, [todaySlots])
  const nextBookedSlot = useMemo(() => {
    const nowKey = format(new Date(), "HH:mm")
    return todaySlots
      .filter((s) => s.status === "booked" && s.time >= nowKey)
      .sort((a, b) => a.time.localeCompare(b.time))[0]
  }, [todaySlots])

  const scheduleItems = useMemo(() => {
    return [...rangeSlots].sort((a, b) => {
      const da = String(a.date || "").slice(0, 10).localeCompare(String(b.date || "").slice(0, 10))
      if (da !== 0) return da
      return String(a.time || "").localeCompare(String(b.time || ""))
    })
  }, [rangeSlots])

  return (
    <NurseLayout>
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Card className="card-feature">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Slots today</CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <div className="flex items-start justify-between gap-2">
                <p className="text-3xl font-bold">{loading ? "..." : stats.totalToday}</p>
                <CalendarDays className="h-4 w-4 shrink-0 text-slate-500" aria-hidden />
              </div>
              <p className="text-xs text-slate-500 mt-1">Open {stats.openToday} • Booked {stats.bookedToday}</p>
            </CardContent>
          </Card>
          <Card className="card-feature">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Next booked</CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <div className="flex items-start justify-between gap-2">
                <p className="text-2xl font-bold">{loading ? "..." : nextBookedSlot?.time || "No booking"}</p>
                <Clock3 className="h-4 w-4 shrink-0 text-slate-500" aria-hidden />
              </div>
              <p className="text-xs text-slate-500 mt-1">
                {nextBookedSlot?.patientUserId != null ? (
                  <Link to={`/nurse/patients/${nextBookedSlot.patientUserId}/profile`} className="text-cyan-700 hover:underline">
                    {nextBookedSlot.patientName || `Patient #${nextBookedSlot.patientUserId}`}
                  </Link>
                ) : nextBookedSlot ? (
                  nextBookedSlot.patientName || "Patient assigned"
                ) : (
                  "No booked slots left today"
                )}
              </p>
              <p className="text-xs text-slate-500">{nextBookedSlot ? `${nextBookedSlot.department} - ${nextBookedSlot.roomName || "-"}` : ""}</p>
            </CardContent>
          </Card>
          <Card className="card-feature">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Doctors today</CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <div className="flex items-start justify-between gap-2">
                <p className="text-3xl font-bold">{loading ? "..." : stats.doctors}</p>
                <Stethoscope className="h-4 w-4 shrink-0 text-slate-500" aria-hidden />
              </div>
              <p className="text-xs text-slate-500 mt-1">Across {stats.departments} departments</p>
            </CardContent>
          </Card>
          <Card className="card-feature">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Cancelled today</CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <div className="flex items-start justify-between gap-2">
                <p className="text-3xl font-bold">{loading ? "..." : stats.cancelledToday}</p>
                <FolderKanban className="h-4 w-4 shrink-0 text-slate-500" aria-hidden />
              </div>
              <p className="text-xs text-slate-500 mt-1">Need reschedule follow-up</p>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6">
          <Card className="card-feature">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Schedule</CardTitle>
            </CardHeader>
            <CardContent className="p-6 pt-0">
              <Tabs value={scheduleTab} onValueChange={(v) => setScheduleTab(v as ScheduleTab)} className="w-full">
                <TabsList className="mb-3 grid w-full max-w-md grid-cols-3">
                  <TabsTrigger value="day">Day</TabsTrigger>
                  <TabsTrigger value="week">Week</TabsTrigger>
                  <TabsTrigger value="month">Month</TabsTrigger>
                </TabsList>

                <TabsContent value="day" className="mt-0 space-y-3">
                  <div className="max-w-sm">
                    <Popover open={dayPickerOpen} onOpenChange={setDayPickerOpen}>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className="w-full justify-start text-left font-normal">
                          <CalendarDays className="mr-2 h-4 w-4" />
                          {formatDayButtonLabel(dayKey)}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <CalendarPicker
                          key={dayPickerOpen ? `day-${dayKey}` : "day-closed"}
                          mode="single"
                          locale={enUS}
                          selected={parseIsoDateLocal(dayKey)}
                          onSelect={(d) => {
                            if (!d) return
                            setDayKey(toLocalIsoDate(d))
                            setDayPickerOpen(false)
                          }}
                          defaultMonth={parseIsoDateLocal(dayKey)}
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                </TabsContent>

                <TabsContent value="week" className="mt-0 space-y-3">
                  <div className="max-w-sm">
                    <Popover open={weekPickerOpen} onOpenChange={setWeekPickerOpen}>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className="w-full justify-start text-left font-normal">
                          <CalendarDays className="mr-2 h-4 w-4" />
                          {formatWeekButtonLabel(weekStartKey)}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <CalendarPicker
                          key={weekPickerOpen ? `week-${weekStartKey}` : "week-closed"}
                          mode="single"
                          locale={enUS}
                          selected={parseIsoDateLocal(weekStartKey)}
                          onSelect={(d) => {
                            if (!d) return
                            setWeekStartKey(toLocalIsoDate(startOfWeekMonday(d)))
                            setWeekPickerOpen(false)
                          }}
                          defaultMonth={parseIsoDateLocal(weekStartKey)}
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                </TabsContent>

                <TabsContent value="month" className="mt-0 space-y-3">
                  <div className="max-w-sm">
                    <Popover open={monthPickerOpen} onOpenChange={setMonthPickerOpen}>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className="w-full justify-start text-left font-normal">
                          <CalendarDays className="mr-2 h-4 w-4" />
                          {formatMonthButtonLabel(monthKey)}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <CalendarPicker
                          mode="single"
                          locale={enUS}
                          month={monthViewDate}
                          onMonthChange={(d) => {
                            setMonthKey(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`)
                          }}
                          selected={monthViewDate}
                          onSelect={(d) => {
                            if (!d) return
                            setMonthKey(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`)
                            setMonthPickerOpen(false)
                          }}
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                </TabsContent>
              </Tabs>

              {loading ? (
                <p className="text-sm text-slate-500">Loading schedule...</p>
              ) : error ? (
                <p className="text-sm text-red-600">{error}</p>
              ) : scheduleItems.length === 0 ? (
                <p className="text-sm text-slate-500">No appointments in the selected range.</p>
              ) : (
                <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
                  {scheduleItems.map((slot) => (
                    <div key={slot.id} className="rounded-lg border border-slate-200 p-3 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-900">
                          {String(slot.date || "").slice(0, 10)} {slot.time} - Dr. {slot.doctorName}
                        </p>
                        <p className="text-sm text-slate-600">{slot.department} • Room {slot.roomName || "-"}</p>
                        <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
                          <UserRound className="h-3.5 w-3.5" />
                          {slot.patientUserId != null ? (
                            <Link to={`/nurse/patients/${slot.patientUserId}/profile`} className="text-cyan-700 hover:underline">
                              {slot.patientName || `Patient #${slot.patientUserId}`}
                            </Link>
                          ) : (
                            "No patient yet"
                          )}
                        </p>
                      </div>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${badgeClass(slot.status)}`}>
                        {slot.status === "open" ? "Open" : slot.status === "booked" ? "Booked" : "Cancelled"}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </NurseLayout>
  )
}
