"use client"

import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { useParams } from "react-router-dom"
import { CheckCircle2, Copy, Edit, FileDown, Loader2, Plus, Save, Trash2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { PatientLayout } from "@/components/patient-layout"
import { PatientHealthChartsHeader, PatientHealthChartsPanel } from "@/components/patient-health-charts"
import { PauseableCornerToastPortal } from "@/components/pauseable-corner-toast"
import { usePdfPreview } from "@/components/pdf-preview-dialog"
import { HealthInfoForm } from "@/components/emr-health-info/health-info-form"
import { HealthRecordsTable } from "@/components/emr-health-info/health-records-table"
import {
  EMPTY_PATIENT_DEFAULTS,
  emptyForm,
  formFromDefaults,
  formFromLatest,
  formFromRecord,
  patientDefaults,
  toHealthInfoPayload,
  toHealthRecord,
  type HealthForm,
  type HealthRecord,
} from "@/components/emr-health-info/health-records"
import { usePauseableToast } from "@/hooks/use-pauseable-toast"
import { buildHealthChartData } from "@/lib/health-chart-data"
import { generateHealthInfoTrackingPdfBlob } from "@/lib/export-health-info-tracking-pdf"
import { vitalMainFormErrorMessages, formatVitalValidationErrorToast } from "@/lib/vital-signs-limits"
import { doctorService } from "@/services/doctor-service"

type HealthInfoPageProps = {
  mode?: "doctor" | "nurse"
}

const messageOf = (err: unknown, fallback: string) => (err instanceof Error && err.message) || fallback

/** Doctor and nurse EMR "Health info" tab: vital-sign history, edit / confirm records, tracking slip PDF. */
export default function HealthInfoPage({ mode = "doctor" }: HealthInfoPageProps) {
  const { t } = useTranslation()
  const { toast, isExiting, showSuccess, showError, onMouseEnter, onMouseLeave } = usePauseableToast(2600)
  const params = useParams<{ patientId: string }>()
  // "OP000000001" → 1
  const patientId = Number(params.patientId?.replace(/^OP0*/, "") || "0")

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [isAdding, setIsAdding] = useState(false)
  const [form, setForm] = useState<HealthForm>(emptyForm)
  const [currentHealthInfoId, setCurrentHealthInfoId] = useState<number | null>(null)
  const [records, setRecords] = useState<HealthRecord[]>([])
  const [defaults, setDefaults] = useState(EMPTY_PATIENT_DEFAULTS)
  /** Row loaded into the form. */
  const [selectedRecord, setSelectedRecord] = useState<HealthRecord | null>(null)
  /** Rows ticked for export / delete / charts. */
  const [selectedRecords, setSelectedRecords] = useState<HealthRecord[]>([])
  const [addingTrackingSlip, setAddingTrackingSlip] = useState(false)

  const patchForm = (patch: Partial<HealthForm>) => setForm((f) => ({ ...f, ...patch }))

  async function addTrackingSlipToMedicalRecord(closePreview: () => void) {
    if (!patientId || selectedRecords.length === 0 || addingTrackingSlip) return
    setAddingTrackingSlip(true)
    try {
      await doctorService.addHealthTrackingSlipToMedicalRecord(patientId, { recordIds: selectedRecords.map((r) => r.id) })
      showSuccess("Health tracking slip added to active medical record.")
      closePreview()
    } catch (err) {
      showError(messageOf(err, "Failed to add slip to medical record"))
    } finally {
      setAddingTrackingSlip(false)
    }
  }

  const pdf = usePdfPreview(
    showError,
    mode === "doctor"
      ? (close) => (
          <Button
            type="button"
            className="btn-outline"
            disabled={selectedRecords.length === 0 || addingTrackingSlip}
            onClick={() => void addTrackingSlipToMedicalRecord(close)}
          >
            {addingTrackingSlip ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
            Add to Medical record
          </Button>
        )
      : undefined,
  )
  const exportingPdf = pdf.busyKey === "export"

  const selectedIsDraft = !!selectedRecord && selectedRecord.status === "draft" && !isEditing
  const canDeleteSelected = !isEditing && selectedRecords.length > 0 && selectedRecords.every((r) => r.status === "draft")
  const canExportSelected = selectedRecords.length > 0 && !exportingPdf

  const loadHealthInfo = async () => {
    if (!patientId) return
    setLoading(true)
    try {
      const result = await doctorService.getHealthInfo(patientId)
      if (!result.success) {
        showError((result as { message?: string }).message || "Failed to load health information")
        return
      }
      const patientInfo = (result as { patientInfo?: Record<string, unknown> }).patientInfo || {}
      const nextDefaults = patientDefaults(patientInfo)
      setDefaults(nextDefaults)
      if (!result.healthInfo) {
        setCurrentHealthInfoId(null)
        setSelectedRecord(null)
        setForm(formFromDefaults(nextDefaults))
        return
      }
      const info = result.healthInfo as unknown as Record<string, unknown>
      setCurrentHealthInfoId(Number(info.id))
      setForm(formFromLatest(info, patientInfo, nextDefaults))
    } catch (err) {
      console.error("Failed to load health info:", err)
      showError("Failed to load health information")
    } finally {
      setLoading(false)
    }
  }

  const loadHealthHistory = async () => {
    try {
      const result = await doctorService.getHealthInfoHistory(patientId, 1, 100)
      if (!result.success) {
        showError((result as { message?: string }).message || "Failed to load health history")
        return
      }
      const rows = (Array.isArray(result.history) ? result.history : []) as unknown as Record<string, unknown>[]
      setRecords(rows.map(toHealthRecord))
    } catch (err) {
      console.error("Failed to load health history:", err)
      showError("Failed to load health history")
    }
  }

  useEffect(() => {
    if (!patientId) return
    void (async () => {
      setLoading(true)
      try {
        await loadHealthInfo()
        await loadHealthHistory()
      } catch (err) {
        console.error(err)
        showError("Failed to load health information")
      } finally {
        setLoading(false)
      }
    })()
    // Load once per patient; the loaders read the latest state when they run.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientId])

  const openRecord = (record: HealthRecord) => {
    setSelectedRecords([])
    setIsEditing(false)
    setForm(formFromRecord(record, defaults))
    setSelectedRecord(record)
    setCurrentHealthInfoId(record.id)
  }

  const clearForm = () => {
    setForm(emptyForm())
    setSelectedRecord(null)
    setCurrentHealthInfoId(null)
  }

  const startAdding = () => {
    if (records.length > 0) {
      openRecord(records[0])
      setCurrentHealthInfoId(null)
    } else {
      clearForm()
    }
    setIsAdding(true)
    setIsEditing(true)
  }

  const inheritSelected = () => {
    if (!selectedRecord) return
    openRecord(selectedRecord)
    setCurrentHealthInfoId(null)
    setSelectedRecord(null)
    setIsAdding(true)
    setIsEditing(true)
  }

  const save = async () => {
    if (!patientId) return
    setSaving(true)
    try {
      const vitalErrors = vitalMainFormErrorMessages(form)
      if (vitalErrors.length) {
        showError(formatVitalValidationErrorToast(vitalErrors))
        return
      }
      const payload = toHealthInfoPayload(form)
      if (currentHealthInfoId && !isAdding) {
        await doctorService.updateHealthInfo(patientId, currentHealthInfoId, payload)
        showSuccess("Health record updated successfully.")
      } else {
        await doctorService.createHealthInfo(patientId, payload)
        showSuccess("Health record created successfully.")
      }
      setIsEditing(false)
      setIsAdding(false)
      await loadHealthInfo()
      await loadHealthHistory()
    } catch (err) {
      showError(messageOf(err, "Failed to save health information"))
    } finally {
      setSaving(false)
    }
  }

  const confirmSelected = async () => {
    if (!selectedRecord) return
    try {
      await doctorService.confirmHealthInfo(patientId, selectedRecord.id)
      showSuccess("Health record confirmed successfully.")
      setSelectedRecord(null)
      await loadHealthHistory()
    } catch (err) {
      showError(messageOf(err, "Failed to confirm health record"))
    }
  }

  const deleteSelected = async () => {
    if (!patientId || !canDeleteSelected) return
    const deleteCount = selectedRecords.length
    if (!confirm(`Delete ${deleteCount} selected draft record(s)?`)) return
    setSaving(true)
    try {
      await Promise.all(selectedRecords.map((r) => doctorService.deleteHealthInfo(patientId, r.id)))
      setSelectedRecords([])
      setSelectedRecord(null)
      showSuccess(`${deleteCount} record(s) deleted successfully.`)
      await loadHealthHistory()
    } catch (err) {
      showError(messageOf(err, "Failed to delete records"))
    } finally {
      setSaving(false)
    }
  }

  const exportTrackingPdf = () => {
    if (!patientId || !canExportSelected) return
    void pdf.preview("export", "Health Tracking Slip Preview (PDF)", async () => {
      const patientRes = await doctorService.getPatient(patientId)
      if (!patientRes.success || !patientRes.patient) throw new Error("Failed to load patient information")
      const p = patientRes.patient
      const dx = p.latestDiagnosis
      const rows = [...selectedRecords].sort((a, b) => a.updatedAt.getTime() - b.updatedAt.getTime())
      return generateHealthInfoTrackingPdfBlob({
        patientName: `${p.lastName || ""} ${p.firstName || ""}`.trim() || p.username || "",
        age: p.age == null ? "" : String(p.age),
        gender: p.gender === "M" ? "Male" : p.gender === "F" ? "Female" : "",
        diagnosis: dx ? `${dx.icd10 || ""}${dx.icd10 && dx.interpretation ? " - " : ""}${dx.interpretation || ""}` : "",
        rows: rows.map((r) => ({
          updatedAt: r.updatedAt,
          bloodPressure: r.bloodPressure,
          pulse: r.heartRate,
          temperature: r.temperature,
          weight: r.weight,
          respiratoryRate: r.respiratoryRate,
          spo2: r.spo2,
          symptoms: r.symptoms,
        })),
      })
    })
  }

  if (loading) {
    return (
      <PatientLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin text-cyan-600 mx-auto mb-4" />
            <p className="text-slate-600">Loading health information...</p>
          </div>
        </div>
      </PatientLayout>
    )
  }

  return (
    <>
      <div className="space-y-6">
        {pdf.dialog}

        <Tabs defaultValue="records" className="w-full">
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="records">{t("patient.healthInfo.tabRecords")}</TabsTrigger>
            <TabsTrigger value="charts">{t("patient.healthInfo.tabCharts")}</TabsTrigger>
          </TabsList>

          <TabsContent value="records" className="mt-4">
            <div className="mb-3 flex items-center justify-end gap-2">
              <Button type="button" size="sm" className="btn-outline" disabled={!canExportSelected} onClick={exportTrackingPdf}>
                {exportingPdf ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
                <span className="ml-2">Export</span>
              </Button>
              <Button
                type="button"
                size="sm"
                className="btn-outline text-red-600"
                disabled={!canDeleteSelected}
                onClick={() => void deleteSelected()}
              >
                <Trash2 className="h-4 w-4" />
                <span className="ml-2">Delete</span>
              </Button>
            </div>

            <HealthRecordsTable
              records={records}
              current={selectedRecord}
              selected={selectedRecords}
              onOpen={openRecord}
              onSelectedChange={setSelectedRecords}
            />

            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-2xl font-bold">Health Information</h3>
                <p className="text-muted-foreground">Update patient health data before examination</p>
              </div>
              <div className="flex gap-3">
                <Button onClick={startAdding} disabled={isEditing} variant="outline" className="btn-outline flex items-center gap-2">
                  <Plus className="h-4 w-4" />
                  Add
                </Button>
                <Button
                  onClick={() => {
                    if (!selectedRecord) return
                    setIsAdding(false)
                    setIsEditing(true)
                  }}
                  disabled={!selectedIsDraft}
                  variant="outline"
                  className="btn-outline flex items-center gap-2"
                >
                  <Edit className="h-4 w-4" />
                  Edit
                </Button>
                <Button onClick={inheritSelected} disabled={!selectedRecord} className="btn-outline flex items-center gap-2">
                  <Copy className="h-4 w-4" />
                  Inherit
                </Button>
                <Button onClick={() => void save()} disabled={!isEditing || saving} className="btn-gradient flex items-center gap-2">
                  <Save className="h-4 w-4" />
                  Save
                </Button>
                <Button
                  onClick={() => void confirmSelected()}
                  disabled={!selectedIsDraft}
                  className="!bg-[#16a34a] hover:bg-green-700 text-white"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  Confirm
                </Button>
                <Button
                  onClick={() => {
                    clearForm()
                    setIsEditing(false)
                    setIsAdding(false)
                  }}
                  disabled={!isEditing}
                  variant="destructive"
                  className="btn-outline flex items-center gap-2"
                >
                  <X className="h-4 w-4" />
                  Cancel
                </Button>
              </div>
            </div>

            <HealthInfoForm form={form} onChange={patchForm} disabled={!isEditing} />
          </TabsContent>

          <TabsContent value="charts" className="mt-4">
            <Card className="border-slate-200/80 shadow-sm">
              <PatientHealthChartsHeader selectedCount={selectedRecords.length} />
              <CardContent>
                <PatientHealthChartsPanel
                  chartData={buildHealthChartData(selectedRecords.length > 0 ? selectedRecords : records)}
                />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
      <PauseableCornerToastPortal toast={toast} isExiting={isExiting} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave} />
    </>
  )
}
