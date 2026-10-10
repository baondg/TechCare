import { useCallback, useEffect, useMemo, useState } from "react"
import { Loader2, Minus, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { YmdEnglishDatePicker } from "@/components/ymd-english-date-picker"
import { doctorService, type DepartmentOption, type PatientDetail } from "@/services/doctor-service"
import { buildFollowUpReexamSlipHtmlDocument } from "@/lib/follow-up-reexam-slip-html"
import { generateFollowUpReexamPdfBlob } from "@/lib/export-follow-up-reexam-pdf"
import { buildSigningTimeLine } from "@/lib/pdf-export-stamp"
import type { usePdfPreview } from "@/components/pdf-preview-dialog"
import { RegimenDocumentsReview, type RegimenDocuments } from "./regimen-documents-review"
import {
  buildFollowUpSlipInputs,
  hospitalTransferRequest,
  hospitalTransferSlipHtml,
  type FollowUpForm,
  type HospitalTransferForm,
} from "./slips"

export const EMR_PRESCRIPTION_SAVED_EVENT = "emr:prescription-saved"

const TRANSFER_HOSPITAL_OPTIONS = [
  "Bệnh viện Chợ Rẫy",
  "Bệnh viện Nhi đồng 2",
  "Bệnh viện Nhiệt đới Trung ương",
  "Bệnh viện Tâm Anh",
  "Bệnh viện Quân y 175",
  "Bệnh viện Thống Nhất",
  "Bệnh viện 115",
] as const

const FOLLOW_UP_MINUTE_OPTIONS = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, "0"))
const FOLLOW_UP_HOUR24_OPTIONS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"))
const DEFAULT_ZOOM = 0.48
const pad2 = (n: number) => String(n).padStart(2, "0")

/** Parse `HH:mm` (24h) for follow-up UI: hour 0–23 and minute. */
function parseFollowTime24hString(time24: string): { hour24: number; minute: number } {
  const [hPart, mPart] = String(time24 || "").trim().split(":")
  const hour24 = Math.min(23, Math.max(0, Number.parseInt(hPart ?? "", 10) || 0))
  const minute = Math.min(59, Math.max(0, Number.parseInt(String(mPart ?? "0").slice(0, 2), 10) || 0))
  return { hour24, minute }
}

function formatFollowTime24h(hour24: number, minute: number): string {
  return `${pad2(Math.min(23, Math.max(0, Math.floor(hour24))))}:${pad2(Math.min(59, Math.max(0, Math.floor(minute))))}`
}

/** Clamp the digits the user typed (empty → 0 on commit paths). */
function parseClampedInput(s: string, max: number): number {
  const d = String(s || "").replace(/\D/g, "")
  return d === "" ? 0 : Math.min(max, Math.max(0, Number.parseInt(d, 10)))
}

function routePatientNumericId(patientId: string): number | null {
  const n = Number(String(patientId).replace(/^OP0*/i, ""))
  return Number.isFinite(n) && n > 0 ? n : null
}

function nextWeekIso(): string {
  const d = new Date()
  d.setDate(d.getDate() + 7)
  return d.toISOString().slice(0, 10)
}

type Choice = "none" | "followup" | "hospital-transfer"

/**
 * Step 1: optionally save a follow-up slip or a hospital transfer. Step 2: review the regimen's papers, then close
 * the visit. Remount (new `key`) on each open for a fresh form.
 */
export function FinishExaminationDialog({
  open,
  onOpenChange,
  patientId,
  patient,
  departments,
  pdf,
  onDocumentSaved,
  onVisitClosed,
  showError,
  showSuccess,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  patientId: string
  patient: PatientDetail | null
  departments: DepartmentOption[]
  pdf: Pick<ReturnType<typeof usePdfPreview>, "preview" | "busyKey">
  onDocumentSaved: () => Promise<void>
  onVisitClosed: () => Promise<void>
  showError: (message: string) => void
  showSuccess: (message: string) => void
}) {
  const [step, setStep] = useState<1 | 2>(1)
  const [choice, setChoice] = useState<Choice>("none")
  const [saving, setSaving] = useState(false)
  const [closing, setClosing] = useState(false)
  const [saved, setSaved] = useState<null | { type: "followup" | "hospital-transfer"; summary: string }>(null)
  const [docs, setDocs] = useState<RegimenDocuments | null>(null)
  const [docsLoading, setDocsLoading] = useState(false)
  const [docsError, setDocsError] = useState<string | null>(null)
  const [zoom, setZoom] = useState(DEFAULT_ZOOM)

  const [follow, setFollow] = useState<FollowUpForm>(() => ({
    date: nextWeekIso(),
    time: "09:00",
    department: String(patient?.inDepartment || patient?.latestDiagnosis?.department || "Outpatient"),
    symptoms: "",
  }))
  const [hourInput, setHourInput] = useState("09")
  const [minuteInput, setMinuteInput] = useState("00")
  const [transfer, setTransfer] = useState<HospitalTransferForm>({ reason: "", note: "", hospitalName: "" })

  const setFollowField = (patch: Partial<FollowUpForm>) => setFollow((f) => ({ ...f, ...patch }))
  const setTransferField = (patch: Partial<HospitalTransferForm>) => setTransfer((f) => ({ ...f, ...patch }))

  const loadDocuments = useCallback(async () => {
    setDocsLoading(true)
    setDocsError(null)
    try {
      setDocs((await doctorService.getActiveRegimenDocuments(patientId)).regimen)
    } catch (e) {
      setDocs(null)
      setDocsError(e instanceof Error ? e.message : "Could not load regimen documents.")
    } finally {
      setDocsLoading(false)
    }
  }, [patientId])

  useEffect(() => {
    if (open && step === 2) void loadDocuments()
  }, [open, step, loadDocuments])

  // A prescription saved while reviewing changes the list.
  useEffect(() => {
    if (!open || step !== 2) return
    const onSaved = (evt: Event) => {
      const detail = (evt as CustomEvent<{ patientId?: string }>).detail
      if (detail && String(detail.patientId || "") === String(patientId)) void loadDocuments()
    }
    window.addEventListener(EMR_PRESCRIPTION_SAVED_EVENT, onSaved)
    return () => window.removeEventListener(EMR_PRESCRIPTION_SAVED_EVENT, onSaved)
  }, [open, step, patientId, loadDocuments])

  // Re-seed the hour / minute boxes when switching to the follow-up form; follow.time is read once per switch.
  useEffect(() => {
    if (choice !== "followup") return
    const { hour24, minute } = parseFollowTime24hString(follow.time)
    setHourInput(pad2(hour24))
    setMinuteInput(pad2(minute))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [choice])

  const commitFollowTime = () => {
    const h = parseClampedInput(hourInput, 23)
    const m = parseClampedInput(minuteInput, 59)
    const time = formatFollowTime24h(h, m)
    setFollowField({ time })
    setHourInput(pad2(h))
    setMinuteInput(pad2(m))
    return time
  }

  const followUpPreviewHtml = useMemo(
    () =>
      choice === "followup" && patient
        ? buildFollowUpReexamSlipHtmlDocument(buildFollowUpSlipInputs(patient, follow, { M: "Male", F: "Female" }))
        : "",
    [choice, patient, follow],
  )
  const hospitalPreviewHtml = useMemo(
    () => (choice === "hospital-transfer" && patient ? hospitalTransferSlipHtml(patient, transfer) : ""),
    [choice, patient, transfer],
  )

  const saveChoiceAndContinue = async () => {
    if (choice === "none") {
      setSaved(null)
      setStep(2)
      return
    }
    setSaving(true)
    try {
      if (choice === "followup") {
        const time = commitFollowTime()
        if (!routePatientNumericId(patientId) || !follow.date || !time.trim() || !follow.department.trim()) {
          showError("Please fill date, time, and department.")
          return
        }
        if (!patient) {
          showError("Patient data is not loaded; refresh the page and try again.")
          return
        }
        const slip = buildFollowUpSlipInputs(patient, { ...follow, time }, { M: "Nam", F: "Nữ" })
        await doctorService.createFollowUpReexamSlip(patientId, slip)
        await onDocumentSaved()
        setSaved({ type: "followup", summary: `Follow-up slip saved: ${follow.date} ${time} — ${follow.department.trim()}` })
      } else {
        if (!transfer.reason.trim()) {
          showError("Reason is required.")
          return
        }
        if (!transfer.hospitalName.trim()) {
          showError("Destination hospital name is required.")
          return
        }
        await doctorService.createPatientTransfer(patientId, hospitalTransferRequest(transfer))
        await onDocumentSaved()
        setSaved({ type: "hospital-transfer", summary: `Hospital transfer recorded: ${transfer.hospitalName.trim()}` })
      }
      setStep(2)
    } catch (e) {
      showError(e instanceof Error ? e.message : "Could not save.")
    } finally {
      setSaving(false)
    }
  }

  const closeVisit = async () => {
    setClosing(true)
    try {
      await doctorService.closeOpenVisitRegimen(patientId)
      showSuccess("Visit closed.")
      onOpenChange(false)
      await onVisitClosed()
    } catch (e) {
      showError(e instanceof Error ? e.message : "Could not close visit.")
    } finally {
      setClosing(false)
    }
  }

  const timeBox = (which: "hour" | "minute") => {
    const isHour = which === "hour"
    const value = isHour ? hourInput : minuteInput
    const setValue = isHour ? setHourInput : setMinuteInput
    return (
      <div className="grid w-[min(5.5rem,28vw)] gap-1">
        <span className="text-[11px] text-muted-foreground">{isHour ? "Hour (0–23)" : "Minute"}</span>
        <Input
          id={isHour ? "fu-time-hour" : "fu-time-minute"}
          className="h-9 font-mono tabular-nums"
          list={isHour ? "fu-follow-hour-options" : "fu-follow-minute-options"}
          inputMode="numeric"
          autoComplete="off"
          aria-label={isHour ? "Hour, 0 to 23 — type or pick from suggestions" : "Minute, 0 to 59 — type or pick from suggestions"}
          value={value}
          onChange={(e) => {
            const raw = e.target.value.replace(/\D/g, "").slice(0, 2)
            setValue(raw)
            if (raw === "") return
            const typed = Math.min(isHour ? 23 : 59, Number.parseInt(raw, 10))
            setFollowField({
              time: isHour
                ? formatFollowTime24h(typed, parseClampedInput(minuteInput, 59))
                : formatFollowTime24h(parseClampedInput(hourInput, 23), typed),
            })
          }}
          onBlur={commitFollowTime}
        />
      </div>
    )
  }

  const choiceButton = (value: Choice, label: string) => (
    <Button
      type="button"
      size="sm"
      variant={choice === value ? "default" : "outline"}
      className={choice === value ? "btn-gradient" : ""}
      onClick={() => setChoice(value)}
    >
      {label}
    </Button>
  )

  const scaledPreview = (title: string, html: string) => (
    <iframe
      title={title}
      className="min-h-[280px] border-0 bg-white origin-top-left"
      scrolling="no"
      style={{
        width: `${Math.round(100 / zoom)}%`,
        height: `${Math.round(100 / zoom)}%`,
        transform: `scale(${zoom})`,
      }}
      srcDoc={html}
      sandbox=""
    />
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92vh] w-full max-w-[min(1360px,99vw)] flex-col gap-3 overflow-hidden p-6">
        <DialogHeader className="shrink-0 space-y-1">
          <DialogTitle>Finish examination ({step}/2)</DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Step 1: optionally add follow-up or hospital transfer. Step 2: review and finish.
          </DialogDescription>
        </DialogHeader>

        {step === 1 ? (
          <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-[minmax(340px,0.78fr)_minmax(620px,1.22fr)]">
            <div className="max-h-[min(72vh,640px)] min-h-0 space-y-4 overflow-y-auto py-1 pr-1">
              <div className="space-y-2">
                <Label>Choose an optional action</Label>
                <div className="flex flex-wrap gap-2">
                  {choiceButton("none", "No additional document")}
                  {choiceButton("followup", "Add follow-up slip")}
                  {choiceButton("hospital-transfer", "Transfer to other hospital")}
                </div>
              </div>

              {choice === "followup" ? (
                <div className="space-y-3">
                  <div className="grid gap-2">
                    <Label htmlFor="fu-date">
                      Date <span className="text-red-500">*</span>
                    </Label>
                    <YmdEnglishDatePicker
                      id="fu-date"
                      value={follow.date}
                      onChange={(date) => setFollowField({ date })}
                      placeholder="Pick date"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label id="fu-time-label">
                      Time <span className="text-red-500">*</span>
                    </Label>
                    <div className="flex flex-wrap items-end gap-2" role="group" aria-labelledby="fu-time-label">
                      <datalist id="fu-follow-hour-options">
                        {FOLLOW_UP_HOUR24_OPTIONS.map((h) => (
                          <option key={h} value={h} />
                        ))}
                      </datalist>
                      <datalist id="fu-follow-minute-options">
                        {FOLLOW_UP_MINUTE_OPTIONS.map((m) => (
                          <option key={m} value={m} />
                        ))}
                      </datalist>
                      {timeBox("hour")}
                      <span className="pb-2 text-sm text-muted-foreground" aria-hidden>
                        :
                      </span>
                      {timeBox("minute")}
                    </div>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="fu-dept">
                      Department <span className="text-red-500">*</span>
                    </Label>
                    <Select value={follow.department} onValueChange={(department) => setFollowField({ department })}>
                      <SelectTrigger id="fu-dept" aria-required="true">
                        <SelectValue placeholder="Select department" />
                      </SelectTrigger>
                      <SelectContent>
                        {departments.map((d) => (
                          <SelectItem key={d.id} value={d.name}>
                            {d.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="fu-symptoms">Reason / symptoms (optional)</Label>
                    <Textarea
                      id="fu-symptoms"
                      value={follow.symptoms}
                      onChange={(e) => setFollowField({ symptoms: e.target.value })}
                      rows={3}
                      placeholder="Chief complaint or visit reason"
                    />
                  </div>
                </div>
              ) : null}

              {choice === "hospital-transfer" ? (
                <div className="space-y-3">
                  <div className="grid gap-2">
                    <Label htmlFor="tr-reason">
                      Reason <span className="text-red-500">*</span>
                    </Label>
                    <Textarea
                      id="tr-reason"
                      value={transfer.reason}
                      onChange={(e) => setTransferField({ reason: e.target.value })}
                      onInput={(e) => setTransferField({ reason: (e.target as HTMLTextAreaElement).value })}
                      onBlur={(e) => setTransferField({ reason: e.target.value })}
                      rows={2}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="tr-note">Clinical note (optional)</Label>
                    <Textarea
                      id="tr-note"
                      value={transfer.note}
                      onChange={(e) => setTransferField({ note: e.target.value })}
                      onInput={(e) => setTransferField({ note: (e.target as HTMLTextAreaElement).value })}
                      onBlur={(e) => setTransferField({ note: e.target.value })}
                      rows={2}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="h-name">
                      Hospital name <span className="text-red-500">*</span>
                    </Label>
                    <Select value={transfer.hospitalName} onValueChange={(hospitalName) => setTransferField({ hospitalName })}>
                      <SelectTrigger id="h-name" aria-required="true">
                        <SelectValue placeholder="Select receiving hospital" />
                      </SelectTrigger>
                      <SelectContent>
                        {TRANSFER_HOSPITAL_OPTIONS.map((hospital) => (
                          <SelectItem key={hospital} value={hospital}>
                            {hospital}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="flex min-h-[260px] flex-col overflow-hidden rounded-lg border bg-muted/20 lg:min-h-0 lg:max-h-[min(72vh,640px)]">
              <div className="shrink-0 flex items-center justify-between gap-2 border-b bg-background px-3 py-1.5">
                <div className="text-xs font-medium">Print preview</div>
                <div className="flex items-center gap-1.5">
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    className="h-7 w-7"
                    onClick={() => setZoom((z) => Math.max(0.3, Number((z - 0.05).toFixed(2))))}
                    title="Zoom out"
                  >
                    <Minus className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 px-2 text-[11px]"
                    onClick={() => setZoom(DEFAULT_ZOOM)}
                    title="Reset fit"
                  >
                    {Math.round(zoom * 100)}%
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    className="h-7 w-7"
                    onClick={() => setZoom((z) => Math.min(1.5, Number((z + 0.05).toFixed(2))))}
                    title="Zoom in"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
              <div className="min-h-0 flex-1 overflow-auto bg-white p-1">
                {choice === "followup" ? (
                  scaledPreview("Follow-up slip preview", followUpPreviewHtml)
                ) : choice === "hospital-transfer" ? (
                  scaledPreview("Hospital transfer slip preview", hospitalPreviewHtml)
                ) : (
                  <p className="p-4 text-sm text-muted-foreground">Choose an action to preview the print slip.</p>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto space-y-3">
            <p className="text-sm text-slate-700">Review papers in this regimen before closing.</p>
            {docsError ? (
              <p className="text-sm text-destructive">{docsError}</p>
            ) : docsLoading ? (
              <p className="text-sm text-muted-foreground">Loading regimen documents…</p>
            ) : docs ? (
              <RegimenDocumentsReview docs={docs} patient={patient} patientId={patientId} pdf={pdf} />
            ) : (
              <div className="rounded-md border bg-slate-50 px-3 py-2 text-sm text-slate-600">No active regimen documents found.</div>
            )}
            {saved ? (
              <div className="rounded-md border bg-slate-50 px-3 py-2 text-sm">
                <span className="font-medium">Added:</span> {saved.summary}
              </div>
            ) : (
              <div className="rounded-md border bg-slate-50 px-3 py-2 text-sm text-slate-600">No additional document added.</div>
            )}
            {saved?.type === "followup" ? (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-white px-3 py-2">
                  <div className="text-sm font-medium text-slate-800">Follow-up reexam slip</div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={pdf.busyKey === "followup-slip"}
                    onClick={() => {
                      if (!patient) return
                      void pdf.preview("followup-slip", "Follow-up slip (PDF)", () =>
                        generateFollowUpReexamPdfBlob({
                          ...buildFollowUpSlipInputs(patient, follow, { M: "Nam", F: "Nữ" }),
                          signingTimeDisplay: buildSigningTimeLine(new Date()),
                          filename: `follow-up-${follow.date || "date"}.pdf`,
                        }),
                      )
                    }}
                  >
                    {pdf.busyKey === "followup-slip" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    Preview PDF
                  </Button>
                </div>
                <div className="rounded-lg border overflow-hidden">
                  <div className="border-b bg-background px-3 py-1.5 text-xs font-medium">Follow-up slip preview</div>
                  <iframe title="Follow-up slip preview (review)" className="h-[420px] w-full border-0" srcDoc={followUpPreviewHtml} sandbox="" />
                </div>
              </>
            ) : null}
            {saved?.type === "hospital-transfer" ? (
              <div className="rounded-lg border overflow-hidden">
                <div className="border-b bg-background px-3 py-1.5 text-xs font-medium">Hospital transfer slip preview</div>
                <iframe title="Hospital transfer slip preview (review)" className="h-[420px] w-full border-0" srcDoc={hospitalPreviewHtml} sandbox="" />
              </div>
            ) : null}
          </div>
        )}

        <DialogFooter className="shrink-0 gap-2 border-t border-border/60 pt-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => (step === 2 ? setStep(1) : onOpenChange(false))}
            disabled={saving || closing}
          >
            {step === 2 ? "Back" : "Cancel"}
          </Button>
          {step === 1 ? (
            <Button type="button" className="btn-gradient" disabled={saving} onClick={() => void saveChoiceAndContinue()}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Continue
            </Button>
          ) : (
            <Button type="button" className="btn-gradient gap-1" disabled={closing} onClick={() => void closeVisit()}>
              {closing ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Finish examination
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
