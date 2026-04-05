import { useNavigate, useParams } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { DoctorLayout } from "./doctor-layout"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import ViewingPatientDashboard from "@/pages/doctor/medical_records/dashboard"
import ViewingPatientHealthInfo from "@/pages/doctor/medical_records/health-info"
import PatientPrescription from "@/pages/doctor/medical_records/prescription"
import PatientDiagnosis from "@/pages/doctor/medical_records/diagnosis"
import PatientSurgery from "@/pages/doctor/medical_records/surgery"
import PatientLab from "@/pages/doctor/medical_records/lab"
import { useCallback, useEffect, useMemo, useState } from "react"
import { EmrSessionProvider } from "@/contexts/emr-session-context"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { doctorService, type PatientDetail } from "@/services/doctor-service"
import { appointmentService, type ClinicRoomOption } from "@/services/appointment-service"
import { Loader2, ArrowRightLeft, AlertCircle } from "lucide-react"

const tabs = [
  { label: "Dashboard", value: "dashboard" },
  { label: "Health info", value: "health-info" },
  { label: "Laboratory", value: "lab" },
  { label: "Diagnosis", value: "diagnosis" },
  { label: "Surgery", value: "surgery" },
  { label: "Prescription", value: "prescription" },
  { label: "History", value: "history" },
]

function routePatientNumericId(patientId: string | undefined): number | null {
  if (!patientId) return null
  const n = Number(String(patientId).replace(/^OP0*/i, ""))
  return Number.isFinite(n) && n > 0 ? n : null
}

export function DoctorLayout2() {
  const navigate = useNavigate()
  const { tab = "dashboard", patientId } = useParams()

  const setActiveTab = (value: string) => {
    navigate(`/doctor/medical_records/${patientId}/${value}`)
  }
  const [loading, setLoading] = useState(true)
  const [patientData, setPatientData] = useState<PatientDetail | null>(null)

  const [followOpen, setFollowOpen] = useState(false)
  const [followDate, setFollowDate] = useState("")
  const [followTime, setFollowTime] = useState("09:00")
  const [followDepartment, setFollowDepartment] = useState("")
  const [followSymptoms, setFollowSymptoms] = useState("")
  const [followSubmitting, setFollowSubmitting] = useState(false)

  const [transferOpen, setTransferOpen] = useState(false)
  const [transferKind, setTransferKind] = useState<"clinic" | "hospital">("clinic")
  const [transferReason, setTransferReason] = useState("")
  const [transferNote, setTransferNote] = useState("")
  const [fromRoomId, setFromRoomId] = useState<string>("")
  const [toRoomId, setToRoomId] = useState<string>("")
  const [toHospitalName, setToHospitalName] = useState("")
  const [toHospitalId, setToHospitalId] = useState("")
  const [transport, setTransport] = useState("")
  const [clinicRooms, setClinicRooms] = useState<ClinicRoomOption[]>([])
  const [roomsLoading, setRoomsLoading] = useState(false)
  const [transferSubmitting, setTransferSubmitting] = useState(false)
  const [finishSubmitting, setFinishSubmitting] = useState(false)
  const [visitLoading, setVisitLoading] = useState(true)
  const [visitActive, setVisitActive] = useState(false)

  const numericRouteId = useMemo(() => routePatientNumericId(patientId), [patientId])

  const loadVisitState = useCallback(async () => {
    if (!patientId) {
      setVisitLoading(false)
      setVisitActive(false)
      return
    }
    setVisitLoading(true)
    try {
      const r = await doctorService.getActiveRegimen(patientId)
      setVisitActive(Boolean(r.success && r.active))
    } catch {
      setVisitActive(false)
    } finally {
      setVisitLoading(false)
    }
  }, [patientId])

  useEffect(() => {
    void loadVisitState()
  }, [loadVisitState])

  const emrSessionValue = useMemo(
    () => ({
      visitLoading,
      visitActive,
      mutationsAllowed: !visitLoading && visitActive,
    }),
    [visitLoading, visitActive]
  )

  const loadPatient = useCallback(async () => {
    if (!patientId) return
    try {
      setLoading(true)
      const res = await doctorService.getPatient(patientId)
      if (res.success && res.patient) {
        setPatientData(res.patient)
        const dept =
          res.patient.latestDiagnosis?.department ||
          res.patient.inDepartment ||
          "Outpatient"
        setFollowDepartment(String(dept))
      } else {
        setPatientData(null)
      }
    } catch (err) {
      console.error(err)
      setPatientData(null)
    } finally {
      setLoading(false)
    }
  }, [patientId])

  useEffect(() => {
    void loadPatient()
  }, [loadPatient])

  useEffect(() => {
    if (!transferOpen) return
    let cancelled = false
    void (async () => {
      setRoomsLoading(true)
      try {
        const rooms = await appointmentService.getClinicRooms()
        if (!cancelled) {
          setClinicRooms(rooms)
          if (rooms.length >= 2) {
            setFromRoomId(String(rooms[0].id))
            setToRoomId(String(rooms[1].id))
          } else if (rooms.length === 1) {
            setFromRoomId(String(rooms[0].id))
            setToRoomId(String(rooms[0].id))
          }
        }
      } catch (e) {
        console.error(e)
        if (!cancelled) setClinicRooms([])
      } finally {
        if (!cancelled) setRoomsLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [transferOpen])

  const renderHeader = () => {
    if (loading) return "Loading patient..."
    if (!patientData) return "Patient not found"
    const { firstName, lastName, age, gender, bmi, latestDiagnosis } = patientData

    const dept = patientData.inDepartment ?? null

    return (
      <div>
        <p className="font-semibold text-lg">
          {firstName} {lastName} | {age} {gender === "M" ? "Male" : "Female"} | BMI: {bmi ?? "N/A"}
        </p>
        {latestDiagnosis && (
          <p className="text-sm text-slate-600">
            Diagnosis: {latestDiagnosis.icd10 || "—"} - {latestDiagnosis.interpretation || "—"}
          </p>
        )}
        <p className="text-sm text-slate-500">Department: {dept || "—"}</p>
      </div>
    )
  }

  const openFollowUp = () => {
    const t = new Date()
    t.setDate(t.getDate() + 7)
    setFollowDate(t.toISOString().slice(0, 10))
    setFollowOpen(true)
  }

  const submitFollowUp = async () => {
    if (!numericRouteId || !followDate || !followTime.trim() || !followDepartment.trim()) {
      window.alert("Please fill date, time, and department.")
      return
    }
    setFollowSubmitting(true)
    try {
      await doctorService.createAppointment({
        patientId: numericRouteId,
        department: followDepartment.trim(),
        date: followDate,
        time: followTime.length <= 5 ? `${followTime}:00` : followTime,
        symptoms: followSymptoms.trim() || undefined,
        notes: followSymptoms.trim() || undefined,
      })
      window.alert("Follow-up appointment scheduled.")
      setFollowOpen(false)
      setFollowSymptoms("")
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Could not create appointment.")
    } finally {
      setFollowSubmitting(false)
    }
  }

  const toRoomDepartmentLabel = useMemo(() => {
    if (!toRoomId) return null
    const r = clinicRooms.find((x) => String(x.id) === toRoomId)
    if (!r) return null
    const n = r.departmentName?.trim()
    if (n) return n
    if (r.departmentId != null && Number.isFinite(Number(r.departmentId))) {
      return `Department #${r.departmentId}`
    }
    return "No department linked to this room"
  }, [clinicRooms, toRoomId])

  const submitTransfer = async () => {
    if (!patientId || !transferReason.trim()) {
      window.alert("Reason is required.")
      return
    }
    setTransferSubmitting(true)
    try {
      if (transferKind === "clinic") {
        const fromR = Number(fromRoomId)
        const toR = Number(toRoomId)
        if (!Number.isFinite(fromR) || !Number.isFinite(toR)) {
          window.alert("Select from and to rooms.")
          setTransferSubmitting(false)
          return
        }
        await doctorService.createPatientTransfer(patientId, {
          kind: "clinic",
          reason: transferReason.trim(),
          note: transferNote.trim() || undefined,
          fromRoomId: fromR,
          toRoomId: toR,
        })
      } else {
        if (!toHospitalName.trim()) {
          window.alert("Destination hospital name is required.")
          setTransferSubmitting(false)
          return
        }
        await doctorService.createPatientTransfer(patientId, {
          kind: "hospital",
          reason: transferReason.trim(),
          note: transferNote.trim() || undefined,
          toHospitalName: toHospitalName.trim(),
          toHospitalId: toHospitalId.trim() || undefined,
          transport: transport.trim() || undefined,
        })
      }
      window.alert("Transfer recorded.")
      setTransferOpen(false)
      setTransferReason("")
      setTransferNote("")
      setToHospitalName("")
      setToHospitalId("")
      setTransport("")
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Could not record transfer.")
    } finally {
      setTransferSubmitting(false)
    }
  }

  const submitFinishExamination = async () => {
    if (!patientId) return
    if (
      !window.confirm(
        "Finish examination and close this visit? Vitals and orders stay linked to this encounter."
      )
    )
      return
    setFinishSubmitting(true)
    try {
      await doctorService.closeOpenVisitRegimen(patientId)
      window.alert("Visit closed. The patient history will show this encounter as one card.")
      await loadVisitState()
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Could not close visit.")
    } finally {
      setFinishSubmitting(false)
    }
  }

  return (
    <EmrSessionProvider value={emrSessionValue}>
    <DoctorLayout>
      <Dialog open={followOpen} onOpenChange={setFollowOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add follow-up appointment</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="fu-date">
                Date <span className="text-red-500">*</span>
              </Label>
              <Input
                id="fu-date"
                type="date"
                value={followDate}
                onChange={(e) => setFollowDate(e.target.value)}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="fu-time">
                Time <span className="text-red-500">*</span>
              </Label>
              <Input
                id="fu-time"
                type="time"
                value={followTime}
                onChange={(e) => setFollowTime(e.target.value)}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="fu-dept">
                Department <span className="text-red-500">*</span>
              </Label>
              <Input
                id="fu-dept"
                value={followDepartment}
                onChange={(e) => setFollowDepartment(e.target.value)}
                placeholder="e.g. Outpatient"
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="fu-symptoms">Reason / symptoms (optional)</Label>
              <Textarea
                id="fu-symptoms"
                value={followSymptoms}
                onChange={(e) => setFollowSymptoms(e.target.value)}
                rows={3}
                placeholder="Chief complaint or visit reason"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => setFollowOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              className="btn-gradient"
              disabled={followSubmitting}
              onClick={() => void submitFollowUp()}
            >
              {followSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Schedule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={transferOpen} onOpenChange={setTransferOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Transfer patient</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant={transferKind === "clinic" ? "default" : "outline"}
                className={transferKind === "clinic" ? "btn-gradient" : ""}
                onClick={() => setTransferKind("clinic")}
              >
                Clinic / room
              </Button>
              <Button
                type="button"
                size="sm"
                variant={transferKind === "hospital" ? "default" : "outline"}
                className={transferKind === "hospital" ? "btn-gradient" : ""}
                onClick={() => setTransferKind("hospital")}
              >
                External hospital
              </Button>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="tr-reason">
                Reason <span className="text-red-500">*</span>
              </Label>
              <Textarea
                id="tr-reason"
                value={transferReason}
                onChange={(e) => setTransferReason(e.target.value)}
                rows={2}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="tr-note">Clinical note (optional)</Label>
              <Textarea id="tr-note" value={transferNote} onChange={(e) => setTransferNote(e.target.value)} rows={2} />
            </div>
            {transferKind === "clinic" ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label>
                    From room <span className="text-red-500">*</span>
                  </Label>
                  {roomsLoading ? (
                    <p className="text-sm text-muted-foreground">Loading rooms…</p>
                  ) : (
                    <Select value={fromRoomId} onValueChange={setFromRoomId}>
                      <SelectTrigger aria-required="true">
                        <SelectValue placeholder="Select room" />
                      </SelectTrigger>
                      <SelectContent>
                        {clinicRooms.map((r) => (
                          <SelectItem key={r.id} value={String(r.id)}>
                            {r.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
                <div className="grid gap-2">
                  <Label>
                    To room <span className="text-red-500">*</span>
                  </Label>
                  {roomsLoading ? null : (
                    <>
                      <Select value={toRoomId} onValueChange={setToRoomId}>
                        <SelectTrigger aria-required="true">
                          <SelectValue placeholder="Select room" />
                        </SelectTrigger>
                        <SelectContent>
                          {clinicRooms.map((r) => (
                            <SelectItem key={r.id} value={String(r.id)}>
                              {r.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {toRoomDepartmentLabel ? (
                        <p className="text-sm text-slate-600 rounded-md border border-cyan-100 bg-cyan-50/60 px-3 py-2">
                          <span className="text-slate-500">Department: </span>
                          <span className="font-medium text-slate-800">{toRoomDepartmentLabel}</span>
                        </p>
                      ) : null}
                    </>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="grid gap-2">
                  <Label htmlFor="h-name">
                    Hospital name <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="h-name"
                    value={toHospitalName}
                    onChange={(e) => setToHospitalName(e.target.value)}
                    placeholder="Receiving facility"
                    required
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="h-id">Hospital / referral ID (optional)</Label>
                  <Input id="h-id" value={toHospitalId} onChange={(e) => setToHospitalId(e.target.value)} />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="h-transport">Transport (optional)</Label>
                  <Input
                    id="h-transport"
                    value={transport}
                    onChange={(e) => setTransport(e.target.value)}
                    placeholder="e.g. ambulance"
                  />
                </div>
              </div>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => setTransferOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              className="btn-gradient gap-1"
              disabled={transferSubmitting}
              onClick={() => void submitTransfer()}
            >
              {transferSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRightLeft className="h-4 w-4" />}
              Save transfer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="space-y-6 w-full">
        {!visitLoading && patientId && !visitActive && patientData ? (
          <Alert variant="default" className="border-amber-200 bg-amber-50 text-amber-950">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              This patient is not checked in yet (no active visit). You can review records; saving diagnosis, labs,
              prescriptions, and other clinical data is disabled until the nurse completes check-in.
            </AlertDescription>
          </Alert>
        ) : null}

        {/* ===== Patient Info Header ===== */}
        <Card className="p-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-r border-white/40 sticky bg-white/80 backdrop-blur-xl shadow-[4px_0_20px_rgba(0,0,0,0.05)] z-40">
          {renderHeader()}

          <div className="flex flex-wrap gap-2 justify-end">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="btn-outline transition-transform duration-500 text-base px-5 py-3 gap-1"
              onClick={() => setTransferOpen(true)}
              disabled={!emrSessionValue.mutationsAllowed}
              title={!emrSessionValue.mutationsAllowed ? "Available after nurse check-in" : undefined}
            >
              <ArrowRightLeft className="h-4 w-4" />
              Transfer
            </Button>
            <Button
              type="button"
              size="sm"
              className="btn-gradient transition-transform duration-500 text-base px-5 py-3"
              onClick={openFollowUp}
              disabled={!patientId || loading || !patientData || !emrSessionValue.mutationsAllowed}
              title={!emrSessionValue.mutationsAllowed ? "Available after nurse check-in" : undefined}
            >
              + Add Follow-up Appointment
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="btn-outline transition-transform duration-500 text-base px-5 py-3"
              disabled={!patientId || loading || !patientData || finishSubmitting || !visitActive}
              title={
                !visitActive
                  ? "No active visit to close"
                  : "Closes the open encounter (regimen) for this patient"
              }
              onClick={() => void submitFinishExamination()}
            >
              {finishSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Finish examination
            </Button>
          </div>
        </Card>

        {/* ===== Tabs ===== */}
        <div className="sticky z-10 bg-white rounded-md w-fit">
          <Tabs value={tab} onValueChange={setActiveTab}>
            <TabsList className="inline-flex rounded-xl bg-tr p-1 gap-1">
              {tabs.map((t) => (
                <TabsTrigger
                  key={t.value}
                  value={t.value}
                  className="tabs-trigger gap-2 h-7 transition duration-500"
                >
                  {t.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>

        {/* ===== Tab Content ===== */}
        <div>
          {tab === "dashboard" && <ViewingPatientDashboard />}
          {tab === "health-info" && <ViewingPatientHealthInfo />}
          {tab === "prescription" && <PatientPrescription />}
          {tab === "diagnosis" && <PatientDiagnosis />}
          {tab === "surgery" && <PatientSurgery />}
          {tab === "lab" && <PatientLab />}
        </div>
      </div>
    </DoctorLayout>
    </EmrSessionProvider>
  )
}
export { DoctorLayout }
