import { useState } from "react"
import { useTranslation } from "react-i18next"
import { Check, Copy } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

export interface IssuedPassword {
  username: string
  password: string
}

/** Shows an admin-issued temporary password once, with a copy button. */
export function TemporaryPasswordDialog({ issued, onClose }: { issued: IssuedPassword | null; onClose: () => void }) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    if (!issued) return
    try {
      await navigator.clipboard.writeText(issued.password)
      setCopied(true)
    } catch {
      // clipboard blocked (http, permissions): the password stays visible to copy by hand
    }
  }

  const close = () => {
    setCopied(false)
    onClose()
  }

  return (
    <Dialog open={issued !== null} onOpenChange={(open) => !open && close()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("admin.accounts.temporaryPasswordTitle")}</DialogTitle>
          <DialogDescription className="text-left">
            {t("admin.accounts.temporaryPasswordNotice", { username: issued?.username ?? "" })}
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2">
          <code
            data-testid="temporary-password"
            className="flex-1 select-all rounded-md border bg-gray-50 px-3 py-2 font-mono text-lg tracking-wider"
          >
            {issued?.password}
          </code>
          <Button type="button" variant="outline" onClick={() => void copy()}>
            {copied ? <Check className="h-4 w-4 mr-1.5" /> : <Copy className="h-4 w-4 mr-1.5" />}
            {copied ? t("admin.accounts.copied") : t("admin.accounts.copy")}
          </Button>
        </div>
        <DialogFooter>
          <Button type="button" className="btn-gradient" onClick={close}>
            {t("admin.accounts.done")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
