"use client"

import { useCallback, useEffect, useState, useRef } from "react"
import { useParams } from "react-router-dom"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Copy, FileDown, History, Plus, Save, Search, X, Loader2 } from "lucide-react"
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table"
import {
  doctorService,
  type Diagnosis as ApiDiagnosis,
  type DiseaseCode,
  type PatientDetail,
} from "@/services/doctor-service"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { generateTreatmentFollowupPdfBlob } from "@/lib/export-treatment-followup-pdf"
import { useEmrSession } from "@/contexts/emr-session-context"

type UiDiagnosis = {
  id: string
  date: string
  doctor: string
  department: string
  complaint: string
  icd10: string
  interpretation: string
  note?: string
  isDraft?: boolean
}

function formatDt(iso: string) {
  try {
    return new Date(iso).toLocaleString("vi-VN")
  } catch {
    return iso
  }
}

function mapApiToUi(d: ApiDiagnosis): UiDiagnosis {
  return {
    id: String(d.id),
    date: formatDt(d.createdAt),
    doctor: d.doctorName,
    department: d.department || "",
    complaint: d.complaint,
    icd10: d.icd10,
    interpretation: d.interpretation || "",
    note: d.note || "",
    isDraft: false,
  }
}

export default function PatientDiagnosis() {
  const { patientId } = useParams<{ patientId: string }>()
  const { mutationsAllowed } = useEmrSession()
  const [diagnoses, setDiagnoses] = useState<UiDiagnosis[]>([])
  const [selectedDx, setSelectedDx] = useState<UiDiagnosis | null>(null)
  const [viewDxBeforeEdit, setViewDxBeforeEdit] = useState<UiDiagnosis | null>(null)
  const [diseaseCodes, setDiseaseCodes] = useState<DiseaseCode[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [exportingPdf, setExportingPdf] = useState(false)
  const [pdfPreviewOpen, setPdfPreviewOpen] = useState(false)
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null)
  const [pdfPreviewFilename, setPdfPreviewFilename] = useState("")
  const pdfBlobUrlRef = useRef<string | null>(null)

  const releasePdfBlobUrl = (next: string | null) => {
    if (pdfBlobUrlRef.current && pdfBlobUrlRef.current !== next) {
      URL.revokeObjectURL(pdfBlobUrlRef.current)
    }
    pdfBlobUrlRef.current = next
    setPdfPreviewUrl(next)
  }

  const closePdfPreview = () => {
    setPdfPreviewOpen(false)
    releasePdfBlobUrl(null)
    setPdfPreviewFilename("")
  }

  const load = useCallback(async () => {
    if (!patientId) return
    setLoading(true)
    try {
      const res = await doctorService.getDiagnoses(patientId)
      const rows = (res.diagnoses || []).map(mapApiToUi)
      setDiagnoses(rows)
      setSelectedDx((prev) => {
        if (!prev) return null
        const matched = rows.find((r) => r.id === prev.id)
        return matched ? { ...matched, isDraft: false } : null
      })
      setViewDxBeforeEdit(null)
    } catch (e) {
      console.error(e)
      alert(e instanceof Error ? e.message : "Could not load diagnoses")
    } finally {
      setLoading(false)
    }
  }, [patientId])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    const loadDiseaseCodes = async () => {
      try {
        const res = await doctorService.getDiseaseCodes()
        setDiseaseCodes(res.diseases || [])
      } catch (e) {
        console.error(e)
      }
    }
    loadDiseaseCodes()
  }, [])

  const handleAddDiagnosis = () => {
    if (!mutationsAllowed) return
    setViewDxBeforeEdit(selectedDx && !selectedDx.isDraft ? selectedDx : null)
    const createDraft = (complaint = "") => {
      setSelectedDx({
        id: "new",
        date: "—",
        doctor: "—",
        department: "",
        complaint,
        icd10: "",
        interpretation: "",
        note: "",
        isDraft: true,
      })
    }
    if (!patientId) {
      createDraft("")
      return
    }
    doctorService
      .getHealthInfo(Number(String(patientId).replace(/^OP0*/i, "")))
      .then((res) => {
        const h = res.healthInfo as any
        const autoComplaint = h?.currentSymptoms || h?.condition || ""
        createDraft(autoComplaint)
      })
      .catch(() => createDraft(""))
  }

  const handleInheritDiagnosis = () => {
    if (!mutationsAllowed) return
    if (!selectedDx || selectedDx.isDraft) return
    setViewDxBeforeEdit(selectedDx)
    setSelectedDx({
      ...selectedDx,
      id: "new",
      date: "—",
      doctor: "—",
      isDraft: true,
    })
  }

  const handleSave = async () => {
    if (!mutationsAllowed) return
    if (!patientId || !selectedDx || !selectedDx.isDraft) return
    if (!selectedDx.complaint.trim() || !selectedDx.icd10.trim()) {
      alert("Please enter symptoms and ICD-10 code")
      return
    }
    if (selectedDx.id !== "new") {
      alert("Only new diagnoses can be saved. Click Add or Inherit to create a new item.")
      return
    }
    setSaving(true)
    try {
      const payload = {
        complaint: selectedDx.complaint.trim(),
        icd10: selectedDx.icd10.trim(),
        interpretation: selectedDx.interpretation.trim() || undefined,
        note: selectedDx.note?.trim() || undefined,
        department: selectedDx.department.trim() || undefined,
      }
      await doctorService.createDiagnosis(patientId, payload)
      await load()
    } catch (e) {
      alert(e instanceof Error ? e.message : "Save failed")
    } finally {
      setSaving(false)
    }
  }

  const handleCancel = () => {
    setSelectedDx(viewDxBeforeEdit ? { ...viewDxBeforeEdit, isDraft: false } : null)
    setViewDxBeforeEdit(null)
  }

  const hasSelectedViewRow = !!selectedDx && !selectedDx.isDraft
  const canAdd = !selectedDx?.isDraft && !loading && !saving && mutationsAllowed
  const canInherit = hasSelectedViewRow && !loading && !saving && mutationsAllowed
  const canCancelDraft = !!selectedDx?.isDraft && !loading
  const canSaveDraft = !!selectedDx?.isDraft && !loading && mutationsAllowed
  const diseaseMap = new Map(diseaseCodes.map((d) => [d.code, d.description]))

  const canExportPdf = !!patientId && !!selectedDx && !exportingPdf

  const handleExportPdf = async () => {
    if (!patientId || !selectedDx) return
    setExportingPdf(true)
    try {
      const res = await doctorService.getPatient(patientId)
      const p: PatientDetail | undefined = res.patient
      if (!p) throw new Error("Fail to load patient information")

      const fullName = `${p.firstName || ""} ${p.lastName || ""}`.trim() || p.username || ""
      const age = p.age != null ? String(p.age) : ""
      const department = (p.inDepartment || (p as any).in_department || "").toString()

      releasePdfBlobUrl(null)
      const { blob, filename } = await generateTreatmentFollowupPdfBlob({
        patientName: fullName,
        age,
        gender: p.gender,
        department,
        diagnosisIcd10: selectedDx.icd10 || "",
        diagnosisInterpretation: selectedDx.interpretation || "",
        complaintSymptoms: selectedDx.complaint || "",
        doctorName: selectedDx.doctor || "",
        note: selectedDx.note || "",
        dateLabel: selectedDx.date && selectedDx.date !== "—" ? selectedDx.date : "",
      })
      const url = URL.createObjectURL(blob)
      setPdfPreviewFilename(filename)
      releasePdfBlobUrl(url)
      setPdfPreviewOpen(true)
    } catch (e) {
      alert(e instanceof Error ? e.message : "Export PDF failed")
    } finally {
      setExportingPdf(false)
    }
  }

  const handleSavePdfFromPreview = () => {
    if (!pdfPreviewUrl || !pdfPreviewFilename) return
    const a = document.createElement("a")
    a.href = pdfPreviewUrl
    a.download = pdfPreviewFilename
    a.rel = "noopener"
    a.click()
  }

  useEffect(() => {
    return () => {
      if (pdfBlobUrlRef.current) {
        URL.revokeObjectURL(pdfBlobUrlRef.current)
        pdfBlobUrlRef.current = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="grid grid-cols-12 gap-6">
      <Dialog
        open={pdfPreviewOpen}
        onOpenChange={(open) => {
          if (!open) closePdfPreview()
        }}
      >
        <DialogContent className="flex max-h-[90vh] w-[min(920px,96vw)] max-w-none flex-col gap-3 p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>Treatment Follow-up Slip (PDF preview)</DialogTitle>
          </DialogHeader>
          {pdfPreviewUrl ? (
            <iframe
              title="Treatment follow-up PDF preview"
              src={pdfPreviewUrl}
              className="min-h-[min(520px,60vh)] w-full flex-1 rounded-md border border-slate-200 bg-slate-50"
            />
          ) : null}
          <DialogFooter className="gap-2 sm:gap-2">
            <Button type="button" variant="outline" className="btn-outline" onClick={closePdfPreview}>
              Close
            </Button>
            <Button
              type="button"
              className="btn-gradient"
              onClick={handleSavePdfFromPreview}
              disabled={!pdfPreviewUrl}
            >
              <FileDown className="h-4 w-4 mr-2" />
              Save / Download
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Card className="col-span-4">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <History size={18} />
            <h3 className="font-semibold text-lg">Diagnosis History</h3>
          </div>

          {loading ? (
            <p className="text-sm text-slate-500">Loading…</p>
          ) : (
            <div className="overflow-x-auto border rounded-lg">
              <Table className="min-w-0 w-full text-sm">
                <TableHeader
                  className="text-white"
                  style={{
                    background:
                      "linear-gradient(135deg, #06b6d4 0%, #0891b2 50%, #06b6d4 100%)",
                  }}
                >
                  <TableRow>
                    <TableHead className="p-2 text-left text-white">Date</TableHead>
                    <TableHead className="p-2 text-left text-white">Doctor</TableHead>
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {diagnoses.map((dx) => (
                    <TableRow
                      key={dx.id}
                      onClick={() => {
                        if (selectedDx?.isDraft) return
                        setSelectedDx({ ...dx, isDraft: false })
                      }}
                      className={`border-t cursor-pointer transition ${
                        selectedDx?.id === dx.id ? "bg-cyan-50" : ""
                      }`}
                    >
                      <TableCell className="p-2">{dx.date}</TableCell>
                      <TableCell className="p-2">{dx.doctor}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="col-span-8">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Search size={18} />
              <h3 className="font-semibold text-lg">Diagnosis Assessment</h3>
            </div>

            <div className="flex gap-2 flex-wrap justify-end">
              <Button
                size="sm"
                className="btn-gradient transition-transform duration-500 text-xl px-7 py-4"
                onClick={handleAddDiagnosis}
                disabled={!canAdd}
              >
                <Plus className="h-4 w-4" />
                Add
              </Button>
              <Button
                size="sm"
                className="btn-outline transition-transform duration-500 text-xl px-7 py-4"
                onClick={handleInheritDiagnosis}
                disabled={!canInherit}
              >
                <Copy className="h-4 w-4" />
                Inherit
              </Button>
              <Button
                size="sm"
                className="btn-outline transition-transform duration-500 text-xl px-7 py-4"
                onClick={handleSave}
                disabled={!canSaveDraft || saving}
              >
                <Save className="h-4 w-4" />
                Save
              </Button>
              <Button
                size="sm"
                className="btn-outline transition-transform duration-500 text-xl px-7 py-4"
                onClick={handleCancel}
                disabled={!canCancelDraft || saving}
              >
                <X className="h-4 w-4" />
                Cancel
              </Button>

              <Button
                size="sm"
                className="btn-outline transition-transform duration-500 text-xl px-7 py-4"
                onClick={() => void handleExportPdf()}
                disabled={!canExportPdf}
                title="Export treatment follow-up slip"
              >
                {exportingPdf ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <FileDown className="h-4 w-4 mr-2" />}
                Export
              </Button>
            </div>
          </div>

          {!selectedDx ? (
            <p className="text-sm text-slate-500 mt-6">
              Click on any row to load that record into the form or click "Add" to create a new diagnosis.
            </p>
          ) : (
            <div className="space-y-4 mt-4">
              <FormField
                label="Chief complaint / symptoms"
                value={selectedDx.complaint}
                editable={selectedDx.isDraft && mutationsAllowed}
                onChange={(v) => setSelectedDx({ ...selectedDx, complaint: v })}
              />

              <DiagnosisCodeField
                label="Diagnosis (ICD-10)"
                value={selectedDx.icd10}
                editable={!!selectedDx.isDraft && mutationsAllowed}
                options={diseaseCodes}
                onChange={(v) => {
                  const autoDescription = diseaseMap.get(v.trim())
                  setSelectedDx({
                    ...selectedDx,
                    icd10: v,
                    interpretation: autoDescription ?? "",
                  })
                }}
              />

              <FormField
                label="Diagnosis (Interpretation)"
                value={selectedDx.interpretation}
                editable={false}
                onChange={(v) => setSelectedDx({ ...selectedDx, interpretation: v })}
              />

              <FormField
                label="Note"
                value={selectedDx.note ?? ""}
                editable={!!selectedDx.isDraft && mutationsAllowed}
                onChange={(v) => setSelectedDx({ ...selectedDx, note: v })}
              />

              {!selectedDx.isDraft && (
                <div className="grid grid-cols-2 gap-2 text-sm text-slate-600">
                  <div>
                    <span className="font-medium">Date:</span> {selectedDx.date}
                  </div>
                  <div>
                    <span className="font-medium">Doctor:</span> {selectedDx.doctor}
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function DiagnosisCodeField({
  label,
  value,
  editable,
  onChange,
  options,
}: {
  label: string
  value: string
  editable: boolean
  onChange: (v: string) => void
  options: DiseaseCode[]
}) {
  const listId = "diagnosis-icd10-options"
  return (
    <div className="space-y-1">
      <label className="text-sm font-medium text-slate-600">{label}</label>
      {editable ? (
        <>
          <input
            list={listId}
            className="w-full rounded-lg border px-3 py-2 text-sm focus:ring-1 focus:ring-cyan-400"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="Select or enter ICD-10 code"
          />
          <datalist id={listId}>
            {options.map((d) => (
              <option key={d.code} value={d.code}>
                {d.description}
              </option>
            ))}
          </datalist>
        </>
      ) : (
        <div className="rounded-lg border bg-slate-50 px-3 py-2 text-sm">{value || "—"}</div>
      )}
    </div>
  )
}

function FormField({
  label,
  value,
  editable,
  onChange,
}: {
  label: string
  value: string
  editable: boolean
  onChange: (v: string) => void
}) {
  return (
    <div className="space-y-1">
      <label className="text-sm font-medium text-slate-600">{label}</label>

      {editable ? (
        <textarea
          className="w-full rounded-lg border px-3 py-2 text-sm focus:ring-1 focus:ring-cyan-400"
          rows={2}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <div className="rounded-lg border bg-slate-50 px-3 py-2 text-sm">{value || "—"}</div>
      )}
    </div>
  )
}
