"use client"

import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react"
import { useParams } from "react-router-dom"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { History, FlaskConical, Upload, Pencil, Plus, FileDown, Loader2, Calendar as CalendarIcon } from "lucide-react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Calendar } from "@/components/ui/calendar"
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
  type TechnicianOption,
} from "@/services/doctor-service"
import { generateBloodTestPdfBlob } from "@/lib/export-blood-test-pdf"
import { signingLineFromIso, stampPdfWithExportFooter } from "@/lib/pdf-export-stamp"
import { evaluateLabMetric } from "@/lib/lab-metric-eval"
import { useEmrSession } from "@/contexts/emr-session-context"
import { format, isValid, parse } from "date-fns"

type Row = {
  id: number | "new"
  testType: string
  testDateIso: string
  technicianId: number | null
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

function formatDisplayDate(iso: string) {
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return iso
    return format(d, "dd/MM/yyyy HH:mm")
  } catch {
    return iso
  }
}

function maskDateTimeInput(raw: string) {
  const digits = String(raw || "").replace(/\D/g, "").slice(0, 12)
  if (digits.length <= 2) return digits
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`
  if (digits.length <= 8) return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`
  if (digits.length <= 10) return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4, 8)} ${digits.slice(8)}`
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4, 8)} ${digits.slice(8, 10)}:${digits.slice(10)}`
}

function parseDdMmYyyyHhMmToIso(v: string): string | null {
  const s = String(v || "").trim()
  if (!s) return ""
  if (!/^\d{2}\/\d{2}\/\d{4}\s\d{2}:\d{2}$/.test(s)) return null
  const d = parse(s, "dd/MM/yyyy HH:mm", new Date())
  if (!isValid(d) || format(d, "dd/MM/yyyy HH:mm") !== s) return null
  return d.toISOString()
}

function safeDateFromIso(iso: string): Date {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? new Date() : d
}

function apiToRow(t: ApiLabTest): Row {
  return {
    id: t.id,
    testType: t.testType,
    testDateIso: t.testDate,
    technicianId: t.technicianId ?? null,
    technicianName: t.technicianName || "",
    resultSummary: t.resultSummary || "",
    fileUrl: t.fileUrl || "",
    note: t.note || "",
  }
}

export default function PatientLab() {
  const { patientId } = useParams<{ patientId: string }>()
  const { mutationsAllowed } = useEmrSession()
  const [rows, setRows] = useState<Row[]>([])
  const [selected, setSelected] = useState<Row | null>(null)
  const [technicians, setTechnicians] = useState<TechnicianOption[]>([])
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
  const [pdfPreviewFilename, setPdfPreviewFilename] = useState("phieu-xet-nghiem.pdf")
  const pdfBlobUrlRef = useRef<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploadingFile, setUploadingFile] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [dateInputValue, setDateInputValue] = useState("")
  const [datePickerOpen, setDatePickerOpen] = useState(false)

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
      alert(e instanceof Error ? e.message : "Khong tai duoc xet nghiem")
    } finally {
      setLoading(false)
    }
  }, [patientId])

  const loadTechnicians = useCallback(async () => {
    try {
      const res = await doctorService.getTechnicians()
      setTechnicians(res.technicians || [])
    } catch (e) {
      console.error(e)
      // Keep form usable even if we can't load technicians
      setTechnicians([])
    }
  }, [])

  const loadPatientContext = useCallback(async () => {
    if (!patientId) return
    try {
      const res = await doctorService.getPatient(patientId)
      const firstName = res.patient?.firstName || ""
      const lastName = res.patient?.lastName || ""
      setPatientCtx({
        gender: res.patient?.gender ?? null,
        bmi: typeof res.patient?.bmi === "number" ? res.patient.bmi : null,
        fullName: `${lastName} ${firstName}`.trim(),
        age: res.patient?.age != null ? String(res.patient.age) : "",
        department: res.patient?.inDepartment || "",
        diagnosis: res.patient?.latestDiagnosis?.interpretation || "",
      })
    } catch (error) {
      console.error(error)
      setPatientCtx({ gender: null, bmi: null, fullName: "", age: "", department: "", diagnosis: "" })
    }
  }, [patientId])

  useEffect(() => {
    void loadTechnicians()
    void loadPatientContext()
    void load()
  }, [load, loadTechnicians, loadPatientContext])

  const updateField = <K extends keyof Row>(key: K, value: Row[K]) => {
    setSelected((prev) => (prev ? { ...prev, [key]: value } : prev))
  }

  useEffect(() => {
    setDateInputValue(selected?.testDateIso ? formatDisplayDate(selected.testDateIso) : "")
  }, [selected?.id, selected?.testDateIso])

  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const handleAdd = () => {
    if (!mutationsAllowed) return
    const now = new Date()
    setSelected({
      id: "new",
      testType: "",
      testDateIso: now.toISOString(),
      technicianId: technicians[0]?.technicianId ?? null,
      technicianName: technicians[0]?.technicianName ?? "",
      resultSummary: "",
      fileUrl: "",
      note: "",
    })
    setEditMode(true)
  }

  const handleSave = async () => {
    if (!mutationsAllowed) return
    if (!patientId || !selected) return
    const iso = selected.testDateIso
    if (!selected.testType.trim()) {
      alert("Nhap loai xet nghiem")
      return
    }
    setSaving(true)
    try {
      if (selected.id === "new") {
        await doctorService.createLabTest(patientId, {
          testType: selected.testType.trim(),
          testDate: iso,
          technicianId: selected.technicianId ?? undefined,
          technicianName: selected.technicianName.trim() || undefined,
          resultSummary: selected.resultSummary.trim() || undefined,
          fileUrl: selected.fileUrl.trim() || undefined,
          note: selected.note.trim() || undefined,
        })
      } else {
        await doctorService.updateLabTest(patientId, selected.id, {
          testType: selected.testType.trim(),
          testDate: iso,
          technicianId: selected.technicianId ?? null,
          technicianName: selected.technicianName.trim() || null,
          resultSummary: selected.resultSummary.trim() || null,
          fileUrl: selected.fileUrl.trim() || null,
          note: selected.note.trim() || null,
        })
      }
      await load()
      setEditMode(false)
    } catch (e) {
      alert(e instanceof Error ? e.message : "Luu that bai")
    } finally {
      setSaving(false)
    }
  }

  const handleCancel = () => {
    void load()
    setEditMode(false)
  }

  const toAbsoluteUrl = (url: string) => {
    if (!url) return ""
    if (/^https?:\/\//i.test(url)) return url
    const base = import.meta.env.VITE_API_BASE_URL || "http://localhost:3000"
    return `${base}${url.startsWith("/") ? "" : "/"}${url}`
  }

  const handlePickFile = () => {
    if (!mutationsAllowed) return
    if (!selected) return
    if (!editMode && selected.id !== "new") return
    fileInputRef.current?.click()
  }

  const handleFileChosen = async (e: ChangeEvent<HTMLInputElement>) => {
    if (!mutationsAllowed) return
    const file = e.target.files?.[0]
    if (!file || !selected) return
    try {
      setUploadingFile(true)
      const uploaded = await doctorService.uploadLabAttachment(file)
      updateField("fileUrl", uploaded.fileUrl)
    } catch (error) {
      console.error(error)
      alert(error instanceof Error ? error.message : "Upload failed")
    } finally {
      setUploadingFile(false)
      e.target.value = ""
    }
  }

  const handleOpenDetail = async () => {
    if (!patientId || !selected || selected.id === "new") return
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
    } catch (error) {
      console.error(error)
      alert(error instanceof Error ? error.message : "Download failed")
    }
  }

  const handleExportPdf = async () => {
    if (!patientId || !selected || selected.id === "new") return
    setExportingPdf(true)
    try {
      const detailRes = await doctorService.getLabTestDetails(patientId, selected.id)
      const { blob, filename } = await generateBloodTestPdfBlob({
        patientName: patientCtx.fullName,
        age: patientCtx.age,
        gender: patientCtx.gender,
        department: patientCtx.department,
        diagnosis: patientCtx.diagnosis,
        testDateLabel: selected.testDateIso,
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

  const fileLabel = selected?.fileUrl?.trim() || ""
  const formEditable = mutationsAllowed && (editMode || selected?.id === "new")

  return (
    <div className="grid grid-cols-12 gap-6">
      <Card className="col-span-6">
        <CardContent className="p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 font-semibold text-lg">
              <History size={18} />
              Laboratory History
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                className="btn-outline gap-1"
                onClick={() => void handleExportPdf()}
                disabled={loading || !selected || selected.id === "new"}
              >
                {exportingPdf ? <Loader2 size={14} className="animate-spin" /> : <FileDown size={14} />} Export
              </Button>
              <Button
                size="sm"
                className="btn-gradient gap-1"
                onClick={handleAdd}
                disabled={loading || !mutationsAllowed}
              >
                <Plus size={14} /> Add
              </Button>
            </div>
          </div>

          {loading ? (
            <p className="text-sm text-slate-500">Loading...</p>
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
                          <a href={toAbsoluteUrl(r.fileUrl)} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
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
              <Button
                size="sm"
                className="btn-outline"
                onClick={handleOpenDetail}
                disabled={!selected || selected.id === "new" || loading}
              >
                View details
              </Button>
              <Button
                size="sm"
                className="btn-outline flex gap-2"
                onClick={() => setEditMode(true)}
                disabled={!selected || selected.id === "new" || loading || !mutationsAllowed}
              >
                <Pencil size={14} /> Edit
              </Button>
              <Button
                size="sm"
                className="btn-gradient"
                onClick={handleSave}
                disabled={saving || !formEditable}
              >
                Save
              </Button>
              <Button size="sm" className="btn-outline" onClick={handleCancel} disabled={saving}>
                Cancel
              </Button>
            </div>
          </div>

          {!selected ? (
            <p className="text-sm text-slate-500">Click on any row to load that record into the form below or click "Add" button to create a new record</p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm text-slate-600">Test type</label>
                  <input
                    className="w-full border rounded px-3 py-2"
                    value={selected.testType}
                    onChange={(e) => updateField("testType", e.target.value)}
                    readOnly={!formEditable}
                  />
                </div>

                <div>
                  <label className="text-sm text-slate-600">Date</label>
                  <div className="relative">
                    <input
                      className="w-full border rounded px-3 py-2 pr-10"
                      value={dateInputValue}
                      placeholder="dd/mm/yyyy hh:mm"
                      readOnly={!formEditable}
                      onChange={(e) => {
                        const next = maskDateTimeInput(e.target.value)
                        setDateInputValue(next)
                        const iso = parseDdMmYyyyHhMmToIso(next)
                        if (iso !== null) updateField("testDateIso", iso)
                      }}
                      onBlur={() => {
                        const iso = parseDdMmYyyyHhMmToIso(dateInputValue)
                        if (iso) {
                          updateField("testDateIso", iso)
                          setDateInputValue(formatDisplayDate(iso))
                        }
                      }}
                    />
                    <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="absolute right-1 top-1/2 h-8 w-8 -translate-y-1/2"
                          disabled={!formEditable}
                        >
                          <CalendarIcon className="h-4 w-4 opacity-70" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-2" align="end">
                        <Calendar
                          mode="single"
                          captionLayout="dropdown"
                          selected={safeDateFromIso(selected.testDateIso)}
                          onSelect={(d) => {
                            if (!d) return
                            const base = selected.testDateIso ? new Date(selected.testDateIso) : new Date()
                            const merged = new Date(d)
                            merged.setHours(base.getHours(), base.getMinutes(), 0, 0)
                            const iso = merged.toISOString()
                            updateField("testDateIso", iso)
                            setDateInputValue(formatDisplayDate(iso))
                            setDatePickerOpen(false)
                          }}
                        />
                        <div className="mt-2 flex gap-2">
                          <Select
                            value={String(safeDateFromIso(selected.testDateIso).getHours()).padStart(2, "0")}
                            onValueChange={(h) => {
                              const base = selected.testDateIso ? new Date(selected.testDateIso) : new Date()
                              base.setHours(Number(h))
                              const iso = base.toISOString()
                              updateField("testDateIso", iso)
                              setDateInputValue(formatDisplayDate(iso))
                            }}
                          >
                            <SelectTrigger className="h-8 w-20"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0")).map((h) => (
                                <SelectItem key={`h-${h}`} value={h}>{h}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Select
                            value={String(safeDateFromIso(selected.testDateIso).getMinutes()).padStart(2, "0")}
                            onValueChange={(m) => {
                              const base = selected.testDateIso ? new Date(selected.testDateIso) : new Date()
                              base.setMinutes(Number(m))
                              const iso = base.toISOString()
                              updateField("testDateIso", iso)
                              setDateInputValue(formatDisplayDate(iso))
                            }}
                          >
                            <SelectTrigger className="h-8 w-20"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {Array.from({ length: 60 }, (_, i) => String(i).padStart(2, "0")).map((m) => (
                                <SelectItem key={`m-${m}`} value={m}>{m}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Button
                            type="button"
                            variant="outline"
                            className="h-8 px-2 text-xs"
                            onClick={() => {
                              const now = new Date()
                              const iso = now.toISOString()
                              updateField("testDateIso", iso)
                              setDateInputValue(formatDisplayDate(iso))
                            }}
                          >
                            Now
                          </Button>
                        </div>
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>
              </div>

              <div>
                <label className="text-sm text-slate-600">Technician</label>
                <Select
                  value={selected.technicianId ? String(selected.technicianId) : ""}
                  onValueChange={(v) => {
                    const idNum = Number(v)
                    const opt = technicians.find((t) => t.technicianId === idNum)
                    updateField("technicianId", Number.isFinite(idNum) ? idNum : null)
                    updateField("technicianName", opt?.technicianName ?? "")
                  }}
                  disabled={!formEditable}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select technician" />
                  </SelectTrigger>
                  <SelectContent>
                    {technicians.map((t) => (
                      <SelectItem key={t.technicianId} value={String(t.technicianId)}>
                        {t.technicianName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm text-slate-600">Result (Short description)</label>
                <input
                  className="w-full border rounded px-3 py-2"
                  value={selected.resultSummary}
                  onChange={(e) => updateField("resultSummary", e.target.value)}
                  readOnly={!formEditable}
                />
              </div>

              <div>
                <label className="text-sm text-slate-600">File URL (PDF / anh)</label>
                <input
                  className="w-full border rounded px-3 py-2 text-sm"
                  value={selected.fileUrl}
                  onChange={(e) => updateField("fileUrl", e.target.value)}
                  placeholder="https://..."
                  readOnly={!formEditable}
                />
              </div>

              <div>
                <label className="text-sm text-slate-600">Results (image / PDF)</label>
                <div
                  className={`border-2 border-dashed rounded-lg p-6 flex flex-col items-center justify-center text-slate-400 ${
                    !formEditable ? "opacity-70 cursor-not-allowed" : "cursor-pointer hover:bg-slate-50"
                  }`}
                  onClick={handlePickFile}
                >
                  <Upload size={20} />
                  <p className="text-sm mt-2 text-center">
                    {uploadingFile ? "Uploading..." : "Click to choose an image/PDF from your computer"}
                  </p>
                  {fileLabel ? (
                    <a href={toAbsoluteUrl(fileLabel)} className="text-cyan-600 text-sm mt-2 break-all" target="_blank" rel="noreferrer" onClick={(ev) => ev.stopPropagation()}>
                      Open file
                    </a>
                  ) : null}
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,image/*"
                  className="hidden"
                  onChange={handleFileChosen}
                />
              </div>

              <div>
                <label className="text-sm text-slate-600">Doctor&apos;s Note</label>
                <textarea
                  className="w-full border rounded px-3 py-2 bg-muted/40"
                  rows={3}
                  value={selected.note}
                  readOnly
                  title="Only doctors can edit this field"
                />
              </div>

            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-5xl w-[95vw]">
          <DialogHeader>
            <DialogTitle>Lab Test Detail Analysis</DialogTitle>
          </DialogHeader>
          <div className="text-sm text-slate-600">
            Context: Gender = {patientCtx.gender || "N/A"}, BMI = {patientCtx.bmi ?? "N/A"}
          </div>
          {detailLoading ? (
            <p className="text-sm text-slate-500">Loading details...</p>
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
            <DialogTitle>Lab Test Slip Preview (PDF)</DialogTitle>
          </DialogHeader>
          <div className="h-[70vh] border rounded-md overflow-hidden bg-white">
            {pdfPreviewUrl ? (
              <iframe title="Blood test PDF preview" src={pdfPreviewUrl} className="w-full h-full" />
            ) : (
              <div className="w-full h-full grid place-items-center text-sm text-slate-500">No preview data available</div>
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
