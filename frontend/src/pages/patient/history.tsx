"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { PatientLayout } from "@/components/patient-layout"
import { cn } from "@/lib/utils"
import { generatePrescriptionPdfBlob } from "@/lib/export-prescription-pdf"
import { generateBloodTestPdfBlob } from "@/lib/export-blood-test-pdf"
import { generateTreatmentFollowupPdfBlob } from "@/lib/export-treatment-followup-pdf"
import { generateHospitalTransferPdfBlob } from "@/lib/export-hospital-transfer-pdf"
import { generateSurgeryPdfBlob } from "@/lib/export-surgery-pdf"
import { generateHealthInfoTrackingPdfBlob } from "@/lib/export-health-info-tracking-pdf"
import { generateFollowUpReexamPdfBlob } from "@/lib/export-follow-up-reexam-pdf"
import type { FollowUpReexamSlipInputs } from "@/lib/follow-up-reexam-slip-html"
import { mergePdfBlobs } from "@/lib/merge-pdf-blobs"
import { signingLineFromIso, stampPdfWithExportFooter } from "@/lib/pdf-export-stamp"
import { profileService, type PatientProfile } from "@/services/profile-service"
import { healthInfoService } from "@/services/health-info-service"
import type { PatientDetail } from "@/services/doctor-service"
import {
  Activity,
  AlertCircle,
  Building2,
  Calendar,
  Download,
  ExternalLink,
  FileDown,
  Loader2,
  Microscope,
  Pill,
  Printer,
  Scissors,
  Stethoscope,
  User,
} from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { TooltipProvider } from "@/components/ui/tooltip"
import { RegimenDocumentPreviewTooltip } from "@/components/regimen-document-preview-tooltip"
import {
  buildHealthTrackingSlipTooltipSummary,
  buildHospitalTransferTooltipSummary,
} from "@/lib/history-regimen-tooltip-text"
import { useSearchParams } from "react-router-dom"
import {
  appointmentService,
  type PatientDashboardSummary,
  type PatientMedicalRegimen,
  type PatientMedicalVisit,
  type PatientSymptomLog,
} from "@/services/appointment-service"

const API_ORIGIN = import.meta.env.VITE_API_BASE_URL || "http://localhost:3000"

function formatDateTime(value: string | null | undefined, locale = "en-US") {
  if (!value) return "—"
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return String(value)
  return d.toLocaleString(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  })
}

function resolveAttachmentUrl(url: string | null) {
  if (!url) return null
  const u = String(url).trim()
  if (!u) return null
  if (u.startsWith("http://") || u.startsWith("https://")) return u
  return `${API_ORIGIN}${u.startsWith("/") ? "" : "/"}${u}`
}

function visitTitle(v: PatientMedicalVisit & { regimenId?: number }) {
  if (v.interpretation?.trim()) return v.interpretation.trim()
  if (v.icd10?.trim()) return `Diagnosis ${v.icd10}`
  if (v.department?.trim()) return v.department.trim()
  if (v.regimenId != null) return `Encounter #${v.regimenId}`
  return `Visit #${v.treatmentId}`
}

function rxStatusLabel(status: string) {
  const s = String(status || "").toLowerCase()
  if (s === "signed") return { label: "Signed", variant: "default" as const }
  if (s === "voided") return { label: "Voided", variant: "secondary" as const }
  return { label: "Draft", variant: "outline" as const }
}

function computeAgeFromDob(dob?: string): number | null {
  if (!dob) return null
  const birth = new Date(dob)
  if (Number.isNaN(birth.getTime())) return null
  const today = new Date()
  let age = today.getFullYear() - birth.getFullYear()
  const m = today.getMonth() - birth.getMonth()
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age -= 1
  return age
}

function patientDisplayName(profile: PatientProfile): string {
  const n = `${profile.lastName || ""} ${profile.firstName || ""}`.trim()
  return n || profile.fullName || "Patient"
}

async function buildPatientDetailForPdf(dashboard: PatientDashboardSummary | null): Promise<PatientDetail> {
  const userRaw = localStorage.getItem("user")
  if (!userRaw) throw new Error("Not signed in")
  const user = JSON.parse(userRaw) as { id: number }
  const profile = await profileService.getProfile(user.id)
  const health = await healthInfoService.getHealthInfo()
  const name = patientDisplayName(profile)
  const diag = dashboard?.summary?.currentDiagnosis
  const bmiVal =
    health.success && health.healthInfo?.bmi != null && Number.isFinite(Number(health.healthInfo.bmi))
      ? Number(health.healthInfo.bmi)
      : null

  return {
    id: 0,
    username: name.replace(/\s+/g, ".").toLowerCase() || "patient",
    email: profile.email || "",
    firstName: profile.firstName || "",
    lastName: profile.lastName || "",
    age: computeAgeFromDob(profile.dateOfBirth),
    gender: profile.sex || null,
    createdAt: "",
    latestDiagnosis: diag
      ? { icd10: diag.icd10, interpretation: diag.interpretation, department: "" }
      : null,
    latestVisit: null,
    doctor: null,
    bmi: bmiVal,
    inDepartment: null,
    healthInsuranceId: profile.insuranceId != null ? String(profile.insuranceId) : null,
    bloodType:
      health.success && health.healthInfo?.bloodType ? String(health.healthInfo.bloodType) : null,
  }
}

function labRowKey(lab: { regimenId: number; treatmentId: number; id: number }) {
  return `${lab.regimenId}-${lab.treatmentId}-${lab.id}`
}

function exportDateStamp() {
  return new Date().toISOString().slice(0, 10)
}

function formatVitalsNoteForVisitExport(v: PatientMedicalRegimen): string {
  const vit = v.vitals
  if (!vit) return ""
  const lines: string[] = ["Vitals (closest to visit window):"]
  if (vit.heightCm != null) lines.push(`Height: ${vit.heightCm} cm`)
  if (vit.weightKg != null) lines.push(`Weight: ${vit.weightKg} kg`)
  if (vit.bmi != null) lines.push(`BMI: ${vit.bmi}`)
  if (vit.bloodPressureSys != null && vit.bloodPressureDia != null) {
    lines.push(`BP: ${vit.bloodPressureSys}/${vit.bloodPressureDia}`)
  }
  if (vit.heartRate != null) lines.push(`HR: ${vit.heartRate} bpm`)
  if (vit.respiratoryRate != null) lines.push(`RR: ${vit.respiratoryRate}`)
  if (vit.temperature != null) lines.push(`Temp: ${vit.temperature}°C`)
  if (vit.spo2 != null) lines.push(`SpO₂: ${vit.spo2}%`)
  if (vit.symptomsNote?.trim()) lines.push(`Note: ${vit.symptomsNote.trim()}`)
  return lines.length > 1 ? lines.join("\n") : ""
}

function mapPrescriptionExportSignature(
  raw: string | undefined
): "draft" | "signed" | "voided" {
  const s = String(raw || "").toLowerCase()
  if (s === "voided") return "voided"
  if (s === "draft") return "draft"
  return "signed"
}

async function buildPatientDetailForVisitCard(v: PatientMedicalRegimen): Promise<PatientDetail> {
  const userRaw = localStorage.getItem("user")
  if (!userRaw) throw new Error("Not signed in")
  const user = JSON.parse(userRaw) as { id: number }
  const profile = await profileService.getProfile(user.id)
  const health = await healthInfoService.getHealthInfo()
  const name = patientDisplayName(profile)
  const bmiVal =
    health.success && health.healthInfo?.bmi != null && Number.isFinite(Number(health.healthInfo.bmi))
      ? Number(health.healthInfo.bmi)
      : null

  return {
    id: 0,
    username: name.replace(/\s+/g, ".").toLowerCase() || "patient",
    email: profile.email || "",
    firstName: profile.firstName || "",
    lastName: profile.lastName || "",
    age: computeAgeFromDob(profile.dateOfBirth),
    gender: profile.sex || null,
    createdAt: "",
    latestDiagnosis: {
      icd10: v.icd10 || "",
      interpretation: v.interpretation || "",
      department: v.department || "",
    },
    latestVisit: v.visitAt || null,
    doctor: v.doctorName || null,
    bmi: bmiVal,
    inDepartment: null,
    healthInsuranceId: profile.insuranceId != null ? String(profile.insuranceId) : null,
    bloodType:
      health.success && health.healthInfo?.bloodType ? String(health.healthInfo.bloodType) : null,
  }
}

export default function PatientHistoryPage() {
  const [searchParams] = useSearchParams()
  const tab = searchParams.get("tab")

  const [visitsLoading, setVisitsLoading] = useState(true)
  const [visitsError, setVisitsError] = useState<string | null>(null)
  const [visits, setVisits] = useState<PatientMedicalRegimen[]>([])

  const [symptomLoading, setSymptomLoading] = useState(true)
  const [symptomLogs, setSymptomLogs] = useState<PatientSymptomLog[]>([])

  const [rxLoading, setRxLoading] = useState(true)
  const [rxDashboard, setRxDashboard] = useState<PatientDashboardSummary | null>(null)

  const [pdfPreviewOpen, setPdfPreviewOpen] = useState(false)
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null)
  const [pdfPreviewFilename, setPdfPreviewFilename] = useState("")
  const [pdfPreviewTitle, setPdfPreviewTitle] = useState("PDF preview")
  const pdfBlobUrlRef = useRef<string | null>(null)
  const [exportingRxPdf, setExportingRxPdf] = useState(false)
  const [exportingLabPdf, setExportingLabPdf] = useState(false)
  /** Which visit card is currently building the merged PDF (null = idle). */
  const [exportingRegimenId, setExportingRegimenId] = useState<number | null>(null)
  const [patientProfile, setPatientProfile] = useState<PatientProfile | null>(null)
  const [exportingHospitalKey, setExportingHospitalKey] = useState<string | null>(null)
  const [selectedLabKey, setSelectedLabKey] = useState<string | null>(null)

  const releasePdfBlobUrl = useCallback((next: string | null) => {
    if (pdfBlobUrlRef.current && pdfBlobUrlRef.current !== next) {
      URL.revokeObjectURL(pdfBlobUrlRef.current)
    }
    pdfBlobUrlRef.current = next
    setPdfPreviewUrl(next)
  }, [])

  const closePdfPreview = useCallback(() => {
    setPdfPreviewOpen(false)
    releasePdfBlobUrl(null)
    setPdfPreviewFilename("")
  }, [releasePdfBlobUrl])

  useEffect(() => {
    return () => {
      if (pdfBlobUrlRef.current) {
        URL.revokeObjectURL(pdfBlobUrlRef.current)
        pdfBlobUrlRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const userRaw = localStorage.getItem("user")
        if (userRaw) {
          const user = JSON.parse(userRaw) as { id: number }
          const p = await profileService.getProfile(user.id)
          if (!cancelled) setPatientProfile(p)
        }
      } catch {
        if (!cancelled) setPatientProfile(null)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      setVisitsLoading(true)
      setVisitsError(null)
      try {
        const data = await appointmentService.getPatientMedicalRegimens()
        if (!cancelled) setVisits(data)
      } catch (e) {
        console.error("Load historyvisits failed:", e)
        if (!cancelled) {
          setVisitsError("Could not load visit history. Please try again.")
          setVisits([])
        }
      } finally {
        if (!cancelled) setVisitsLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      setSymptomLoading(true)
      try {
        const logs = await appointmentService.getPatientSymptomLogs()
        if (!cancelled) setSymptomLogs(logs)
      } catch (e) {
        console.error("Load symptom logs failed:", e)
        if (!cancelled) setSymptomLogs([])
      } finally {
        if (!cancelled) setSymptomLoading(false)
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
        const data = await appointmentService.getPatientDashboardSummary()
        if (!cancelled) setRxDashboard(data)
      } catch (e) {
        console.error("Load prescriptions for records failed:", e)
      } finally {
        if (!cancelled) setRxLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const prescriptionGroups = rxDashboard?.activePrescriptionsList ?? []

  const flatLabRows = useMemo(() => {
    const rows: Array<
      PatientMedicalVisit["labTests"][0] & { visitAt: string; treatmentId: number; regimenId: number }
    > = []
    for (const v of visits) {
      for (const lab of v.labTests) {
        rows.push({ ...lab, visitAt: v.visitAt, treatmentId: v.treatmentId, regimenId: v.regimenId })
      }
    }
    rows.sort((a, b) => new Date(b.testAt).getTime() - new Date(a.testAt).getTime())
    return rows
  }, [visits])

  useEffect(() => {
    if (flatLabRows.length === 0) {
      setSelectedLabKey(null)
      return
    }
    setSelectedLabKey((prev) => {
      if (prev && flatLabRows.some((r) => labRowKey(r) === prev)) return prev
      return labRowKey(flatLabRows[0])
    })
  }, [flatLabRows])

  const selectedLabRow = useMemo(
    () => flatLabRows.find((r) => labRowKey(r) === selectedLabKey) ?? null,
    [flatLabRows, selectedLabKey]
  )

  const handleSavePdfFromPreview = useCallback(async () => {
    if (!pdfPreviewUrl || !pdfPreviewFilename) return
    try {
      const res = await fetch(pdfPreviewUrl)
      const raw = await res.blob()
      const stamped = await stampPdfWithExportFooter(raw, new Date())
      const url = URL.createObjectURL(stamped)
      const a = document.createElement("a")
      a.href = url
      a.download = pdfPreviewFilename
      a.rel = "noopener"
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (e) {
      console.error(e)
      window.alert(e instanceof Error ? e.message : "Download failed")
    }
  }, [pdfPreviewUrl, pdfPreviewFilename])

  const handlePrintPdfFromPreview = useCallback(async () => {
    if (!pdfPreviewUrl) return
    let stampedUrl: string | null = null
    try {
      const res = await fetch(pdfPreviewUrl)
      const raw = await res.blob()
      const stamped = await stampPdfWithExportFooter(raw, new Date())
      stampedUrl = URL.createObjectURL(stamped)
      const iframe = document.createElement("iframe")
      iframe.style.position = "fixed"
      iframe.style.right = "0"
      iframe.style.bottom = "0"
      iframe.style.width = "0"
      iframe.style.height = "0"
      iframe.style.border = "0"
      iframe.src = stampedUrl
      document.body.appendChild(iframe)
      iframe.onload = () => {
        try {
          iframe.contentWindow?.focus()
          iframe.contentWindow?.print()
        } finally {
          setTimeout(() => {
            if (iframe.parentNode) iframe.parentNode.removeChild(iframe)
            if (stampedUrl) URL.revokeObjectURL(stampedUrl)
          }, 500)
        }
      }
    } catch (e) {
      console.error(e)
      if (stampedUrl) URL.revokeObjectURL(stampedUrl)
      window.alert(e instanceof Error ? e.message : "Print failed")
    }
  }, [pdfPreviewUrl])

  const handleExportPrescriptionsPdf = useCallback(async () => {
    if (prescriptionGroups.length === 0) return
    setExportingRxPdf(true)
    try {
      const patient = await buildPatientDetailForPdf(rxDashboard)
      const blobs: Blob[] = []
      for (const rx of prescriptionGroups) {
        const doctorLabel = (rx.doctorName || "").trim() || "—"
        const { blob } = await generatePrescriptionPdfBlob({
          patient,
          medications: rx.medications.map((med) => ({
            name: med.name,
            quantity: med.quantity || "—",
            unit: "tablet",
            duration: med.duration?.trim() || "7",
            usage: med.frequency || "—",
            note: "",
          })),
          prescriptionDate: formatDateTime(rx.prescribedAt),
          doctorName: doctorLabel,
          signatureStatus: "signed",
          signingTimeDisplay: signingLineFromIso(rx.prescribedAt),
        })
        blobs.push(blob)
      }
      const merged = blobs.length === 1 ? blobs[0] : await mergePdfBlobs(blobs)
      const filename = `prescriptions-${exportDateStamp()}.pdf`
      const url = URL.createObjectURL(merged)
      setPdfPreviewFilename(filename)
      setPdfPreviewTitle("Prescription preview (PDF)")
      releasePdfBlobUrl(url)
      setPdfPreviewOpen(true)
    } catch (e) {
      console.error(e)
      window.alert(e instanceof Error ? e.message : "Failed to export prescriptions")
    } finally {
      setExportingRxPdf(false)
    }
  }, [prescriptionGroups, rxDashboard, releasePdfBlobUrl])

  const handleExportLabPdf = useCallback(async () => {
    if (!selectedLabRow) return
    setExportingLabPdf(true)
    try {
      const userRaw = localStorage.getItem("user")
      if (!userRaw) throw new Error("Not signed in")
      const user = JSON.parse(userRaw) as { id: number }
      const profile = await profileService.getProfile(user.id)
      const name = patientDisplayName(profile)
      const age = computeAgeFromDob(profile.dateOfBirth)
      const visit =
        visits.find((v) => v.regimenId === selectedLabRow.regimenId) ??
        visits.find((v) => v.treatmentId === selectedLabRow.treatmentId)
      let diagnosis = "—"
      if (visit?.icd10 || visit?.interpretation) {
        diagnosis = [visit.icd10, visit.interpretation].filter(Boolean).join(" — ")
      } else if (rxDashboard?.summary?.currentDiagnosis) {
        const d = rxDashboard.summary.currentDiagnosis
        diagnosis = [d.icd10, d.interpretation].filter(Boolean).join(" — ") || "—"
      }

      const details = await appointmentService.getPatientLabTestDetails(selectedLabRow.id)
      const { blob, filename } = await generateBloodTestPdfBlob({
        patientName: name,
        age: age != null ? String(age) : "—",
        gender: profile.sex,
        department: visit?.department || "Laboratory",
        diagnosis,
        testDateLabel: formatDateTime(selectedLabRow.testAt),
        details,
        filename: `lab-${selectedLabRow.id}-${exportDateStamp()}.pdf`,
        signingTimeDisplay: signingLineFromIso(selectedLabRow.testAt),
      })
      const url = URL.createObjectURL(blob)
      setPdfPreviewFilename(filename)
      setPdfPreviewTitle("Lab result preview (PDF)")
      releasePdfBlobUrl(url)
      setPdfPreviewOpen(true)
    } catch (e) {
      console.error(e)
      window.alert(e instanceof Error ? e.message : "Failed to export lab PDF")
    } finally {
      setExportingLabPdf(false)
    }
  }, [selectedLabRow, visits, rxDashboard, releasePdfBlobUrl])

  const handleHospitalTransferPdf = useCallback(
    async (v: PatientMedicalRegimen, ht: PatientMedicalRegimen["hospitalTransfers"][number]) => {
      const key = `${v.regimenId}-${ht.orderId}`
      setExportingHospitalKey(key)
      try {
        let profile = patientProfile
        if (!profile) {
          const userRaw = localStorage.getItem("user")
          if (!userRaw) throw new Error("Not signed in")
          const user = JSON.parse(userRaw) as { id: number }
          profile = await profileService.getProfile(user.id)
        }
        const name = patientDisplayName(profile)
        const { blob, filename } = await generateHospitalTransferPdfBlob({
          patientName: name,
          patientDob: profile.dateOfBirth,
          patientSex: profile.sex,
          insuranceId: profile.insuranceId != null ? String(profile.insuranceId) : undefined,
          insuranceExpiry: profile.insuranceExpiry,
          destinationHospital: ht.toHospitalName,
          destinationRefId: ht.toHospitalId,
          reason: ht.reason,
          note: ht.note,
          transport: ht.transport,
          transferAt: formatDateTime(ht.transferAt),
          doctorName: v.doctorName,
          facilityName: "TechCare",
          icd10: v.icd10,
          diagnosis: v.interpretation,
          formPayload: ht.formPayload,
          filename: `phieu-chuyen-vien-regimen-${v.regimenId}-order-${ht.orderId}.pdf`,
          signingTimeDisplay: signingLineFromIso(ht.transferAt),
        })
        const url = URL.createObjectURL(blob)
        setPdfPreviewFilename(filename)
        setPdfPreviewTitle("Hospital transfer (PDF)")
        releasePdfBlobUrl(url)
        setPdfPreviewOpen(true)
      } catch (e) {
        console.error(e)
        window.alert(e instanceof Error ? e.message : "Failed to generate PDF")
      } finally {
        setExportingHospitalKey(null)
      }
    },
    [patientProfile, releasePdfBlobUrl]
  )

  const handleExportVisitMergedPdf = useCallback(async (v: PatientMedicalRegimen) => {
    setExportingRegimenId(v.regimenId)
    try {
      const patient = await buildPatientDetailForVisitCard(v)
      const name = `${patient.lastName || ""} ${patient.firstName || ""}`.trim() || patient.username
      const ageStr = patient.age != null ? String(patient.age) : "—"
      const latestDiagnosisText = [v.icd10, v.interpretation].filter(Boolean).join(" — ") || "—"
      const vitNote = formatVitalsNoteForVisitExport(v)

      const blobs: Blob[] = []

      const hasEncounterSummary =
        Boolean(v.complaint?.trim()) ||
        Boolean(v.icd10?.trim()) ||
        Boolean(v.interpretation?.trim()) ||
        vitNote.trim().length > 0

      if (hasEncounterSummary) {
        const { blob } = await generateTreatmentFollowupPdfBlob({
          patientName: name,
          age: ageStr,
          gender: patient.gender,
          department: v.department || "—",
          diagnosisIcd10: v.icd10 || "—",
          diagnosisInterpretation: v.interpretation || "—",
          complaintSymptoms: v.complaint?.trim() || "—",
          doctorName: v.doctorName?.trim() || "—",
          note: vitNote.trim() ? vitNote : "—",
          dateLabel: formatDateTime(v.visitAt),
          filename: `visit-${v.regimenId}-encounter-summary.pdf`,
          signingTimeDisplay: signingLineFromIso(v.visitAt),
        })
        blobs.push(blob)
      }

      for (const item of v.followUpReexamSlips ?? []) {
        const raw = item.slip
        if (!raw || typeof raw !== "object") continue
        const slip = { ...(raw as Record<string, unknown>) } as unknown as FollowUpReexamSlipInputs
        if (!Array.isArray(slip.insuranceCardParts)) {
          ;(slip as { insuranceCardParts: string[] }).insuranceCardParts = []
        }
        const { blob } = await generateFollowUpReexamPdfBlob({
          ...slip,
          signingTimeDisplay: signingLineFromIso(item.createdAt),
          filename: `follow-up-reexam-regimen-${v.regimenId}-order-${item.orderId}.pdf`,
        })
        blobs.push(blob)
      }

      const rxDoctor = v.doctorName?.trim() || "—"
      for (const rx of v.prescriptions) {
        const { blob } = await generatePrescriptionPdfBlob({
          patient,
          medications: rx.medications.map((med) => ({
            name: med.name,
            quantity: med.quantity || "—",
            unit: med.unit || "tablet",
            duration: med.duration?.trim() || "7",
            usage: med.frequency || "—",
            note: "",
          })),
          prescriptionDate: formatDateTime(rx.prescribedAt),
          doctorName: rxDoctor,
          signatureStatus: mapPrescriptionExportSignature(rx.signatureStatus),
          signingTimeDisplay: signingLineFromIso(rx.prescribedAt),
        })
        blobs.push(blob)
      }

      for (const s of v.surgeries) {
        const { blob } = await generateSurgeryPdfBlob({
          patientLabel: name,
          patientAge: patient.age,
          patientGender: patient.gender,
          healthInsuranceId: patient.healthInsuranceId ?? null,
          latestDiagnosisText,
          surgeon: s.surgeon || "—",
          type: s.surgeryType || "—",
          urgency: s.urgency || "—",
          start: s.start,
          end: s.end,
          result: s.result || "—",
          note: s.note || "",
          filename: `surgery-${s.id}.pdf`,
          signingTimeDisplay: signingLineFromIso(s.start) ?? signingLineFromIso(v.visitAt),
        })
        blobs.push(blob)
      }

      for (const lab of v.labTests) {
        const details = await appointmentService.getPatientLabTestDetails(lab.id)
        const { blob } = await generateBloodTestPdfBlob({
          patientName: name,
          age: ageStr,
          gender: patient.gender,
          department: v.department || "Laboratory",
          diagnosis: latestDiagnosisText,
          testDateLabel: formatDateTime(lab.testAt),
          details,
          filename: `lab-${lab.id}-${exportDateStamp()}.pdf`,
          signingTimeDisplay: signingLineFromIso(lab.testAt),
        })
        blobs.push(blob)
      }

      let phProfile = patientProfile
      if (!phProfile) {
        const ur = localStorage.getItem("user")
        if (ur) {
          const u = JSON.parse(ur) as { id: number }
          phProfile = await profileService.getProfile(u.id)
        }
      }
      for (const ht of v.hospitalTransfers) {
        const { blob } = await generateHospitalTransferPdfBlob({
          patientName: name,
          patientDob: phProfile?.dateOfBirth,
          patientSex: phProfile?.sex,
          insuranceId: phProfile?.insuranceId != null ? String(phProfile.insuranceId) : undefined,
          insuranceExpiry: phProfile?.insuranceExpiry,
          destinationHospital: ht.toHospitalName,
          destinationRefId: ht.toHospitalId,
          reason: ht.reason,
          note: ht.note,
          transport: ht.transport,
          transferAt: formatDateTime(ht.transferAt),
          doctorName: v.doctorName,
          facilityName: "TechCare",
          icd10: v.icd10,
          diagnosis: v.interpretation,
          formPayload: ht.formPayload,
          filename: `phieu-chuyen-vien-regimen-${v.regimenId}-order-${ht.orderId}.pdf`,
          signingTimeDisplay: signingLineFromIso(ht.transferAt),
        })
        blobs.push(blob)
      }

      for (const slip of v.healthTrackingSlips ?? []) {
        const { blob } = await generateHealthInfoTrackingPdfBlob({
          patientName: name,
          age: ageStr,
          gender: patient.gender === "M" ? "Male" : patient.gender === "F" ? "Female" : "",
          diagnosis: latestDiagnosisText,
          rows: (slip.rows || []).map((r) => ({
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
        blobs.push(blob)
      }

      for (const slip of v.healthTrackingSlips ?? []) {
        const { blob } = await generateHealthInfoTrackingPdfBlob({
          patientName: name,
          age: ageStr,
          gender: patient.gender === "M" ? "Male" : patient.gender === "F" ? "Female" : "",
          diagnosis: latestDiagnosisText,
          rows: (slip.rows || []).map((r) => ({
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
        })
        blobs.push(blob)
      }

      if (blobs.length === 0) {
        window.alert("This visit has no documents to export yet.")
        return
      }

      const merged = await mergePdfBlobs(blobs)
      const filename = `visit-encounter-${v.regimenId}-${exportDateStamp()}.pdf`
      const url = URL.createObjectURL(merged)
      setPdfPreviewFilename(filename)
      setPdfPreviewTitle("Visit records preview (merged PDF)")
      releasePdfBlobUrl(url)
      setPdfPreviewOpen(true)
    } catch (e) {
      console.error(e)
      window.alert(e instanceof Error ? e.message : "Export failed")
    } finally {
      setExportingRegimenId(null)
    }
  }, [releasePdfBlobUrl, patientProfile])

  return (
    <PatientLayout>
      <Dialog
        open={pdfPreviewOpen}
        onOpenChange={(open) => {
          if (!open) closePdfPreview()
        }}
      >
        <DialogContent className="flex max-h-[90vh] w-[min(920px,96vw)] max-w-none flex-col gap-3 p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>{pdfPreviewTitle}</DialogTitle>
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
            <Button type="button" variant="outline" onClick={handlePrintPdfFromPreview} disabled={!pdfPreviewUrl}>
              <Printer className="mr-2 h-4 w-4" />
              Print
            </Button>
            <Button type="button" className="btn-gradient" onClick={handleSavePdfFromPreview} disabled={!pdfPreviewUrl}>
              <FileDown className="mr-2 h-4 w-4" />
              Save / Download
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="space-y-6">
        <Tabs defaultValue={tab || "visits"} className="space-y-4">
          <TabsList className="flex flex-wrap h-auto gap-1">
            <TabsTrigger value="visits">History visits</TabsTrigger>
            <TabsTrigger value="prescriptions">Prescriptions</TabsTrigger>
            <TabsTrigger value="lab-results">Lab results</TabsTrigger>
            <TabsTrigger value="symptom-checker">Symptom checker</TabsTrigger>
          </TabsList>

          <TabsContent value="visits" className="space-y-4">
            <TooltipProvider delayDuration={200}>
            {visitsLoading ? (
              <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span>Loading visit history…</span>
              </div>
            ) : visitsError ? (
              <Card className="border-destructive/40">
                <CardContent className="py-8 text-center text-sm text-destructive">{visitsError}</CardContent>
              </Card>
            ) : visits.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center text-sm text-muted-foreground">
                  No completed visits yet. When your doctor uses &quot;Finish examination&quot;, that encounter appears here
                  as one card.
                </CardContent>
              </Card>
            ) : (
              visits.map((v) => {
                const isThisExporting = exportingRegimenId === v.regimenId
                const exportBusy = exportingRegimenId !== null
                const hospitalTransfers = v.hospitalTransfers ?? []
                const healthTrackingSlips = v.healthTrackingSlips ?? []
                return (
                <Card key={v.regimenId} className="overflow-hidden border-border/80 shadow-sm">
                  <CardHeader className="bg-gradient-to-r from-sky-50/90 to-transparent dark:from-sky-950/30">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="space-y-1 min-w-0">
                        <CardTitle className="flex items-start gap-2 text-lg sm:text-xl">
                          <Stethoscope className="mt-0.5 h-5 w-5 shrink-0 text-sky-600" />
                          <span className="leading-snug">{visitTitle(v)}</span>
                        </CardTitle>
                        <CardDescription className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs sm:text-sm">
                          <span className="inline-flex items-center gap-1">
                            <Calendar className="h-3.5 w-3.5" />
                            {formatDateTime(v.visitAt)}
                            {v.visitEnd ? (
                              <span className="text-muted-foreground">
                                {" "}
                                – ended {formatDateTime(v.visitEnd)}
                              </span>
                            ) : null}
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <User className="h-3.5 w-3.5" />
                            {v.doctorName || "—"}
                          </span>
                          {v.roomName ? (
                            <span className="text-muted-foreground">Room: {v.roomName}</span>
                          ) : null}
                          {v.department ? (
                            <Badge variant="secondary" className="font-normal">
                              {v.department}
                            </Badge>
                          ) : null}
                        </CardDescription>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="shrink-0 gap-2"
                        disabled={visitsLoading || exportBusy}
                        onClick={() => void handleExportVisitMergedPdf(v)}
                      >
                        {isThisExporting ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Download className="h-4 w-4" />
                        )}
                        Export records
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-6 pt-6">
                    <section className="space-y-2">
                      <h3 className="text-sm font-semibold text-foreground">Diagnosis & chief complaint</h3>
                      {v.complaint ? (
                        <p className="text-sm text-muted-foreground whitespace-pre-wrap">{v.complaint}</p>
                      ) : (
                        <p className="text-sm text-muted-foreground">—</p>
                      )}
                      <div className="flex flex-wrap gap-2 pt-1">
                        {v.icd10 ? (
                          <Badge variant="outline" className="font-mono text-xs">
                            ICD-10: {v.icd10}
                          </Badge>
                        ) : null}
                      </div>
                    </section>

                    {v.vitals ? (
                      <>
                        <Separator />
                        <section className="space-y-3">
                          <h3 className="flex items-center gap-2 text-sm font-semibold">
                            <Activity className="h-4 w-4 text-emerald-600" />
                            Vitals & notes
                          </h3>
                          <p className="text-xs text-muted-foreground">
                            Recorded closest to visit time: {formatDateTime(v.vitals.recordedAt)}
                          </p>
                          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                            <VitalItem label="Height" value={v.vitals.heightCm ? `${v.vitals.heightCm} cm` : "—"} />
                            <VitalItem label="Weight" value={v.vitals.weightKg ? `${v.vitals.weightKg} kg` : "—"} />
                            <VitalItem label="BMI" value={v.vitals.bmi != null ? String(v.vitals.bmi) : "—"} />
                            <VitalItem
                              label="Blood pressure"
                              value={
                                v.vitals.bloodPressureSys != null && v.vitals.bloodPressureDia != null
                                  ? `${v.vitals.bloodPressureSys}/${v.vitals.bloodPressureDia}`
                                  : "—"
                              }
                            />
                            <VitalItem label="Heart rate" value={v.vitals.heartRate != null ? `${v.vitals.heartRate} bpm` : "—"} />
                            <VitalItem label="Resp. rate" value={v.vitals.respiratoryRate != null ? `${v.vitals.respiratoryRate}` : "—"} />
                            <VitalItem label="Temperature" value={v.vitals.temperature != null ? `${v.vitals.temperature}°C` : "—"} />
                            <VitalItem label="SpO₂" value={v.vitals.spo2 != null ? `${v.vitals.spo2}%` : "—"} />
                          </div>
                          {v.vitals.symptomsNote ? (
                            <p className="text-xs text-muted-foreground whitespace-pre-wrap border rounded-md p-2 bg-muted/30">
                              {v.vitals.symptomsNote}
                            </p>
                          ) : null}
                        </section>
                      </>
                    ) : null}

                    {v.prescriptions.length > 0 ? (
                      <>
                        <Separator />
                        <section className="space-y-3">
                          <h3 className="flex items-center gap-2 text-sm font-semibold">
                            <Pill className="h-4 w-4 text-violet-600" />
                            Prescriptions (this visit)
                          </h3>
                          <div className="space-y-4">
                            {v.prescriptions.map((rx) => {
                              const st = rxStatusLabel(rx.signatureStatus)
                              return (
                                <div key={rx.id} className="rounded-lg border bg-card/50 p-3 space-y-2">
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <span className="text-xs font-medium text-muted-foreground">
                                      {formatDateTime(rx.prescribedAt)}
                                    </span>
                                    <Badge variant={st.variant} className="text-[10px] uppercase tracking-wide">
                                      {st.label}
                                    </Badge>
                                  </div>
                                  {rx.medications.length === 0 ? (
                                    <p className="text-xs text-muted-foreground">No medications on this order.</p>
                                  ) : (
                                    <ul className="space-y-2">
                                      {rx.medications.map((med) => (
                                        <li
                                          key={med.id}
                                          className="flex flex-col gap-0.5 rounded-md bg-muted/40 px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between"
                                        >
                                          <span className="font-medium">{med.name}</span>
                                          <span className="text-xs text-muted-foreground">
                                            {med.frequency || "—"}
                                            {med.quantity ? ` · Qty: ${med.quantity}` : ""}
                                            {med.unit ? ` ${med.unit}` : ""}
                                            {med.duration ? ` · ${med.duration}d` : ""}
                                          </span>
                                        </li>
                                      ))}
                                    </ul>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        </section>
                      </>
                    ) : null}

                    {v.labTests.length > 0 ? (
                      <>
                        <Separator />
                        <section className="space-y-3">
                          <h3 className="flex items-center gap-2 text-sm font-semibold">
                            <Microscope className="h-4 w-4 text-cyan-600" />
                            Lab tests
                          </h3>
                          <ul className="space-y-2">
                            {v.labTests.map((lab) => {
                              const href = resolveAttachmentUrl(lab.fileUrl)
                              return (
                                <li
                                  key={lab.id}
                                  className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between"
                                >
                                  <div className="min-w-0 space-y-1">
                                    <p className="font-medium leading-tight">{lab.testType}</p>
                                    <p className="text-xs text-muted-foreground">{formatDateTime(lab.testAt)}</p>
                                    {lab.resultSummary ? (
                                      <p className="text-sm text-muted-foreground whitespace-pre-wrap">{lab.resultSummary}</p>
                                    ) : null}
                                    {lab.note ? (
                                      <p className="text-xs text-muted-foreground italic">{lab.note}</p>
                                    ) : null}
                                    {lab.technicianName ? (
                                      <p className="text-[11px] text-muted-foreground">Technician: {lab.technicianName}</p>
                                    ) : null}
                                  </div>
                                  {href ? (
                                    <Button variant="outline" size="sm" className="shrink-0" asChild>
                                      <a
                                        href={href}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                                        Attachment
                                      </a>
                                    </Button>
                                  ) : null}
                                </li>
                              )
                            })}
                          </ul>
                        </section>
                      </>
                    ) : null}

                    {hospitalTransfers.length > 0 ? (
                      <>
                        <Separator />
                        <section className="space-y-3">
                          <h3 className="flex items-center gap-2 text-sm font-semibold">
                            <Building2 className="h-4 w-4 text-rose-700" />
                            Hospital transfer
                          </h3>
                          <ul className="space-y-3">
                            {hospitalTransfers.map((ht) => {
                              const hKey = `${v.regimenId}-${ht.orderId}`
                              const busyH = exportingHospitalKey === hKey
                              return (
                                <RegimenDocumentPreviewTooltip
                                  key={ht.orderId}
                                  summary={buildHospitalTransferTooltipSummary(ht, formatDateTime)}
                                  formPayload={ht.formPayload}
                                >
                                  <li className="rounded-lg border border-rose-100 bg-rose-50/40 dark:bg-rose-950/20 p-3 space-y-2 cursor-help">
                                  <div className="flex flex-wrap items-start justify-between gap-2">
                                    <div className="min-w-0 space-y-1">
                                      <p className="font-medium text-sm leading-tight">
                                        To: {ht.toHospitalName}
                                      </p>
                                      <p className="text-xs text-muted-foreground">
                                        {formatDateTime(ht.transferAt)}
                                        {ht.toHospitalId ? ` · Ref: ${ht.toHospitalId}` : ""}
                                      </p>
                                      {ht.transport ? (
                                        <p className="text-xs text-muted-foreground">Transport: {ht.transport}</p>
                                      ) : null}
                                      <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                                        {ht.reason}
                                      </p>
                                      {ht.note ? (
                                        <p className="text-xs text-muted-foreground italic whitespace-pre-wrap">
                                          {ht.note}
                                        </p>
                                      ) : null}
                                    </div>
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      className="shrink-0 gap-1.5"
                                      disabled={busyH || exportingHospitalKey !== null}
                                      onClick={() => void handleHospitalTransferPdf(v, ht)}
                                    >
                                      {busyH ? (
                                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                      ) : (
                                        <FileDown className="h-3.5 w-3.5" />
                                      )}
                                      PDF
                                    </Button>
                                  </div>
                                  </li>
                                </RegimenDocumentPreviewTooltip>
                              )
                            })}
                          </ul>
                        </section>
                      </>
                    ) : null}

                    {healthTrackingSlips.length > 0 ? (
                      <>
                        <Separator />
                        <section className="space-y-3">
                          <h3 className="flex items-center gap-2 text-sm font-semibold">
                            <Activity className="h-4 w-4 text-red-600" />
                            Health tracking slips
                          </h3>
                          <ul className="space-y-3">
                            {healthTrackingSlips.map((slip) => (
                              <RegimenDocumentPreviewTooltip
                                key={slip.orderId}
                                summary={buildHealthTrackingSlipTooltipSummary(slip, formatDateTime)}
                                formPayload={slip.formPayload}
                              >
                                <li className="rounded-lg border p-3 space-y-1 cursor-help">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="font-medium">Slip #{slip.orderId}</span>
                                    <Badge variant="outline" className="text-[10px]">
                                      {slip.rows?.length || 0} row(s)
                                    </Badge>
                                  </div>
                                  <p className="text-xs text-muted-foreground">{formatDateTime(slip.createdAt)}</p>
                                  {slip.createdByDoctor ? (
                                    <p className="text-xs text-muted-foreground">Created by: {slip.createdByDoctor}</p>
                                  ) : null}
                                </li>
                              </RegimenDocumentPreviewTooltip>
                            ))}
                          </ul>
                        </section>
                      </>
                    ) : null}

                    {v.surgeries.length > 0 ? (
                      <>
                        <Separator />
                        <section className="space-y-3">
                          <h3 className="flex items-center gap-2 text-sm font-semibold">
                            <Scissors className="h-4 w-4 text-amber-700" />
                            Procedures & surgery
                          </h3>
                          <ul className="space-y-3">
                            {v.surgeries.map((s) => (
                              <li key={s.id} className="rounded-lg border p-3 space-y-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="font-medium">{s.surgeryType}</span>
                                  {s.urgency ? (
                                    <Badge variant="outline" className="text-[10px]">
                                      {s.urgency}
                                    </Badge>
                                  ) : null}
                                </div>
                                <p className="text-xs text-muted-foreground">
                                  {formatDateTime(s.start)} — {formatDateTime(s.end)}
                                </p>
                                {s.surgeon ? (
                                  <p className="text-xs text-muted-foreground">Surgeon: {s.surgeon}</p>
                                ) : null}
                                {s.result ? (
                                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">{s.result}</p>
                                ) : null}
                                {s.note ? <p className="text-xs italic text-muted-foreground">{s.note}</p> : null}
                              </li>
                            ))}
                          </ul>
                        </section>
                      </>
                    ) : null}

                    {v.prescriptions.length === 0 &&
                    v.labTests.length === 0 &&
                    v.surgeries.length === 0 &&
                    hospitalTransfers.length === 0 &&
                    healthTrackingSlips.length === 0 &&
                    !v.vitals ? (
                      <p className="text-xs text-muted-foreground text-center py-2">
                        Aside from the diagnosis, no prescriptions, lab tests, or vitals are linked to this visit yet.
                      </p>
                    ) : null}
                  </CardContent>
                </Card>
                )
              })
            )}
            </TooltipProvider>
          </TabsContent>

          <TabsContent value="prescriptions" className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="space-y-1.5">
                    <CardTitle className="flex items-center gap-2">
                      <Pill className="h-5 w-5" />
                      Active prescriptions
                    </CardTitle>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="shrink-0 gap-2"
                    disabled={rxLoading || prescriptionGroups.length === 0 || exportingRxPdf}
                    onClick={() => void handleExportPrescriptionsPdf()}
                  >
                    {exportingRxPdf ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <FileDown className="h-4 w-4" />
                    )}
                    Export PDF
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {rxLoading ? (
                  <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    <span>Loading…</span>
                  </div>
                ) : prescriptionGroups.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">No signed prescriptions yet.</p>
                ) : (
                  <div className="space-y-4">
                    {prescriptionGroups.map((rx) => (
                      <div key={rx.id} className="space-y-2 rounded-lg border p-4">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Prescription · {formatDateTime(rx.prescribedAt)}
                        </p>
                        {rx.doctorName?.trim() ? (
                          <p className="text-xs text-muted-foreground">Signed by {rx.doctorName.trim()}</p>
                        ) : null}
                        <div className="space-y-2">
                          {rx.medications.map((med) => (
                            <div
                              key={med.id}
                              className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-muted/50 px-3 py-2"
                            >
                              <div className="min-w-0">
                                <p className="font-medium">{med.name}</p>
                                <p className="text-sm text-muted-foreground">
                                  {med.frequency || "—"}
                                  {med.duration ? ` · ${med.duration} day(s)` : ""}
                                </p>
                              </div>
                              <span className="text-xs text-muted-foreground">Qty: {med.quantity || "—"}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="lab-results" className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="space-y-1.5">
                    <CardTitle className="flex items-center gap-2">
                      <Microscope className="h-5 w-5" />
                      Lab results
                    </CardTitle>
                    <CardDescription>
                      From all completed encounters, newest first. Select a row to export the same PDF layout used in the
                      doctor and technician portals.
                    </CardDescription>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="shrink-0 gap-2"
                    disabled={visitsLoading || !selectedLabRow || exportingLabPdf}
                    onClick={() => void handleExportLabPdf()}
                  >
                    {exportingLabPdf ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <FileDown className="h-4 w-4" />
                    )}
                    Export PDF
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {visitsLoading ? (
                  <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    <span>Loading…</span>
                  </div>
                ) : flatLabRows.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">No lab tests yet.</p>
                ) : (
                  <div className="space-y-3">
                    {flatLabRows.map((lab) => {
                      const href = resolveAttachmentUrl(lab.fileUrl)
                      const rowKey = labRowKey(lab)
                      const isSelected = selectedLabKey === rowKey
                      return (
                        <div
                          key={rowKey}
                          role="button"
                          tabIndex={0}
                          onClick={() => setSelectedLabKey(rowKey)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault()
                              setSelectedLabKey(rowKey)
                            }
                          }}
                          className={cn(
                            "flex flex-col gap-2 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between cursor-pointer transition-colors outline-none",
                            isSelected ? "border-primary ring-2 ring-primary/30 bg-primary/5" : "hover:bg-muted/40"
                          )}
                        >
                          <div className="min-w-0 space-y-1">
                            <p className="font-medium">{lab.testType}</p>
                            <p className="text-xs text-muted-foreground">
                              {formatDateTime(lab.testAt)} · Visit {formatDateTime(lab.visitAt)}
                            </p>
                            {lab.resultSummary ? (
                              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{lab.resultSummary}</p>
                            ) : null}
                          </div>
                          {href ? (
                            <Button variant="outline" size="sm" className="shrink-0" asChild>
                              <a
                                href={href}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                                File
                              </a>
                            </Button>
                          ) : null}
                        </div>
                      )
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="symptom-checker" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertCircle className="h-5 w-5 text-amber-600" />
                  Symptom checker history
                </CardTitle>
                <CardDescription>
                  Saved guidance from the patient portal tool. This does not replace a doctor&apos;s diagnosis.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {symptomLoading ? (
                  <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    <span>Loading…</span>
                  </div>
                ) : symptomLogs.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">No entries yet.</p>
                ) : (
                  <div className="space-y-4">
                    {symptomLogs.map((log) => (
                      <Card key={log.id} className="border-amber-200/80 dark:border-amber-900/50">
                        <CardHeader className="pb-2">
                          <CardTitle className="text-base leading-snug">
                            {log.condition?.trim() || "Symptom analysis"}
                          </CardTitle>
                          <CardDescription>{formatDateTime(log.time)}</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-2 text-sm text-muted-foreground">
                          {log.suggestion ? (
                            <p className="whitespace-pre-wrap">{log.suggestion}</p>
                          ) : (
                            <p>No suggestion text was saved.</p>
                          )}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </PatientLayout>
  )
}

function VitalItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-muted/20 px-2 py-2">
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold tabular-nums">{value}</p>
    </div>
  )
}
