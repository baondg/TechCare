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
import DoctorPatientHistoryPage from "@/pages/doctor/medical_records/history"
import { useCallback, useEffect, useMemo, useState } from "react"
import { EmrSessionProvider } from "@/contexts/emr-session-context"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { YmdEnglishDatePicker } from "@/components/ymd-english-date-picker"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { doctorService, type DepartmentOption, type PatientDetail } from "@/services/doctor-service"
import { appointmentService, type ClinicRoomOption } from "@/services/appointment-service"
import { buildHospitalTransferSlipHtmlDocument } from "@/lib/hospital-transfer-slip-html"
import {
  buildFollowUpReexamSlipHtmlDocument,
  formatDdMmYyyy,
  parseIsoDateForSlip,
  splitInsuranceCardParts,
} from "@/lib/follow-up-reexam-slip-html"
import { generateFollowUpReexamPdfBlob } from "@/lib/export-follow-up-reexam-pdf"
import { generatePrescriptionPdfBlob } from "@/lib/export-prescription-pdf"
import { generateSurgeryPdfBlob } from "@/lib/export-surgery-pdf"
import { generateBloodTestPdfBlob } from "@/lib/export-blood-test-pdf"
import { generateHospitalTransferPdfBlob } from "@/lib/export-hospital-transfer-pdf"
import { generateHealthInfoTrackingPdfBlob } from "@/lib/export-health-info-tracking-pdf"
import { buildSigningTimeLine, signingLineFromIso, stampPdfWithExportFooter } from "@/lib/pdf-export-stamp"
import { usePauseableToast } from "@/hooks/usePauseableToast"
import { PauseableCornerToastPortal } from "@/components/pauseable-corner-toast"
import { Loader2, ArrowRightLeft, AlertCircle, FileDown, Printer, Plus, Minus } from "lucide-react"

const tabs = [
  { label: "Dashboard", value: "dashboard" },
  { label: "Health info", value: "health-info" },
  { label: "Laboratory", value: "lab" },
  { label: "Diagnosis", value: "diagnosis" },
  { label: "Surgery", value: "surgery" },
  { label: "Prescription", value: "prescription" },
  { label: "History", value: "history" },
]

const TRANSFER_HOSPITAL_OPTIONS = [
  "Bệnh viện Chợ Rẫy",
  "Bệnh viện Nhi đồng 2",
  "Bệnh viện Nhiệt đới Trung ương",
  "Bệnh viện Tâm Anh",
  "Bệnh viện Quân y 175",
  "Bệnh viện Thống Nhất",
  "Bệnh viện 115",
] as const

function routePatientNumericId(patientId: string | undefined): number | null {
  if (!patientId) return null
  const n = Number(String(patientId).replace(/^OP0*/i, ""))
  return Number.isFinite(n) && n > 0 ? n : null
}

function readSignedInDisplayName(): string {
  try {
    const raw = localStorage.getItem("user")
    if (!raw) return ""
    const u = JSON.parse(raw) as { firstName?: string; lastName?: string; username?: string; fullName?: string }
    const n = `${u.lastName || ""} ${u.firstName || ""}`.trim()
    return n || String(u.fullName || "").trim() || String(u.username || "").trim()
  } catch {
    return ""
  }
}

function formatDateTime(value: string | null | undefined, locale = "vi-VN") {
  if (!value) return "—"
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return String(value)
  return d.toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" })
}

const FOLLOW_UP_MINUTE_OPTIONS = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, "0"))
const FOLLOW_UP_HOUR24_OPTIONS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"))

/** Parse `HH:mm` (24h) for follow-up UI: hour 0–23 and minute. */
function parseFollowTime24hString(time24: string): { hour24: number; minute: number } {
  const raw = String(time24 || "").trim()
  const [hPart, mPart] = raw.split(":")
  const hour24 = Math.min(23, Math.max(0, Number.parseInt(hPart ?? "", 10) || 0))
  const minute = Math.min(59, Math.max(0, Number.parseInt(String(mPart ?? "0").slice(0, 2), 10) || 0))
  return { hour24, minute }
}

function formatFollowTime24h(hour24: number, minute: number): string {
  const h = Math.min(23, Math.max(0, Math.floor(hour24)))
  const mm = Math.min(59, Math.max(0, Math.floor(minute)))
  return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`
}

/** Clamp hour 0–23 from digits the user typed (empty → 0 on commit paths). */
function parseFollowHourInputValue(s: string): number {
  const d = String(s || "").replace(/\D/g, "")
  if (d === "") return 0
  return Math.min(23, Math.max(0, Number.parseInt(d, 10)))
}

/** Clamp minute 0–59 from digits the user typed (empty → 0 on commit paths). */
function parseFollowMinuteInputValue(s: string): number {
  const d = String(s || "").replace(/\D/g, "")
  if (d === "") return 0
  return Math.min(59, Math.max(0, Number.parseInt(d, 10)))
}

export function DoctorLayout2() {
  const { toast, isExiting, showSuccess, showError, onMouseEnter, onMouseLeave } = usePauseableToast(2600)
  const navigate = useNavigate()
  const { tab = "dashboard", patientId } = useParams()

  const setActiveTab = (value: string) => {
    navigate(`/doctor/medical_records/${patientId}/${value}`)
  }
  const [loading, setLoading] = useState(true)
  const [patientData, setPatientData] = useState<PatientDetail | null>(null)

  const [followDate, setFollowDate] = useState("")
  const [followTime, setFollowTime] = useState("09:00")
  const [followHourInput, setFollowHourInput] = useState("09")
  const [followMinuteInput, setFollowMinuteInput] = useState("00")
  const [followDepartment, setFollowDepartment] = useState("")
  const [departmentOptions, setDepartmentOptions] = useState<DepartmentOption[]>([])
  const [followSymptoms, setFollowSymptoms] = useState("")

  const [transferOpen, setTransferOpen] = useState(false)
  const [transferKind, setTransferKind] = useState<"clinic" | "hospital">("clinic")
  const [transferReason, setTransferReason] = useState("")
  const [transferNote, setTransferNote] = useState("")
  const [fromRoomId, setFromRoomId] = useState<string>("")
  const [toRoomId, setToRoomId] = useState<string>("")
  const [toHospitalName, setToHospitalName] = useState("")
  const [toHospitalId, setToHospitalId] = useState("")
  const [transport, setTransport] = useState("")
  const [clinicalSummary, setClinicalSummary] = useState("")
  const [keyFindings, setKeyFindings] = useState("")
  const [keyTestsSummary, setKeyTestsSummary] = useState("")
  const [treatmentsProvided, setTreatmentsProvided] = useState("")
  const [conditionAtTransfer, setConditionAtTransfer] = useState("")
  const [transferObjective, setTransferObjective] = useState("")
  const [clinicRooms, setClinicRooms] = useState<ClinicRoomOption[]>([])
  const [roomsLoading, setRoomsLoading] = useState(false)
  const [transferSubmitting, setTransferSubmitting] = useState(false)
  const [finishSubmitting, setFinishSubmitting] = useState(false)
  const [visitLoading, setVisitLoading] = useState(true)
  const [visitActive, setVisitActive] = useState(false)
  const [checkInRoom, setCheckInRoom] = useState<{ id: number; name: string } | null>(null)

  const [finishWizardOpen, setFinishWizardOpen] = useState(false)
  const [finishWizardStep, setFinishWizardStep] = useState<1 | 2>(1)
  const [finishWizardChoice, setFinishWizardChoice] = useState<"none" | "followup" | "hospital-transfer">("none")
  const [finishWizardSaving, setFinishWizardSaving] = useState(false)
  const [finishWizardSaved, setFinishWizardSaved] = useState<null | { type: "followup" | "hospital-transfer"; summary: string }>(null)
  const [finishWizardDocsLoading, setFinishWizardDocsLoading] = useState(false)
  const [finishWizardDocsError, setFinishWizardDocsError] = useState<string | null>(null)
  const [finishWizardDocs, setFinishWizardDocs] = useState<Awaited<ReturnType<typeof doctorService.getActiveRegimenDocuments>>["regimen"]>(null)
  const [slipPreviewZoom, setSlipPreviewZoom] = useState(0.48)

  const [pdfPreviewOpen, setPdfPreviewOpen] = useState(false)
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null)
  const [pdfPreviewTitle, setPdfPreviewTitle] = useState<string>("PDF preview")
  const [pdfPreviewFilename, setPdfPreviewFilename] = useState<string>("document.pdf")
  const [pdfGeneratingKey, setPdfGeneratingKey] = useState<string | null>(null)

  const numericRouteId = useMemo(() => routePatientNumericId(patientId), [patientId])

  const openPdfPreview = useCallback((blob: Blob, filename: string, title: string) => {
    const url = URL.createObjectURL(blob)
    setPdfPreviewFilename(filename || "document.pdf")
    setPdfPreviewTitle(title || "PDF preview")
    if (pdfPreviewUrl) URL.revokeObjectURL(pdfPreviewUrl)
    setPdfPreviewUrl(url)
    setPdfPreviewOpen(true)
  }, [pdfPreviewUrl])

  const closePdfPreview = useCallback(() => {
    setPdfPreviewOpen(false)
    if (pdfPreviewUrl) URL.revokeObjectURL(pdfPreviewUrl)
    setPdfPreviewUrl(null)
  }, [pdfPreviewUrl])

  const savePdfFromPreview = useCallback(async () => {
    if (!pdfPreviewUrl) return
    try {
      const res = await fetch(pdfPreviewUrl)
      const raw = await res.blob()
      const stamped = await stampPdfWithExportFooter(raw, new Date())
      const url = URL.createObjectURL(stamped)
      const a = document.createElement("a")
      a.href = url
      a.download = pdfPreviewFilename || "document.pdf"
      a.rel = "noopener"
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      console.error(e)
      showError(e instanceof Error ? e.message : "Download failed")
    }
  }, [pdfPreviewUrl, pdfPreviewFilename, showError])

  useEffect(() => {
    return () => {
      if (pdfPreviewUrl) URL.revokeObjectURL(pdfPreviewUrl)
    }
  }, [pdfPreviewUrl])

  const loadVisitState = useCallback(async () => {
    if (!patientId) {
      setVisitLoading(false)
      setVisitActive(false)
      setCheckInRoom(null)
      return
    }
    setVisitLoading(true)
    try {
      const r = await doctorService.getActiveRegimen(patientId)
      setVisitActive(Boolean(r.success && r.active))
      const room = r.checkInRoom
      if (r.success && room) {
        const rawId = room.id
        const roomId = typeof rawId === "number" ? rawId : Number(rawId)
        if (Number.isFinite(roomId) && roomId > 0) {
          setCheckInRoom({ id: roomId, name: String(room.name || "").trim() || `Room #${roomId}` })
        } else {
          setCheckInRoom(null)
        }
      } else {
        setCheckInRoom(null)
      }
    } catch {
      setVisitActive(false)
      setCheckInRoom(null)
    } finally {
      setVisitLoading(false)
    }
  }, [patientId])

  useEffect(() => {
    void loadVisitState()
  }, [loadVisitState])

  const loadPatient = useCallback(async () => {
    if (!patientId) return
    try {
      setLoading(true)
      const res = await doctorService.getPatient(patientId)
      if (res.success && res.patient) {
        setPatientData(res.patient)
        const dept =
          res.patient.inDepartment ||
          res.patient.latestDiagnosis?.department ||
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

  const refreshPatientBanner = useCallback(() => {
    void loadPatient()
  }, [loadPatient])

  const emrSessionValue = useMemo(
    () => ({
      visitLoading,
      visitActive,
      mutationsAllowed: !visitLoading && visitActive,
      refreshPatientBanner,
    }),
    [visitLoading, visitActive, refreshPatientBanner]
  )

  useEffect(() => {
    void loadPatient()
  }, [loadPatient])

  useEffect(() => {
    if (checkInRoom) {
      setFromRoomId(String(checkInRoom.id))
    } else {
      setFromRoomId("")
    }
  }, [checkInRoom])

  useEffect(() => {
    if (!transferOpen) return
    let cancelled = false
    void (async () => {
      setRoomsLoading(true)
      try {
        const rooms = await appointmentService.getClinicRooms()
        if (!cancelled) {
          setClinicRooms(rooms)
          const fromIdStr = checkInRoom ? String(checkInRoom.id) : ""
          if (rooms.length >= 2) {
            const other = rooms.find((r) => String(r.id) !== fromIdStr) ?? rooms[1]
            setToRoomId(String(other.id))
          } else if (rooms.length === 1) {
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
  }, [transferOpen, checkInRoom])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const r = await doctorService.getDepartments()
        if (!cancelled) setDepartmentOptions(Array.isArray(r.departments) ? r.departments : [])
      } catch (e) {
        if (!cancelled) {
          setDepartmentOptions([])
          console.error(e)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const r = await doctorService.getDepartments()
        if (!cancelled) setDepartmentOptions(Array.isArray(r.departments) ? r.departments : [])
      } catch (e) {
        if (!cancelled) {
          setDepartmentOptions([])
          console.error(e)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!finishWizardOpen || finishWizardStep !== 2 || !patientId) return
    let cancelled = false
    void (async () => {
      setFinishWizardDocsLoading(true)
      setFinishWizardDocsError(null)
      try {
        const r = await doctorService.getActiveRegimenDocuments(patientId)
        if (!cancelled) setFinishWizardDocs(r.regimen)
      } catch (e) {
        if (!cancelled) {
          setFinishWizardDocs(null)
          setFinishWizardDocsError(e instanceof Error ? e.message : "Could not load regimen documents.")
        }
      } finally {
        if (!cancelled) setFinishWizardDocsLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [finishWizardOpen, finishWizardStep, patientId])

  useEffect(() => {
    if (finishWizardOpen) setSlipPreviewZoom(0.48)
  }, [finishWizardOpen])

  const renderHeader = () => {
    if (loading) return "Loading patient..."
    if (!patientData) return "Patient not found"
    const { firstName, lastName, age, gender, bmi, latestDiagnosis } = patientData

    const deptLabel =
      patientData.inDepartment?.trim() ||
      latestDiagnosis?.department?.trim() ||
      null

    return (
      <div>
        <p className="font-semibold text-lg">
          {lastName} {firstName} | {age} {gender === "M" ? "Male" : "Female"} | BMI: {bmi ?? "N/A"}
        </p>
        {latestDiagnosis && (
          <p className="text-sm text-slate-600">
            Diagnosis: {latestDiagnosis.icd10 || "—"} - {latestDiagnosis.interpretation || "—"}
          </p>
        )}
        <p className="text-sm text-slate-500">Department: {deptLabel || "—"}</p>
      </div>
    )
  }

  const departmentLabelForRoomId = useCallback((roomId: string | null) => {
    if (!roomId) return null
    const r = clinicRooms.find((x) => String(x.id) === roomId)
    if (!r) return null
    const n = r.departmentName?.trim()
    if (n) return n
    if (r.departmentId != null && Number.isFinite(Number(r.departmentId))) {
      return `Department #${r.departmentId}`
    }
    return "No department linked to this room"
  }, [clinicRooms])

  const fromRoomDepartmentLabel = useMemo(
    () => departmentLabelForRoomId(fromRoomId),
    [departmentLabelForRoomId, fromRoomId]
  )

  const toRoomDepartmentLabel = useMemo(
    () => departmentLabelForRoomId(toRoomId),
    [departmentLabelForRoomId, toRoomId]
  )

  useEffect(() => {
    if (!finishWizardOpen || finishWizardChoice !== "followup") return
    const { hour24, minute } = parseFollowTime24hString(followTime)
    setFollowHourInput(String(hour24).padStart(2, "0"))
    setFollowMinuteInput(String(minute).padStart(2, "0"))
    // Re-seed when opening the follow-up form or switching to it; followTime is read once per transition.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finishWizardOpen, finishWizardChoice])

  const commitFollowTimeFromInputs = useCallback(() => {
    const h = parseFollowHourInputValue(followHourInput)
    const m = parseFollowMinuteInputValue(followMinuteInput)
    const next = formatFollowTime24h(h, m)
    setFollowTime(next)
    setFollowHourInput(String(h).padStart(2, "0"))
    setFollowMinuteInput(String(m).padStart(2, "0"))
    return next
  }, [followHourInput, followMinuteInput])

  const followUpPreviewHtml = useMemo(() => {
    if (!finishWizardOpen || finishWizardChoice !== "followup" || !patientData) return ""
    const patientName = `${patientData.lastName || ""} ${patientData.firstName || ""}`.trim() || "—"
    const genderLabel =
      patientData.gender === "M" ? "Male" : patientData.gender === "F" ? "Female" : patientData.gender?.trim() || "—"
    const dx = patientData.latestDiagnosis
    const diagnosis = [dx?.icd10, dx?.interpretation].filter(Boolean).join(" — ") || "—"
    const rev = followDate.trim() ? parseIsoDateForSlip(followDate) : null
    const revisitDay = rev ? rev.day.padStart(2, "0") : "…"
    const revisitMonth = rev ? rev.month.padStart(2, "0") : "…"
    const revisitYear = rev ? rev.year : "…"
    const now = new Date()
    const footerDay = String(now.getDate())
    const footerMonth = String(now.getMonth() + 1)
    const footerYear = String(now.getFullYear())
    const examDateDisplay = formatDdMmYyyy(
      `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`
    )
    const placeholderDate = "..../..../........"
    return buildFollowUpReexamSlipHtmlDocument({
      patientName,
      genderLabel,
      dateOfBirthDisplay: patientData.dateOfBirth ? formatDdMmYyyy(patientData.dateOfBirth) || placeholderDate : placeholderDate,
      address: "—",
      insuranceCardParts: splitInsuranceCardParts(patientData.healthInsuranceId),
      insuranceValidFromDisplay: placeholderDate,
      insuranceValidToDisplay:
        patientData.healthInsuranceExpiredDate ? formatDdMmYyyy(patientData.healthInsuranceExpiredDate) || placeholderDate : placeholderDate,
      examDateDisplay: examDateDisplay || placeholderDate,
      admissionDateDisplay: placeholderDate,
      dischargeDateDisplay: placeholderDate,
      diagnosis,
      comorbidities: followSymptoms.trim() || "—",
      revisitDay,
      revisitMonth,
      revisitYear,
      appointmentTimeLabel: followTime.trim() || undefined,
      departmentLabel: followDepartment.trim() || undefined,
      footerPlaceLine: "………………",
      footerDay,
      footerMonth,
      footerYear,
      doctorDisplayName: readSignedInDisplayName() || "—",
    })
  }, [finishWizardOpen, finishWizardChoice, patientData, followDate, followTime, followDepartment, followSymptoms])

  const hospitalTransferPreviewHtml = useMemo(() => {
    const shouldPreview =
      (transferOpen && transferKind === "hospital") ||
      (finishWizardOpen && finishWizardChoice === "hospital-transfer")
    if (!shouldPreview || !patientData) return ""
    const t = (s: string) => s.trim()
    const patientName = `${patientData.lastName || ""} ${patientData.firstName || ""}`.trim() || "—"
    const patientSex =
      patientData.gender === "M" ? "Male" : patientData.gender === "F" ? "Female" : patientData.gender || "—"

    const formPayload: Record<string, unknown> = {
      portalVersion: 1,
      toHospitalName: t(toHospitalName),
      ...(t(toHospitalId) ? { toHospitalId: t(toHospitalId) } : {}),
      ...(t(clinicalSummary) ? { clinicalSummary: t(clinicalSummary) } : {}),
      ...(t(keyFindings) ? { keyFindings: t(keyFindings) } : {}),
      ...(t(keyTestsSummary) ? { keyTestsSummary: t(keyTestsSummary) } : {}),
      ...(t(treatmentsProvided) ? { treatmentsProvided: t(treatmentsProvided) } : {}),
      ...(t(conditionAtTransfer) ? { conditionAtTransfer: t(conditionAtTransfer) } : {}),
      ...(t(transferObjective) ? { transferObjective: t(transferObjective) } : {}),
    }

    return buildHospitalTransferSlipHtmlDocument({
      patientName,
      patientDob: "—",
      patientSex,
      insuranceId: patientData.healthInsuranceId || undefined,
      destinationHospital: t(toHospitalName) || "—",
      destinationRefId: t(toHospitalId) || undefined,
      reason: t(transferReason),
      note: t(transferNote) || undefined,
      transport: t(transport) || undefined,
      transferAt: new Date().toLocaleString("vi-VN", { dateStyle: "medium", timeStyle: "short" }),
      doctorName: readSignedInDisplayName() || "—",
      icd10: patientData.latestDiagnosis?.icd10,
      diagnosis: patientData.latestDiagnosis?.interpretation,
      formPayload,
    })
  }, [
    transferOpen,
    transferKind,
    finishWizardOpen,
    finishWizardChoice,
    patientData,
    transferReason,
    transferNote,
    toHospitalName,
    toHospitalId,
    transport,
    clinicalSummary,
    keyFindings,
    keyTestsSummary,
    treatmentsProvided,
    conditionAtTransfer,
    transferObjective,
  ])

  const submitTransfer = async () => {
    if (!patientId || !transferReason.trim()) {
      showError("Reason is required.")
      return
    }
    setTransferSubmitting(true)
    try {
      if (transferKind === "clinic") {
        const fromR = checkInRoom != null ? Number(checkInRoom.id) : Number(fromRoomId)
        const toR = Number(toRoomId)
        if (!Number.isFinite(fromR) || fromR <= 0) {
          showError(
            "Could not determine the check-in room for this visit. Ask the nurse to confirm today’s appointment / check-in.",
          )
          return
        }
        if (!Number.isFinite(toR) || toR <= 0) {
          showError("Select a destination room.")
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
          showError("Destination hospital name is required.")
          return
        }
        await doctorService.createPatientTransfer(patientId, {
          kind: "hospital",
          reason: transferReason.trim(),
          note: transferNote.trim() || undefined,
          toHospitalName: toHospitalName.trim(),
          toHospitalId: toHospitalId.trim() || undefined,
          transport: transport.trim() || undefined,
          formPayload: {
            portalVersion: 1,
            recordedAt: new Date().toISOString(),
            toHospitalName: toHospitalName.trim(),
            toHospitalId: toHospitalId.trim() || undefined,
            clinicalSummary: clinicalSummary.trim() || undefined,
            keyFindings: keyFindings.trim() || undefined,
            keyTestsSummary: keyTestsSummary.trim() || undefined,
            treatmentsProvided: treatmentsProvided.trim() || undefined,
            conditionAtTransfer: conditionAtTransfer.trim() || undefined,
            transferObjective: transferObjective.trim() || undefined,
          },
        })
      }
      showSuccess("Transfer recorded.")
      refreshPatientBanner()
      await loadVisitState()
      setTransferOpen(false)
      setTransferReason("")
      setTransferNote("")
      setToHospitalName("")
      setToHospitalId("")
      setTransport("")
      setClinicalSummary("")
      setKeyFindings("")
      setKeyTestsSummary("")
      setTreatmentsProvided("")
      setConditionAtTransfer("")
      setTransferObjective("")
    } catch (e) {
      showError(e instanceof Error ? e.message : "Could not record transfer.")
    } finally {
      setTransferSubmitting(false)
    }
  }

  const submitFinishExamination = async () => {
    if (!patientId) return
    setFinishWizardStep(1)
    setFinishWizardChoice("none")
    setFinishWizardSaved(null)
    const t = new Date()
    t.setDate(t.getDate() + 7)
    setFollowDate(t.toISOString().slice(0, 10))
    setFollowTime("09:00")
    setFollowSymptoms("")
    setFinishWizardOpen(true)
  }

  const saveFinishWizardChoiceAndContinue = async () => {
    if (!patientId) return
    if (finishWizardChoice === "none") {
      setFinishWizardSaved(null)
      setFinishWizardStep(2)
      return
    }

    setFinishWizardSaving(true)
    try {
      if (finishWizardChoice === "followup") {
        const timeCommitted = commitFollowTimeFromInputs()
        if (!numericRouteId || !followDate || !timeCommitted.trim() || !followDepartment.trim()) {
          showError("Please fill date, time, and department.")
          return
        }
        const slipInputs = buildFollowUpReexamSlipInputs()
        if (!slipInputs?.patientName?.trim()) {
          showError("Patient data is not loaded; refresh the page and try again.")
          return
        }
        await doctorService.createFollowUpReexamSlip(patientId, slipInputs as unknown as Record<string, unknown>)
        refreshPatientBanner()
        await loadVisitState()
        setFinishWizardSaved({
          type: "followup",
          summary: `Follow-up slip saved: ${followDate} ${timeCommitted} — ${followDepartment.trim()}`,
        })
      } else {
        if (!transferReason.trim()) {
          showError("Reason is required.")
          return
        }
        if (!toHospitalName.trim()) {
          showError("Destination hospital name is required.")
          return
        }
        await doctorService.createPatientTransfer(patientId, {
          kind: "hospital",
          reason: transferReason.trim(),
          note: transferNote.trim() || undefined,
          toHospitalName: toHospitalName.trim(),
          toHospitalId: toHospitalId.trim() || undefined,
          transport: transport.trim() || undefined,
          formPayload: {
            portalVersion: 1,
            recordedAt: new Date().toISOString(),
            toHospitalName: toHospitalName.trim(),
            toHospitalId: toHospitalId.trim() || undefined,
            clinicalSummary: clinicalSummary.trim() || undefined,
            keyFindings: keyFindings.trim() || undefined,
            keyTestsSummary: keyTestsSummary.trim() || undefined,
            treatmentsProvided: treatmentsProvided.trim() || undefined,
            conditionAtTransfer: conditionAtTransfer.trim() || undefined,
            transferObjective: transferObjective.trim() || undefined,
          },
        })
        refreshPatientBanner()
        await loadVisitState()
        setFinishWizardSaved({
          type: "hospital-transfer",
          summary: `Hospital transfer recorded: ${toHospitalName.trim()}`,
        })
      }
      setFinishWizardStep(2)
    } catch (e) {
      showError(e instanceof Error ? e.message : "Could not save.")
    } finally {
      setFinishWizardSaving(false)
    }
  }

  const confirmFinishAndCloseVisit = async () => {
    if (!patientId) return
    setFinishSubmitting(true)
    try {
      await doctorService.closeOpenVisitRegimen(patientId)
      showSuccess("Visit closed.")
      setFinishWizardOpen(false)
      await loadVisitState()
    } catch (e) {
      showError(e instanceof Error ? e.message : "Could not close visit.")
    } finally {
      setFinishSubmitting(false)
    }
  }

  const buildFollowUpReexamSlipInputs = useCallback(() => {
    if (!patientData) return null
    const patientName = `${patientData.lastName || ""} ${patientData.firstName || ""}`.trim() || "—"
    const genderLabel =
      patientData.gender === "M" ? "Nam" : patientData.gender === "F" ? "Nữ" : patientData.gender?.trim() || "—"
    const dx = patientData.latestDiagnosis
    const diagnosis = [dx?.icd10, dx?.interpretation].filter(Boolean).join(" — ") || "—"
    const rev = followDate.trim() ? parseIsoDateForSlip(followDate) : null
    const revisitDay = rev ? rev.day.padStart(2, "0") : "…"
    const revisitMonth = rev ? rev.month.padStart(2, "0") : "…"
    const revisitYear = rev ? rev.year : "…"
    const now = new Date()
    const footerDay = String(now.getDate())
    const footerMonth = String(now.getMonth() + 1)
    const footerYear = String(now.getFullYear())
    const examDateDisplay = formatDdMmYyyy(
      `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`
    )
    const placeholderDate = "..../..../........"
    return {
      patientName,
      genderLabel,
      dateOfBirthDisplay: patientData.dateOfBirth ? formatDdMmYyyy(patientData.dateOfBirth) || placeholderDate : placeholderDate,
      address: "—",
      insuranceCardParts: splitInsuranceCardParts(patientData.healthInsuranceId),
      insuranceValidFromDisplay: placeholderDate,
      insuranceValidToDisplay:
        patientData.healthInsuranceExpiredDate ? formatDdMmYyyy(patientData.healthInsuranceExpiredDate) || placeholderDate : placeholderDate,
      examDateDisplay: examDateDisplay || placeholderDate,
      admissionDateDisplay: placeholderDate,
      dischargeDateDisplay: placeholderDate,
      diagnosis,
      comorbidities: followSymptoms.trim() || "—",
      revisitDay,
      revisitMonth,
      revisitYear,
      appointmentTimeLabel: followTime.trim() || undefined,
      departmentLabel: followDepartment.trim() || undefined,
      footerPlaceLine: "………………",
      footerDay,
      footerMonth,
      footerYear,
      doctorDisplayName: readSignedInDisplayName() || "—",
    }
  }, [patientData, followDate, followTime, followDepartment, followSymptoms])

  return (
    <EmrSessionProvider value={emrSessionValue}>
    <DoctorLayout>
      <Dialog open={pdfPreviewOpen} onOpenChange={(open) => { if (!open) closePdfPreview() }}>
        <DialogContent className="flex max-h-[90vh] w-[min(920px,96vw)] max-w-none flex-col gap-3 p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>{pdfPreviewTitle}</DialogTitle>
            <DialogDescription className="sr-only">Preview the generated PDF before saving or downloading.</DialogDescription>
          </DialogHeader>
          {pdfPreviewUrl ? (
            <iframe
              title="PDF preview"
              src={pdfPreviewUrl}
              className="min-h-[min(520px,60vh)] w-full flex-1 rounded-md border bg-muted/30"
            />
          ) : null}
          <DialogFooter className="gap-2 sm:justify-end">
            <Button type="button" variant="outline" onClick={closePdfPreview}>
              Cancel
            </Button>
            <Button type="button" onClick={savePdfFromPreview} disabled={!pdfPreviewUrl}>
              <FileDown className="mr-2 h-4 w-4" />
              Save / Download
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={finishWizardOpen} onOpenChange={setFinishWizardOpen}>
        <DialogContent className="flex max-h-[92vh] w-full max-w-[min(1360px,99vw)] flex-col gap-3 overflow-hidden p-6">
          <DialogHeader className="shrink-0 space-y-1">
            <DialogTitle>Finish examination ({finishWizardStep}/2)</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Step 1: optionally add follow-up or hospital transfer. Step 2: review and finish.
            </DialogDescription>
          </DialogHeader>

          {finishWizardStep === 1 ? (
            <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-[minmax(340px,0.78fr)_minmax(620px,1.22fr)]">
              <div className="max-h-[min(72vh,640px)] min-h-0 space-y-4 overflow-y-auto py-1 pr-1">
                <div className="space-y-2">
                  <Label>Choose an optional action</Label>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant={finishWizardChoice === "none" ? "default" : "outline"}
                      className={finishWizardChoice === "none" ? "btn-gradient" : ""}
                      onClick={() => setFinishWizardChoice("none")}
                    >
                      No additional document
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={finishWizardChoice === "followup" ? "default" : "outline"}
                      className={finishWizardChoice === "followup" ? "btn-gradient" : ""}
                      onClick={() => setFinishWizardChoice("followup")}
                    >
                      Add follow-up slip
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={finishWizardChoice === "hospital-transfer" ? "default" : "outline"}
                      className={finishWizardChoice === "hospital-transfer" ? "btn-gradient" : ""}
                      onClick={() => setFinishWizardChoice("hospital-transfer")}
                    >
                      Transfer to other hospital
                    </Button>
                  </div>
                </div>

                {finishWizardChoice === "followup" ? (
                  <div className="space-y-3">
                    <div className="grid gap-2">
                      <Label htmlFor="fu-date">
                        Date <span className="text-red-500">*</span>
                      </Label>
                      <YmdEnglishDatePicker
                        id="fu-date"
                        value={followDate}
                        onChange={setFollowDate}
                        placeholder="Pick date"
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label id="fu-time-label">
                        Time <span className="text-red-500">*</span>
                      </Label>
                      <div
                        className="flex flex-wrap items-end gap-2"
                        role="group"
                        aria-labelledby="fu-time-label"
                      >
                        <datalist id="fu-follow-hour-options">
                          {FOLLOW_UP_HOUR24_OPTIONS.map((h) => (
                            <option key={h} value={h} />
                          ))}
                        </datalist>
                        <datalist id="fu-follow-minute-options">
                          {FOLLOW_UP_MINUTE_OPTIONS.map((m) => (
                            <option key={m} value={m} />
                          ))}
                        </datalist>
                        <div className="grid w-[min(5.5rem,28vw)] gap-1">
                          <span className="text-[11px] text-muted-foreground">Hour (0–23)</span>
                          <Input
                            id="fu-time-hour"
                            className="h-9 font-mono tabular-nums"
                            list="fu-follow-hour-options"
                            inputMode="numeric"
                            autoComplete="off"
                            aria-label="Hour, 0 to 23 — type or pick from suggestions"
                            value={followHourInput}
                            onChange={(e) => {
                              const raw = e.target.value.replace(/\D/g, "").slice(0, 2)
                              setFollowHourInput(raw)
                              if (raw !== "") {
                                const h = Math.min(23, Number.parseInt(raw, 10))
                                const m = parseFollowMinuteInputValue(followMinuteInput)
                                setFollowTime(formatFollowTime24h(h, m))
                              }
                            }}
                            onBlur={() => {
                              const h = parseFollowHourInputValue(followHourInput)
                              const m = parseFollowMinuteInputValue(followMinuteInput)
                              setFollowTime(formatFollowTime24h(h, m))
                              setFollowHourInput(String(h).padStart(2, "0"))
                              setFollowMinuteInput(String(m).padStart(2, "0"))
                            }}
                          />
                        </div>
                        <span className="pb-2 text-sm text-muted-foreground" aria-hidden>
                          :
                        </span>
                        <div className="grid w-[min(5.5rem,28vw)] gap-1">
                          <span className="text-[11px] text-muted-foreground">Minute</span>
                          <Input
                            id="fu-time-minute"
                            className="h-9 font-mono tabular-nums"
                            list="fu-follow-minute-options"
                            inputMode="numeric"
                            autoComplete="off"
                            aria-label="Minute, 0 to 59 — type or pick from suggestions"
                            value={followMinuteInput}
                            onChange={(e) => {
                              const raw = e.target.value.replace(/\D/g, "").slice(0, 2)
                              setFollowMinuteInput(raw)
                              if (raw !== "") {
                                const m = Math.min(59, Number.parseInt(raw, 10))
                                const h = parseFollowHourInputValue(followHourInput)
                                setFollowTime(formatFollowTime24h(h, m))
                              }
                            }}
                            onBlur={() => {
                              const h = parseFollowHourInputValue(followHourInput)
                              const m = parseFollowMinuteInputValue(followMinuteInput)
                              setFollowTime(formatFollowTime24h(h, m))
                              setFollowHourInput(String(h).padStart(2, "0"))
                              setFollowMinuteInput(String(m).padStart(2, "0"))
                            }}
                          />
                        </div>
                      </div>
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="fu-dept">
                        Department <span className="text-red-500">*</span>
                      </Label>
                      <Select value={followDepartment} onValueChange={setFollowDepartment}>
                        <SelectTrigger id="fu-dept" aria-required="true">
                          <SelectValue placeholder="Select department" />
                        </SelectTrigger>
                        <SelectContent>
                          {departmentOptions.map((d) => (
                            <SelectItem key={d.id} value={d.name}>
                              {d.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="fu-symptoms">Reason / symptoms (optional)</Label>
                      <Textarea id="fu-symptoms" value={followSymptoms} onChange={(e) => setFollowSymptoms(e.target.value)} rows={3} placeholder="Chief complaint or visit reason" />
                    </div>
                  </div>
                ) : null}

                {finishWizardChoice === "hospital-transfer" ? (
                  <div className="space-y-3">
                    <div className="grid gap-2">
                      <Label htmlFor="tr-reason">
                        Reason <span className="text-red-500">*</span>
                      </Label>
                      <Textarea
                        id="tr-reason"
                        value={transferReason}
                        onChange={(e) => setTransferReason(e.target.value)}
                        onInput={(e) => setTransferReason((e.target as HTMLTextAreaElement).value)}
                        onBlur={(e) => setTransferReason(e.target.value)}
                        rows={2}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="tr-note">Clinical note (optional)</Label>
                      <Textarea
                        id="tr-note"
                        value={transferNote}
                        onChange={(e) => setTransferNote(e.target.value)}
                        onInput={(e) => setTransferNote((e.target as HTMLTextAreaElement).value)}
                        onBlur={(e) => setTransferNote(e.target.value)}
                        rows={2}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="h-name">
                        Hospital name <span className="text-red-500">*</span>
                      </Label>
                      <Select value={toHospitalName} onValueChange={setToHospitalName}>
                        <SelectTrigger id="h-name" aria-required="true">
                          <SelectValue placeholder="Select receiving hospital" />
                        </SelectTrigger>
                        <SelectContent>
                          {TRANSFER_HOSPITAL_OPTIONS.map((hospital) => (
                            <SelectItem key={hospital} value={hospital}>
                              {hospital}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="flex min-h-[260px] flex-col overflow-hidden rounded-lg border bg-muted/20 lg:min-h-0 lg:max-h-[min(72vh,640px)]">
                <div className="shrink-0 flex items-center justify-between gap-2 border-b bg-background px-3 py-1.5">
                  <div className="text-xs font-medium">Print preview</div>
                  <div className="flex items-center gap-1.5">
                    <Button
                      type="button"
                      size="icon"
                      variant="outline"
                      className="h-7 w-7"
                      onClick={() => setSlipPreviewZoom((z) => Math.max(0.3, Number((z - 0.05).toFixed(2))))}
                      title="Zoom out"
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 px-2 text-[11px]"
                      onClick={() => setSlipPreviewZoom(0.48)}
                      title="Reset fit"
                    >
                      {Math.round(slipPreviewZoom * 100)}%
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="outline"
                      className="h-7 w-7"
                      onClick={() => setSlipPreviewZoom((z) => Math.min(1.5, Number((z + 0.05).toFixed(2))))}
                      title="Zoom in"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                <div className="min-h-0 flex-1 overflow-auto bg-white p-1">
                  {finishWizardChoice === "followup" ? (
                    <iframe
                      title="Follow-up slip preview"
                      className="min-h-[280px] border-0 bg-white origin-top-left"
                      scrolling="no"
                      style={{
                        width: `${Math.round(100 / slipPreviewZoom)}%`,
                        height: `${Math.round(100 / slipPreviewZoom)}%`,
                        transform: `scale(${slipPreviewZoom})`,
                      }}
                      srcDoc={followUpPreviewHtml}
                      sandbox=""
                    />
                  ) : finishWizardChoice === "hospital-transfer" ? (
                    <iframe
                      title="Hospital transfer slip preview"
                      className="min-h-[280px] border-0 bg-white origin-top-left"
                      scrolling="no"
                      style={{
                        width: `${Math.round(100 / slipPreviewZoom)}%`,
                        height: `${Math.round(100 / slipPreviewZoom)}%`,
                        transform: `scale(${slipPreviewZoom})`,
                      }}
                      srcDoc={hospitalTransferPreviewHtml}
                      sandbox=""
                    />
                  ) : (
                    <p className="p-4 text-sm text-muted-foreground">Choose an action to preview the print slip.</p>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="min-h-0 flex-1 overflow-y-auto space-y-3">
              <p className="text-sm text-slate-700">Review papers in this regimen before closing.</p>
              {finishWizardDocsError ? (
                <p className="text-sm text-destructive">{finishWizardDocsError}</p>
              ) : finishWizardDocsLoading ? (
                <p className="text-sm text-muted-foreground">Loading regimen documents…</p>
              ) : finishWizardDocs ? (
                <div className="rounded-md border bg-white">
                  <div className="border-b bg-slate-50 px-3 py-2 text-sm font-medium">Regimen documents</div>
                  <div className="grid gap-2 p-3 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-700">Prescriptions</span>
                      <span className="font-medium">{finishWizardDocs.prescriptions?.length || 0}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-700">Diagnoses</span>
                      <span className="font-medium">{finishWizardDocs.diagnoses?.length || 0}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-700">Lab tests</span>
                      <span className="font-medium">{finishWizardDocs.labTests?.length || 0}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-700">Surgeries</span>
                      <span className="font-medium">{finishWizardDocs.surgeries?.length || 0}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-700">Hospital transfers</span>
                      <span className="font-medium">{finishWizardDocs.hospitalTransfers?.length || 0}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-700">Follow-up reexam slips</span>
                      <span className="font-medium">{finishWizardDocs.followUpReexamSlips?.length || 0}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-700">Health tracking slips</span>
                      <span className="font-medium">{finishWizardDocs.healthTrackingSlips?.length || 0}</span>
                    </div>
                  </div>
                  <div className="border-t p-3 space-y-3">
                    {finishWizardDocs.prescriptions?.length ? (
                      <div className="space-y-1">
                        <div className="text-xs font-semibold text-slate-600">Prescriptions</div>
                        {finishWizardDocs.prescriptions.slice(0, 6).map((rx) => {
                          const key = `rx-${rx.id}`
                          return (
                            <div key={rx.id} className="flex items-center justify-between gap-2 rounded-md border bg-slate-50 px-3 py-2">
                              <div className="min-w-0">
                                <div className="text-slate-800 font-medium truncate">Prescription</div>
                                <div className="text-xs text-slate-600">{formatDateTime(rx.prescribedAt)}</div>
                              </div>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                disabled={!patientData || pdfGeneratingKey === key}
                                onClick={async () => {
                                  if (!patientData) return
                                  setPdfGeneratingKey(key)
                                  try {
                                    const { blob, filename } = await generatePrescriptionPdfBlob({
                                      patient: patientData,
                                      medications: (rx.medications || []).map((m) => ({
                                        name: m.name,
                                        quantity: m.quantity || "—",
                                        unit: m.unit || "tablet",
                                        duration: m.duration,
                                        usage: m.frequency || "—",
                                        note: "",
                                      })),
                                      prescriptionDate: formatDateTime(rx.prescribedAt),
                                      doctorName: readSignedInDisplayName() || "—",
                                      signatureStatus: "signed",
                                      filename: `prescription-${rx.id}.pdf`,
                                      signingTimeDisplay: signingLineFromIso(rx.prescribedAt),
                                    })
                                    openPdfPreview(blob, filename, "Prescription (PDF)")
                                  } catch (e) {
                                    showError(e instanceof Error ? e.message : "Failed to generate PDF")
                                  } finally {
                                    setPdfGeneratingKey(null)
                                  }
                                }}
                              >
                                {pdfGeneratingKey === key ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                                Preview PDF
                              </Button>
                            </div>
                          )
                        })}
                        {finishWizardDocs.prescriptions.length > 6 ? (
                          <div className="text-xs text-muted-foreground">…and {finishWizardDocs.prescriptions.length - 6} more</div>
                        ) : null}
                      </div>
                    ) : null}

                    {finishWizardDocs.diagnoses?.length ? (
                      <div className="space-y-1">
                        <div className="text-xs font-semibold text-slate-600">Diagnoses</div>
                        {finishWizardDocs.diagnoses.slice(0, 6).map((dx) => (
                          <div key={dx.id} className="rounded-md border bg-slate-50 px-3 py-2">
                            <div className="text-slate-800 font-medium truncate">
                              {dx.icd10 || "—"}{dx.interpretation ? ` - ${dx.interpretation}` : ""}
                            </div>
                            <div className="text-xs text-slate-600">
                              {formatDateTime(dx.diagnosedAt)}{dx.complaint ? ` · ${dx.complaint}` : ""}
                            </div>
                          </div>
                        ))}
                        {finishWizardDocs.diagnoses.length > 6 ? (
                          <div className="text-xs text-muted-foreground">…and {finishWizardDocs.diagnoses.length - 6} more</div>
                        ) : null}
                      </div>
                    ) : null}

                    {finishWizardDocs.surgeries?.length ? (
                      <div className="space-y-1">
                        <div className="text-xs font-semibold text-slate-600">Surgeries</div>
                        {finishWizardDocs.surgeries.slice(0, 6).map((s) => {
                          const key = `surgery-${s.id}`
                          const patientLabel = patientData ? `${patientData.lastName || ""} ${patientData.firstName || ""}`.trim() || patientData.username : "—"
                          const latestDiagnosisText = patientData?.latestDiagnosis
                            ? `${patientData.latestDiagnosis.icd10 || "—"} — ${patientData.latestDiagnosis.interpretation || "—"}`
                            : "—"
                          return (
                            <div key={s.id} className="flex items-center justify-between gap-2 rounded-md border bg-slate-50 px-3 py-2">
                              <div className="min-w-0">
                                <div className="text-slate-800 font-medium truncate">{s.surgeryType || "Surgery"}</div>
                                <div className="text-xs text-slate-600">{formatDateTime(s.start)}</div>
                              </div>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                disabled={!patientData || pdfGeneratingKey === key}
                                onClick={async () => {
                                  if (!patientData) return
                                  setPdfGeneratingKey(key)
                                  try {
                                    const { blob, filename } = await generateSurgeryPdfBlob({
                                      patientLabel,
                                      patientAge: patientData.age,
                                      patientGender: patientData.gender,
                                      healthInsuranceId: patientData.healthInsuranceId ?? null,
                                      latestDiagnosisText,
                                      surgeon: s.surgeon || "—",
                                      type: s.surgeryType || "—",
                                      urgency: s.urgency || "—",
                                      start: s.start,
                                      end: s.end,
                                      result: s.result || "—",
                                      note: s.note || "",
                                      filename: `surgery-${s.id}.pdf`,
                                      signingTimeDisplay: signingLineFromIso(s.start),
                                    })
                                    openPdfPreview(blob, filename, "Surgery (PDF)")
                                  } catch (e) {
                                    showError(e instanceof Error ? e.message : "Failed to generate PDF")
                                  } finally {
                                    setPdfGeneratingKey(null)
                                  }
                                }}
                              >
                                {pdfGeneratingKey === key ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                                Preview PDF
                              </Button>
                            </div>
                          )
                        })}
                        {finishWizardDocs.surgeries.length > 6 ? (
                          <div className="text-xs text-muted-foreground">…and {finishWizardDocs.surgeries.length - 6} more</div>
                        ) : null}
                      </div>
                    ) : null}

                    {finishWizardDocs.labTests?.length ? (
                      <div className="space-y-1">
                        <div className="text-xs font-semibold text-slate-600">Lab tests</div>
                        {finishWizardDocs.labTests.slice(0, 6).map((t) => {
                          const key = `lab-${t.id}`
                          const patientName = patientData ? `${patientData.lastName || ""} ${patientData.firstName || ""}`.trim() || patientData.username : "—"
                          const ageStr = patientData?.age != null ? String(patientData.age) : "—"
                          const dxLine = patientData?.latestDiagnosis
                            ? `${patientData.latestDiagnosis.icd10 || "—"} — ${patientData.latestDiagnosis.interpretation || "—"}`
                            : "—"
                          return (
                            <div key={t.id} className="flex items-center justify-between gap-2 rounded-md border bg-slate-50 px-3 py-2">
                              <div className="min-w-0">
                                <div className="text-slate-800 font-medium truncate">{t.testType || "Test"}</div>
                                <div className="text-xs text-slate-600">{formatDateTime(t.testAt)}</div>
                              </div>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                disabled={!patientData || pdfGeneratingKey === key}
                                onClick={async () => {
                                  if (!patientData || !patientId) return
                                  setPdfGeneratingKey(key)
                                  try {
                                    const detailRes = await doctorService.getLabTestDetails(patientId, t.id)
                                    const details = detailRes.details ?? []
                                    const { blob, filename } = await generateBloodTestPdfBlob({
                                      patientName,
                                      age: ageStr,
                                      gender: patientData.gender,
                                      department: finishWizardDocs?.treatments?.[0]?.department || "Laboratory",
                                      diagnosis: dxLine,
                                      testDateLabel: formatDateTime(t.testAt),
                                      details,
                                      filename: `lab-${t.id}.pdf`,
                                      signingTimeDisplay: signingLineFromIso(t.testAt),
                                    })
                                    openPdfPreview(blob, filename, "Lab (PDF)")
                                  } catch (e) {
                                    showError(e instanceof Error ? e.message : "Failed to generate PDF")
                                  } finally {
                                    setPdfGeneratingKey(null)
                                  }
                                }}
                              >
                                {pdfGeneratingKey === key ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                                Preview PDF
                              </Button>
                            </div>
                          )
                        })}
                        {finishWizardDocs.labTests.length > 6 ? (
                          <div className="text-xs text-muted-foreground">…and {finishWizardDocs.labTests.length - 6} more</div>
                        ) : null}
                      </div>
                    ) : null}

                    {finishWizardDocs.hospitalTransfers?.length ? (
                      <div className="space-y-1">
                        <div className="text-xs font-semibold text-slate-600">Hospital transfers</div>
                        {finishWizardDocs.hospitalTransfers.slice(0, 6).map((ht) => {
                          const key = `ht-${ht.orderId}`
                          const patientName = patientData ? `${patientData.lastName || ""} ${patientData.firstName || ""}`.trim() || patientData.username : "—"
                          const patientSex =
                            patientData?.gender === "M" ? "M" : patientData?.gender === "F" ? "F" : patientData?.gender || undefined
                          return (
                            <div key={ht.orderId} className="flex items-center justify-between gap-2 rounded-md border bg-slate-50 px-3 py-2">
                              <div className="min-w-0">
                                <div className="text-slate-800 font-medium truncate">{ht.toHospitalName || "—"}</div>
                                <div className="text-xs text-slate-600">{formatDateTime(ht.transferAt)}</div>
                              </div>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                disabled={!patientData || pdfGeneratingKey === key}
                                onClick={async () => {
                                  if (!patientData) return
                                  setPdfGeneratingKey(key)
                                  try {
                                    const { blob, filename } = await generateHospitalTransferPdfBlob({
                                      patientName,
                                      patientDob: "—",
                                      patientSex,
                                      insuranceId: patientData.healthInsuranceId || undefined,
                                      insuranceExpiry: "—",
                                      destinationHospital: ht.toHospitalName,
                                      destinationRefId: ht.toHospitalId,
                                      reason: ht.reason,
                                      note: ht.note,
                                      transport: ht.transport,
                                      transferAt: formatDateTime(ht.transferAt),
                                      doctorName: readSignedInDisplayName() || "—",
                                      facilityName: "TechCare",
                                      icd10: patientData.latestDiagnosis?.icd10,
                                      diagnosis: patientData.latestDiagnosis?.interpretation,
                                      formPayload: ht.formPayload,
                                      filename: `hospital-transfer-${ht.orderId}.pdf`,
                                      signingTimeDisplay: signingLineFromIso(ht.transferAt),
                                    })
                                    openPdfPreview(blob, filename, "Hospital transfer (PDF)")
                                  } catch (e) {
                                    showError(e instanceof Error ? e.message : "Failed to generate PDF")
                                  } finally {
                                    setPdfGeneratingKey(null)
                                  }
                                }}
                              >
                                {pdfGeneratingKey === key ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                                Preview PDF
                              </Button>
                            </div>
                          )
                        })}
                        {finishWizardDocs.hospitalTransfers.length > 6 ? (
                          <div className="text-xs text-muted-foreground">…and {finishWizardDocs.hospitalTransfers.length - 6} more</div>
                        ) : null}
                      </div>
                    ) : null}

                    {finishWizardDocs.followUpReexamSlips?.length ? (
                      <div className="space-y-1">
                        <div className="text-xs font-semibold text-slate-600">Follow-up reexam slips</div>
                        {finishWizardDocs.followUpReexamSlips.slice(0, 6).map((slipRow) => {
                          const key = `fup-${slipRow.orderId}`
                          return (
                            <div key={slipRow.orderId} className="flex items-center justify-between gap-2 rounded-md border bg-slate-50 px-3 py-2">
                              <div className="min-w-0">
                                <div className="text-slate-800 font-medium truncate">Follow-up Slip</div>
                                <div className="text-xs text-slate-600">{formatDateTime(slipRow.createdAt)}</div>
                              </div>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                disabled={pdfGeneratingKey === key}
                                onClick={async () => {
                                  setPdfGeneratingKey(key)
                                  try {
                                    const baseSlip = (slipRow.slip || {}) as Record<string, unknown>
                                    const { blob, filename } = await generateFollowUpReexamPdfBlob({
                                      ...(baseSlip as Parameters<typeof generateFollowUpReexamPdfBlob>[0]),
                                      signingTimeDisplay: buildSigningTimeLine(new Date(slipRow.createdAt)),
                                      filename: `follow-up-${slipRow.orderId}.pdf`,
                                    })
                                    openPdfPreview(blob, filename, "Follow-up slip (PDF)")
                                  } catch (e) {
                                    showError(e instanceof Error ? e.message : "Failed to generate PDF")
                                  } finally {
                                    setPdfGeneratingKey(null)
                                  }
                                }}
                              >
                                {pdfGeneratingKey === key ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                                Preview PDF
                              </Button>
                            </div>
                          )
                        })}
                        {finishWizardDocs.followUpReexamSlips.length > 6 ? (
                          <div className="text-xs text-muted-foreground">…and {finishWizardDocs.followUpReexamSlips.length - 6} more</div>
                        ) : null}
                      </div>
                    ) : null}

                    {finishWizardDocs.healthTrackingSlips?.length ? (
                      <div className="space-y-1">
                        <div className="text-xs font-semibold text-slate-600">Health tracking slips</div>
                        {finishWizardDocs.healthTrackingSlips.slice(0, 6).map((slip) => {
                          const key = `hts-${slip.orderId}`
                          return (
                            <div key={slip.orderId} className="flex items-center justify-between gap-2 rounded-md border bg-slate-50 px-3 py-2">
                              <div className="min-w-0">
                                <div className="text-slate-800 font-medium truncate">Health Tracking Slip</div>
                                <div className="text-xs text-slate-600">
                                  {formatDateTime(slip.createdAt)} · {slip.rows?.length || 0} row(s)
                                </div>
                              </div>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                disabled={!patientData || pdfGeneratingKey === key}
                                onClick={async () => {
                                  if (!patientData) return
                                  setPdfGeneratingKey(key)
                                  try {
                                    const rows = Array.isArray(slip.rows) ? slip.rows : []
                                    const diagnosis = patientData.latestDiagnosis
                                      ? `${patientData.latestDiagnosis.icd10 || ""}${patientData.latestDiagnosis.icd10 && patientData.latestDiagnosis.interpretation ? " - " : ""}${patientData.latestDiagnosis.interpretation || ""}`
                                      : ""
                                    const { blob, filename } = await generateHealthInfoTrackingPdfBlob({
                                      patientName: `${patientData.lastName || ""} ${patientData.firstName || ""}`.trim() || patientData.username || "",
                                      age: patientData.age == null ? "" : String(patientData.age),
                                      gender: patientData.gender === "M" ? "Male" : patientData.gender === "F" ? "Female" : "",
                                      diagnosis,
                                      rows: rows.map((r) => ({
                                        updatedAt: new Date(r.updatedAt),
                                        bloodPressure: r.bloodPressure || "",
                                        pulse: Number(r.pulse) || 0,
                                        temperature: Number(r.temperature) || 0,
                                        weight: Number(r.weight) || 0,
                                        respiratoryRate: Number(r.respiratoryRate) || 0,
                                        spo2: Number(r.spo2) || 0,
                                        symptoms: r.symptoms || "",
                                      })),
                                      filename: `health-tracking-${slip.orderId}.pdf`,
                                      signingTimeDisplay: signingLineFromIso(slip.createdAt),
                                    })
                                    openPdfPreview(blob, filename, "Health tracking slip (PDF)")
                                  } catch (e) {
                                    showError(e instanceof Error ? e.message : "Failed to generate PDF")
                                  } finally {
                                    setPdfGeneratingKey(null)
                                  }
                                }}
                              >
                                {pdfGeneratingKey === key ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                                Preview PDF
                              </Button>
                            </div>
                          )
                        })}
                        {finishWizardDocs.healthTrackingSlips.length > 6 ? (
                          <div className="text-xs text-muted-foreground">…and {finishWizardDocs.healthTrackingSlips.length - 6} more</div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : (
                <div className="rounded-md border bg-slate-50 px-3 py-2 text-sm text-slate-600">No active regimen documents found.</div>
              )}
              {finishWizardSaved ? (
                <div className="rounded-md border bg-slate-50 px-3 py-2 text-sm">
                  <span className="font-medium">Added:</span> {finishWizardSaved.summary}
                </div>
              ) : (
                <div className="rounded-md border bg-slate-50 px-3 py-2 text-sm text-slate-600">No additional document added.</div>
              )}
              {finishWizardSaved?.type === "followup" ? (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-white px-3 py-2">
                  <div className="text-sm font-medium text-slate-800">Follow-up reexam slip</div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={pdfGeneratingKey === "followup-slip"}
                    onClick={async () => {
                      const slip = buildFollowUpReexamSlipInputs()
                      if (!slip) return
                      setPdfGeneratingKey("followup-slip")
                      try {
                        const { blob, filename } = await generateFollowUpReexamPdfBlob({
                          ...slip,
                          signingTimeDisplay: buildSigningTimeLine(new Date()),
                          filename: `follow-up-${followDate || "date"}.pdf`,
                        })
                        openPdfPreview(blob, filename, "Follow-up slip (PDF)")
                      } catch (e) {
                        showError(e instanceof Error ? e.message : "Failed to generate PDF")
                      } finally {
                        setPdfGeneratingKey(null)
                      }
                    }}
                  >
                    {pdfGeneratingKey === "followup-slip" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    Preview PDF
                  </Button>
                </div>
              ) : null}
              {finishWizardSaved?.type === "followup" ? (
                <div className="rounded-lg border overflow-hidden">
                  <div className="border-b bg-background px-3 py-1.5 text-xs font-medium">Follow-up slip preview</div>
                  <iframe title="Follow-up slip preview (review)" className="h-[420px] w-full border-0" srcDoc={followUpPreviewHtml} sandbox="" />
                </div>
              ) : null}
              {finishWizardSaved?.type === "hospital-transfer" ? (
                <div className="rounded-lg border overflow-hidden">
                  <div className="border-b bg-background px-3 py-1.5 text-xs font-medium">Hospital transfer slip preview</div>
                  <iframe title="Hospital transfer slip preview (review)" className="h-[420px] w-full border-0" srcDoc={hospitalTransferPreviewHtml} sandbox="" />
                </div>
              ) : null}
            </div>
          )}

          <DialogFooter className="shrink-0 gap-2 border-t border-border/60 pt-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                if (finishWizardStep === 2) setFinishWizardStep(1)
                else setFinishWizardOpen(false)
              }}
              disabled={finishWizardSaving || finishSubmitting}
            >
              {finishWizardStep === 2 ? "Back" : "Cancel"}
            </Button>
            {finishWizardStep === 1 ? (
              <Button type="button" className="btn-gradient" disabled={finishWizardSaving} onClick={() => void saveFinishWizardChoiceAndContinue()}>
                {finishWizardSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Continue
              </Button>
            ) : (
              <Button type="button" className="btn-gradient gap-1" disabled={finishSubmitting} onClick={() => void confirmFinishAndCloseVisit()}>
                {finishSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Finish examination
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={transferOpen} onOpenChange={setTransferOpen}>
        <DialogContent
          className={
            "flex max-h-[90vh] w-full max-w-lg flex-col gap-3 overflow-y-auto p-6 sm:max-w-lg"
          }
        >
          <DialogHeader className="shrink-0 space-y-1">
            <DialogTitle>Transfer clinic</DialogTitle>
            <DialogDescription className="sr-only">
              Move the patient to another clinic room. From room reflects the nurse check-in slot for today.
            </DialogDescription>
          </DialogHeader>
          <div
            className={
              "min-h-0 flex-1"
            }
          >
            <div
              className={
                "space-y-4 py-1"
              }
            >
            <div className="grid gap-2">
              <Label htmlFor="tr-reason">
                Reason <span className="text-red-500">*</span>
              </Label>
              <Textarea
                id="tr-reason"
                value={transferReason}
                onChange={(e) => setTransferReason(e.target.value)}
                onInput={(e) => setTransferReason((e.target as HTMLTextAreaElement).value)}
                onBlur={(e) => setTransferReason(e.target.value)}
                rows={2}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="tr-note">Clinical note (optional)</Label>
              <Textarea
                id="tr-note"
                value={transferNote}
                onChange={(e) => setTransferNote(e.target.value)}
                onInput={(e) => setTransferNote((e.target as HTMLTextAreaElement).value)}
                onBlur={(e) => setTransferNote(e.target.value)}
                rows={2}
              />
            </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label>
                    From room <span className="text-red-500">*</span>
                  </Label>
                  {visitLoading ? (
                    <p className="text-sm text-muted-foreground">Loading visit…</p>
                  ) : checkInRoom ? (
                    <>
                      <div
                        className="rounded-lg border bg-muted/40 px-3 py-2 text-sm text-foreground"
                        aria-readonly="true"
                      >
                        {checkInRoom.name}
                      </div>
                      {fromRoomDepartmentLabel ? (
                        <p className="text-sm text-slate-600 rounded-md border border-cyan-100 bg-cyan-50/60 px-3 py-2">
                          <span className="text-slate-500">Department: </span>
                          <span className="font-medium text-slate-800">{fromRoomDepartmentLabel}</span>
                        </p>
                      ) : null}
                    </>
                  ) : (
                    <div className="rounded-lg border border-amber-200 bg-amber-50/80 px-3 py-2 text-sm text-amber-950">
                      No check-in room on file for today. Clinic transfer needs the room from the nurse check-in slot.
                    </div>
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
            </div>
          </div>
          <DialogFooter className="shrink-0 gap-2 border-t border-border/60 pt-3">
            <Button type="button" variant="outline" onClick={() => setTransferOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              className="btn-gradient gap-1"
              disabled={transferSubmitting || !checkInRoom}
              title={!checkInRoom ? "Check-in room is required for a clinic transfer" : undefined}
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
              onClick={() => {
                setTransferKind("clinic")
                void loadVisitState().finally(() => setTransferOpen(true))
              }}
              disabled={!emrSessionValue.mutationsAllowed}
              title={!emrSessionValue.mutationsAllowed ? "Available after nurse check-in" : undefined}
            >
              <ArrowRightLeft className="h-4 w-4" />
              Transfer clinic
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
          {tab === "history" && <DoctorPatientHistoryPage />}
        </div>
      </div>
      <PauseableCornerToastPortal
        toast={toast}
        isExiting={isExiting}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
      />
    </DoctorLayout>
    </EmrSessionProvider>
  )
}
export { DoctorLayout }
