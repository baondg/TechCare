import { useCallback, useEffect, useId, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { ChevronDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"
import { doctorService, type MedicineOption } from "@/services/doctor-service"

/** Medicine name with catalogue suggestions; a pick (or an exact name match on blur) also sets the unit. */
export function MedicineNameCombobox({
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
