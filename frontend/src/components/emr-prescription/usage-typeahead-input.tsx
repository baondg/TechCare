import { useMemo, type KeyboardEvent } from "react"
import { useTranslation } from "react-i18next"
import type { TFunction } from "i18next"
import { cn } from "@/lib/utils"
import { medicationUnitLabelVi } from "@/lib/medication-units-vi"
import type { Medication } from "./medications"

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
  const unit = medicationUnitLabelVi(med.unit || "tablet")
  return t("doctor.prescription.usageDailyPrefix", { amount: n, unit })
}

function usageTypeaheadGhostTail(suggestion: string | null, usage: string): string | null {
  if (!suggestion) return null
  if (!usage) return suggestion
  if (suggestion.startsWith(usage)) return suggestion.slice(usage.length)
  return null
}

/** Usage text with a greyed "per day" suggestion from qty ÷ duration; Enter accepts it. */
export function UsageTypeaheadInput({
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
