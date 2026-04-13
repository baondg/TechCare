"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useParams } from "react-router-dom"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { History, FlaskConical, Upload, Pencil, FileDown, Loader2 } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
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
  type LabTest as ApiLabTest,
  type LabTestDetail,
} from "@/services/doctor-service"
import { generateBloodTestPdfBlob } from "@/lib/export-blood-test-pdf"
import { signingLineFromIso, stampPdfWithExportFooter } from "@/lib/pdf-export-stamp"
import { evaluateLabMetric } from "@/lib/lab-metric-eval"
import { useEmrSession } from "@/contexts/emr-session-context"

type Row = {
  id: number
  testType: string
  testDateIso: string
  technicianName: string
  resultSummary: string
  fileUrl: string
  note: string
}

type PatientContext = {
  gender: string | null
  bmi: number | null
  fullName: string
  age: string
  department: string
  diagnosis: string
}

function toDateInput(iso: string) {
  if (!iso) return ""
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(
    d.getMinutes()
  )}`
}

function formatDisplayDate(iso: string) {
  try {
    return new Date(iso).toLocaleString("en-US")
  } catch {
    return iso
  }
}

function apiToRow(t: ApiLabTest): Row {
  return {
    id: t.id,
    testType: t.testType,
    testDateIso: t.testDate,
    technicianName: t.technicianName || "",
    resultSummary: t.resultSummary || "",
    fileUrl: t.fileUrl || "",
    note: t.note || "",
  }
}

function toAbsoluteUrl(url: string) {
  if (!url) return ""
  if (/^https?:\/\//i.test(url)) return url
  const base = import.meta.env.VITE_API_BASE_URL || "http://localhost:3000"
  return `${base}${url.startsWith("/") ? "" : "/"}${url}`
}

export default function PatientLab() {
  const { patientId } = useParams<{ patientId: string }>()
  const { mutationsAllowed } = useEmrSession()
  const [rows, setRows] = useState<Row[]>([])
  const [selected, setSelected] = useState<Row | null>(null)
  const [patientCtx, setPatientCtx] = useState<PatientContext>({
    gender: null,
    bmi: null,
    fullName: "",
    age: "",
    department: "",
    diagnosis: "",
  })
  const [detailOpen, setDetailOpen] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailRows, setDetailRows] = useState<LabTestDetail[]>([])
  const [exportingPdf, setExportingPdf] = useState(false)
  const [pdfPreviewOpen, setPdfPreviewOpen] = useState(false)
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null)
  const [pdfPreviewFilename, setPdfPreviewFilename] = useState("lab-result.pdf")
  const pdfBlobUrlRef = useRef<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [editMode, setEditMode] = useState(false)

  const load = useCallback(async () => {
    if (!patientId) return
    setLoading(true)
    try {
      const res = await doctorService.getLabTests(patientId)
      const list = (res.labTests || []).map(apiToRow)
      setRows(list)
      if (list.length > 0) {
        setSelected(list[0])
        setEditMode(false)
      } else {
        setSelected(null)
      }
    } catch (e) {
      console.error(e)
      alert(e instanceof Error ? e.message : "Failed to load lab tests")
    } finally {
      setLoading(false)
    }
  }, [patientId])

  const loadPatientContext = useCallback(async () => {
    if (!patientId) return
    try {
      const res = await doctorService.getPatient(patientId)
      const firstName = res.patient?.firstName || ""
      const lastName = res.patient?.lastName || ""
      const ld = res.patient?.latestDiagnosis
      const diagnosisLine =
        ld && (ld.icd10 || ld.interpretation)
          ? [ld.icd10, ld.interpretation].filter(Boolean).join(" — ")
          : ""
      setPatientCtx({
        gender: res.patient?.gender ?? null,
        bmi: typeof res.patient?.bmi === "number" ? res.patient.bmi : null,
        fullName: `${firstName} ${lastName}`.trim(),
        age: res.patient?.age != null ? String(res.patient.age) : "",
        department: res.patient?.inDepartment || "",
        diagnosis: diagnosisLine,
      })
    } catch (error) {
      console.error(error)
      setPatientCtx({ gender: null, bmi: null, fullName: "", age: "", department: "", diagnosis: "" })
    }
  }, [patientId])

  useEffect(() => {
    void loadPatientContext()
    void load()
  }, [load, loadPatientContext])

  const updateField = <K extends keyof Row>(key: K, value: Row[K]) => {
    setSelected((prev) => (prev ? { ...prev, [key]: value } : prev))
  }

  const releasePdfBlobUrl = () => {
    if (pdfBlobUrlRef.current) {
      URL.revokeObjectURL(pdfBlobUrlRef.current)
      pdfBlobUrlRef.current = null
    }
  }

  const closePdfPreview = () => {
    setPdfPreviewOpen(false)
    setPdfPreviewUrl(null)
    releasePdfBlobUrl()
  }

  const handleSavePdfFromPreview = async () => {
    if (!pdfPreviewUrl) return
    try {
      const res = await fetch(pdfPreviewUrl)
      const raw = await res.blob()
      const stamped = await stampPdfWithExportFooter(raw, new Date())
      const url = URL.createObjectURL(stamped)
      const a = document.createElement("a")
      a.href = url
      a.download = pdfPreviewFilename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (e) {
      console.error(e)
      alert(e instanceof Error ? e.message : "Download failed")
    }
  }

  const handleOpenDetail = async () => {
    if (!patientId || !selected) return
    setDetailOpen(true)
    setDetailLoading(true)
    try {
      const res = await doctorService.getLabTestDetails(patientId, selected.id)
      setDetailRows(res.details || [])
    } catch (error) {
      console.error(error)
      alert(error instanceof Error ? error.message : "Cannot load test details")
      setDetailRows([])
    } finally {
      setDetailLoading(false)
    }
  }

  const handleExportPdf = async () => {
    if (!patientId || !selected) return
    setExportingPdf(true)
    try {
      const detailRes = await doctorService.getLabTestDetails(patientId, selected.id)
      const { blob, filename } = await generateBloodTestPdfBlob({
        patientName: patientCtx.fullName || "Patient",
        age: patientCtx.age || "—",
        gender: patientCtx.gender,
        department: patientCtx.department || "Laboratory",
        diagnosis: patientCtx.diagnosis || "—",
        testDateLabel: formatDisplayDate(selected.testDateIso),
        details: detailRes.details || [],
        signingTimeDisplay: signingLineFromIso(selected.testDateIso),
      })
      releasePdfBlobUrl()
      const blobUrl = URL.createObjectURL(blob)
      pdfBlobUrlRef.current = blobUrl
      setPdfPreviewUrl(blobUrl)
      setPdfPreviewFilename(filename)
      setPdfPreviewOpen(true)
    } catch (error) {
      console.error(error)
      alert(error instanceof Error ? error.message : "Export failed")
    } finally {
      setExportingPdf(false)
    }
  }

  useEffect(() => {
    return () => {
      releasePdfBlobUrl()
    }
  }, [])

  const handleSaveNote = async () => {
    if (!mutationsAllowed) return
    if (!patientId || !selected || !editMode) return
    setSaving(true)
    try {
      await doctorService.updateLabTest(patientId, selected.id, {
        note: selected.note.trim() || null,
      })
      await load()
      setEditMode(false)
    } catch (e) {
      alert(e instanceof Error ? e.message : "Save failed")
    } finally {
      setSaving(false)
    }
  }

  const handleCancel = () => {
    void load()
    setEditMode(false)
  }

  const fileLabel = selected?.fileUrl?.trim() || ""

  return (
    <div className="grid grid-cols-12 gap-6">
      <Card className="col-span-6">
        <CardContent className="p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 font-semibold text-lg">
              <History size={18} />
              Laboratory History
            </div>
            <Button
              size="sm"
              className="btn-outline gap-1"
              onClick={() => void handleExportPdf()}
              disabled={loading || !selected}
            >
              {exportingPdf ? <Loader2 size={14} className="animate-spin" /> : <FileDown size={14} />} Export
            </Button>
          </div>

          {loading ? (
            <p className="text-sm text-slate-500">Loading…</p>
          ) : (
            <div className="overflow-x-auto border rounded-lg">
              <Table className="min-w-[700px] w-full text-sm">
                <TableHeader
                  className="bg-cyan-50 text-white"
                  style={{ background: "linear-gradient(135deg, #06b6d4 0%, #0891b2 100%)" }}
                >
                  <TableRow>
                    <TableHead className="p-2 text-left text-white">No.</TableHead>
                    <TableHead className="p-2 text-left text-white">Test Type</TableHead>
                    <TableHead className="p-2 text-left text-white">Date</TableHead>
                    <TableHead className="p-2 text-left text-white">Technician</TableHead>
                    <TableHead className="p-2 text-left text-white">Result</TableHead>
                    <TableHead className="p-2 text-left text-white">File</TableHead>
                    <TableHead className="p-2 text-left text-white">Note</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r, i) => (
                    <TableRow
                      key={r.id}
                      onClick={() => {
                        setSelected(r)
                        setEditMode(false)
                      }}
                      className={`border-t hover:bg-slate-50 cursor-pointer ${
                        selected?.id === r.id ? "bg-cyan-50" : ""
                      }`}
                    >
                      <TableCell className="p-2">{i + 1}</TableCell>
                      <TableCell className="p-2">{r.testType}</TableCell>
                      <TableCell className="p-2">{formatDisplayDate(r.testDateIso)}</TableCell>
                      <TableCell className="p-2">{r.technicianName || "—"}</TableCell>
                      <TableCell className="p-2">{r.resultSummary || "—"}</TableCell>
                      <TableCell className="p-2 text-cyan-600 underline break-all max-w-[140px]">
                        {r.fileUrl ? (
                          <a
                            href={toAbsoluteUrl(r.fileUrl)}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(e) => e.stopPropagation()}
                          >
                            Link
                          </a>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell className="p-2">{r.note || "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="col-span-6">
        <CardContent className="p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 font-semibold text-lg">
              <FlaskConical size={18} />
              Laboratory Result
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" className="btn-outline" onClick={handleOpenDetail} disabled={!selected || loading}>
                View details
              </Button>
              <Button
                size="sm"
                className="btn-outline flex gap-2"
                onClick={() => setEditMode(true)}
                disabled={!selected || loading || !mutationsAllowed}
              >
                <Pencil size={14} /> Edit
              </Button>
            </div>
          </div>

          {!selected ? (
            <p className="text-sm text-slate-500">Select a row from the history table to view details.</p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm text-slate-600">Test type</label>
                  <input className="w-full border rounded px-3 py-2 bg-muted/40" value={selected.testType} readOnly />
                </div>

                <div>
                  <label className="text-sm text-slate-600">Date</label>
                  <input
                    type="datetime-local"
                    className="w-full border rounded px-3 py-2 bg-muted/40"
                    value={toDateInput(selected.testDateIso)}
                    readOnly
                  />
                </div>
              </div>

              <div>
                <label className="text-sm text-slate-600">Technician</label>
                <input
                  className="w-full border rounded px-3 py-2 bg-muted/40"
                  value={selected.technicianName}
                  readOnly
                />
              </div>

              <div>
                <label className="text-sm text-slate-600">Result (short description)</label>
                <input
                  className="w-full border rounded px-3 py-2 bg-muted/40"
                  value={selected.resultSummary}
                  readOnly
                />
              </div>

              <div>
                <label className="text-sm text-slate-600">File URL (PDF / image)</label>
                <input className="w-full border rounded px-3 py-2 text-sm bg-muted/40" value={selected.fileUrl} readOnly />
              </div>

              <div>
                <label className="text-sm text-slate-600">Results (image / PDF)</label>
                <div className="border-2 border-dashed rounded-lg p-6 flex flex-col items-center justify-center text-slate-400 bg-muted/20">
                  <Upload size={20} />
                  <p className="text-sm mt-2 text-center">Uploaded by the lab team. Open the link above.</p>
                  {fileLabel ? (
                    <a
                      href={toAbsoluteUrl(fileLabel)}
                      className="text-cyan-600 text-sm mt-2 break-all"
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open file
                    </a>
                  ) : null}
                </div>
              </div>

              <div>
                <label className="text-sm text-slate-600">Doctor&apos;s note</label>
                <textarea
                  className={`w-full border rounded px-3 py-2 ${editMode && mutationsAllowed ? "" : "bg-muted/40"}`}
                  rows={3}
                  value={selected.note}
                  onChange={(e) => updateField("note", e.target.value)}
                  readOnly={!editMode || !mutationsAllowed}
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  size="sm"
                  className="btn-gradient"
                  onClick={handleSaveNote}
                  disabled={saving || !editMode || !mutationsAllowed}
                >
                  Save
                </Button>
                <Button size="sm" className="btn-outline" onClick={handleCancel} disabled={saving}>
                  Cancel
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-5xl w-[95vw]">
          <DialogHeader>
            <DialogTitle>Lab test detail analysis</DialogTitle>
          </DialogHeader>
          <div className="text-sm text-slate-600">
            Context: Gender = {patientCtx.gender || "N/A"}, BMI = {patientCtx.bmi ?? "N/A"}
          </div>
          {detailLoading ? (
            <p className="text-sm text-slate-500">Loading details…</p>
          ) : (
            <div className="max-h-[65vh] overflow-auto border rounded-lg">
              <Table className="w-full text-sm">
                <TableHeader
                  className="text-white"
                  style={{ background: "linear-gradient(135deg, #06b6d4 0%, #0891b2 100%)" }}
                >
                  <TableRow>
                    <TableHead className="text-white w-16 text-center">No.</TableHead>
                    <TableHead className="text-white">Index</TableHead>
                    <TableHead className="text-white">Result</TableHead>
                    <TableHead className="text-white">Unit</TableHead>
                    <TableHead className="text-white">Reference</TableHead>
                    <TableHead className="text-white w-28">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detailRows.map((d) => {
                    const evalResult = evaluateLabMetric(d, patientCtx)
                    return (
                      <TableRow
                        key={`${d.testId}-${d.no}`}
                        className={`h-11 transition-colors ${
                          evalResult.abnormal
                            ? "bg-red-50 hover:bg-red-100/90 border-l-4 border-l-red-500"
                            : "hover:bg-muted/50"
                        }`}
                      >
                        <TableCell
                          className={`text-center font-medium ${evalResult.abnormal ? "text-red-900" : ""}`}
                        >
                          {d.no}
                        </TableCell>
                        <TableCell className={evalResult.abnormal ? "font-semibold text-red-900" : ""}>
                          {d.itemIndex}
                        </TableCell>
                        <TableCell className={evalResult.abnormal ? "font-bold text-red-600 underline" : ""}>
                          {d.result}
                        </TableCell>
                        <TableCell className={evalResult.abnormal ? "text-red-900" : ""}>{d.unit || "-"}</TableCell>
                        <TableCell className={evalResult.abnormal ? "font-medium text-red-900" : ""}>
                          {evalResult.referenceText}
                        </TableCell>
                        <TableCell>
                          {evalResult.status === "abnormal" ? (
                            <span className="text-red-600 font-semibold">Abnormal</span>
                          ) : evalResult.status === "normal" ? (
                            <span className="text-emerald-600 font-semibold">Normal</span>
                          ) : (
                            <span className="text-slate-500">N/A</span>
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                  {detailRows.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-10 text-muted-foreground">
                        No detail rows found in TEST_DETAIL
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={pdfPreviewOpen} onOpenChange={(open) => (!open ? closePdfPreview() : setPdfPreviewOpen(open))}>
        <DialogContent className="max-w-6xl w-[96vw]">
          <DialogHeader>
            <DialogTitle>Lab result preview (PDF)</DialogTitle>
          </DialogHeader>
          <div className="h-[70vh] border rounded-md overflow-hidden bg-white">
            {pdfPreviewUrl ? (
              <iframe title="Blood test PDF preview" src={pdfPreviewUrl} className="w-full h-full" />
            ) : (
              <div className="w-full h-full grid place-items-center text-sm text-slate-500">No preview data</div>
            )}
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" className="btn-outline" onClick={closePdfPreview}>
              Close
            </Button>
            <Button type="button" className="btn-gradient" onClick={handleSavePdfFromPreview} disabled={!pdfPreviewUrl}>
              Download PDF
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
