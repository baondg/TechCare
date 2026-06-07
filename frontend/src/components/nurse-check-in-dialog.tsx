import { useEffect, useMemo, useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Loader2 } from "lucide-react"
import { appointmentService, type NurseCheckInSlot } from "@/services/appointment-service"

function formatApiError(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e)
  try {
    const j = JSON.parse(m) as { message?: string }
    if (j?.message) return String(j.message)
  } catch {
    /* ignore */
  }
  return m.length > 280 ? `${m.slice(0, 280)}…` : m
}

function formatSlotWhen(slot: NurseCheckInSlot): string {
  if (slot.dateDisplay && slot.timeDisplay) {
    const t = slot.timeDisplay.length === 5 ? `${slot.timeDisplay}:00` : slot.timeDisplay
    return `${t} · ${slot.dateDisplay}`
  }
  if (slot.timeDisplay) return slot.timeDisplay
  if (!slot.slotTime) return "—"
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(slot.slotTime) && !/[zZ]|[+-]\d{2}:\d{2}$/.test(slot.slotTime)) {
    const [datePart, timePart = ""] = slot.slotTime.split("T")
    const hhmmss = timePart.slice(0, 8) || timePart
    return `${hhmmss} · ${datePart}`
  }
  const d = new Date(slot.slotTime)
  return Number.isNaN(d.getTime()) ? slot.slotTime : d.toLocaleString("vi-VN")
}

type Mode = "booked" | "assignOpen"

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  patientIdParam: string | undefined
  hintPatientPk?: number | null
  hintAppointmentId?: number | null
  hintTimeDisplay?: string | null
  hintRoomName?: string | null
  onSuccess: (details: { appointmentId: number; startedAt: string; regimenId: number }) => void
}

function hasBookedHint(hintAppointmentId?: number | null): boolean {
  return hintAppointmentId != null && Number.isFinite(hintAppointmentId) && hintAppointmentId > 0
}

export function NurseCheckInDialog({
  open,
  onOpenChange,
  patientIdParam,
  hintPatientPk,
  hintAppointmentId,
  hintTimeDisplay,
  hintRoomName,
  onSuccess,
}: Props) {
  const [loading, setLoading] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [today, setToday] = useState<string>("")
  const [todayTimezone, setTodayTimezone] = useState<string>("")
  const [bookings, setBookings] = useState<NurseCheckInSlot[]>([])
  const [openSlots, setOpenSlots] = useState<NurseCheckInSlot[]>([])
  const [mode, setMode] = useState<Mode>("booked")

  const bookedHint = hasBookedHint(hintAppointmentId)

  useEffect(() => {
    if (!open) {
      setErr(null)
      setBookings([])
      setOpenSlots([])
      setToday("")
      setTodayTimezone("")
      setMode("booked")
      return
    }
    if (!patientIdParam) return

    let cancelled = false
    ;(async () => {
      setLoading(true)
      setErr(null)
      try {
        const r = await appointmentService.getNurseCheckInOptions(patientIdParam, {
          patientPk: hintPatientPk ?? undefined,
          appointmentId: hintAppointmentId ?? undefined,
        })
        if (cancelled) return
        setToday(r.today || "")
        setBookings(r.patientBookings || [])
        setOpenSlots(r.openSlots || [])
        const hasBookings = (r.patientBookings || []).length > 0
        setMode(hasBookings || bookedHint ? "booked" : "assignOpen")
      } catch (e) {
        if (!cancelled) setErr(formatApiError(e))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [open, patientIdParam, hintPatientPk, hintAppointmentId, bookedHint])

  const displayBookings = useMemo((): NurseCheckInSlot[] => {
    if (bookings.length > 0) return bookings
    if (!bookedHint || !hintAppointmentId) return []
    return [
      {
        id: hintAppointmentId,
        slotTime: "",
        timeDisplay: hintTimeDisplay || "",
        dateDisplay: today || "",
        doctorId: 0,
        doctorName: "",
        department: "",
        roomId: null,
        roomName: hintRoomName || "",
        condition: "",
      },
    ]
  }, [bookings, bookedHint, hintAppointmentId, hintTimeDisplay, hintRoomName, today])

  const finish = (appointmentId: number, regimenId: number) => {
    onSuccess({ appointmentId, startedAt: new Date().toISOString(), regimenId })
    onOpenChange(false)
  }

  const handleAccept = async (appointmentId: number) => {
    if (!patientIdParam) return
    setActionLoading(true)
    setErr(null)
    try {
      const r = await appointmentService.postNurseCheckInAccept({ patientId: patientIdParam, appointmentId })
      finish(r.appointment.id, r.regimenId)
    } catch (e) {
      setErr(formatApiError(e))
    } finally {
      setActionLoading(false)
    }
  }

  const handleAssign = async (appointmentId: number) => {
    if (!patientIdParam) return
    setActionLoading(true)
    setErr(null)
    try {
      const r = await appointmentService.postNurseCheckInAssign({ patientId: patientIdParam, appointmentId })
      finish(r.appointment?.id ?? appointmentId, r.regimenId)
    } catch (e) {
      setErr(formatApiError(e))
    } finally {
      setActionLoading(false)
    }
  }

  /** Picking another open slot = reschedule from the first listed booking today. */
  const handleAlternativeOpenSlot = async (toAppointmentId: number) => {
    if (!patientIdParam || displayBookings.length === 0) return
    const fromAppointmentId = displayBookings[0].id
    if (!window.confirm("Move this patient to the selected slot? Their current booking will be released as an open slot.")) return
    setActionLoading(true)
    setErr(null)
    try {
      const r = await appointmentService.postNurseCheckInReschedule({
        patientId: patientIdParam,
        fromAppointmentId,
        toAppointmentId,
      })
      finish(r.appointment?.id ?? toAppointmentId, r.regimenId)
    } catch (e) {
      setErr(formatApiError(e))
    } finally {
      setActionLoading(false)
    }
  }

  const openSlotsSorted = useMemo(() => {
    return [...openSlots].sort((a, b) => {
      const dept = (a.department || "").localeCompare(b.department || "", undefined, { sensitivity: "base" })
      if (dept !== 0) return dept
      const ta = `${a.dateDisplay || ""} ${a.timeDisplay || ""}`
      const tb = `${b.dateDisplay || ""} ${b.timeDisplay || ""}`
      return ta.localeCompare(tb)
    })
  }, [openSlots])

  const slotButton = (slot: NurseCheckInSlot, onPick: (id: number) => void) => (
    <button
      key={slot.id}
      type="button"
      disabled={actionLoading}
      onClick={() => onPick(slot.id)}
      className="w-full text-left rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm hover:bg-cyan-50 hover:border-cyan-300 transition-colors disabled:opacity-50"
    >
      <span className="font-medium text-slate-800">{formatSlotWhen(slot)}</span>
      <span className="block text-slate-600">
        {slot.doctorName}
        {slot.department ? ` · ${slot.department}` : ""}
      </span>
      <span className="block text-slate-500 text-xs">
        Room: {slot.roomName || `#${slot.roomId ?? "—"}`}
      </span>
    </button>
  )

  const effectiveMode = mode === "booked" || displayBookings.length > 0 ? "booked" : "assignOpen"

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Check-in — assign clinic room</DialogTitle>
          <DialogDescription>
            Today ({today || "…"}
            {todayTimezone ? ` · ${todayTimezone}` : ""}): confirm an existing booking or assign an open slot.
          </DialogDescription>
        </DialogHeader>

        {err && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-md px-3 py-2">{err}</p>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-12 text-slate-500 gap-2">
            <Loader2 className="h-5 w-5 animate-spin" />
            Loading…
          </div>
        ) : (
          <div className="overflow-y-auto flex-1 space-y-4 pr-1 min-h-0">
            {effectiveMode === "booked" && (
              <>
                {displayBookings.length === 0 ? null : (
                  <>
                    <p className="text-sm font-medium text-slate-700">Patient booking(s) today</p>
                    <div className="space-y-3">
                      {displayBookings.map((b) => (
                        <div
                          key={b.id}
                          className="rounded-lg border border-slate-200 bg-slate-50/80 p-3 flex flex-row items-start justify-between gap-3"
                        >
                          <div className="text-sm min-w-0 flex-1">
                            <div className="font-medium text-slate-800">{formatSlotWhen(b)}</div>
                            <div className="text-slate-600">
                              {b.doctorName}
                              {b.department ? ` · ${b.department}` : ""}
                            </div>
                            <div className="text-slate-500 text-xs">
                              Room: {b.roomName || `#${b.roomId ?? "—"}`}
                            </div>
                            {b.condition ? (
                              <div className="text-xs text-slate-500 mt-1">Note: {b.condition}</div>
                            ) : null}
                          </div>
                          <Button
                            type="button"
                            size="sm"
                            className="btn-gradient shrink-0 bg-emerald-600 hover:bg-emerald-700 text-white"
                            disabled={actionLoading}
                            onClick={() => handleAccept(b.id)}
                          >
                            Accept
                          </Button>
                        </div>
                      ))}
                    </div>
                  </>
                )}

                {displayBookings.length > 0 && openSlotsSorted.length > 0 ? (
                  <>
                    <Separator className="my-2" />
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-slate-700">Other open slots today (all departments)</p>
                      <p className="text-xs text-slate-500 leading-relaxed">
                        Unbooked times across the clinic — choosing one here is a reschedule: the patient moves to that
                        slot and the current booking above becomes open again.
                      </p>
                      {displayBookings.length > 1 ? (
                        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-md px-2.5 py-2">
                          Several bookings today: picking a slot below only moves the patient from the{" "}
                          <span className="font-medium">first</span> booking in the list. Use{" "}
                          <span className="font-medium">Accept</span> on another card to check in that appointment as
                          listed.
                        </p>
                      ) : null}
                      <div className="space-y-2 max-h-[min(240px,40vh)] overflow-y-auto pr-0.5">
                        {openSlotsSorted.map((s) => slotButton(s, handleAlternativeOpenSlot))}
                      </div>
                    </div>
                  </>
                ) : displayBookings.length > 0 && openSlotsSorted.length === 0 ? (
                  <>
                    <Separator className="my-2" />
                    <p className="text-xs text-slate-500">
                      No other open slots today — only this booking is available unless staff add slots on Appointments.
                    </p>
                  </>
                ) : null}
              </>
            )}

            {effectiveMode === "assignOpen" && (
              <>
                <p className="text-sm text-slate-600">
                  This patient has no scheduled appointment today. Pick an open slot to assign them (room &amp; time).
                </p>
                {openSlots.length === 0 ? (
                  <p className="text-sm text-amber-700 bg-amber-50 border border-amber-100 rounded-md px-3 py-2">
                    No open slots today. Add slots on the Appointments page.
                  </p>
                ) : (
                  <div className="space-y-2">{openSlots.map((s) => slotButton(s, handleAssign))}</div>
                )}
              </>
            )}
          </div>
        )}

        <DialogFooter className="sm:justify-end border-t pt-3">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={actionLoading}>
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
