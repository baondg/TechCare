import { useCallback, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { Loader2 } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { SignaturePad } from "@/components/signature-pad"
import { doctorService } from "@/services/doctor-service"

/**
 * The doctor's signature for PDFs. `ensureSignature()` returns the saved one, or opens the pad and resolves with the
 * new one (null if the doctor cancels). `openEditor()` opens the pad to change it. Render `dialog` once.
 */
export function useDoctorSignature(showError: (m: string) => void, showSuccess: (m: string) => void) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  /** `export` = asked for because a PDF needs it; `edit` = "Change signature". */
  const [context, setContext] = useState<"export" | "edit">("export")
  const [initial, setInitial] = useState<string | null>(null)
  const [padKey, setPadKey] = useState(0)
  const [saving, setSaving] = useState(false)
  const [opening, setOpening] = useState(false)
  const waiter = useRef<((sig: string | null) => void) | null>(null)

  const showPad = (nextContext: "export" | "edit", nextInitial: string | null) => {
    setContext(nextContext)
    setInitial(nextInitial)
    setPadKey((k) => k + 1)
    setOpen(true)
  }

  /** Resolve a waiting export; `cancelled` also tells the doctor the export stopped. */
  const settle = useCallback(
    (sig: string | null, cancelled: boolean) => {
      const resolve = waiter.current
      waiter.current = null
      resolve?.(sig)
      if (resolve && cancelled) showError(t("doctor.prescription.signatureExportCancelled"))
    },
    [showError, t],
  )

  const ensureSignature = useCallback(async (): Promise<string | null> => {
    try {
      const got = await doctorService.getSignature()
      if (got.success && got.signature?.trim()) return got.signature.trim()
    } catch (e) {
      showError(e instanceof Error ? e.message : t("doctor.prescription.signatureLoadFail"))
      return null
    }
    return new Promise((resolve) => {
      waiter.current = resolve
      showPad("export", null)
    })
  }, [showError, t])

  const openEditor = useCallback(async () => {
    setOpening(true)
    try {
      const got = await doctorService.getSignature()
      showPad("edit", got.success && got.signature?.trim() ? got.signature.trim() : null)
    } catch (e) {
      showError(e instanceof Error ? e.message : t("doctor.prescription.signatureLoadFail"))
    } finally {
      setOpening(false)
    }
  }, [showError, t])

  const save = async (dataUrl: string) => {
    setSaving(true)
    const forExport = waiter.current != null
    try {
      await doctorService.saveSignature(dataUrl)
      setOpen(false)
      settle(dataUrl, false)
      if (!forExport) showSuccess(t("doctor.prescription.signatureUpdateSuccess"))
    } catch (e) {
      showError(e instanceof Error ? e.message : t("doctor.prescription.signatureSaveFail"))
    } finally {
      setSaving(false)
    }
  }

  const close = () => {
    setOpen(false)
    settle(null, true)
  }

  const dialog = (
    <Dialog open={open} onOpenChange={(next) => (next ? setOpen(true) : close())}>
      <DialogContent className="max-w-md gap-4">
        <DialogHeader>
          <DialogTitle>
            {context === "edit" ? t("doctor.prescription.signatureEditDialogTitle") : t("doctor.prescription.signatureDialogTitle")}
          </DialogTitle>
          <DialogDescription>
            {context === "edit"
              ? t("doctor.prescription.signatureEditDialogDescription")
              : t("doctor.prescription.signatureDialogDescription")}
          </DialogDescription>
        </DialogHeader>
        <SignaturePad
          key={padKey}
          initialSignature={initial}
          onSave={(url) => void save(url)}
          onCancel={close}
          className={saving ? "pointer-events-none opacity-60" : undefined}
        />
        {saving ? (
          <div className="flex items-center justify-center gap-2 text-sm text-slate-600">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t("common.loading")}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )

  return { ensureSignature, openEditor, opening, saving, dialog }
}
