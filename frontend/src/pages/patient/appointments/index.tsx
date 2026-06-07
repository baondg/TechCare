"use client"

import { useState, useMemo } from "react"
import { useNavigate } from "react-router-dom"
import { Calendar as CalendarIcon, Clock, User, Plus } from "lucide-react"
import { PatientLayout } from "@/components/patient-layout"
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
import { Textarea } from "@/components/ui/textarea"
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover"
import { Calendar } from "@/components/ui/calendar"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useAppointments } from "@/hooks/useAppointments"
import type { Appointment } from "@/services/appointment-service"
import { format, parseISO, parse, isValid } from "date-fns"
import { applyDdMmYyyyRangeTyping } from "@/lib/date-range"

export default function AppointmentsPage() {
  const navigate = useNavigate()
  const [startDate, setStartDate] = useState("")
  const [startDateValue, setStartDateValue] = useState<Date | undefined>()
  const [endDate, setEndDate] = useState("")
  const [endDateValue, setEndDateValue] = useState<Date | undefined>()
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false)
  const [statusFilter, setStatusFilter] = useState<"All" | Appointment["status"]>("All")

  const formatDateInput = (value: string) => {
    const digits = value.replace(/\D/g, "").slice(0, 8)
    if (digits.length <= 2) return digits
    if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`
    return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`
  }

  const parseDateInput = (value: string) => {
    if (!value) return undefined
    const parsedDate = parse(value, "dd/MM/yyyy", new Date())
    if (!isValid(parsedDate)) return undefined
    if (format(parsedDate, "dd/MM/yyyy") !== value) return undefined
    return parsedDate
  }

  const [cancelTargetId, setCancelTargetId] = useState<number | null>(null)
  const [cancelReason, setCancelReason] = useState("")
  const [cancelSaving, setCancelSaving] = useState(false)

  const { appointments, loading, cancel } = useAppointments()

  const filteredAppointments = useMemo(() => {
    let filtered = [...appointments]
    if (startDate) {
      const [day, month, year] = startDate.split('/')
      if (day && month && year) {
        const start = new Date(`${year}-${month}-${day}`)
        filtered = filtered.filter(app => new Date(app.date) >= start)
      }
    }
    if (endDate) {
      const [day, month, year] = endDate.split('/')
      if (day && month && year) {
        const end = new Date(`${year}-${month}-${day}`)
        filtered = filtered.filter(app => new Date(app.date) <= end)
      }
    }
    if (statusFilter !== "All") {
      filtered = filtered.filter((app) => app.status === statusFilter)
    }
    return filtered
  }, [appointments, startDate, endDate, statusFilter])

  const handleBookAppointment = () => {
    navigate("/patient/appointments/book-appointment")
  }

  const handleReschedule = (id: number) => {
    navigate("/patient/appointments/book-appointment", { state: { rescheduleId: id } })
  }

  const openCancelDialog = (id: number) => {
    setCancelTargetId(id)
    setCancelReason("")
    setCancelDialogOpen(true)
  }

  const submitCancel = async () => {
    const reason = cancelReason.trim()
    if (!cancelTargetId || !reason) return
    setCancelSaving(true)
    try {
      await cancel(cancelTargetId, reason)
      setCancelDialogOpen(false)
      setCancelTargetId(null)
      setCancelReason("")
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Could not cancel appointment")
    } finally {
      setCancelSaving(false)
    }
  }

  const handleFeedback = (id: number) => {
    navigate("/patient/feedback", { state: { appointmentId: id } })
  }

  return (
    <PatientLayout>
      <div className="space-y-8">
        <div className="flex items-center justify-end">
          <Button onClick={handleBookAppointment} className="btn-gradient hover:border-none h-14 px-8 text-base shadow-lg">
            <Plus className="h-5 w-5 mr-2" />
            Book Appointment
          </Button>
        </div>

        {/* Filters Section */}
        <Card className="card-feature border-slate-200/60">
          <CardContent className="p-6">
            <div className="flex flex-wrap items-center gap-4">
              <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as typeof statusFilter)}>
                <SelectTrigger className="h-12 w-[200px] text-base" aria-label="Filter by status">
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="All">All statuses</SelectItem>
                  <SelectItem value="Upcoming">Upcoming</SelectItem>
                  <SelectItem value="Pending">Awaiting doctor</SelectItem>
                  <SelectItem value="Done">Done</SelectItem>
                  <SelectItem value="Cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
              <div className="relative flex-1 max-w-xs">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-400"
                      aria-label="Open start date calendar"
                    >
                      <CalendarIcon className="w-5 h-5" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="p-0">
                    <Calendar
                      mode="single"
                      selected={startDateValue}
                      disabled={(date) => Boolean(endDateValue && date > endDateValue)}
                      onSelect={(selectedDate) => {
                        setStartDateValue(selectedDate)
                        setStartDate(selectedDate ? format(selectedDate, "dd/MM/yyyy") : "")
                      }}
                      captionLayout="dropdown"
                    />
                  </PopoverContent>
                </Popover>
                <Input
                  type="text"
                  placeholder="dd/mm/yyyy"
                  value={startDate}
                  onChange={(e) => {
                    const next = applyDdMmYyyyRangeTyping({
                      prevText: startDate,
                      rawInput: e.target.value,
                      otherValue: endDateValue,
                      kind: "from",
                    })
                    if (!next) return
                    setStartDate(next.nextText)
                    setStartDateValue(next.nextValue)
                  }}
                  className="pl-10 h-12 text-base"
                />
              </div>
              <span className="text-slate-400">to</span>
              <div className="relative flex-1 max-w-xs">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-400"
                      aria-label="Open end date calendar"
                    >
                      <CalendarIcon className="w-5 h-5" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="p-0">
                    <Calendar
                      mode="single"
                      selected={endDateValue}
                      disabled={(date) => Boolean(startDateValue && date < startDateValue)}
                      onSelect={(selectedDate) => {
                        setEndDateValue(selectedDate)
                        setEndDate(selectedDate ? format(selectedDate, "dd/MM/yyyy") : "")
                      }}
                      captionLayout="dropdown"
                    />
                  </PopoverContent>
                </Popover>
                <Input
                  type="text"
                  placeholder="dd/mm/yyyy"
                  value={endDate}
                  onChange={(e) => {
                    const next = applyDdMmYyyyRangeTyping({
                      prevText: endDate,
                      rawInput: e.target.value,
                      otherValue: startDateValue,
                      kind: "to",
                    })
                    if (!next) return
                    setEndDate(next.nextText)
                    setEndDateValue(next.nextValue)
                  }}
                  className="pl-10 h-12 text-base"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Appointments List */}
        <div className="space-y-4">
          {loading ? (
            <div className="text-center py-8 text-slate-500">Loading appointments...</div>
          ) : filteredAppointments.length === 0 ? (
            <div className="text-center py-8 text-slate-500">No appointments found.</div>
          ) : (
            filteredAppointments.map((appointment) => (
              <Card key={appointment.id} className="card-feature border-slate-200/60 overflow-hidden transition-all duration-300 hover:shadow-md">
                <CardContent className="p-0">
                  <div className="flex flex-col md:flex-row">
                    {/* Date Column */}
                    <div className="bg-slate-50 p-6 flex flex-col items-center justify-center min-w-[150px] border-b md:border-b-0 md:border-r border-slate-100">
                      <span className="text-3xl font-bold text-slate-700">
                        {format(parseISO(appointment.date), 'dd')}
                      </span>
                      <span className="text-lg font-medium text-slate-500 uppercase">
                        {format(parseISO(appointment.date), 'MMM')}
                      </span>
                      <span className="text-sm text-slate-400 mt-1">
                        {format(parseISO(appointment.date), 'yyyy')}
                      </span>
                    </div>

                    {/* Details Column */}
                    <div className="flex-1 p-6">
                      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-4">
                        <div>
                          <h3 className="text-xl font-bold text-slate-800 mb-1">{appointment.department}</h3>
                          <div className="flex items-center text-slate-500">
                            <User className="w-4 h-4 mr-2" />
                            {appointment.doctor}
                          </div>
                        </div>
                        <div className={`mt-2 md:mt-0 px-4 py-1.5 rounded-full text-sm font-medium ${
                          appointment.status === "Upcoming" 
                            ? "bg-cyan-50 text-cyan-700 border border-cyan-100" 
                            : appointment.status === "Pending"
                            ? "bg-amber-50 text-amber-800 border border-amber-100"
                            : appointment.status === "Done"
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-100"
                            : "bg-red-50 text-red-700 border border-red-100"
                        }`}>
                          {appointment.status === "Pending" ? "Awaiting doctor" : appointment.status}
                        </div>
                      </div>

                      <div className="flex items-center text-slate-500 mb-6">
                        <Clock className="w-4 h-4 mr-2" />
                        {appointment.time.substring(0, 5)}
                        {appointment.room && (
                          <span className="ml-4 flex items-center">
                            <span className="w-1.5 h-1.5 rounded-full bg-slate-300 mr-4" />
                            Room {appointment.room}
                          </span>
                        )}
                      </div>

                      <div className="flex gap-3">
                        {appointment.status === "Upcoming" || appointment.status === "Pending" ? (
                          <>
                            <Button 
                              variant="outline" 
                              className="border-cyan-200 text-cyan-700 hover:bg-cyan-50 hover:text-cyan-800"
                              onClick={() => handleReschedule(appointment.id)}
                            >
                              Reschedule
                            </Button>
                            <Button 
                              variant="outline" 
                              className="border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800"
                              onClick={() => openCancelDialog(appointment.id)}
                            >
                              Cancel
                            </Button>
                          </>
                        ) : appointment.status === "Done" ? (
                          <Button 
                            className="bg-cyan-600 hover:bg-cyan-700 text-white border-none"
                            onClick={() => handleFeedback(appointment.id)}
                          >
                            Give Feedback
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>

      <Dialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Cancel appointment</DialogTitle>
            <p className="text-sm text-muted-foreground">
              Please tell your doctor why you are cancelling. This message will be sent with the cancellation notice.
            </p>
          </DialogHeader>
          <div className="grid gap-2 py-2">
            <Label htmlFor="cancel-reason">
              Reason<span className="text-red-500"> *</span>
            </Label>
            <Textarea
              id="cancel-reason"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              onInput={(e) => setCancelReason((e.target as HTMLTextAreaElement).value)}
              placeholder="e.g. schedule conflict, feeling better…"
              rows={4}
              className="resize-none"
            />
          </div>
          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setCancelDialogOpen(false)}
              disabled={cancelSaving}
            >
              Back
            </Button>
            <Button
              type="button"
              id="cancel-appointment"
              className="!bg-red-600 !hover:bg-red-700 text-white"
              disabled={!cancelReason.trim() || cancelSaving}
              onClick={() => void submitCancel()}
            >
              {cancelSaving ? "Cancelling…" : "OK - Cancel appointment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PatientLayout>
  )
}
