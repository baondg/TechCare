"use client"

import { useState, useEffect } from "react"
<<<<<<< HEAD
import {
  Calendar,
  Search,
  Clock,
  User,
  CheckCircle,
  XCircle,
  Plus,
  Loader2,
  X,
} from "lucide-react"
=======
import { useNavigate } from "react-router-dom"
import { Calendar, Search, Clock, User, CheckCircle, XCircle } from "lucide-react"
>>>>>>> d0e85e3f (add technician portal + appointment page)
import { DoctorLayout } from "@/components/doctor-layout"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
<<<<<<< HEAD
import {
  doctorService,
  type DoctorAppointment,
  type Patient,
} from "@/services/doctor-service"

export default function DoctorAppointmentsPage() {
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")
  const [statusFilter, setStatusFilter] = useState("")
  const [appointments, setAppointments] = useState<DoctorAppointment[]>([])
  const [loading, setLoading] = useState(true)

  // ── New-appointment modal state ──
  const [showModal, setShowModal] = useState(false)
  const [patients, setPatients] = useState<Patient[]>([])
  const [form, setForm] = useState({
    patientId: "",
    department: "",
    date: "",
    time: "",
    room: "",
    symptoms: "",
    notes: "",
  })
  const [saving, setSaving] = useState(false)

=======
import { appointmentService, type Appointment } from "@/services/appointment-service"
import { useAuth } from "@/contexts/AuthContext"
import { format, parseISO } from "date-fns"

export default function DoctorAppointmentsPage() {
  const { user } = useAuth()

  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [filteredAppointments, setFilteredAppointments] = useState<Appointment[]>([])
  const [loading, setLoading] = useState(true)

>>>>>>> d0e85e3f (add technician portal + appointment page)
  useEffect(() => {
    loadAppointments()
  }, [])

<<<<<<< HEAD
  const loadAppointments = async (
    opts?: { status?: string; startDate?: string; endDate?: string }
  ) => {
    try {
      setLoading(true)
      const res = await doctorService.getAppointments(opts)
      setAppointments(res.appointments)
=======
  useEffect(() => {
    filterAppointments()
  }, [startDate, endDate, appointments])

  const loadAppointments = async () => {
    try {
      setLoading(true)
      const data = await appointmentService.getAppointments()
      
      // lọc appointment theo doctor hiện tại
      const doctorAppointments = data.filter(
        (app) => app.doctor === user?.username
      )

      setAppointments(doctorAppointments)
>>>>>>> d0e85e3f (add technician portal + appointment page)
    } catch (error) {
      console.error("Failed to load appointments", error)
    } finally {
      setLoading(false)
    }
  }

<<<<<<< HEAD
  const handleFilter = () => {
    loadAppointments({
      status: statusFilter || undefined,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
    })
  }

  const handleConfirm = async (id: number) => {
    try {
      await doctorService.confirmAppointment(id)
      loadAppointments()
    } catch (error) {
      console.error("Confirm failed", error)
    }
  }

  const handleCancel = async (id: number) => {
    if (!confirm("Cancel this appointment?")) return
    try {
      await doctorService.cancelAppointment(id)
      loadAppointments()
    } catch (error) {
      console.error("Cancel failed", error)
    }
  }

  // ── Modal helpers ──
  const openNewAppointment = async () => {
    setShowModal(true)
    try {
      const res = await doctorService.getPatients()
      setPatients(res.patients)
    } catch {
      setPatients([])
    }
  }

  const handleCreate = async () => {
    if (!form.patientId || !form.date || !form.time) return
    setSaving(true)
    try {
      await doctorService.createAppointment({
        patientId: Number(form.patientId),
        department: form.department,
        date: form.date,
        time: form.time,
        room: form.room || undefined,
        symptoms: form.symptoms || undefined,
        notes: form.notes || undefined,
      })
      setShowModal(false)
      setForm({ patientId: "", department: "", date: "", time: "", room: "", symptoms: "", notes: "" })
      loadAppointments()
    } catch (error) {
      console.error("Create appointment failed", error)
    } finally {
      setSaving(false)
=======
  const filterAppointments = () => {
    let filtered = [...appointments]

    if (startDate) {
      const [day, month, year] = startDate.split("/")
      if (day && month && year) {
        const start = new Date(`${year}-${month}-${day}`)
        filtered = filtered.filter(app => new Date(app.date) >= start)
      }
    }

    if (endDate) {
      const [day, month, year] = endDate.split("/")
      if (day && month && year) {
        const end = new Date(`${year}-${month}-${day}`)
        filtered = filtered.filter(app => new Date(app.date) <= end)
      }
    }

    setFilteredAppointments(filtered)
  }

  const handleAccept = async (id: number) => {
    try {
      await appointmentService.updateAppointment(id, { status: "Confirmed" })
      loadAppointments()
    } catch (error) {
      console.error("Accept failed", error)
    }
  }

  const handleReject = async (id: number) => {
    if (!confirm("Reject this appointment?")) return
    try {
      await appointmentService.updateAppointment(id, { status: "Rejected" })
      loadAppointments()
    } catch (error) {
      console.error("Reject failed", error)
>>>>>>> d0e85e3f (add technician portal + appointment page)
    }
  }

  return (
    <DoctorLayout>
      <div className="space-y-8">
        {/* HEADER */}
<<<<<<< HEAD
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold bg-linear-to-r from-[#06b6d4] via-[#0891b2] to-[#06b6d4] bg-clip-text text-transparent mb-2">
              My Appointments
            </h2>
            <p className="text-slate-600 text-lg">
              Review and manage patient appointments
            </p>
          </div>
          <Button className="btn-gradient" onClick={openNewAppointment}>
            <Plus className="w-4 h-4 mr-2" />
            New Appointment
          </Button>
=======
        <div>
          <h2 className="text-3xl font-bold bg-linear-to-r from-[#06b6d4] via-[#0891b2] to-[#06b6d4] bg-clip-text text-transparent mb-2">
            My Appointments
          </h2>
          <p className="text-slate-600 text-lg">
            Review and manage patient appointments
          </p>
>>>>>>> d0e85e3f (add technician portal + appointment page)
        </div>

        {/* FILTER */}
        <Card className="card-feature border-slate-200/60">
<<<<<<< HEAD
          <CardContent className="p-6 flex flex-wrap items-center gap-4">
            <div className="relative max-w-xs">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <Input
                type="date"
=======
          <CardContent className="p-6 flex items-center gap-4">
            <div className="relative max-w-xs">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <Input
                type="text"
                placeholder="dd/mm/yyyy"
>>>>>>> d0e85e3f (add technician portal + appointment page)
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="pl-10 h-12"
              />
            </div>

            <span className="text-slate-400">to</span>

            <div className="relative max-w-xs">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <Input
<<<<<<< HEAD
                type="date"
=======
                type="text"
                placeholder="dd/mm/yyyy"
>>>>>>> d0e85e3f (add technician portal + appointment page)
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="pl-10 h-12"
              />
            </div>

<<<<<<< HEAD
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-12 rounded-md border px-3 text-sm"
              aria-label="Status filter"
            >
              <option value="">All statuses</option>
              <option value="Pending">Pending</option>
              <option value="Confirmed">Confirmed</option>
              <option value="Done">Done</option>
              <option value="Cancelled">Cancelled</option>
              <option value="Rejected">Rejected</option>
            </select>

            <Button variant="outline" onClick={handleFilter}>
=======
            <Button variant="outline">
>>>>>>> d0e85e3f (add technician portal + appointment page)
              <Search className="w-5 h-5 mr-2" />
              Filter
            </Button>
          </CardContent>
        </Card>

        {/* LIST */}
        <div className="space-y-4">
          {loading ? (
<<<<<<< HEAD
            <div className="flex items-center justify-center gap-2 py-8 text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading appointments…
            </div>
          ) : appointments.length === 0 ? (
=======
            <div className="text-center py-8 text-slate-500">
              Loading appointments...
            </div>
          ) : filteredAppointments.length === 0 ? (
>>>>>>> d0e85e3f (add technician portal + appointment page)
            <div className="text-center py-8 text-slate-500">
              No appointments found.
            </div>
          ) : (
<<<<<<< HEAD
            appointments.map((appointment) => (
              <Card
                key={appointment.id}
                className="card-feature border-slate-200/60"
              >
                <CardContent className="p-6">
                  <div className="flex flex-col md:flex-row justify-between gap-6">
                    {/* LEFT */}
                    <div>
                      <h3 className="text-xl font-bold text-slate-800 mb-2">
                        {appointment.department || "General"}
=======
            filteredAppointments.map((appointment) => (
              <Card key={appointment.id} className="card-feature border-slate-200/60">
                <CardContent className="p-6">
                  <div className="flex flex-col md:flex-row justify-between gap-6">

                    {/* LEFT */}
                    <div>
                      <h3 className="text-xl font-bold text-slate-800 mb-2">
                        {appointment.department}
>>>>>>> d0e85e3f (add technician portal + appointment page)
                      </h3>

                      <div className="flex items-center text-slate-600 mb-2">
                        <User className="w-4 h-4 mr-2" />
<<<<<<< HEAD
                        Patient: {appointment.patientName || `#${appointment.patientId}`}
=======
                        Patient: {appointment.patient}
>>>>>>> d0e85e3f (add technician portal + appointment page)
                      </div>

                      <div className="flex items-center text-slate-500">
                        <Clock className="w-4 h-4 mr-2" />
<<<<<<< HEAD
                        {new Date(appointment.date).toLocaleDateString("en-GB", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        })}{" "}
                        — {appointment.time?.substring(0, 5)}
=======
                        {format(parseISO(appointment.date), "dd MMM yyyy")} —{" "}
                        {appointment.time.substring(0, 5)}
>>>>>>> d0e85e3f (add technician portal + appointment page)
                      </div>

                      {appointment.room && (
                        <p className="text-sm text-slate-500 mt-1">
                          Room {appointment.room}
                        </p>
                      )}
                    </div>

                    {/* RIGHT */}
                    <div className="flex flex-col items-end gap-3">
<<<<<<< HEAD
                      {/* STATUS BADGE */}
                      <div
                        className={`px-4 py-1.5 rounded-full text-sm font-medium ${
                          appointment.status === "Pending"
                            ? "bg-yellow-50 text-yellow-700 border border-yellow-100"
                            : appointment.status === "Confirmed"
                            ? "bg-cyan-50 text-cyan-700 border border-cyan-100"
                            : appointment.status === "Done"
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-100"
                            : "bg-red-50 text-red-700 border border-red-100"
                        }`}
=======

                      {/* STATUS BADGE */}
                      <div
                        className={`px-4 py-1.5 rounded-full text-sm font-medium
                          ${
                            appointment.status === "Pending"
                              ? "bg-yellow-50 text-yellow-700 border border-yellow-100"
                              : appointment.status === "Confirmed"
                              ? "bg-cyan-50 text-cyan-700 border border-cyan-100"
                              : appointment.status === "Done"
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-100"
                              : "bg-red-50 text-red-700 border border-red-100"
                          }`}
>>>>>>> d0e85e3f (add technician portal + appointment page)
                      >
                        {appointment.status}
                      </div>

                      {/* ACTION BUTTONS */}
                      {appointment.status === "Pending" && (
                        <div className="flex gap-2">
                          <Button
                            className="bg-cyan-600 hover:bg-cyan-700 text-white"
<<<<<<< HEAD
                            onClick={() => handleConfirm(appointment.id)}
=======
                            onClick={() => handleAccept(appointment.id)}
>>>>>>> d0e85e3f (add technician portal + appointment page)
                          >
                            <CheckCircle className="w-4 h-4 mr-2" />
                            Accept
                          </Button>

                          <Button
                            variant="outline"
                            className="border-red-200 text-red-700 hover:bg-red-50"
<<<<<<< HEAD
                            onClick={() => handleCancel(appointment.id)}
                          >
                            <XCircle className="w-4 h-4 mr-2" />
                            Cancel
                          </Button>
                        </div>
                      )}

                      {appointment.status === "Confirmed" && (
                        <Button
                          variant="outline"
                          className="border-red-200 text-red-700 hover:bg-red-50"
                          onClick={() => handleCancel(appointment.id)}
                        >
                          <XCircle className="w-4 h-4 mr-2" />
                          Cancel
                        </Button>
                      )}
                    </div>
=======
                            onClick={() => handleReject(appointment.id)}
                          >
                            <XCircle className="w-4 h-4 mr-2" />
                            Reject
                          </Button>
                        </div>
                      )}
                    </div>

>>>>>>> d0e85e3f (add technician portal + appointment page)
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>
<<<<<<< HEAD

      {/* ── New Appointment Modal ── */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center">
          <Card className="w-full max-w-lg mx-4">
            <CardContent className="p-6 space-y-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xl font-bold">New Appointment</h3>
                <button onClick={() => setShowModal(false)} aria-label="Close">
                  <X className="h-5 w-5 text-slate-400 hover:text-slate-600" />
                </button>
              </div>

              {/* Patient select */}
              <div>
                <label className="text-sm font-medium text-slate-700 block mb-1">
                  Patient *
                </label>
                <select
                  value={form.patientId}
                  onChange={(e) => setForm({ ...form, patientId: e.target.value })}
                  className="w-full h-10 rounded-md border px-3 text-sm"
                  aria-label="Select patient"
                >
                  <option value="">Select patient…</option>
                  {patients.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.firstName} {p.lastName} ({p.username})
                    </option>
                  ))}
                </select>
              </div>

              {/* Department */}
              <div>
                <label className="text-sm font-medium text-slate-700 block mb-1">
                  Department
                </label>
                <Input
                  value={form.department}
                  onChange={(e) => setForm({ ...form, department: e.target.value })}
                  placeholder="e.g. Cardiology"
                />
              </div>

              {/* Date & Time row */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-slate-700 block mb-1">
                    Date *
                  </label>
                  <Input
                    type="date"
                    value={form.date}
                    onChange={(e) => setForm({ ...form, date: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700 block mb-1">
                    Time *
                  </label>
                  <Input
                    type="time"
                    value={form.time}
                    onChange={(e) => setForm({ ...form, time: e.target.value })}
                  />
                </div>
              </div>

              {/* Room */}
              <div>
                <label className="text-sm font-medium text-slate-700 block mb-1">
                  Room
                </label>
                <Input
                  value={form.room}
                  onChange={(e) => setForm({ ...form, room: e.target.value })}
                  placeholder="e.g. 201A"
                />
              </div>

              {/* Symptoms */}
              <div>
                <label className="text-sm font-medium text-slate-700 block mb-1">
                  Symptoms
                </label>
                <Input
                  value={form.symptoms}
                  onChange={(e) => setForm({ ...form, symptoms: e.target.value })}
                  placeholder="Brief summary"
                />
              </div>

              {/* Notes */}
              <div>
                <label className="text-sm font-medium text-slate-700 block mb-1">
                  Notes
                </label>
                <Input
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  placeholder="Additional notes"
                />
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setShowModal(false)}>
                  Cancel
                </Button>
                <Button
                  className="btn-gradient"
                  onClick={handleCreate}
                  disabled={saving || !form.patientId || !form.date || !form.time}
                >
                  {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  Create
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </DoctorLayout>
  )
}
=======
    </DoctorLayout>
  )
}
>>>>>>> d0e85e3f (add technician portal + appointment page)
