"use client"

import { useState, useMemo, useEffect } from "react"
import { Calendar, Search, Clock, User, ArrowRightFromLine, Loader2, CheckCircle2, MoreVertical } from "lucide-react"
import { DoctorLayout } from "@/components/doctor-layout"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { format, parseISO } from "date-fns"
import { useDoctorAppointments } from "@/hooks/useDoctorAppointments"
import { Link } from "react-router-dom"
import { appointmentService, type DoctorOption } from "@/services/appointment-service"
import { doctorService, type DoctorAppointment } from "@/services/doctor-service"
import { usePauseableToast } from "@/hooks/usePauseableToast"
import { PauseableCornerToastPortal } from "@/components/pauseable-corner-toast"

type AppointmentUiStatus = "Done" | "Upcoming" | "Confirmed" | "Cancelled"

const normalizeAppointmentStatus = (status?: string): AppointmentUiStatus => {
  const value = String(status || "").trim().toLowerCase()
  if (value === "done" || value === "completed") return "Done"
  if (value === "confirmed") return "Confirmed"
  if (value === "cancelled" || value === "canceled" || value === "rejected") return "Cancelled"
  return "Upcoming"
}

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

export default function DoctorAppointmentsPage() {
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")
  const [doctorOptions, setDoctorOptions] = useState<DoctorOption[]>([])
  const [coverOpen, setCoverOpen] = useState(false)
  const [coverTarget, setCoverTarget] = useState<DoctorAppointment | null>(null)
  const [coverDoctorId, setCoverDoctorId] = useState<string>("")
  const [coverReason, setCoverReason] = useState("")
  const [coverSaving, setCoverSaving] = useState(false)
  const [selectedAppointmentIds, setSelectedAppointmentIds] = useState<number[]>([])
  const [cancelOpen, setCancelOpen] = useState(false)
  const [cancelTarget, setCancelTarget] = useState<DoctorAppointment | null>(null)
  const [cancelReason, setCancelReason] = useState("")
  const [cancelSaving, setCancelSaving] = useState(false)
  const [acceptingId, setAcceptingId] = useState<number | null>(null)
  const [optionsMenuOpenId, setOptionsMenuOpenId] = useState<number | null>(null)

  const { toast, isExiting, showSuccess, showError, onMouseEnter, onMouseLeave } = usePauseableToast(2600)
  const { appointments, loading, refresh, confirm, cancelConfirmed } = useDoctorAppointments()

  useEffect(() => {
    void (async () => {
      try {
        const list = await appointmentService.getDoctors()
        setDoctorOptions(list || [])
      } catch (e) {
        console.error(e)
        showError(e instanceof Error ? e.message : "Could not load doctor list")
      }
    })()
  }, [showError])

  const filteredAppointments = useMemo(() => {
    let filtered = [...appointments]
    if (startDate) {
      const [day, month, year] = startDate.split("/")
      if (day && month && year) {
        const start = new Date(`${year}-${month}-${day}`)
        filtered = filtered.filter((app) => new Date(app.date) >= start)
      }
    }
    if (endDate) {
      const [day, month, year] = endDate.split("/")
      if (day && month && year) {
        const end = new Date(`${year}-${month}-${day}`)
        filtered = filtered.filter((app) => new Date(app.date) <= end)
      }
    }
    return filtered
  }, [appointments, startDate, endDate])

  const coverCandidates = useMemo(() => {
    const sourceAppointments = coverTarget
      ? [coverTarget]
      : filteredAppointments.filter((a) => selectedAppointmentIds.includes(a.id))
    if (!sourceAppointments.length) return []
    const depts = Array.from(new Set(sourceAppointments.map((a) => String(a.department || "").trim()).filter(Boolean)))
    const selfId = coverTarget?.assignedDoctorId
    return doctorOptions.filter((d) => (!selfId || d.id !== selfId) && depts.some((dep) => doctorWorksInDepartment(d, dep)))
  }, [coverTarget, doctorOptions, filteredAppointments, selectedAppointmentIds])

  const openCover = (a: DoctorAppointment) => {
    setOptionsMenuOpenId(null)
    setCoverTarget(a)
    setCoverDoctorId("")
    setCoverReason("")
    setCoverOpen(true)
  }

  const openBulkCover = () => {
    setCoverTarget(null)
    setCoverDoctorId("")
    setCoverReason("")
    setCoverOpen(true)
  }

  const openCancelVisit = (a: DoctorAppointment) => {
    setOptionsMenuOpenId(null)
    setCancelTarget(a)
    setCancelReason("")
    setCancelOpen(true)
  }

  const submitCover = async () => {
    const reason = coverReason.trim()
    if (!coverDoctorId || !reason) return
    setCoverSaving(true)
    try {
      if (coverTarget) {
        await doctorService.coverAppointment(coverTarget.id, Number(coverDoctorId), reason)
      } else {
        const selected = filteredAppointments.filter((a) => selectedAppointmentIds.includes(a.id))
        for (const a of selected) {
          await doctorService.coverAppointment(a.id, Number(coverDoctorId), reason)
        }
      }
      setCoverOpen(false)
      setCoverTarget(null)
      setCoverReason("")
      setSelectedAppointmentIds([])
      refresh()
      showSuccess("Cover doctor assigned successfully")
    } catch (e: unknown) {
      showError(e instanceof Error ? e.message : "Could not assign cover doctor")
    } finally {
      setCoverSaving(false)
    }
  }

  const submitCancelVisit = async () => {
    const reason = cancelReason.trim()
    if (!cancelTarget || !reason) return
    setCancelSaving(true)
    try {
      await cancelConfirmed(cancelTarget.id, reason)
      setCancelOpen(false)
      setCancelTarget(null)
      setCancelReason("")
      showSuccess("Visit cancelled successfully")
    } catch (e: unknown) {
      showError(e instanceof Error ? e.message : "Could not cancel appointment")
    } finally {
      setCancelSaving(false)
    }
  }

  const handleAccept = async (a: DoctorAppointment) => {
    setAcceptingId(a.id)
    try {
      await confirm(a.id)
      showSuccess("Appointment accepted successfully")
    } catch (e: unknown) {
      showError(e instanceof Error ? e.message : "Could not confirm appointment")
    } finally {
      setAcceptingId(null)
    }
  }

  return (
    <DoctorLayout>
      <div className="space-y-8">
        <div>
          <h2 className="text-3xl font-bold bg-linear-to-r from-[#06b6d4] via-[#0891b2] to-[#06b6d4] bg-clip-text text-transparent mb-2">
            My Appointments
          </h2>
        </div>

        <Card className="card-feature border-slate-200/60">
          <CardContent className="p-6 flex items-center gap-4">
            <div className="relative max-w-xs">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <Input
                type="text"
                placeholder="dd/mm/yyyy"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="pl-10 h-12"
              />
            </div>

            <span className="text-slate-400">to</span>

            <div className="relative max-w-xs">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <Input
                type="text"
                placeholder="dd/mm/yyyy"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="pl-10 h-12"
              />
            </div>

            <Button type="button" variant="outline">
              <Search className="w-5 h-5 mr-2" />
              Filter
            </Button>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-slate-600">
              Selected slots: <span className="font-semibold">{selectedAppointmentIds.length}</span>
            </p>
            <Button
              type="button"
              variant="outline"
              className="border-cyan-200 text-cyan-800 hover:bg-cyan-50"
              disabled={!selectedAppointmentIds.length}
              onClick={openBulkCover}
            >
              <ArrowRightFromLine className="w-4 h-4 mr-2" />
              Cover selected
            </Button>
          </div>
          {loading ? (
            <div className="text-center py-8 text-slate-500">Loading appointments...</div>
          ) : filteredAppointments.length === 0 ? (
            <div className="text-center py-8 text-slate-500">No appointments found.</div>
          ) : (
            filteredAppointments.map((appointment) => {
              const uiStatus = normalizeAppointmentStatus(appointment.status)
              const awaiting = appointment.awaitingDoctorConfirmation === true
              const hasPatient = Boolean(appointment.patientId)
              const isAcceptedSlot = hasPatient && !awaiting && uiStatus === "Upcoming"
              const badgeLabel =
                uiStatus === "Done" || uiStatus === "Cancelled"
                  ? uiStatus
                  : awaiting
                    ? "Awaiting confirmation"
                    : isAcceptedSlot
                      ? "Accepted"
                      : uiStatus
              return (
                <Card key={appointment.id} className="card-feature border-slate-200/60">
                  <CardContent className="p-6">
                    <div className="flex flex-col md:flex-row justify-between gap-6">
                      <div>
                        {uiStatus === "Upcoming" && appointment.patientId && !awaiting ? (
                          <label className="mb-2 inline-flex items-center gap-2 text-sm text-slate-600">
                            <input
                              type="checkbox"
                              checked={selectedAppointmentIds.includes(appointment.id)}
                              onChange={(e) => {
                                setSelectedAppointmentIds((ids) =>
                                  e.target.checked ? Array.from(new Set([...ids, appointment.id])) : ids.filter((id) => id !== appointment.id)
                                )
                              }}
                            />
                            Select
                          </label>
                        ) : null}
                        <h3 className="text-xl font-bold text-slate-800 mb-2">{appointment.department}</h3>

                        <div className="flex items-center text-slate-600 mb-2">
                          <User className="w-4 h-4 mr-2" />
                          Patient:{" "}
                          {appointment.patientId ? (
                            <Link
                              to={`/doctor/patients/${appointment.patientId}/profile`}
                              className="text-cyan-700 hover:underline"
                            >
                              {appointment.patientName || `Patient #${appointment.patientId}`}
                            </Link>
                          ) : (
                            appointment.patientName || "Unknown patient"
                          )}
                        </div>

                        <div className="flex items-center text-slate-500">
                          <Clock className="w-4 h-4 mr-2" />
                          {format(parseISO(appointment.date), "dd MMM yyyy")} — {appointment.time.substring(0, 5)}
                        </div>

                        {appointment.room && (
                          <p className="text-sm text-slate-500 mt-1">Room {appointment.room}</p>
                        )}
                      </div>

                      <div className="flex flex-col items-end gap-3">
                        <div className="flex items-center gap-2">
                          <div
                            className={`inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-medium
                          ${
                            uiStatus === "Done"
                              ? "bg-green-100 text-green-700"
                              : awaiting
                                ? "bg-amber-100 text-amber-900"
                                : isAcceptedSlot
                                  ? "border border-emerald-200 bg-emerald-50 text-emerald-900"
                                  : uiStatus === "Upcoming"
                                    ? "bg-blue-100 text-blue-700"
                                    : uiStatus === "Cancelled"
                                      ? "bg-yellow-100 text-yellow-700"
                                      : "bg-gray-100 text-gray-700"
                          }`}
                          >
                            {isAcceptedSlot ? (
                              <>
                                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
                                {badgeLabel}
                              </>
                            ) : (
                              badgeLabel
                            )}
                          </div>

                          {isAcceptedSlot ? (
                            <Popover
                              open={optionsMenuOpenId === appointment.id}
                              onOpenChange={(open) => setOptionsMenuOpenId(open ? appointment.id : null)}
                            >
                              <PopoverTrigger asChild>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="icon"
                                  className="h-9 w-9 shrink-0 border-slate-200 text-slate-600 hover:bg-slate-50"
                                  aria-label="Other options: cover or cancel visit"
                                >
                                  <MoreVertical className="h-4 w-4" />
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent align="end" className="w-52 p-1">
                                <button
                                  type="button"
                                  className="flex w-full items-center gap-2 rounded-sm px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100"
                                  onClick={() => openCover(appointment)}
                                >
                                  <ArrowRightFromLine className="h-4 w-4 shrink-0 text-cyan-700" />
                                  Cover…
                                </button>
                                <button
                                  type="button"
                                  className="flex w-full items-center gap-2 rounded-sm px-3 py-2 text-left text-sm text-red-800 hover:bg-red-50"
                                  onClick={() => openCancelVisit(appointment)}
                                >
                                  Cancel visit…
                                </button>
                              </PopoverContent>
                            </Popover>
                          ) : null}
                        </div>

                        {awaiting && appointment.patientId ? (
                          <div className="flex flex-wrap gap-2 justify-end">
                            <Button
                              type="button"
                              className="btn-gradient"
                              disabled={acceptingId === appointment.id}
                              onClick={() => void handleAccept(appointment)}
                            >
                              {acceptingId === appointment.id ? (
                                <>
                                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                                  Accepting…
                                </>
                              ) : (
                                "Accept"
                              )}
                            </Button>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )
            })
          )}
        </div>
      </div>

      <Dialog open={coverOpen} onOpenChange={setCoverOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Assign cover doctor</DialogTitle>
            <p className="text-sm text-muted-foreground">
              Choose another doctor in the same department as this appointment room. If a patient is booked on this slot, they will be notified.
            </p>
          </DialogHeader>
          {coverTarget ? (
            <div className="space-y-3 py-2">
              <p className="text-sm text-slate-600">
                {format(parseISO(coverTarget.date), "dd MMM yyyy")} at {coverTarget.time.substring(0, 5)} ·{" "}
                {coverTarget.department}
              </p>
              <div className="grid gap-2">
                <Label htmlFor="cover-doc">Covering doctor</Label>
                <Select value={coverDoctorId} onValueChange={setCoverDoctorId}>
                  <SelectTrigger id="cover-doc">
                    <SelectValue placeholder="Select doctor" />
                  </SelectTrigger>
                  <SelectContent>
                    {coverCandidates.map((d) => {
                      const fullName = `${d.firstName || ""} ${d.lastName || ""}`.trim() || d.username
                      return (
                        <SelectItem key={d.id} value={String(d.id)}>
                          Dr. {fullName}
                        </SelectItem>
                      )
                    })}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="cover-reason">Reason</Label>
                <Textarea
                  id="cover-reason"
                  value={coverReason}
                  onChange={(e) => setCoverReason(e.target.value)}
                  onInput={(e) => setCoverReason((e.target as HTMLTextAreaElement).value)}
                  onBlur={(e) => setCoverReason(e.target.value)}
                  placeholder="Required - shared with the patient in the notification"
                  rows={3}
                  className="resize-none"
                />
              </div>
            </div>
          ) : selectedAppointmentIds.length ? (
            <div className="space-y-3 py-2">
              <p className="text-sm text-slate-600">
                Reassign <span className="font-semibold">{selectedAppointmentIds.length}</span> selected slot(s).
              </p>
              <div className="grid gap-2">
                <Label htmlFor="cover-doc-bulk">Covering doctor</Label>
                <Select value={coverDoctorId} onValueChange={setCoverDoctorId}>
                  <SelectTrigger id="cover-doc-bulk">
                    <SelectValue placeholder="Select doctor" />
                  </SelectTrigger>
                  <SelectContent>
                    {coverCandidates.map((d) => {
                      const fullName = `${d.firstName || ""} ${d.lastName || ""}`.trim() || d.username
                      return (
                        <SelectItem key={d.id} value={String(d.id)}>
                          Dr. {fullName}
                        </SelectItem>
                      )
                    })}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="cover-reason-bulk">Reason</Label>
                <Textarea
                  id="cover-reason-bulk"
                  value={coverReason}
                  onChange={(e) => setCoverReason(e.target.value)}
                  onInput={(e) => setCoverReason((e.target as HTMLTextAreaElement).value)}
                  onBlur={(e) => setCoverReason(e.target.value)}
                  placeholder="Required — applied to each selected booking"
                  rows={3}
                  className="resize-none"
                />
              </div>
            </div>
          ) : null}
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => setCoverOpen(false)} disabled={coverSaving}>
              Cancel
            </Button>
            <Button
              id="ok-cover-appointments"
              type="button"
              className="btn-gradient"
              disabled={!coverDoctorId || !coverReason.trim() || coverSaving}
              onClick={() => void submitCover()}
            >
              {coverSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              OK
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Cancel visit</DialogTitle>
            <p className="text-sm text-muted-foreground">
              Cancels this confirmed booking and notifies the patient. A reason is required.
            </p>
          </DialogHeader>
          {cancelTarget ? (
            <div className="grid gap-2 py-2">
              <p className="text-sm text-slate-600">
                {format(parseISO(cancelTarget.date), "dd MMM yyyy")} at {cancelTarget.time.substring(0, 5)} ·{" "}
                {cancelTarget.patientName}
              </p>
              <Label htmlFor="cancel-visit-reason">Reason</Label>
              <Textarea
                id="cancel-visit-reason"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                onInput={(e) => setCancelReason((e.target as HTMLTextAreaElement).value)}
                rows={4}
                className="resize-none"
                placeholder="Required"
              />
            </div>
          ) : null}
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => setCancelOpen(false)} disabled={cancelSaving}>
              Back
            </Button>
            <Button
              id="ok-cancel-visit"
              type="button"
              className="!bg-red-600 hover:bg-red-700 text-white"
              disabled={!cancelReason.trim() || cancelSaving}
              onClick={() => void submitCancelVisit()}
            >
              {cancelSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Cancel visit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <PauseableCornerToastPortal
        toast={toast}
        isExiting={isExiting}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
      />
    </DoctorLayout>
  )
}
