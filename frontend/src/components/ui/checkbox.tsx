import { Check } from "lucide-react"

interface ColumnCheckboxProps {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
  compact?: boolean
  /** When true (default), avoids scroll-into-view on toggle inside scrollable dialogs. */
  preventFocusScroll?: boolean
}

export function Checkbox({
  label,
  checked,
  onChange,
  compact = false,
  preventFocusScroll = true,
}: ColumnCheckboxProps) {
  const handleToggle = () => onChange(!checked)

  return (
    <div
      className={`flex items-center cursor-pointer select-none ${compact ? "gap-1" : "gap-2"}`}
      role="checkbox"
      aria-checked={checked}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === " " || e.key === "Enter") {
          e.preventDefault()
          handleToggle()
        }
      }}
      onMouseDown={
        preventFocusScroll
          ? (e) => {
              e.preventDefault()
            }
          : undefined
      }
      onClick={handleToggle}
    >
      <span
        className={`
          ${compact ? "w-3.5 h-3.5" : "w-4 h-4"}
          border rounded-sm shrink-0
          flex items-center justify-center
          transition-colors
          ${checked ? "bg-cyan-500 border-cyan-500" : "border-slate-400"}
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
    </div>
  )
}
