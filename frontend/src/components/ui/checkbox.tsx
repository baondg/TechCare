import { Check } from "lucide-react"

interface ColumnCheckboxProps {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
}

export function Checkbox({
  label,
  checked,
  onChange,
}: ColumnCheckboxProps) {
  return (
    <label className="flex items-center gap-2 cursor-pointer select-none">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="sr-only"
      />

      <span
        className={`
          w-4 h-4
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
            className="w-3 h-3 text-white"
            strokeWidth={3}
          />
        )}
      </span>

      <span className="text-sm">{label}</span>
    </label>
  )
}
