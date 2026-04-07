import { useCallback, useEffect, useRef, useState } from "react"
import { useParams } from "react-router-dom"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { doctorService } from "@/services/doctor-service"
import type { PatientMedicalRegimen } from "@/services/appointment-service"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { generateTreatmentFollowupPdfBlob } from "@/lib/export-treatment-followup-pdf"
import { generatePrescriptionPdfBlob } from "@/lib/export-prescription-pdf"
import { generateSurgeryPdfBlob } from "@/lib/export-surgery-pdf"
import { generateBloodTestPdfBlob } from "@/lib/export-blood-test-pdf"
import { generateHospitalTransferPdfBlob } from "@/lib/export-hospital-transfer-pdf"
import { mergePdfBlobs } from "@/lib/merge-pdf-blobs"
import { Download, FileDown, Loader2, Printer, Stethoscope, User, Calendar } from "lucide-react"

function exportDateStamp() {
  return new Date().toISOString().slice(0, 10)
}

function mapPrescriptionExportSignature(raw: string | undefined): "draft" | "signed" | "voided" {
  const s = String(raw || "").toLowerCase()
  if (s === "voided") return "voided"
  if (s === "draft") return "draft"
  return "signed"
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "—"
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return String(value)
  return d.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })
}

export default function DoctorPatientHistoryPage() {
  const { patientId } = useParams<{ patientId: string }>()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [visits, setVisits] = useState<PatientMedicalRegimen[]>([])
  const [exportingRegimenId, setExportingRegimenId] = useState<number | null>(null)

  const [pdfPreviewOpen, setPdfPreviewOpen] = useState(false)
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null)
  const [pdfPreviewFilename, setPdfPreviewFilename] = useState("")
  const [pdfPreviewTitle, setPdfPreviewTitle] = useState("PDF preview")
  const pdfBlobUrlRef = useRef<string | null>(null)

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
    if (!patientId) return
    let cancelled = false
    void (async () => {
      setLoading(true)
      setError(null)
      try {
        const rows = await doctorService.getPatientMedicalRegimens(patientId)
        if (!cancelled) setVisits(rows)
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Could not load visit history.")
          setVisits([])
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [patientId])

  const handleSavePdfFromPreview = useCallback(() => {
    if (!pdfPreviewUrl || !pdfPreviewFilename) return
    const a = document.createElement("a")
    a.href = pdfPreviewUrl
    a.download = pdfPreviewFilename
    a.rel = "noopener"
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }, [pdfPreviewUrl, pdfPreviewFilename])

  const handlePrintPdfFromPreview = useCallback(() => {
    if (!pdfPreviewUrl) return
    const iframe = document.createElement("iframe")
    iframe.style.position = "fixed"
    iframe.style.right = "0"
    iframe.style.bottom = "0"
    iframe.style.width = "0"
    iframe.style.height = "0"
    iframe.style.border = "0"
    iframe.src = pdfPreviewUrl
    document.body.appendChild(iframe)
    iframe.onload = () => {
      try {
        iframe.contentWindow?.focus()
        iframe.contentWindow?.print()
      } finally {
        setTimeout(() => {
          if (iframe.parentNode) iframe.parentNode.removeChild(iframe)
        }, 500)
      }
    }
  }, [pdfPreviewUrl])

  const handleViewRegimenPdf = useCallback(async (v: PatientMedicalRegimen) => {
    if (!patientId) return
    setExportingRegimenId(v.regimenId)
    try {
      const res = await doctorService.getPatient(patientId)
      const patient = res.patient
      const fullName = `${patient.firstName || ""} ${patient.lastName || ""}`.trim() || patient.username
      const ageStr = patient.age != null ? String(patient.age) : "—"
      const latestDiagnosisText = [v.icd10, v.interpretation].filter(Boolean).join(" — ") || "—"

      const blobs: Blob[] = []
      const hasEncounterSummary =
        Boolean(v.complaint?.trim()) || Boolean(v.icd10?.trim()) || Boolean(v.interpretation?.trim())

      if (hasEncounterSummary) {
        const { blob } = await generateTreatmentFollowupPdfBlob({
          patientName: fullName,
          age: ageStr,
          gender: patient.gender,
          department: v.department || "—",
          diagnosisIcd10: v.icd10 || "—",
          diagnosisInterpretation: v.interpretation || "—",
          complaintSymptoms: v.complaint?.trim() || "—",
          doctorName: v.doctorName?.trim() || "—",
          note: "—",
          dateLabel: formatDateTime(v.visitAt),
          filename: `visit-${v.regimenId}-encounter-summary.pdf`,
        })
        blobs.push(blob)
      }

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
          doctorName: v.doctorName?.trim() || "—",
          signatureStatus: mapPrescriptionExportSignature(rx.signatureStatus),
        })
        blobs.push(blob)
      }

      for (const s of v.surgeries) {
        const { blob } = await generateSurgeryPdfBlob({
          patientLabel: fullName,
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
        })
        blobs.push(blob)
      }

      for (const lab of v.labTests) {
        const details = await doctorService.getLabTestDetails(patientId, lab.id)
        const { blob } = await generateBloodTestPdfBlob({
          patientName: fullName,
          age: ageStr,
          gender: patient.gender,
          department: v.department || "Laboratory",
          diagnosis: latestDiagnosisText,
          testDateLabel: formatDateTime(lab.testAt),
          details,
          filename: `lab-${lab.id}-${exportDateStamp()}.pdf`,
        })
        blobs.push(blob)
      }

      for (const ht of v.hospitalTransfers || []) {
        const { blob } = await generateHospitalTransferPdfBlob({
          patientName: fullName,
          patientDob: "—",
          patientSex: patient.gender,
          insuranceId: patient.healthInsuranceId ?? undefined,
          insuranceExpiry: "—",
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
          filename: `hospital-transfer-regimen-${v.regimenId}-order-${ht.orderId}.pdf`,
        })
        blobs.push(blob)
      }

      if (blobs.length === 0) {
        window.alert("This visit has no documents to preview yet.")
        return
      }

      const merged = blobs.length === 1 ? blobs[0] : await mergePdfBlobs(blobs)
      const filename = `visit-regimen-${v.regimenId}-${exportDateStamp()}.pdf`
      const url = URL.createObjectURL(merged)
      setPdfPreviewFilename(filename)
      setPdfPreviewTitle(`Regimen #${v.regimenId} documents (PDF)`)
      releasePdfBlobUrl(url)
      setPdfPreviewOpen(true)
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Failed to generate merged PDF")
    } finally {
      setExportingRegimenId(null)
    }
  }, [patientId, releasePdfBlobUrl])

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span>Loading visit history…</span>
      </div>
    )
  }

  if (error) {
    return (
      <Card className="border-destructive/40">
        <CardContent className="py-8 text-center text-sm text-destructive">{error}</CardContent>
      </Card>
    )
  }

  if (!visits.length) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          No completed visits found for this patient.
        </CardContent>
      </Card>
    )
  }

  return (
    <>
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
            <Button type="button" onClick={handleSavePdfFromPreview} disabled={!pdfPreviewUrl}>
              <FileDown className="mr-2 h-4 w-4" />
              Save / Download
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="space-y-4">
        {visits.map((v) => {
          const isExporting = exportingRegimenId === v.regimenId
          const hasDocs =
            v.prescriptions.length > 0 ||
            v.labTests.length > 0 ||
            v.surgeries.length > 0 ||
            (v.hospitalTransfers || []).length > 0 ||
            Boolean(v.complaint?.trim()) ||
            Boolean(v.icd10?.trim()) ||
            Boolean(v.interpretation?.trim())

          return (
            <Card key={v.regimenId} className="overflow-hidden border-border/80 shadow-sm">
              <CardHeader className="bg-gradient-to-r from-sky-50/90 to-transparent">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="space-y-1 min-w-0">
                    <CardTitle className="flex items-start gap-2 text-lg sm:text-xl">
                      <Stethoscope className="mt-0.5 h-5 w-5 shrink-0 text-sky-600" />
                      <span className="leading-snug">
                        Encounter #{v.regimenId}
                      </span>
                    </CardTitle>
                    <CardDescription className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs sm:text-sm">
                      <span className="inline-flex items-center gap-1">
                        <Calendar className="h-3.5 w-3.5" />
                        {formatDateTime(v.visitAt)} - ended {formatDateTime(v.visitEnd)}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <User className="h-3.5 w-3.5" />
                        {v.doctorName || "—"}
                      </span>
                      {v.roomName ? <span className="text-muted-foreground">Room: {v.roomName}</span> : null}
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
                    disabled={!hasDocs || (exportingRegimenId !== null && !isExporting)}
                    onClick={() => void handleViewRegimenPdf(v)}
                    title={!hasDocs ? "No documents in this encounter" : undefined}
                  >
                    {isExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                    View PDF
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 text-sm pt-5">
                <div>
                  <span className="font-medium">Diagnosis:</span>{" "}
                  {[v.icd10, v.interpretation].filter(Boolean).join(" — ") || "—"}
                </div>
                <div className="whitespace-pre-wrap">
                  <span className="font-medium">Chief complaint:</span> {v.complaint || "—"}
                </div>
                <Separator />
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <Info label="Prescriptions" value={String(v.prescriptions.length)} />
                  <Info label="Lab tests" value={String(v.labTests.length)} />
                  <Info label="Surgeries" value={String(v.surgeries.length)} />
                  <Info label="Hospital transfers" value={String((v.hospitalTransfers || []).length)} />
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </>
  )
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-muted/20 p-2">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="text-base font-semibold">{value}</div>
    </div>
  )
}
