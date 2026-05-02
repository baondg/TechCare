"use client"

import { useEffect, useState, type ReactNode } from "react"
import { enUS } from "date-fns/locale"
import { endOfDay, isWithinInterval, startOfDay } from "date-fns"
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Calendar as CalendarPicker } from "@/components/ui/calendar"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

export type ScheduleTab = "day" | "week" | "month"

export function toLocalIsoDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

export function parseIsoDateLocal(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number)
  return new Date(y, m - 1, d)
}

/** Monday as first day of week (ISO-style week). */
export function startOfWeekMonday(d: Date): Date {
  const date = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const day = date.getDay()
  const diff = day === 0 ? -6 : 1 - day
  date.setDate(date.getDate() + diff)
  return date
}

export function endOfWeekFromMonday(monday: Date): Date {
  return new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6)
}

export function rangeForScheduleTab(
  tab: ScheduleTab,
  dayKey: string,
  weekStartKey: string,
  monthKey: string
): { startDate: string; endDate: string } {
  if (tab === "day") {
    return { startDate: dayKey, endDate: dayKey }
  }
  if (tab === "week") {
    const mon = parseIsoDateLocal(weekStartKey)
    return { startDate: weekStartKey, endDate: toLocalIsoDate(endOfWeekFromMonday(mon)) }
  }
  const [y, m] = monthKey.split("-").map(Number)
  const first = new Date(y, m - 1, 1)
  const last = new Date(y, m, 0)
  return { startDate: toLocalIsoDate(first), endDate: toLocalIsoDate(last) }
}

export function formatDayButtonLabel(iso: string) {
  return parseIsoDateLocal(iso).toLocaleDateString("en-US", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  })
}

export function formatWeekButtonLabel(weekStartIso: string) {
  const start = parseIsoDateLocal(weekStartIso)
  const end = endOfWeekFromMonday(start)
  const opt = { month: "short" as const, day: "numeric" as const, year: "numeric" as const }
  return `${start.toLocaleDateString("en-US", opt)} – ${end.toLocaleDateString("en-US", opt)}`
}

export function formatMonthButtonLabel(monthKeyStr: string) {
  const [y, m] = monthKeyStr.split("-").map(Number)
  if (!y || !m) return monthKeyStr
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" })
}

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

function parseMonthKey(monthKey: string): { year: number; month: number } {
  const [y, m] = monthKey.split("-").map(Number)
  return { year: y || new Date().getFullYear(), month: m && m >= 1 && m <= 12 ? m : new Date().getMonth() + 1 }
}

/** Tabs + triggers aligned with doctor-layout-2 / App.css `.tabs-trigger`. */
export function ScheduleDashboardTabs({
  scheduleTab,
  onScheduleTabChange,
  children,
}: {
  scheduleTab: ScheduleTab
  onScheduleTabChange: (v: ScheduleTab) => void
  children: ReactNode
}) {
  return (
    <Tabs value={scheduleTab} onValueChange={(v) => onScheduleTabChange(v as ScheduleTab)} className="w-full">
      <div className="flex flex-col gap-4">
        <div className="w-fit max-w-full rounded-xl border border-slate-200/80 bg-slate-50/50 p-1.5 shadow-sm">
          <TabsList className="inline-flex h-auto min-h-0 flex-wrap items-center justify-start gap-2 rounded-lg bg-transparent p-0 text-muted-foreground">
            <TabsTrigger value="day" className="tabs-trigger shrink-0 gap-2 px-4 py-2 text-sm shadow-none data-[state=active]:shadow-none">
              Day
            </TabsTrigger>
            <TabsTrigger value="week" className="tabs-trigger shrink-0 gap-2 px-4 py-2 text-sm shadow-none data-[state=active]:shadow-none">
              Week
            </TabsTrigger>
            <TabsTrigger value="month" className="tabs-trigger shrink-0 gap-2 px-4 py-2 text-sm shadow-none data-[state=active]:shadow-none">
              Month
            </TabsTrigger>
          </TabsList>
        </div>
        <div>{children}</div>
      </div>
    </Tabs>
  )
}

export function ScheduleDayPickerField({
  dayKey,
  setDayKey,
}: {
  dayKey: string
  setDayKey: (iso: string) => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <TabsContent value="day" className="mt-0">
      <div className="max-w-sm rounded-xl border border-slate-200/80 bg-white p-1 shadow-sm">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" className="w-full justify-start rounded-lg border-slate-200 text-left font-normal shadow-none">
              <CalendarDays className="mr-2 h-4 w-4 shrink-0" />
              {formatDayButtonLabel(dayKey)}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <CalendarPicker
              key={open ? `day-${dayKey}` : "day-closed"}
              mode="single"
              locale={enUS}
              weekStartsOn={1}
              selected={parseIsoDateLocal(dayKey)}
              onSelect={(d) => {
                if (!d) return
                setDayKey(toLocalIsoDate(d))
                setOpen(false)
              }}
              defaultMonth={parseIsoDateLocal(dayKey)}
            />
          </PopoverContent>
        </Popover>
      </div>
    </TabsContent>
  )
}

export function ScheduleWeekPickerField({
  weekStartKey,
  setWeekStartKey,
}: {
  weekStartKey: string
  setWeekStartKey: (iso: string) => void
}) {
  const [open, setOpen] = useState(false)
  const weekStartDate = parseIsoDateLocal(weekStartKey)
  const weekEndDate = endOfWeekFromMonday(weekStartDate)
  const weekInterval = {
    start: startOfDay(weekStartDate),
    end: endOfDay(weekEndDate),
  }

  return (
    <TabsContent value="week" className="mt-0">
      <div className="max-w-sm space-y-2 rounded-xl border border-slate-200/80 bg-white p-3 shadow-sm">
        <p className="text-xs font-medium text-slate-500">Select any day inside the week</p>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" className="w-full justify-start rounded-lg border-slate-200 text-left font-normal shadow-none">
              <CalendarDays className="mr-2 h-4 w-4 shrink-0" />
              {formatWeekButtonLabel(weekStartKey)}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <CalendarPicker
              key={open ? `week-${weekStartKey}` : "week-closed"}
              mode="single"
              locale={enUS}
              weekStartsOn={1}
              showWeekNumber
              modifiers={{
                inSelectedWeek: (date) => isWithinInterval(date, weekInterval),
              }}
              modifiersClassNames={{
                inSelectedWeek: "bg-cyan-100/80 dark:bg-cyan-950/50 aria-selected:!bg-primary aria-selected:!text-primary-foreground",
              }}
              selected={weekStartDate}
              onSelect={(d) => {
                if (!d) return
                setWeekStartKey(toLocalIsoDate(startOfWeekMonday(d)))
                setOpen(false)
              }}
              defaultMonth={weekStartDate}
            />
          </PopoverContent>
        </Popover>
      </div>
    </TabsContent>
  )
}

export function ScheduleMonthPickerField({
  monthKey,
  setMonthKey,
}: {
  monthKey: string
  setMonthKey: (key: string) => void
}) {
  const [open, setOpen] = useState(false)
  const { year: keyYear, month: keyMonth } = parseMonthKey(monthKey)
  const [year, setYear] = useState(keyYear)

  useEffect(() => {
    if (open) setYear(keyYear)
  }, [open, keyYear])

  return (
    <TabsContent value="month" className="mt-0">
      <div className="max-w-sm rounded-xl border border-slate-200/80 bg-white p-3 shadow-sm">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" className="w-full justify-start rounded-lg border-slate-200 text-left font-normal shadow-none">
              <CalendarDays className="mr-2 h-4 w-4 shrink-0" />
              {formatMonthButtonLabel(monthKey)}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[min(100vw-2rem,18rem)] p-3" align="start">
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 shrink-0 rounded-lg shadow-none"
                  aria-label="Previous year"
                  onClick={() => setYear((y) => y - 1)}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="min-w-0 text-center text-sm font-semibold tabular-nums">{year}</span>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 shrink-0 rounded-lg shadow-none"
                  aria-label="Next year"
                  onClick={() => setYear((y) => y + 1)}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {MONTH_LABELS.map((label, idx) => {
                  const m = idx + 1
                  const active = year === keyYear && m === keyMonth
                  return (
                    <Button
                      key={label}
                      type="button"
                      variant={active ? "default" : "outline"}
                      className="h-9 rounded-lg text-xs font-medium shadow-none sm:text-sm"
                      onClick={() => {
                        setMonthKey(`${year}-${String(m).padStart(2, "0")}`)
                        setOpen(false)
                      }}
                    >
                      {label}
                    </Button>
                  )
                })}
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </TabsContent>
  )
}
