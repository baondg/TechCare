"use client"

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react"
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
  Copy,
  Save,
  X,
  ChevronDown,
  FileDown,
  Loader2,
  Printer,
  Sparkles,
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
} from "@/services/doctor-service"
import { generatePrescriptionPdfBlob } from "@/lib/export-prescription-pdf"
import { buildSigningTimeLine, signingLineFromIso, stampPdfWithExportFooter } from "@/lib/pdf-export-stamp"
import { usePauseableToast } from "@/hooks/usePauseableToast"
import { PauseableCornerToastPortal } from "@/components/pauseable-corner-toast"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useEmrSession } from "@/contexts/emr-session-context"
import { useTranslation } from "react-i18next"
import type { TFunction } from "i18next"

type Medication = {
  name: string
  quantity: string
  unit: string
  /** Số ngày dùng thuốc (PRESCRIPTION_DETAIL.duration). */
  duration: string
  usage: string
  note?: string
}

function normalizeMedicationUnit(raw: string | null | undefined): string {
  const s = String(raw || "")
    .trim()
    .toLowerCase()
  if (!s) return "tablet"
  // Keep the DB unit label when available (e.g. "application", "vial", "ml")
  return s
}

type UiPrescription = {
  id: string
  /** ISO from API — for compact history column */
  createdAt: string
  date: string
  doctor: string
  medications: Medication[]
  isDraft?: boolean
}

function resolveLocaleTag(lang: string | undefined): string {
  return lang?.toLowerCase().startsWith("vi") ? "vi-VN" : "en-US"
}

function formatHistoryTableDate(iso: string, localeTag: string, notAvailable: string) {
  if (!iso) return notAvailable
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return iso
    const date = d.toLocaleDateString(localeTag, { day: "2-digit", month: "2-digit", year: "2-digit" })
    const time = d.toLocaleTimeString(localeTag, { hour: "2-digit", minute: "2-digit", hour12: false })
    return `${date} ${time}`
  } catch {
    return iso
  }
}

function formatDt(iso: string, localeTag: string) {
  try {
    return new Date(iso).toLocaleString(localeTag)
  } catch {
    return iso
  }
}

function mapApi(p: ApiPrescription, localeTag: string): UiPrescription {
  return {
    id: String(p.id),
    createdAt: p.createdAt,
    date: formatDt(p.createdAt, localeTag),
    doctor: p.doctorName,
    medications: (p.medications || []).map((m) => ({
      name: m.name,
      quantity: m.quantity || "",
      unit: normalizeMedicationUnit(m.unit),
      duration: m.duration != null && String(m.duration).trim() !== "" ? String(m.duration).trim() : "7",
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
  duration: "7",
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
  const { t } = useTranslation()
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
            onInput={(e) => onChange((e.target as HTMLInputElement).value)}
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
            aria-label={t("doctor.prescription.openMedicineList")}
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
            <div className="p-3 text-sm text-slate-500">{t("doctor.prescription.comboboxLoading")}</div>
          ) : items.length === 0 ? (
            <div className="p-3 text-sm text-slate-500">{t("doctor.prescription.noResult")}</div>
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

/** Per-day amount: quantity ÷ duration (for usage typeahead). */
function formatDailyDoseFromQtyDuration(quantityStr: string, durationStr: string): string | null {
  const qty = Number.parseFloat(String(quantityStr ?? "").trim().replace(",", "."))
  const dur = Number.parseFloat(String(durationStr ?? "").trim().replace(",", "."))
  if (!Number.isFinite(qty) || qty <= 0) return null
  if (!Number.isFinite(dur) || dur <= 0) return null
  const per = qty / dur
  if (!Number.isFinite(per) || per <= 0) return null
  const rounded = Math.round(per * 100) / 100
  if (Number.isInteger(rounded)) return String(rounded)
  return rounded.toFixed(2).replace(/\.?0+$/, "")
}

function buildUsageTypeaheadSuggestion(
  med: Pick<Medication, "quantity" | "duration" | "unit">,
  t: TFunction
): string | null {
  const n = formatDailyDoseFromQtyDuration(med.quantity, med.duration)
  if (n == null) return null
  const unit = (med.unit || "tablet").trim() || "tablet"
  return t("doctor.prescription.usageDailyPrefix", { amount: n, unit })
}

function usageTypeaheadGhostTail(suggestion: string | null, usage: string): string | null {
  if (!suggestion) return null
  if (!usage) return suggestion
  if (suggestion.startsWith(usage)) return suggestion.slice(usage.length)
  return null
}

function UsageTypeaheadInput({
  value,
  onChange,
  quantity,
  duration,
  unit,
  disabled,
}: {
  value: string
  onChange: (v: string) => void
  quantity: string
  duration: string
  unit: string
  disabled?: boolean
}) {
  const { t } = useTranslation()
  const suggestion = useMemo(
    () => buildUsageTypeaheadSuggestion({ quantity, duration, unit }, t),
    [quantity, duration, unit, t]
  )
  const ghostTail = usageTypeaheadGhostTail(suggestion, value)

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return
    if (!suggestion) return
    if (value === suggestion) return
    if (value === "" || suggestion.startsWith(value)) {
      e.preventDefault()
      onChange(suggestion)
    }
  }

  return (
    <div
      className={cn(
        "relative h-7 w-full min-w-[7rem] rounded border border-slate-200 bg-white",
        !disabled && "focus-within:border-cyan-500 focus-within:ring-1 focus-within:ring-cyan-500/30"
      )}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 flex items-center overflow-hidden rounded px-1.5 text-xs leading-tight"
      >
        <span className="whitespace-pre text-slate-900">{value}</span>
        {ghostTail ? <span className="whitespace-pre text-slate-400">{ghostTail}</span> : null}
      </div>
      <input
        className="relative z-10 h-7 w-full box-border rounded bg-transparent px-1.5 text-xs leading-tight text-transparent caret-slate-900 selection:bg-cyan-200/80"
        value={value}
        placeholder={suggestion ? "" : t("doctor.prescription.usagePlaceholder")}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        onInput={(e) => onChange((e.target as HTMLInputElement).value)}
        onKeyDown={onKeyDown}
        title={
          suggestion
            ? t("doctor.prescription.usageEnterHint", { suggestion: suggestion.trimEnd() })
            : undefined
        }
        spellCheck={false}
        autoComplete="off"
      />
    </div>
  )
}

export default function PatientPrescription() {
  const { t, i18n } = useTranslation()
  const localeTag = resolveLocaleTag(i18n.language)
  const { toast, isExiting, showSuccess, showError, onMouseEnter, onMouseLeave } = usePauseableToast(2600)
  const { patientId } = useParams<{ patientId: string }>()
  const { mutationsAllowed } = useEmrSession()
  const [prescriptions, setPrescriptions] = useState<UiPrescription[]>([])
  const [selectedRx, setSelectedRx] = useState<UiPrescription | null>(null)
  const [viewRxBeforeEdit, setViewRxBeforeEdit] = useState<UiPrescription | null>(null)
  const [isEditMode, setIsEditMode] = useState(false)
  const [draftMeds, setDraftMeds] = useState<Medication[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [exportingPdf, setExportingPdf] = useState(false)
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
        const loc = resolveLocaleTag(i18n.language)
        const rows = (res.prescriptions || []).map((p) => mapApi(p, loc))
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
        showError(e instanceof Error ? e.message : t("doctor.prescription.loadFail"))
      } finally {
        setLoading(false)
      }
    },
    [patientId, showError, i18n.language, t]
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
    if (!mutationsAllowed) return
    setViewRxBeforeEdit(selectedRx && !selectedRx.isDraft ? selectedRx : null)
    setSelectedRx({
      id: "new",
      createdAt: "",
      date: t("common.notAvailable"),
      doctor: t("common.notAvailable"),
      medications: [],
      isDraft: true,
    })
    setDraftMeds([emptyMed()])
    setIsEditMode(true)
  }

  const handleInheritPrescription = () => {
    if (!mutationsAllowed) return
    if (!selectedRx || selectedRx.isDraft) return
    setViewRxBeforeEdit(selectedRx)
    setSelectedRx({
      ...selectedRx,
      id: "new",
      createdAt: "",
      date: t("common.notAvailable"),
      doctor: t("common.notAvailable"),
      isDraft: true,
    })
    setDraftMeds([
      ...(selectedRx.medications || []).map((m) => ({
        name: m.name || "",
        quantity: m.quantity || "",
        unit: m.unit || "tablet",
        duration: m.duration?.trim() || "7",
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
    if (!mutationsAllowed) return
    if (!patientId || !selectedRx || !isEditMode) return
    const meds = draftMeds
      .filter((m) => !isEmptyMedication(m))
      .map((m) => ({
        name: m.name.trim(),
        quantity: m.quantity.trim(),
        unit: m.unit,
        duration: String(m.duration ?? "").trim() || "7",
        usage: String(m.usage ?? "").trim(),
        ...(m.note?.trim() ? { note: m.note.trim() } : {}),
      }))
    if (meds.length === 0 || !meds.some((m) => m.name)) {
      showError(t("doctor.prescription.needOneNamedMed"))
      return
    }
    if (selectedRx.id !== "new") {
      showError(t("doctor.prescription.saveOnlyNew"))
      return
    }
    setSaving(true)
    try {
      const lineDurations = meds.map((m) => {
        const n = parseInt(String(m.duration), 10)
        return Number.isFinite(n) && n >= 1 ? n : 7
      })
      const headerDuration = Math.max(...lineDurations, 1)
      const created = await doctorService.createPrescription(patientId, {
        medications: meds,
        duration: headerDuration,
      })
      const newId =
        created.success && created.prescription?.id != null
          ? String(created.prescription.id)
          : undefined
      await load(newId ? { selectPrescriptionId: newId } : undefined)
      setIsEditMode(false)
      showSuccess(t("doctor.prescription.saveSuccess"))
    } catch (e) {
      showError(e instanceof Error ? e.message : t("doctor.prescription.saveFail"))
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
  const selectedCanInherit = hasSelectedViewRow
  const canAdd = !isEditMode && !loading && !saving && mutationsAllowed
  const canInherit =
    !isEditMode && selectedCanInherit && !loading && !saving && mutationsAllowed
  const canCancelEdit = isEditMode && !loading
  const canSaveRx = isEditMode && !loading && mutationsAllowed

  // ── AI Suggest State ──
  const [aiSuggesting, setAiSuggesting] = useState(false)

  const handleAiSuggest = async () => {
    if (!patientId || !selectedRx?.isDraft) return
    setAiSuggesting(true)
    try {
      const patientRes = await doctorService.getPatient(patientId)
      const patient = patientRes.patient
      const diagnosis = patient?.latestDiagnosis
        ? `${patient.latestDiagnosis.icd10} - ${patient.latestDiagnosis.interpretation}`
        : t("doctor.prescription.generalConsultation")
      const na = t("doctor.prescription.patientInfoNa")
      const patientInfo = patient
        ? t("doctor.prescription.patientInfoLine", {
            ageLabel: t("doctor.prescription.patientInfoAge"),
            age: patient.age != null && String(patient.age).trim() !== "" ? String(patient.age) : na,
            genderLabel: t("doctor.prescription.patientInfoGender"),
            gender: patient.gender?.trim() ? patient.gender : na,
            bmiLabel: t("doctor.prescription.patientInfoBmi"),
            bmi: patient.bmi != null && String(patient.bmi).trim() !== "" ? String(patient.bmi) : na,
          })
        : ""

      const res = await doctorService.getAiMedicineSuggestions({
        diagnosis,
        symptoms: diagnosis,
        patientInfo,
      })

      if (res.success && res.suggestions.length > 0) {
        const newMeds: Medication[] = res.suggestions.map((s) => {
          const durRaw = s.duration != null ? String(s.duration).trim() : ''
          const duration =
            durRaw !== '' && Number.parseInt(durRaw, 10) >= 1 ? durRaw : '7'
          return {
            name: s.name || '',
            quantity: String(s.quantity || ''),
            unit: normalizeMedicationUnit(s.unit),
            duration,
            usage: s.usage || '',
            note: s.note || '',
          }
        })
        setDraftMeds([...newMeds, emptyMed()])
        showSuccess(t("doctor.prescription.aiSuggestSuccess", { count: res.suggestions.length }))
      } else {
        showError(t("doctor.prescription.aiNoSuggestions"))
      }
    } catch (err: any) {
      showError(err?.message || t("doctor.prescription.aiSuggestFail"))
    } finally {
      setAiSuggesting(false)
    }
  }

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
        throw new Error(t("doctor.prescription.patientLoadFail"))
      }
      const dash = t("common.notAvailable")
      const rxDate = selectedRx?.createdAt
        ? formatDt(selectedRx.createdAt, localeTag)
        : new Date().toLocaleString(localeTag)
      const rxDoctor =
        selectedRx?.doctor && selectedRx.doctor !== dash ? selectedRx.doctor : dash
      releasePdfBlobUrl(null)
      /** Saved prescriptions always show doctor name on PDF (no separate sign step). */
      const sigForPdf = selectedRx?.isDraft ? ("draft" as const) : ("signed" as const)

      const { blob, filename } = await generatePrescriptionPdfBlob({
        patient: res.patient,
        medications: meds.map((m) => ({
          name: m.name,
          quantity: m.quantity,
          unit: m.unit,
          duration: String(m.duration ?? "").trim() || "7",
          usage: m.usage ?? "",
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
      showSuccess(t("doctor.prescription.pdfPreviewSuccess"))
    } catch (e) {
      showError(e instanceof Error ? e.message : t("doctor.prescription.pdfExportFail"))
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
      showError(e instanceof Error ? e.message : t("doctor.prescription.downloadFailed"))
    }
  }

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
            <DialogTitle>{t("doctor.prescription.dialogPdfTitle")}</DialogTitle>
          </DialogHeader>
          {pdfPreviewUrl ? (
            <iframe
              title={t("doctor.prescription.iframePdfTitle")}
              src={pdfPreviewUrl}
              className="min-h-[min(520px,60vh)] w-full flex-1 rounded-md border border-slate-200 bg-slate-50"
            />
          ) : null}
          <DialogFooter className="gap-2 sm:gap-2">
            <Button type="button" variant="outline" className="btn-outline" onClick={closePdfPreview}>
              {t("doctor.prescription.close")}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="btn-outline"
              disabled
              title={t("doctor.prescription.printDisabledHint")}
            >
              <Printer className="h-4 w-4 mr-2" />
              {t("doctor.prescription.print")}
            </Button>
            <Button type="button" className="btn-gradient" onClick={handleSavePdfFromPreview}>
              <FileDown className="h-4 w-4 mr-2" />
              {t("doctor.prescription.saveDownload")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Card className="col-span-4">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <History size={18} />
              <h3 className="font-semibold text-lg">{t("doctor.prescription.historyTitle")}</h3>
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
              <span className="ml-2">{t("doctor.prescription.exportPdf")}</span>
            </Button>
          </div>

          {loading ? (
            <p className="text-sm text-slate-500">{t("common.loading")}</p>
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
                    <TableHead className="w-[38%] p-1.5 text-left text-[13px] font-semibold text-white">
                      {t("doctor.prescription.colDate")}
                    </TableHead>
                    <TableHead className="p-1.5 text-left text-[13px] font-semibold text-white">
                      {t("doctor.patients.colDoctor")}
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
                        <span className="block truncate" title={formatDt(rx.createdAt, localeTag)}>
                          {formatHistoryTableDate(rx.createdAt, localeTag, t("common.notAvailable"))}
                        </span>
                      </TableCell>
                      <TableCell className="max-w-0 p-1.5 align-top leading-snug">
                        <span className="block truncate" title={rx.doctor}>
                          {rx.doctor}
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
                className="btn-gradient transition-transform duration-500"
                onClick={handleAddPrescription}
                disabled={!canAdd}
              >
                <Plus className="h-4 w-4" />
                {t("doctor.prescription.add")}
              </Button>
              {/* AI Suggest Medicine Button */}
              {selectedRx?.isDraft && isEditMode && (
                <Button
                  size="sm"
                  className="h-9 gap-2 border-0 !bg-gradient-to-r !from-violet-500 !to-purple-600 px-4 text-white shadow-sm hover:from-violet-600 hover:to-purple-700"
                  onClick={handleAiSuggest}
                  disabled={aiSuggesting}
                  title={t("doctor.prescription.aiSuggestHint")}
                >
                  {aiSuggesting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  {t("doctor.prescription.aiSuggest")}
                </Button>
              )}
              <Button
                size="sm"
                className="btn-outline transition-transform duration-500"
                onClick={handleInheritPrescription}
                disabled={!canInherit}
              >
                <Copy className="h-4 w-4" />
                {t("doctor.prescription.inherit")}
              </Button>
              <Button
                size="sm"
                className="btn-outline transition-transform duration-500"
                onClick={handleSave}
                disabled={!canSaveRx || saving}
              >
                <Save className="h-4 w-4" />
                {t("doctor.prescription.save")}
              </Button>
              <Button
                size="sm"
                className="btn-outline transition-transform duration-500"
                onClick={handleCancel}
                disabled={!canCancelEdit || saving}
              >
                <X className="h-4 w-4" />
                {t("doctor.prescription.cancel")}
              </Button>
            </div>
          </div>

          {!selectedRx ? (
            <p className="text-sm text-slate-500">{t("doctor.prescription.selectRowHint")}</p>
          ) : (
            <div className="relative overflow-x-hidden border rounded-lg">
              <Table className="relative z-0 w-full table-fixed text-xs">
                <TableHeader>
                  <TableRow
                    style={{
                      background:
                        "linear-gradient(135deg, #06b6d4 0%, #0891b2 50%, #06b6d4 100%)",
                    }}
                  >
                    <TableHead className="w-8 p-1.5 text-center text-white">{t("doctor.prescription.tableNo")}</TableHead>
                    <TableHead className="w-[18%] min-w-0 p-1.5 text-left text-white">
                      {t("doctor.prescription.medication")}
                    </TableHead>
                    <TableHead className="w-[9%] p-1.5 text-white">{t("doctor.prescription.qty")}</TableHead>
                    <TableHead className="w-[10%] p-1.5 text-white">{t("doctor.prescription.unit")}</TableHead>
                    <TableHead className="w-[9%] p-1.5 text-white">{t("doctor.prescription.duration")}</TableHead>
                    <TableHead className="min-w-0 p-1.5 text-white">{t("doctor.prescription.usage")}</TableHead>
                    <TableHead className="min-w-0 p-1.5 text-white">{t("doctor.prescription.note")}</TableHead>
                    <TableHead className="w-7 p-1 text-center text-white" aria-label={t("doctor.prescription.removeRow")} />
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
                            disabled={saving || !mutationsAllowed}
                          />
                        </TableCell>
                        <TableCell className="p-0.5 align-middle">
                          <input
                            className="h-7 w-full box-border rounded border border-slate-200 px-1.5 text-xs leading-tight"
                            value={med.quantity}
                            placeholder={t("doctor.prescription.qtyPlaceholder")}
                            disabled={!mutationsAllowed}
                            onChange={(e) => updateMedication(index, "quantity", e.target.value)}
                            onInput={(e) => updateMedication(index, "quantity", (e.target as HTMLInputElement).value)}
                            onBlur={(e) => updateMedication(index, "quantity", e.target.value)}
                          />
                        </TableCell>
                        <TableCell className="p-0.5 align-middle">
                          <input
                            readOnly
                            disabled
                            className="h-7 w-full box-border cursor-not-allowed rounded border border-slate-200 bg-slate-100 px-1.5 text-xs leading-tight text-slate-700"
                            value={med.unit}
                            title={t("doctor.prescription.unitFromCatalogHint")}
                          />
                        </TableCell>
                        <TableCell className="p-0.5 align-middle">
                          <input
                            type="number"
                            min={1}
                            className="h-7 w-full box-border rounded border border-slate-200 px-1.5 text-xs leading-tight"
                            value={med.duration}
                            placeholder={t("doctor.prescription.daysPlaceholder")}
                            title={t("doctor.prescription.durationDaysHint")}
                            disabled={!mutationsAllowed}
                            onChange={(e) => updateMedication(index, "duration", e.target.value)}
                            onInput={(e) => updateMedication(index, "duration", (e.target as HTMLInputElement).value)}
                            onBlur={(e) => updateMedication(index, "duration", e.target.value)}
                          />
                        </TableCell>
                        <TableCell className="p-0.5 align-middle">
                          <UsageTypeaheadInput
                            value={med.usage}
                            onChange={(v) => updateMedication(index, "usage", v)}
                            quantity={med.quantity}
                            duration={med.duration}
                            unit={med.unit}
                            disabled={!mutationsAllowed}
                          />
                        </TableCell>
                        <TableCell className="p-0.5 align-middle">
                          <input
                            className="h-7 w-full box-border rounded border border-slate-200 px-1.5 text-xs leading-tight"
                            value={med.note}
                            placeholder={t("doctor.prescription.notePlaceholder")}
                            disabled={!mutationsAllowed}
                            onChange={(e) => updateMedication(index, "note", e.target.value)}
                            onInput={(e) => updateMedication(index, "note", (e.target as HTMLInputElement).value)}
                            onBlur={(e) => updateMedication(index, "note", e.target.value)}
                          />
                        </TableCell>
                        <TableCell className="w-7 p-0.5 text-center align-middle">
                          {index !== draftMeds.length - 1 && (
                            <button
                              type="button"
                              onClick={() => removeMedication(index)}
                              disabled={!mutationsAllowed}
                              className="inline-flex h-7 w-6 shrink-0 items-center justify-center rounded text-red-500 hover:bg-red-50 disabled:opacity-40"
                              title={t("doctor.prescription.removeMedHint")}
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
                        <TableCell className="p-0.5 text-center align-middle text-xs tabular-nums">
                          {med.duration || t("common.notAvailable")}
                        </TableCell>
                        <TableCell className="p-0.5 align-middle text-xs">{med.usage}</TableCell>
                        <TableCell className="p-0.5 align-middle text-xs">{med.note ?? t("common.notAvailable")}</TableCell>
                        <TableCell className="w-7 p-0.5" />
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
              {!selectedRx.isDraft ? (
                <div className="relative z-[1] flex items-start gap-3 border-t border-slate-200 bg-cyan-50/80 px-4 py-3">
                  <div className="min-w-0">
                    <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                      {t("doctor.prescription.doctorLabel")}
                    </div>
                    <div className="text-base font-semibold text-slate-900">{selectedRx.doctor}</div>
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
    <PauseableCornerToastPortal
      toast={toast}
      isExiting={isExiting}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    />
    </>
  )
}
