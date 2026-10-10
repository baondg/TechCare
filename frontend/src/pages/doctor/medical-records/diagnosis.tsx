"use client"

import { useCallback, useEffect, useState, useRef, useId } from "react"
import { useParams } from "react-router-dom"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { ChevronDown, Copy, FileDown, History, Plus, Save, Search, X, Loader2 } from "lucide-react"
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
import { signingLineFromIso, stampPdfWithExportFooter } from "@/lib/pdf-export-stamp"
import { useEmrSession } from "@/contexts/emr-session-context"
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { useTranslation } from "react-i18next"
import { translatePatientInDepartment } from "@/lib/patient-departments"

type UiDiagnosis = {
  id: string
  /** ISO từ API — dùng cho dòng thời gian ký trên PDF */
  createdAtIso?: string
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
    createdAtIso: d.createdAt,
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
  const { t } = useTranslation()
  const { patientId } = useParams<{ patientId: string }>()
  const { mutationsAllowed, refreshPatientBanner } = useEmrSession()
  const [diagnoses, setDiagnoses] = useState<UiDiagnosis[]>([])
  const [selectedDx, setSelectedDx] = useState<UiDiagnosis | null>(null)
  const [viewDxBeforeEdit, setViewDxBeforeEdit] = useState<UiDiagnosis | null>(null)
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
    if (!selectedDx.icd10.trim()) {
      alert("Please select an ICD-10 diagnosis")
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
      refreshPatientBanner()
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
  const canExportPdf = !!patientId && !!selectedDx && !exportingPdf

  const handleExportPdf = async () => {
    if (!patientId || !selectedDx) return
    setExportingPdf(true)
    try {
      const res = await doctorService.getPatient(patientId)
      const p: PatientDetail | undefined = res.patient
      if (!p) throw new Error("Fail to load patient information")

      const fullName = `${p.lastName || ""} ${p.firstName || ""}`.trim() || p.username || ""
      const age = p.age != null ? String(p.age) : ""
      const departmentRaw = (p.inDepartment || (p as any).in_department || "").toString()
      const department = translatePatientInDepartment(departmentRaw, t)

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
        signingTimeDisplay: signingLineFromIso(selectedDx.createdAtIso),
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

  const handleSavePdfFromPreview = async () => {
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
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      console.error(e)
      alert(e instanceof Error ? e.message : "Download failed")
    }
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
                className="btn-gradient transition-transform duration-500"
                onClick={handleAddDiagnosis}
                disabled={!canAdd}
              >
                <Plus className="h-4 w-4" />
                Add
              </Button>
              <Button
                size="sm"
                className="btn-outline transition-transform duration-500"
                onClick={handleInheritDiagnosis}
                disabled={!canInherit}
              >
                <Copy className="h-4 w-4" />
                Inherit
              </Button>
              <Button
                size="sm"
                className="btn-outline transition-transform duration-500"
                onClick={handleSave}
                disabled={!canSaveDraft || saving}
              >
                <Save className="h-4 w-4" />
                Save
              </Button>
              <Button
                size="sm"
                className="btn-outline transition-transform duration-500"
                onClick={handleCancel}
                disabled={!canCancelDraft || saving}
              >
                <X className="h-4 w-4" />
                Cancel
              </Button>

              <Button
                size="sm"
                className="btn-outline transition-transform duration-500"
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
                editable={!!selectedDx.isDraft && mutationsAllowed}
                onChange={(v) => setSelectedDx({ ...selectedDx, complaint: v })}
              />

              <Icd10Combobox
                label="Diagnosis (ICD-10)"
                required
                value={selectedDx.icd10}
                disabled={!selectedDx.isDraft || !mutationsAllowed}
                onIcdChange={(icd10, interpretationFromPick) => {
                  setSelectedDx({
                    ...selectedDx,
                    icd10,
                    ...(interpretationFromPick !== undefined ? { interpretation: interpretationFromPick } : {}),
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

/**
 * Server-backed search (GET /api/doctor/diseases?q=) — avoids huge <datalist> and the API’s
 * default LIMIT 300 when no query (only early alphabet codes would load client-side).
 */
function Icd10Combobox({
  label,
  required = false,
  value,
  disabled,
  onIcdChange,
}: {
  label: string
  required?: boolean
  value: string
  disabled: boolean
  /** Second arg only when user picks a row — then interpretation is set from DB. */
  onIcdChange: (icd10: string, interpretationFromPick?: string) => void
}) {
  const listId = useId()
  const skipBlurResolveRef = useRef(false)
  const blurResolveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<DiseaseCode[]>([])
  const [loading, setLoading] = useState(false)

  const load = useCallback(async (q: string) => {
    setLoading(true)
    try {
      const res = await doctorService.getDiseaseCodes(q.trim() || undefined)
      setItems(res.diseases || [])
    } catch {
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!open) return
    const t = window.setTimeout(() => {
      void load(value)
    }, 220)
    return () => window.clearTimeout(t)
  }, [open, value, load])

  const tryResolveExactIcd = useCallback(async () => {
    const c = value.trim()
    if (!c) return
    try {
      const res = await doctorService.getDiseaseCodes(c)
      const exact = res.diseases?.find((x) => x.code === c)
      if (exact) onIcdChange(exact.code, exact.description)
    } catch {
      /* ignore */
    }
  }, [value, onIcdChange])

  if (disabled) {
    return (
      <div className="space-y-1">
        <label className="text-sm font-medium text-slate-600">
          {label}
          {required ? <span className="text-red-500"> *</span> : null}
        </label>
        <div className="rounded-lg border bg-slate-50 px-3 py-2 text-sm">{value || "—"}</div>
      </div>
    )
  }

  return (
    <div className="space-y-1">
      <label className="text-sm font-medium text-slate-600">
        {label}
        {required ? <span className="text-red-500"> *</span> : null}
      </label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverAnchor asChild>
          <div
            className={cn(
              "flex h-10 w-full items-stretch rounded-lg border border-slate-200 bg-white shadow-sm",
              "focus-within:border-cyan-500 focus-within:ring-1 focus-within:ring-cyan-500/30",
            )}
          >
            <Input
              className="h-10 min-h-10 min-w-0 flex-1 rounded-none border-0 bg-transparent px-3 py-2 text-sm shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
              value={value}
              onChange={(e) => {
                onIcdChange(e.target.value)
                setOpen(true)
              }}
              onInput={(e) => {
                onIcdChange((e.target as HTMLInputElement).value)
                setOpen(true)
              }}
              onClick={() => setOpen(true)}
              onFocus={() => setOpen(true)}
              onBlur={() => {
                if (blurResolveTimerRef.current) clearTimeout(blurResolveTimerRef.current)
                blurResolveTimerRef.current = window.setTimeout(() => {
                  blurResolveTimerRef.current = null
                  if (skipBlurResolveRef.current) return
                  void tryResolveExactIcd()
                }, 200)
              }}
              autoComplete="off"
              placeholder="Type code or name (e.g. C03) — search from database"
              role="combobox"
              aria-expanded={open}
              aria-haspopup="listbox"
              aria-controls={listId}
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-10 min-h-10 w-9 shrink-0 rounded-none rounded-r-lg border-l border-slate-200 p-0 hover:bg-slate-50"
              aria-label="Open ICD-10 suggestions"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setOpen((o) => !o)}
            >
              <ChevronDown
                className={cn("h-4 w-4 text-slate-600 transition-transform duration-200", open && "rotate-180")}
              />
            </Button>
          </div>
        </PopoverAnchor>
        <PopoverContent
          className="p-0 w-[var(--radix-popover-anchor-width)] min-w-[min(28rem,calc(100vw-2rem))] max-w-[min(36rem,96vw)]"
          align="start"
          sideOffset={4}
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <ScrollArea className="h-[min(280px,40vh)]">
            {loading ? (
              <div className="flex items-center gap-2 p-3 text-sm text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                Searching…
              </div>
            ) : items.length === 0 ? (
              <div className="p-3 text-sm text-slate-500">No matching ICD-10 rows. Try another code or keyword.</div>
            ) : (
              <ul id={listId} className="py-1" role="listbox">
                {items.map((d) => (
                  <li key={d.code}>
                    <button
                      type="button"
                      role="option"
                      className="w-full text-left px-3 py-2 text-sm hover:bg-cyan-50"
                      title={`${d.code} — ${d.description}`}
                      onMouseDown={(e) => {
                        e.preventDefault()
                        if (blurResolveTimerRef.current) {
                          clearTimeout(blurResolveTimerRef.current)
                          blurResolveTimerRef.current = null
                        }
                        skipBlurResolveRef.current = true
                      }}
                      onClick={() => {
                        onIcdChange(d.code, d.description)
                        setOpen(false)
                        skipBlurResolveRef.current = false
                      }}
                    >
                      <span className="font-mono font-medium text-slate-900">{d.code}</span>
                      <span className="mt-0.5 block text-xs leading-snug text-slate-600 line-clamp-2">
                        {d.description}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </ScrollArea>
        </PopoverContent>
      </Popover>
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
          onInput={(e) => onChange((e.target as HTMLTextAreaElement).value)}
          onBlur={(e) => onChange(e.target.value)}
        />
      ) : (
        <div className="rounded-lg border bg-slate-50 px-3 py-2 text-sm">{value || "—"}</div>
      )}
    </div>
  )
}
