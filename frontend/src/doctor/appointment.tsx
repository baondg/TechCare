"use client"

import { useState, useEffect } from "react"
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
import { DoctorLayout } from "@/components/doctor-layout"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
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

  useEffect(() => {
    loadAppointments()
  }, [])

  const loadAppointments = async (
    opts?: { status?: string; startDate?: string; endDate?: string }
  ) => {
    try {
      setLoading(true)
      const res = await doctorService.getAppointments(opts)
      setAppointments(res.appointments)
    } catch (error) {
      console.error("Failed to load appointments", error)
    } finally {
      setLoading(false)
    }
  }

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
    }
  }

  return (
    <DoctorLayout>
      <div className="space-y-8">
        {/* HEADER */}
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
        </div>

        {/* FILTER */}
        <Card className="card-feature border-slate-200/60">
          <CardContent className="p-6 flex flex-wrap items-center gap-4">
            <div className="relative max-w-xs">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="pl-10 h-12"
              />
            </div>

            <span className="text-slate-400">to</span>

            <div className="relative max-w-xs">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="pl-10 h-12"
              />
            </div>

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
              <Search className="w-5 h-5 mr-2" />
              Filter
            </Button>
          </CardContent>
        </Card>

        {/* LIST */}
        <div className="space-y-4">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-8 text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading appointments…
            </div>
          ) : appointments.length === 0 ? (
            <div className="text-center py-8 text-slate-500">
              No appointments found.
            </div>
          ) : (
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
                      </h3>

                      <div className="flex items-center text-slate-600 mb-2">
                        <User className="w-4 h-4 mr-2" />
                        Patient: {appointment.patientName || `#${appointment.patientId}`}
                      </div>

                      <div className="flex items-center text-slate-500">
                        <Clock className="w-4 h-4 mr-2" />
                        {new Date(appointment.date).toLocaleDateString("en-GB", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        })}{" "}
                        — {appointment.time?.substring(0, 5)}
                      </div>

                      {appointment.room && (
                        <p className="text-sm text-slate-500 mt-1">
                          Room {appointment.room}
                        </p>
                      )}
                    </div>

                    {/* RIGHT */}
                    <div className="flex flex-col items-end gap-3">
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
                      >
                        {appointment.status}
                      </div>

                      {/* ACTION BUTTONS */}
                      {appointment.status === "Pending" && (
                        <div className="flex gap-2">
                          <Button
                            className="bg-cyan-600 hover:bg-cyan-700 text-white"
                            onClick={() => handleConfirm(appointment.id)}
                          >
                            <CheckCircle className="w-4 h-4 mr-2" />
                            Accept
                          </Button>

                          <Button
                            variant="outline"
                            className="border-red-200 text-red-700 hover:bg-red-50"
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
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>

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
