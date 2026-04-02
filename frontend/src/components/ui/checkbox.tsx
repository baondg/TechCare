import { Check } from "lucide-react"

interface ColumnCheckboxProps {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
  compact?: boolean
}

export function Checkbox({
  label,
  checked,
  onChange,
  compact = false,
}: ColumnCheckboxProps) {
  return (
    <label className={`flex items-center cursor-pointer select-none ${compact ? "gap-1" : "gap-2"}`}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="sr-only"
      />

      <span
        className={`
          ${compact ? "w-3.5 h-3.5" : "w-4 h-4"}
          border rounded-sm
          flex items-center justify-center
          transition-colors
          ${checked
            ? "bg-cyan-500 border-cyan-500"
            : "border-slate-400"}
        `}
      >
        {checked && (
          <Check
            className={`${compact ? "w-2.5 h-2.5" : "w-3 h-3"} text-white`}
            strokeWidth={3}
          />
        )}
      </span>

      <span className={compact ? "text-xs" : "text-sm"}>{label}</span>
    </label>
  )
}
