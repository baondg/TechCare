"use client"

import { useEffect, useMemo, useState } from "react"
import { format } from "date-fns"
import { Link } from "react-router-dom"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { NurseLayout } from "@/components/nurse-layout"
import { appointmentService, type NurseOpenSlot } from "@/services/appointment-service"
import { CalendarDays, Clock3, FolderKanban, Stethoscope, UserRound } from "lucide-react"

function badgeClass(status: NurseOpenSlot["status"]) {
  if (status === "open") return "bg-green-100 text-green-700"
  if (status === "booked") return "bg-blue-100 text-blue-700"
  return "bg-slate-200 text-slate-600"
}

export default function NurseDashboard() {
  const [todaySlots, setTodaySlots] = useState<NurseOpenSlot[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  const today = useMemo(() => new Date(), [])
  const todayKey = useMemo(() => format(today, "yyyy-MM-dd"), [today])

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

  return (
    <NurseLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-3xl font-bold bg-linear-to-r from-[#06b6d4] via-[#0891b2] to-[#06b6d4] bg-clip-text text-transparent">
              Nurse Operations Dashboard
            </h2>
            <p className="text-slate-600">Quick view of the most-used appointment data for today.</p>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Card className="card-feature">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2"><CalendarDays className="h-4 w-4" />Today Slots</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{loading ? "..." : stats.totalToday}</p>
              <p className="text-xs text-slate-500 mt-1">Open {stats.openToday} • Booked {stats.bookedToday}</p>
            </CardContent>
          </Card>
          <Card className="card-feature">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2"><Clock3 className="h-4 w-4" />Next Booked Slot</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{loading ? "..." : nextBookedSlot?.time || "No booking"}</p>
              <p className="text-xs text-slate-500 mt-1">
                {nextBookedSlot?.patientId ? (
                  <Link to={`/nurse/patients/${nextBookedSlot.patientId}/profile`} className="text-cyan-700 hover:underline">
                    {nextBookedSlot.patientName || `Patient #${nextBookedSlot.patientId}`}
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
              <CardTitle className="text-sm flex items-center gap-2"><Stethoscope className="h-4 w-4" />Doctors Active</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{loading ? "..." : stats.doctors}</p>
              <p className="text-xs text-slate-500 mt-1">Across {stats.departments} departments</p>
            </CardContent>
          </Card>
          <Card className="card-feature">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2"><FolderKanban className="h-4 w-4" />Cancelled Today</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{loading ? "..." : stats.cancelledToday}</p>
              <p className="text-xs text-slate-500 mt-1">Need reschedule follow-up</p>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6">
          <Card className="card-feature">
            <CardHeader className="pb-3">
              <CardTitle>Today Schedule ({format(today, "dd/MM/yyyy")})</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <p className="text-sm text-slate-500">Loading schedule...</p>
              ) : error ? (
                <p className="text-sm text-red-600">{error}</p>
              ) : todaySlots.length === 0 ? (
                <p className="text-sm text-slate-500">No slots created for today.</p>
              ) : (
                <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
                  {todaySlots.slice().sort((a, b) => a.time.localeCompare(b.time)).map((slot) => (
                    <div key={slot.id} className="rounded-lg border border-slate-200 p-3 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-900">{slot.time} - Dr. {slot.doctorName}</p>
                        <p className="text-sm text-slate-600">{slot.department} • Room {slot.roomName || "-"}</p>
                        <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
                          <UserRound className="h-3.5 w-3.5" />
                          {slot.patientId ? (
                            <Link to={`/nurse/patients/${slot.patientId}/profile`} className="text-cyan-700 hover:underline">
                              {slot.patientName || `Patient #${slot.patientId}`}
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
