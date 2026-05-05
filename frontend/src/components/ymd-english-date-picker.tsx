"use client"

import { format, isValid, parse } from "date-fns"
import { enUS } from "date-fns/locale"
import { Calendar as CalendarIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"

function parseYmdLocal(ymd: string): Date | undefined {
  const s = String(ymd || "").trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return undefined
  const d = parse(s, "yyyy-MM-dd", new Date(), { locale: enUS })
  return isValid(d) ? d : undefined
}

export type YmdEnglishDatePickerProps = {
  id?: string
  name?: string
  "aria-label"?: string
  value: string
  onChange: (ymd: string) => void
  disabled?: boolean
  className?: string
  placeholder?: string
}

/**
 * yyyy-MM-dd field with English react-day-picker UI (avoids browser/OS `type="date"` locale).
 */
export function YmdEnglishDatePicker({
  id,
  name,
  "aria-label": ariaLabel,
  value,
  onChange,
  disabled,
  className,
  placeholder = "Pick a date",
}: YmdEnglishDatePickerProps) {
  const selected = parseYmdLocal(value)
  const label = selected ? format(selected, "MMM d, yyyy", { locale: enUS }) : null

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          id={id}
          name={name}
          aria-label={ariaLabel}
          type="button"
          variant="outline"
          disabled={disabled}
          className={cn(
            "h-9 justify-start text-left font-normal text-sm text-slate-900",
            !value && "text-muted-foreground",
            className
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4 shrink-0 opacity-70" aria-hidden />
          {label ?? placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="z-[100] w-auto p-0" align="start">
        <Calendar
          mode="single"
          captionLayout="dropdown"
          locale={enUS}
          selected={selected}
          onSelect={(d) => {
            onChange(d ? format(d, "yyyy-MM-dd") : "")
          }}
        />
        <div className="flex items-center justify-between gap-2 border-t px-2 py-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 px-2 text-xs"
            aria-label="Clear selected date"
            onClick={() => onChange("")}
          >
            Clear
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 px-2 text-xs"
            aria-label="Set date to today"
            onClick={() => onChange(format(new Date(), "yyyy-MM-dd"))}
          >
            Today
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
