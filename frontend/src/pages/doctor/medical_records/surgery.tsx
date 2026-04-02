"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useParams } from "react-router-dom"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  Plus,
  Pencil,
  Copy,
  FileDown,
  Loader2,
  Save,
  X,
  PenLine,
  PenOff,
} from "lucide-react"
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table"
import { doctorService, type SurgeryRecord } from "@/services/doctor-service"
import { generateSurgeryPdfBlob } from "@/lib/export-surgery-pdf"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

const URGENCY_OPTIONS = ["HIGH", "MEDIUM", "LOW"] as const

/** SURGERY.type ENUM — see database_description.sql */
const SURGERY_TYPE_OPTIONS = [
  "Minor Surgery",
  "Intermediate Surgery",
  "Major Ambulatory Surgery",
  "Day Surgery",
] as const

const DEFAULT_SURGERY_TYPE: (typeof SURGERY_TYPE_OPTIONS)[number] = "Day Surgery"

function normalizeSurgeryType(raw: string | null | undefined): (typeof SURGERY_TYPE_OPTIONS)[number] {
  const s = String(raw || "").trim()
  return SURGERY_TYPE_OPTIONS.includes(s as (typeof SURGERY_TYPE_OPTIONS)[number])
    ? (s as (typeof SURGERY_TYPE_OPTIONS)[number])
    : DEFAULT_SURGERY_TYPE
}

type UiSurgery = {
  id: string
  type: string
  urgency: string
  startIso: string
  endIso: string
  surgeon: string
  result: string
  note?: string
  isDraft?: boolean
}

function formatDt(iso: string | null | undefined) {
  if (!iso) return "—"
  try {
    return new Date(iso).toLocaleString("vi-VN")
  } catch {
    return String(iso)
  }
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

function normalizeUrgency(u: string | null | undefined) {
  const x = String(u || "MEDIUM").toUpperCase()
  return URGENCY_OPTIONS.includes(x as (typeof URGENCY_OPTIONS)[number]) ? x : "MEDIUM"
}

function toIsoFromLocal(v: string) {
  if (!v) return ""
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? "" : d.toISOString()
}

function mapApi(s: SurgeryRecord): UiSurgery {
  const startIso = s.start ? new Date(s.start).toISOString() : ""
  const endIso = s.end ? new Date(s.end).toISOString() : ""
  return {
    id: String(s.id),
    type: normalizeSurgeryType(s.type),
    urgency: normalizeUrgency(s.urgency),
    startIso,
    endIso,
    surgeon: s.surgeonName || "",
    result: s.result || "",
    note: s.note || "",
    isDraft: false,
  }
}

export default function PatientSurgery() {
  const { patientId } = useParams<{ patientId: string }>()
  const [surgeries, setSurgeries] = useState<UiSurgery[]>([])
  const [selected, setSelected] = useState<UiSurgery | null>(null)
  const [isEdit, setIsEdit] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [exportingPdf, setExportingPdf] = useState(false)
  const [patientLabel, setPatientLabel] = useState("—")
  const [patientAge, setPatientAge] = useState<number | null>(null)
  const [patientGender, setPatientGender] = useState<string | null>(null)
  const [healthInsuranceId, setHealthInsuranceId] = useState<string | null>(null)
  const [latestDiagnosisText, setLatestDiagnosisText] = useState<string>("—")

  const [pdfPreviewOpen, setPdfPreviewOpen] = useState(false)
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null)
  const [pdfPreviewFilename, setPdfPreviewFilename] = useState("")
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

  const load = useCallback(async () => {
    if (!patientId) return
    setLoading(true)
    try {
      const [surRes, patRes] = await Promise.all([
        doctorService.getSurgeries(patientId),
        doctorService.getPatient(patientId).catch(() => null),
      ])
      if (patRes?.patient) {
        const p = patRes.patient
        const name = `${p.firstName || ""} ${p.lastName || ""}`.trim() || p.username || "—"
        setPatientLabel(name)
        setPatientAge(p.age ?? null)
        setPatientGender(p.gender ?? null)
        setHealthInsuranceId(p.healthInsuranceId ?? null)
        const ld = p.latestDiagnosis
        setLatestDiagnosisText(
          ld?.icd10 && ld?.interpretation ? `${ld.icd10}-${ld.interpretation}` : ld?.icd10 ? `${ld.icd10}-` : "—"
        )
      }
      const list = (surRes.surgeries || []).map(mapApi)
      setSurgeries(list)
      if (list.length > 0) {
        setSelected(list[0])
        setIsEdit(false)
      } else {
        setSelected(null)
      }
    } catch (e) {
      console.error(e)
      alert(e instanceof Error ? e.message : "Không tải được phẫu thuật")
    } finally {
      setLoading(false)
    }
  }, [patientId])

  useEffect(() => {
    load()
  }, [load])

  const patchSelected = (patch: Partial<UiSurgery>) => {
    if (!selected) return
    setSelected({ ...selected, ...patch })
  }

  const handleAdd = () => {
    const now = new Date()
    const end = new Date(now.getTime() + 60 * 60 * 1000)
    setSelected({
      id: "new",
      type: DEFAULT_SURGERY_TYPE,
      urgency: "MEDIUM",
      startIso: now.toISOString(),
      endIso: end.toISOString(),
      surgeon: "",
      result: "",
      note: "",
      isDraft: true,
    })
    setIsEdit(true)
  }

  const handleInherit = () => {
    if (!selected) return
    if (selected.isDraft) {
      handleAdd()
      return
    }
    setSelected({
      ...selected,
      id: "new",
      isDraft: true,
    })
    setIsEdit(true)
  }

  const handleSave = async () => {
    if (!patientId || !selected) return
    if (!selected.startIso || !selected.endIso) {
      alert("Chọn thời gian bắt đầu và kết thúc")
      return
    }
    const startD = new Date(selected.startIso)
    const endD = new Date(selected.endIso)
    if (Number.isNaN(startD.getTime()) || Number.isNaN(endD.getTime()) || endD <= startD) {
      alert("Thời gian kết thúc phải sau thời gian bắt đầu")
      return
    }

    if (selected.isDraft) {
      setSaving(true)
      try {
        await doctorService.createSurgery(patientId, {
          type: normalizeSurgeryType(selected.type),
          start: selected.startIso,
          end: selected.endIso,
          surgeonName: selected.surgeon.trim() || null,
          urgency: normalizeUrgency(selected.urgency),
          result: selected.result.trim() || null,
          note: selected.note?.trim() || null,
        })
        await load()
        setIsEdit(false)
      } catch (e) {
        alert(e instanceof Error ? e.message : "Lưu thất bại")
      } finally {
        setSaving(false)
      }
      return
    }
    if (selected.id === "new") return
    setSaving(true)
    try {
      await doctorService.updateSurgery(patientId, Number(selected.id), {
        type: normalizeSurgeryType(selected.type),
        start: selected.startIso,
        end: selected.endIso,
        surgeonName: selected.surgeon.trim() || null,
        urgency: normalizeUrgency(selected.urgency),
        result: selected.result,
        note: selected.note ?? "",
      })
      await load()
      setIsEdit(false)
    } catch (e) {
      alert(e instanceof Error ? e.message : "Lưu thất bại")
    } finally {
      setSaving(false)
    }
  }

  const handleCancel = () => {
    load()
    setIsEdit(false)
  }

  const canEditFields = selected && (selected.isDraft || isEdit)

  const [signingKind, setSigningKind] = useState<null | "sign" | "unsign">(null)

  const canAdd = !isEdit && !loading && !saving && !signingKind
  const canEdit = selected && !isEdit && !loading && !saving && !signingKind && !selected.isDraft
  const canInherit = selected && !isEdit && !loading && !saving && !signingKind
  const canSign = selected && !isEdit && !loading && !saving && !signingKind
  const canUnsign = selected && !isEdit && !loading && !saving && !signingKind
  const canSaveOrCancel = selected && (selected.isDraft || isEdit) && !loading && !signingKind

  const handleExportPdf = async () => {
    if (!patientId || !selected) return
    setExportingPdf(true)
    try {
      const { blob, filename } = await generateSurgeryPdfBlob({
        patientLabel,
        patientAge,
        patientGender,
        healthInsuranceId,
        latestDiagnosisText,
        surgeon: selected.surgeon,
        type: selected.type,
        urgency: selected.urgency,
        start: selected.startIso,
        end: selected.endIso,
        result: selected.result,
        note: selected.note ?? "",
      })
      const url = URL.createObjectURL(blob)
      releasePdfBlobUrl(url)
      setPdfPreviewFilename(filename)
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
            <DialogTitle>Surgery preview (PDF)</DialogTitle>
          </DialogHeader>
          {pdfPreviewUrl ? (
            <iframe
              title="Surgery PDF preview"
              src={pdfPreviewUrl}
              className="min-h-[min(520px,60vh)] w-full flex-1 rounded-md border border-slate-200 bg-slate-50"
            />
          ) : null}
          <DialogFooter className="gap-2 sm:gap-2">
            <Button type="button" variant="outline" className="btn-outline" onClick={closePdfPreview}>
              Close
            </Button>
            <Button type="button" className="btn-gradient" onClick={handleSavePdfFromPreview}>
              <FileDown className="h-4 w-4 mr-2" />
              Save / Download
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="grid grid-cols-12 gap-6">
      <Card className="col-span-4">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-lg">Surgery history</span>
            </div>
            <Button
              size="sm"
              className="btn-outline transition-transform duration-500 text-xl px-4 py-2"
              onClick={() => void handleExportPdf()}
              disabled={loading || exportingPdf || !selected}
              title="Export surgical procedure record (PDF)"
            >
              {exportingPdf ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <FileDown className="h-4 w-4 mr-2" />
              )}
              Export PDF
            </Button>
          </div>

          {loading ? (
            <p className="text-sm text-slate-500">Đang tải…</p>
          ) : (
            <Table className="w-full text-sm overflow-x-auto">
              <TableHeader
                className="bg-cyan-50 text-white"
                style={{ background: "linear-gradient(135deg, #06b6d4 0%, #0891b2 100%)" }}
              >
                <TableRow>
                  <TableHead className="p-2 text-left text-white">No.</TableHead>
                  <TableHead className="p-2 text-left text-white">Type</TableHead>
                  <TableHead className="p-2 text-left text-white">Start date</TableHead>
                  <TableHead className="p-2 text-left text-white">Surgeon</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {surgeries.map((s, i) => (
                  <TableRow
                    key={s.id}
                    onClick={() => {
                      setSelected({ ...s, isDraft: false })
                      setIsEdit(false)
                    }}
                    className={`cursor-pointer border-t hover:bg-slate-50 ${
                      selected?.id === s.id ? "bg-cyan-50" : ""
                    }`}
                  >
                    <TableCell className="p-2">{i + 1}</TableCell>
                    <TableCell className="p-2">{s.type || "—"}</TableCell>
                    <TableCell className="p-2">{formatDt(s.startIso)}</TableCell>
                    <TableCell className="p-2">{s.surgeon || "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card className="col-span-8">
        <CardContent className="p-5 space-y-4">
          <div className="overflow-x-auto">
            <div className="flex flex-nowrap gap-2 justify-end min-w-max">
            <Button
              size="sm"
              className="btn-gradient transition-transform duration-500 text-xl px-7 py-4"
              onClick={handleAdd}
              disabled={!canAdd}
            >
              <Plus size={16} /> Add
            </Button>

            <Button
              size="sm"
              className="btn-outline transition-transform duration-500 text-xl px-7 py-4"
              onClick={() => setIsEdit(true)}
              disabled={!canEdit}
            >
              <Pencil size={16} /> Edit
            </Button>

            <Button
              size="sm"
              className="btn-outline transition-transform duration-500 text-xl px-7 py-4"
              onClick={handleInherit}
              disabled={!canInherit}
            >
              <Copy size={16} /> Inherit
            </Button>

            <Button
              size="sm"
              className="!bg-[#16a34a] text-white hover:bg-green-700 border-0 transition-transform duration-500 text-xl px-7 py-4 gap-2"
              onClick={async () => {
                if (!canSign) return
                setSigningKind("sign")
                try {
                  await handleSave()
                } finally {
                  setSigningKind(null)
                }
              }}
              disabled={!canSign}
              title="Sign (finalize) — Web demo"
            >
              {signingKind === "sign" ? <Loader2 className="h-4 w-4 animate-spin shrink-0" /> : null}
              <PenLine className="h-5 w-5" />
              Sign
            </Button>

            <Button
              size="sm"
              className="!bg-[#dc2626] text-white hover:bg-red-700 border-0 transition-transform duration-500 text-xl px-7 py-4 gap-2"
              onClick={async () => {
                if (!canUnsign) return
                setSigningKind("unsign")
                try {
                  await handleSave()
                } finally {
                  setSigningKind(null)
                }
              }}
              disabled={!canUnsign}
              title="Void (revoke signature) — Web demo"
            >
              {signingKind === "unsign" ? <Loader2 className="h-4 w-4 animate-spin shrink-0" /> : null}
              <PenOff className="h-5 w-5" />
              Void Signature
            </Button>

            <Button
              size="sm"
              className="btn-outline transition-transform duration-500 text-xl px-7 py-4"
              onClick={handleSave}
              disabled={!canSaveOrCancel || saving}
            >
              <Save className="h-4 w-4" /> Save
            </Button>

            <Button
              size="sm"
              className="btn-outline transition-transform duration-500 text-xl px-7 py-4"
              onClick={handleCancel}
              disabled={!canSaveOrCancel || saving}
            >
              <X className="h-4 w-4" /> Cancel
            </Button>
            </div>
          </div>

          {!selected ? (
            <p className="text-sm text-slate-500">
              Click on any row to load that record into the form below or click &quot;Add&quot; button to create a new
              record
            </p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Patient" value={patientLabel} />
                {canEditFields ? (
                  <div>
                    <label className="text-xs text-slate-500">Surgeon</label>
                    <input
                      className="w-full border rounded px-2 py-1 text-sm"
                      value={selected.surgeon}
                      onChange={(e) => patchSelected({ surgeon: e.target.value })}
                    />
                  </div>
                ) : (
                  <Field label="Surgeon" value={selected.surgeon} />
                )}

                {canEditFields ? (
                  <>
                    <div>
                      <label className="text-xs text-slate-500">Type</label>
                      <select
                        className="w-full border rounded px-2 py-1 text-sm bg-white"
                        value={normalizeSurgeryType(selected.type)}
                        onChange={(e) =>
                          patchSelected({
                            type: normalizeSurgeryType(e.target.value),
                          })
                        }
                      >
                        {SURGERY_TYPE_OPTIONS.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-slate-500">Urgency</label>
                      <select
                        className="w-full border rounded px-2 py-1 text-sm bg-white"
                        value={normalizeUrgency(selected.urgency)}
                        onChange={(e) => patchSelected({ urgency: e.target.value })}
                      >
                        {URGENCY_OPTIONS.map((u) => (
                          <option key={u} value={u}>
                            {u}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-slate-500">Start</label>
                      <input
                        type="datetime-local"
                        className="w-full border rounded px-2 py-1 text-sm"
                        value={toDateInput(selected.startIso)}
                        onChange={(e) => {
                          const iso = toIsoFromLocal(e.target.value)
                          if (iso) patchSelected({ startIso: iso })
                        }}
                      />
                    </div>
                    <div>
                      <label className="text-xs text-slate-500">End</label>
                      <input
                        type="datetime-local"
                        className="w-full border rounded px-2 py-1 text-sm"
                        value={toDateInput(selected.endIso)}
                        onChange={(e) => {
                          const iso = toIsoFromLocal(e.target.value)
                          if (iso) patchSelected({ endIso: iso })
                        }}
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <Field label="Type" value={selected.type} />
                    <Field label="Urgency" value={selected.urgency} />
                    <Field label="Start" value={formatDt(selected.startIso)} />
                    <Field label="End" value={formatDt(selected.endIso)} />
                  </>
                )}
              </div>

              <TextArea
                label="Result (Short description)"
                value={selected.result}
                editable={!!canEditFields}
                onChange={(v) => patchSelected({ result: v })}
              />

              <TextArea
                label="Doctor's Note"
                value={selected.note ?? ""}
                editable={!!canEditFields}
                onChange={(v) => patchSelected({ note: v })}
              />
            </>
          )}
        </CardContent>
      </Card>
    </div>
    </>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <label className="text-xs text-slate-500">{label}</label>
      <div className="border rounded px-2 py-1 text-sm bg-slate-50">{value || "—"}</div>
    </div>
  )
}

function TextArea({
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
    <div>
      <label className="text-xs text-slate-500">{label}</label>
      {editable ? (
        <textarea
          className="w-full border rounded px-2 py-2 text-sm"
          rows={3}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <div className="border rounded px-2 py-2 text-sm bg-slate-50">{value || "—"}</div>
      )}
    </div>
  )
}
