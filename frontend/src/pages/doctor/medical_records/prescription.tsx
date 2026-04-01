"use client"

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { useParams } from "react-router-dom"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Trash2,
  History,
  Plus,
  Edit,
  Copy,
  Save,
  X,
  ChevronDown,
  FileDown,
  Loader2,
  Printer,
  CheckCircle2,
  PenOff,
  PenLine,
} from "lucide-react"
import { cn } from "@/lib/utils"
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
  type Prescription as ApiPrescription,
  type MedicineOption,
  type PrescriptionSignatureStatus,
} from "@/services/doctor-service"
import { generatePrescriptionPdfBlob } from "@/lib/export-prescription-pdf"
import { usePauseableToast, type PauseableToastEntry } from "@/hooks/usePauseableToast"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

const PRESCRIPTION_UNITS = [
  "tablet",
  "capsule",
  "syrup",
  "injection",
  "drop",
  "cream",
  "ointment",
  "powder",
  "spray",
] as const

type MedUnit = (typeof PRESCRIPTION_UNITS)[number]

type Medication = {
  name: string
  quantity: string
  unit: MedUnit
  usage: string
  note?: string
}

function normalizeMedicationUnit(raw: string | null | undefined): MedUnit {
  const s = String(raw || "")
    .trim()
    .toLowerCase()
  if (!s) return "tablet"
  const hit = PRESCRIPTION_UNITS.find((u) => u === s || s.startsWith(u) || s.includes(u))
  if (hit) return hit
  if (s.includes("cap")) return "capsule"
  if (s.includes("tab") || s === "viên") return "tablet"
  if (s.includes("syrup") || s.includes("siro")) return "syrup"
  if (s.includes("inj") || s.includes("inject") || s.includes("tiêm")) return "injection"
  if (s.includes("drop") || s.includes("nhỏ giọt")) return "drop"
  if (s.includes("cream") || s.includes("kem")) return "cream"
  if (s.includes("oint") || s.includes("mỡ")) return "ointment"
  if (s.includes("powder") || s.includes("bột")) return "powder"
  if (s.includes("spray") || s.includes("xịt")) return "spray"
  return "tablet"
}

type UiPrescription = {
  id: string
  /** ISO from API — for compact history column */
  createdAt: string
  date: string
  doctor: string
  medications: Medication[]
  signatureStatus: PrescriptionSignatureStatus
  isDraft?: boolean
}

function formatHistoryTableDate(iso: string) {
  if (!iso) return "—"
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return iso
    const date = d.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "2-digit" })
    const time = d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", hour12: false })
    return `${date} ${time}`
  } catch {
    return iso
  }
}

function normalizeSignatureStatus(s: string | undefined): PrescriptionSignatureStatus {
  const raw = String(s || "").trim().toLowerCase()
  if (raw === "signed") return "signed"
  if (raw === "voided") return "voided"
  if (raw === "unsigned") return "voided"
  return "draft"
}

function signatureStatusLabel(s: PrescriptionSignatureStatus): "Draft" | "Signed" | "Voided" {
  if (s === "signed") return "Signed"
  if (s === "voided") return "Voided"
  return "Draft"
}

function formatDt(iso: string) {
  try {
    return new Date(iso).toLocaleString("vi-VN")
  } catch {
    return iso
  }
}

function mapApi(p: ApiPrescription): UiPrescription {
  return {
    id: String(p.id),
    createdAt: p.createdAt,
    date: formatDt(p.createdAt),
    doctor: p.doctorName,
    signatureStatus: normalizeSignatureStatus(p.signatureStatus),
    medications: (p.medications || []).map((m) => ({
      name: m.name,
      quantity: m.quantity || "",
      unit: normalizeMedicationUnit(m.unit),
      usage: m.usage || "",
      note: m.note || "",
    })),
    isDraft: false,
  }
}

const emptyMed = (): Medication => ({
  name: "",
  quantity: "",
  unit: "tablet",
  usage: "",
  note: "",
})

function MedicineNameCombobox({
  value,
  onChange,
  onMedicinePickOrResolve,
  disabled,
}: {
  value: string
  onChange: (v: string) => void
  /** Chọn từ danh sách hoặc khớp tên chính xác sau blur → cập nhật unit từ MEDICINE */
  onMedicinePickOrResolve?: (m: MedicineOption) => void
  disabled?: boolean
}) {
  const listId = useId()
  const skipBlurResolveRef = useRef(false)
  const blurResolveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<MedicineOption[]>([])
  const [loading, setLoading] = useState(false)

  const load = useCallback(async (q: string) => {
    setLoading(true)
    try {
      const res = await doctorService.getMedicines(q.trim() || undefined)
      setItems(res.medicines || [])
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
    }, 200)
    return () => window.clearTimeout(t)
  }, [open, value, load])

  const tryResolveExactMatch = useCallback(async () => {
    if (!onMedicinePickOrResolve) return
    const n = value.trim()
    if (!n) return
    try {
      const res = await doctorService.getMedicines(n)
      const exact = res.medicines?.find((x) => x.name.toLowerCase() === n.toLowerCase())
      if (exact) onMedicinePickOrResolve(exact)
    } catch {
      /* ignore */
    }
  }, [value, onMedicinePickOrResolve])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <div
          className={cn(
            "flex h-7 w-full max-w-[9.5rem] sm:max-w-[11rem] items-stretch rounded border border-slate-200 bg-white shadow-sm",
            "focus-within:border-cyan-500 focus-within:ring-1 focus-within:ring-cyan-500/30",
            disabled && "cursor-not-allowed opacity-60"
          )}
        >
          <Input
            className="h-7 min-h-7 min-w-0 flex-1 rounded-none border-0 bg-transparent px-1.5 py-0 text-xs leading-tight shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 md:h-7 md:text-xs"
            value={value}
            disabled={disabled}
            onChange={(e) => onChange(e.target.value)}
            onFocus={() => setOpen(true)}
            onBlur={() => {
              if (blurResolveTimerRef.current) clearTimeout(blurResolveTimerRef.current)
              blurResolveTimerRef.current = window.setTimeout(() => {
                blurResolveTimerRef.current = null
                if (skipBlurResolveRef.current) return
                void tryResolveExactMatch()
              }, 200)
            }}
            autoComplete="off"
            role="combobox"
            aria-expanded={open}
            aria-haspopup="listbox"
            aria-controls={listId}
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 min-h-7 w-6 shrink-0 rounded-none rounded-r-md border-l border-slate-200 p-0 hover:bg-slate-50"
            disabled={disabled}
            aria-label="Mở danh sách thuốc"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setOpen((o) => !o)}
          >
            <ChevronDown
              className={cn("h-3 w-3 text-slate-600 transition-transform duration-200", open && "rotate-180")}
            />
          </Button>
        </div>
      </PopoverAnchor>
      <PopoverContent
        className="p-0 w-[var(--radix-popover-anchor-width)] min-w-[10rem] max-w-[min(20rem,90vw)]"
        align="start"
        sideOffset={4}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <ScrollArea className="h-[200px]">
          {loading ? (
            <div className="p-3 text-sm text-slate-500">Đang tải…</div>
          ) : items.length === 0 ? (
            <div className="p-3 text-sm text-slate-500">No result!</div>
          ) : (
            <ul id={listId} className="py-1" role="listbox">
              {items.map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    role="option"
                    className="w-full text-left px-2.5 py-1.5 text-xs hover:bg-cyan-50 truncate"
                    onMouseDown={(e) => {
                      e.preventDefault()
                      if (blurResolveTimerRef.current) {
                        clearTimeout(blurResolveTimerRef.current)
                        blurResolveTimerRef.current = null
                      }
                      skipBlurResolveRef.current = true
                    }}
                    onClick={() => {
                      onMedicinePickOrResolve?.(m)
                      setOpen(false)
                      skipBlurResolveRef.current = false
                    }}
                  >
                    {m.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  )
}

export default function PatientPrescription() {
  const { toast, isExiting, showSuccess, showError, onMouseEnter, onMouseLeave } = usePauseableToast()
  const { patientId } = useParams<{ patientId: string }>()
  const [prescriptions, setPrescriptions] = useState<UiPrescription[]>([])
  const [selectedRx, setSelectedRx] = useState<UiPrescription | null>(null)
  const [viewRxBeforeEdit, setViewRxBeforeEdit] = useState<UiPrescription | null>(null)
  const [isEditMode, setIsEditMode] = useState(false)
  const [draftMeds, setDraftMeds] = useState<Medication[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [exportingPdf, setExportingPdf] = useState(false)
  const [signingKind, setSigningKind] = useState<null | "sign" | "unsign">(null)
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

  const isEmptyMedication = (med: Medication) =>
    !med.name && !med.quantity && !med.usage && !med.note

  const load = useCallback(
    async (options?: { selectPrescriptionId?: string }) => {
      if (!patientId) return
      setLoading(true)
      try {
        const res = await doctorService.getPrescriptions(patientId)
        const rows = (res.prescriptions || []).map(mapApi)
        setPrescriptions(rows)
        const pickId = options?.selectPrescriptionId
        if (pickId) {
          const pick = rows.find((r) => r.id === pickId)
          setSelectedRx(pick ? { ...pick, isDraft: false } : null)
        } else {
          setSelectedRx((prev) => {
            if (!prev) return null
            const matched = rows.find((r) => r.id === prev.id)
            return matched ? { ...matched, isDraft: false } : null
          })
        }
        setDraftMeds([])
        setIsEditMode(false)
        setViewRxBeforeEdit(null)
      } catch (e) {
        console.error(e)
        showError(e instanceof Error ? e.message : "Fail to load prescription information")
      } finally {
        setLoading(false)
      }
    },
    [patientId, showError]
  )

  useEffect(() => {
    load()
  }, [load])

  const removeMedication = (index: number) => {
    setDraftMeds((prev) => {
      if (index === prev.length - 1) return prev
      return prev.filter((_, i) => i !== index)
    })
  }

  const handleRowBlur = (index: number) => {
    setDraftMeds((prev) => {
      if (index === prev.length - 1) return prev
      if (isEmptyMedication(prev[index])) {
        return prev.filter((_, i) => i !== index)
      }
      return prev
    })
  }

  const handleAddPrescription = () => {
    setViewRxBeforeEdit(selectedRx && !selectedRx.isDraft ? selectedRx : null)
    setSelectedRx({
      id: "new",
      createdAt: "",
      date: "—",
      doctor: "—",
      medications: [],
      signatureStatus: "draft",
      isDraft: true,
    })
    setDraftMeds([emptyMed()])
    setIsEditMode(true)
  }

  const handleEditPrescription = () => {
    if (!selectedRx || selectedRx.isDraft) return
    if (selectedRx.signatureStatus !== "draft") return
    setViewRxBeforeEdit(selectedRx)
    setSelectedRx({ ...selectedRx, isDraft: true })
    setDraftMeds([
      ...(selectedRx.medications || []).map((m) => ({
        name: m.name || "",
        quantity: m.quantity || "",
        unit: m.unit || "tablet",
        usage: m.usage || "",
        note: m.note || "",
      })),
      emptyMed(),
    ])
    setIsEditMode(true)
  }

  const handleInheritPrescription = () => {
    if (!selectedRx || selectedRx.isDraft) return
    setViewRxBeforeEdit(selectedRx)
    setSelectedRx({
      ...selectedRx,
      id: "new",
      createdAt: "",
      date: "—",
      doctor: "—",
      signatureStatus: "draft",
      isDraft: true,
    })
    setDraftMeds([
      ...(selectedRx.medications || []).map((m) => ({
        name: m.name || "",
        quantity: m.quantity || "",
        unit: m.unit || "tablet",
        usage: m.usage || "",
        note: m.note || "",
      })),
      emptyMed(),
    ])
    setIsEditMode(true)
  }

  const updateMedication = (index: number, field: keyof Medication, value: string) => {
    setDraftMeds((prev) => {
      const updated = [...prev]
      updated[index] = { ...updated[index], [field]: value }

      if (index === prev.length - 1 && field === "name" && value.trim() !== "") {
        return [...updated, emptyMed()]
      }
      return updated
    })
  }

  const applyPickedMedicineToDraft = useCallback((index: number, m: MedicineOption) => {
    setDraftMeds((prev) => {
      const updated = [...prev]
      updated[index] = {
        ...updated[index],
        name: m.name,
        unit: normalizeMedicationUnit(m.unit),
      }
      const isLast = index === prev.length - 1
      if (isLast && m.name.trim() !== "") {
        return [...updated, emptyMed()]
      }
      return updated
    })
  }, [])

  const handleSave = async () => {
    if (!patientId || !selectedRx || !isEditMode) return
    const meds = draftMeds
      .filter((m) => !isEmptyMedication(m))
      .map((m) => ({
        name: m.name.trim(),
        quantity: m.quantity.trim(),
        unit: m.unit,
        usage: m.usage.trim(),
        ...(m.note?.trim() ? { note: m.note.trim() } : {}),
      }))
    if (meds.length === 0 || !meds.some((m) => m.name)) {
      showError("Thêm ít nhất một thuốc có tên")
      return
    }
    setSaving(true)
    try {
      const isUpdate =
        selectedRx.id !== "new" && Number.isFinite(Number(selectedRx.id))
      if (isUpdate) {
        await doctorService.updatePrescription(patientId, selectedRx.id, {
          medications: meds,
        })
        await load()
      } else {
        const created = await doctorService.createPrescription(patientId, { medications: meds })
        const newId =
          created.success && created.prescription?.id != null
            ? String(created.prescription.id)
            : undefined
        await load(newId ? { selectPrescriptionId: newId } : undefined)
      }
      setIsEditMode(false)
      showSuccess("Success")
    } catch (e) {
      showError(e instanceof Error ? e.message : "Fail")
    } finally {
      setSaving(false)
    }
  }

  const handleCancel = () => {
    setIsEditMode(false)
    setSelectedRx(viewRxBeforeEdit ? { ...viewRxBeforeEdit, isDraft: false } : null)
    setDraftMeds([])
    setViewRxBeforeEdit(null)
  }

  const hasSelectedViewRow = !!selectedRx && !selectedRx.isDraft
  const selectedIsDraftRecord =
    hasSelectedViewRow && selectedRx!.signatureStatus === "draft"
  /** Any saved row (Draft / Signed / Unsigned) — copy into a new draft */
  const selectedCanInherit = hasSelectedViewRow
  const canAdd = !isEditMode && !loading && !saving
  const canEdit =
    !isEditMode && hasSelectedViewRow && selectedIsDraftRecord && !loading && !saving
  const canInherit =
    !isEditMode && selectedCanInherit && !loading && !saving
  const canSaveOrCancel = isEditMode && !loading
  const canSign =
    hasSelectedViewRow &&
    selectedRx!.signatureStatus === "draft" &&
    !isEditMode &&
    !loading &&
    !saving &&
    !signingKind
  const canUnsign =
    hasSelectedViewRow &&
    selectedRx!.signatureStatus === "signed" &&
    !isEditMode &&
    !loading &&
    !saving &&
    !signingKind

  const getMedicationsForExport = (): Medication[] => {
    if (!selectedRx) return []
    if (selectedRx.isDraft) {
      return draftMeds.filter((m) => !isEmptyMedication(m) && m.name.trim())
    }
    return (selectedRx.medications || []).filter((m) => m.name?.trim())
  }

  const canExportPdf =
    !!patientId && getMedicationsForExport().length > 0 && !exportingPdf

  const handleExportPdf = async () => {
    if (!patientId) return
    const meds = getMedicationsForExport()
    if (meds.length === 0) return
    setExportingPdf(true)
    try {
      const res = await doctorService.getPatient(patientId)
      if (!res.success || !res.patient) {
        throw new Error("Fail to load patient information")
      }
      const rxDate = selectedRx?.date && selectedRx.date !== "—" ? selectedRx.date : new Date().toLocaleString("vi-VN")
      const rxDoctor =
        selectedRx?.doctor && selectedRx.doctor !== "—"
          ? selectedRx.doctor
          : "—"
      releasePdfBlobUrl(null)
      const sigForPdf: PrescriptionSignatureStatus = selectedRx?.isDraft
        ? "draft"
        : selectedRx?.signatureStatus ?? "draft"

      const { blob, filename } = await generatePrescriptionPdfBlob({
        patient: res.patient,
        medications: meds.map((m) => ({
          name: m.name,
          quantity: m.quantity,
          unit: m.unit,
          usage: m.usage,
          note: m.note,
        })),
        prescriptionDate: rxDate,
        doctorName: rxDoctor,
        signatureStatus: sigForPdf,
      })
      const url = URL.createObjectURL(blob)
      setPdfPreviewFilename(filename)
      releasePdfBlobUrl(url)
      setPdfPreviewOpen(true)
      showSuccess("Success")
    } catch (e) {
      showError(e instanceof Error ? e.message : "Failed to export PDF")
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

  const handleSignPrescription = async () => {
    if (!patientId || !selectedRx || selectedRx.isDraft || selectedRx.signatureStatus !== "draft") return
    setSigningKind("sign")
    try {
      await doctorService.signPrescription(patientId, selectedRx.id)
      await load()
      showSuccess("Success")
    } catch (e) {
      showError(e instanceof Error ? e.message : "Fail")
    } finally {
      setSigningKind(null)
    }
  }

  const handleUnsignPrescription = async () => {
    if (!patientId || !selectedRx || selectedRx.isDraft || selectedRx.signatureStatus !== "signed") return
    setSigningKind("unsign")
    try {
      await doctorService.unsignPrescription(patientId, selectedRx.id)
      await load()
      showSuccess("Success")
    } catch (e) {
      showError(e instanceof Error ? e.message : "Fail")
    } finally {
      setSigningKind(null)
    }
  }

  const pauseableToast =
    toast &&
    typeof document !== "undefined" &&
    createPortal(
      <PrescriptionPageToast
        toast={toast}
        isExiting={isExiting}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
      />,
      document.body
    )

  return (
    <>
    <div className="grid grid-cols-12 gap-6">
      <Dialog
        open={pdfPreviewOpen}
        onOpenChange={(open) => {
          if (!open) closePdfPreview()
        }}
      >
        <DialogContent className="flex max-h-[90vh] w-[min(920px,96vw)] max-w-none flex-col gap-3 p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>Prescription preview (PDF)</DialogTitle>
          </DialogHeader>
          {pdfPreviewUrl ? (
            <iframe
              title="Prescription PDF preview"
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
              variant="outline"
              className="btn-outline"
              disabled
              title="Printing will be added in a future update"
            >
              <Printer className="h-4 w-4 mr-2" />
              Print
            </Button>
            <Button type="button" className="btn-gradient" onClick={handleSavePdfFromPreview}>
              <FileDown className="h-4 w-4 mr-2" />
              Save / Download
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Card className="col-span-4">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <History size={18} />
              <h3 className="font-semibold text-lg">Prescription History</h3>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="btn-outline shrink-0"
              disabled={!canExportPdf}
              onClick={() => void handleExportPdf()}
            >
              {exportingPdf ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <FileDown className="h-4 w-4" />
              )}
              <span className="ml-2">Export PDF</span>
            </Button>
          </div>

          {loading ? (
            <p className="text-sm text-slate-500">Đang tải…</p>
          ) : (
            <div className="overflow-hidden border rounded-lg">
              <Table className="w-full table-fixed text-xs">
                <TableHeader
                  className="text-white"
                  style={{
                    background:
                      "linear-gradient(135deg, #06b6d4 0%, #0891b2 50%, #06b6d4 100%)",
                  }}
                >
                  <TableRow>
                    <TableHead className="w-[32%] p-1.5 text-left text-[13px] font-semibold text-white">
                      Date
                    </TableHead>
                    <TableHead className="w-[48%] p-1.5 text-left text-[13px] font-semibold text-white">
                      Doctor
                    </TableHead>
                    <TableHead className="w-[20%] p-1.5 text-left text-[13px] font-semibold text-white">
                      Status
                    </TableHead>
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {prescriptions.map((rx) => (
                    <TableRow
                      key={rx.id}
                      onClick={() => {
                        if (isEditMode) return
                        setSelectedRx({ ...rx, isDraft: false })
                        setDraftMeds([])
                      }}
                      className={`border-t cursor-pointer ${
                        selectedRx?.id === rx.id ? "bg-cyan-50" : ""
                      }`}
                    >
                      <TableCell className="max-w-0 p-1.5 align-top leading-snug">
                        <span className="block truncate" title={rx.date}>
                          {formatHistoryTableDate(rx.createdAt)}
                        </span>
                      </TableCell>
                      <TableCell className="max-w-0 p-1.5 align-top leading-snug">
                        <span className="block truncate" title={rx.doctor}>
                          {rx.doctor}
                        </span>
                      </TableCell>
                      <TableCell className="max-w-0 p-1.5 align-top leading-snug">
                        <span className="block truncate" title={signatureStatusLabel(rx.signatureStatus)}>
                          {signatureStatusLabel(rx.signatureStatus)}
                        </span>
                      </TableCell>
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
          <div className="flex items-center justify-end mb-4">
            <div className="flex gap-2 flex-wrap justify-end">
              <Button
                size="sm"
                className="btn-gradient transition-transform duration-500 text-xl px-7 py-4"
                onClick={handleAddPrescription}
                disabled={!canAdd}
              >
                <Plus className="h-4 w-4" />
                Add
              </Button>
              <Button
                size="sm"
                className="btn-outline transition-transform duration-500 text-xl px-7 py-4"
                onClick={handleEditPrescription}
                disabled={!canEdit}
              >
                <Edit className="h-4 w-4" />
                Edit
              </Button>
              <Button
                size="sm"
                className="btn-outline transition-transform duration-500 text-xl px-7 py-4"
                onClick={handleInheritPrescription}
                disabled={!canInherit}
              >
                <Copy className="h-4 w-4" />
                Inherit
              </Button>
              <Button
                type="button"
                variant="default"
                size="sm"
                className="h-9 gap-2 border-0 !bg-[#16a34a] px-4 text-white shadow-sm hover:bg-[#15803d] focus-visible:ring-2 focus-visible:ring-green-600 focus-visible:ring-offset-2"
                onClick={() => void handleSignPrescription()}
                disabled={!canSign}
                title="Ký số — finalize prescription (Draft → Signed)"
              >
                <PenLine className="h-4 w-4" />
                {signingKind === "sign" ? <Loader2 className="h-4 w-4 animate-spin shrink-0" /> : null}
                Sign
              </Button>
              <Button
                type="button"
                variant="default"
                size="sm"
                className="h-9 gap-2 border-0 !bg-[#dc2626] px-4 text-white shadow-sm hover:bg-[#b91c1c] focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-2"
                onClick={() => void handleUnsignPrescription()}
                disabled={!canUnsign}
                title="revoke signature (Signed → Voided)"
              >
                <PenOff className="h-4 w-4" />
                {signingKind === "unsign" ? <Loader2 className="h-4 w-4 animate-spin shrink-0" /> : null}
                Void Signature
              </Button>
              <Button
                size="sm"
                className="btn-outline transition-transform duration-500 text-xl px-7 py-4"
                onClick={handleSave}
                disabled={!canSaveOrCancel || saving}
              >
                <Save className="h-4 w-4" />
                Save
              </Button>
              <Button
                size="sm"
                className="btn-outline transition-transform duration-500 text-xl px-7 py-4"
                onClick={handleCancel}
                disabled={!canSaveOrCancel || saving}
              >
                <X className="h-4 w-4" />
                Cancel
              </Button>
            </div>
          </div>

          {!selectedRx ? (
            <p className="text-sm text-slate-500">Click on any row to load that record into the form below or click "Add" button to create a new record</p>
          ) : (
            <div
              className={cn(
                "relative overflow-x-hidden border rounded-lg",
                !selectedRx.isDraft && selectedRx.signatureStatus === "voided" && "overflow-hidden"
              )}
            >
              {!selectedRx.isDraft && selectedRx.signatureStatus === "voided" ? (
                <div
                  className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center overflow-hidden"
                  aria-hidden
                >
                  <span className="text-red-600/45 text-5xl sm:text-6xl font-black -rotate-[18deg] select-none tracking-[0.2em] whitespace-nowrap drop-shadow-sm">
                    VOIDED
                  </span>
                </div>
              ) : null}
              <Table className="relative z-0 w-full table-fixed text-xs">
                <TableHeader>
                  <TableRow
                    style={{
                      background:
                        "linear-gradient(135deg, #06b6d4 0%, #0891b2 50%, #06b6d4 100%)",
                    }}
                  >
                    <TableHead className="w-8 p-1.5 text-center text-white">No.</TableHead>
                    <TableHead className="w-[18%] min-w-0 p-1.5 text-left text-white">Medication</TableHead>
                    <TableHead className="w-[9%] p-1.5 text-white">Qty</TableHead>
                    <TableHead className="w-[10%] p-1.5 text-white">Unit</TableHead>
                    <TableHead className="min-w-0 p-1.5 text-white">Usage</TableHead>
                    <TableHead className="min-w-0 p-1.5 text-white">Note</TableHead>
                    <TableHead className="w-7 p-1 text-center text-white" aria-label="Remove row" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {selectedRx.isDraft ? (
                    draftMeds.map((med, index) => (
                      <TableRow
                        key={index}
                        className="border-t"
                        onBlur={() => handleRowBlur(index)}
                      >
                        <TableCell className="p-0.5 text-center align-middle text-xs tabular-nums">
                          {index + 1}
                        </TableCell>
                        <TableCell className="max-w-0 p-0.5 align-middle">
                          <MedicineNameCombobox
                            value={med.name}
                            onChange={(v) => updateMedication(index, "name", v)}
                            onMedicinePickOrResolve={(m) => applyPickedMedicineToDraft(index, m)}
                            disabled={saving}
                          />
                        </TableCell>
                        <TableCell className="p-0.5 align-middle">
                          <input
                            className="h-7 w-full box-border rounded border border-slate-200 px-1.5 text-xs leading-tight"
                            value={med.quantity}
                            placeholder="Qty"
                            onChange={(e) => updateMedication(index, "quantity", e.target.value)}
                          />
                        </TableCell>
                        <TableCell className="p-0.5 align-middle">
                          <input
                            readOnly
                            disabled
                            className="h-7 w-full box-border cursor-not-allowed rounded border border-slate-200 bg-slate-100 px-1.5 text-xs leading-tight text-slate-700"
                            value={med.unit}
                            title="Unit comes from the MEDICINE catalog when you select a drug name"
                          />
                        </TableCell>
                        <TableCell className="p-0.5 align-middle">
                          <input
                            className="h-7 w-full box-border rounded border border-slate-200 px-1.5 text-xs leading-tight"
                            value={med.usage}
                            placeholder="Usage"
                            onChange={(e) => updateMedication(index, "usage", e.target.value)}
                          />
                        </TableCell>
                        <TableCell className="p-0.5 align-middle">
                          <input
                            className="h-7 w-full box-border rounded border border-slate-200 px-1.5 text-xs leading-tight"
                            value={med.note}
                            placeholder="Note"
                            onChange={(e) => updateMedication(index, "note", e.target.value)}
                          />
                        </TableCell>
                        <TableCell className="w-7 p-0.5 text-center align-middle">
                          {index !== draftMeds.length - 1 && (
                            <button
                              type="button"
                              onClick={() => removeMedication(index)}
                              className="inline-flex h-7 w-6 shrink-0 items-center justify-center rounded text-red-500 hover:bg-red-50"
                              title="Remove medication"
                            >
                              <Trash2 className="h-3.5 w-3.5 " strokeWidth={2} aria-hidden />
                            </button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    selectedRx.medications.map((med, index) => (
                      <TableRow key={index} className="border-t hover:bg-slate-50">
                        <TableCell className="p-0.5 text-center align-middle text-xs tabular-nums">
                          {index + 1}
                        </TableCell>
                        <TableCell className="p-0.5 align-middle text-xs">{med.name}</TableCell>
                        <TableCell className="p-0.5 text-center align-middle text-xs">{med.quantity}</TableCell>
                        <TableCell className="p-0.5 align-middle text-xs">{med.unit}</TableCell>
                        <TableCell className="p-0.5 align-middle text-xs">{med.usage}</TableCell>
                        <TableCell className="p-0.5 align-middle text-xs">{med.note ?? "—"}</TableCell>
                        <TableCell className="w-7 p-0.5" />
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
              {!selectedRx.isDraft && selectedRx.signatureStatus === "signed" ? (
                <div className="relative z-[1] flex items-start gap-3 border-t border-slate-200 bg-emerald-50/90 px-4 py-3">
                  <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-green-600" aria-hidden />
                  <div className="min-w-0">
                    <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Signed</div>
                    <div className="text-base font-semibold text-slate-900">{selectedRx.doctor}</div>
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
    {pauseableToast}
    </>
  )
}

function PrescriptionPageToast({
  toast,
  isExiting,
  onMouseEnter,
  onMouseLeave,
}: {
  toast: PauseableToastEntry
  isExiting: boolean
  onMouseEnter: () => void
  onMouseLeave: () => void
}) {
  const [entered, setEntered] = useState(false)

  useLayoutEffect(() => {
    setEntered(false)
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => setEntered(true))
    })
    return () => cancelAnimationFrame(id)
  }, [toast.id])

  const visible = entered && !isExiting

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "pointer-events-auto fixed bottom-6 left-6 z-[100] max-w-md rounded-lg border px-4 py-3 text-sm shadow-lg transition-opacity duration-300 ease-out",
        visible ? "opacity-100" : "opacity-0",
        toast.variant === "success" && "bg-[#34A853] text-white",
        toast.variant === "error" && "bg-[#EA4335] text-white"
      )}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {toast.message}
    </div>
  )
}
