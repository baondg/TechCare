import { useCallback, useEffect, useState, type ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { FileDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { stampPdfWithExportFooter } from "@/lib/pdf-export-stamp"

/**
 * Generate a PDF, preview it in a dialog, save it with the export footer stamped on.
 * `preview(key, title, make)` marks `busyKey` while `make` runs (`make` returns null to show nothing);
 * render `dialog` once.
 * `extraActions(close)` renders more footer buttons before Save.
 */
export function usePdfPreview(
  showError: (message: string) => void,
  extraActions?: (close: () => void) => ReactNode,
) {
  const { t } = useTranslation()
  const [url, setUrl] = useState<string | null>(null)
  const [title, setTitle] = useState("PDF preview")
  const [filename, setFilename] = useState("document.pdf")
  const [busyKey, setBusyKey] = useState<string | null>(null)

  useEffect(() => {
    return () => {
      if (url) URL.revokeObjectURL(url)
    }
  }, [url])

  const preview = useCallback(
    async (key: string, nextTitle: string, make: () => Promise<{ blob: Blob; filename: string } | null>) => {
      setBusyKey(key)
      try {
        const made = await make()
        if (!made) return
        const { blob, filename: name } = made
        setFilename(name || "document.pdf")
        setTitle(nextTitle || "PDF preview")
        setUrl(URL.createObjectURL(blob))
      } catch (e) {
        showError(e instanceof Error ? e.message : "Failed to generate PDF")
      } finally {
        setBusyKey(null)
      }
    },
    [showError],
  )

  const close = useCallback(() => setUrl(null), [])

  const save = useCallback(async () => {
    if (!url) return
    try {
      const raw = await (await fetch(url)).blob()
      const stamped = await stampPdfWithExportFooter(raw, new Date())
      const href = URL.createObjectURL(stamped)
      const a = document.createElement("a")
      a.href = href
      a.download = filename || "document.pdf"
      a.rel = "noopener"
      a.click()
      URL.revokeObjectURL(href)
    } catch (e) {
      console.error(e)
      showError(e instanceof Error ? e.message : "Download failed")
    }
  }, [url, filename, showError])

  const dialog = (
    <Dialog open={url !== null} onOpenChange={(open) => { if (!open) close() }}>
      <DialogContent className="flex max-h-[90vh] w-[min(920px,96vw)] max-w-none flex-col gap-3 p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="sr-only">Preview the generated PDF before saving or downloading.</DialogDescription>
        </DialogHeader>
        {url ? (
          <iframe
            title="PDF preview"
            src={url}
            className="min-h-[min(520px,60vh)] w-full flex-1 rounded-md border bg-muted/30"
          />
        ) : null}
        <DialogFooter className="gap-2 sm:justify-end">
          <Button type="button" variant="outline" onClick={close}>
            {t("common.close")}
          </Button>
          {extraActions?.(close)}
          <Button type="button" onClick={save} disabled={!url}>
            <FileDown className="mr-2 h-4 w-4" />
            {t("common.saveDownload")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )

  return { preview, busyKey, dialog }
}
