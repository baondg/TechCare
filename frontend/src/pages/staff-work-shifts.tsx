import { useCallback, useEffect, useMemo, useState } from "react"
import * as XLSX from "xlsx"
import { ChevronDown, Download, History, RefreshCcw, Users } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import {
  getClinicalStaffDirectory,
  getMyWorkShifts,
  type ClinicalStaffDirectoryRow,
  type WorkShiftRow,
} from "@/services/work-shift-service"
import { useAuth } from "@/contexts/AuthContext"

/** Minutes from midnight; inclusive end for shift 1 & 2 windows. */
const CA1_START = 7 * 60
const CA1_END = 11 * 60 + 30
const CA2_START = 13 * 60
const CA2_END = 17 * 60 + 30

const SHIFT_TOOLTIP_LINES = [
  "Shift 1: 7:00 – 11:30",
  "Shift 2: 13:00 – 17:30",
  "Shift 3: other times outside the ranges above",
].join("\n")

const TABLE_HEADER_GRADIENT =
  "linear-gradient(135deg, #06b6d4 0%, #0891b2 50%, #06b6d4 100%)"

function pad2(n: number) {
  return String(n).padStart(2, "0")
}

/** Local calendar YYYY-MM-DD (avoid toISOString UTC day shift). */
function toYmdLocal(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

function todayYmd(): string {
  return toYmdLocal(new Date())
}

function addYearsYmd(ymd: string, deltaYears: number): string {
  const [y, m, d] = ymd.split("-").map(Number)
  const dt = new Date(y, m - 1, d)
  dt.setFullYear(dt.getFullYear() + deltaYears)
  return toYmdLocal(dt)
}

/** Default “custom range” preset: first of current month → end of month +2. */
function defaultCustomRange(): { start: string; end: string } {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), 1)
  const end = new Date(now.getFullYear(), now.getMonth() + 2, 0)
  return {
    start: toYmdLocal(start),
    end: toYmdLocal(end),
  }
}

function parseDbStart(raw: string): { y: number; m: number; d: number; totalMin: number } | null {
  const s = String(raw || "").trim()
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/.exec(s)
  if (!m) return null
  const y = Number(m[1])
  const mo = Number(m[2])
  const d = Number(m[3])
  const h = Number(m[4])
  const mi = Number(m[5])
  if (![y, mo, d, h, mi].every((n) => Number.isFinite(n))) return null
  return { y, m: mo, d, totalMin: h * 60 + mi }
}

/** dd-mm-yyyy from shift start timestamp string. */
function formatDateDdMmYyyy(raw: string): string {
  const p = parseDbStart(raw)
  if (!p) return "—"
  return `${pad2(p.d)}-${pad2(p.m)}-${p.y}`
}

type ShiftKind = 1 | 2 | 3

/** Map start time to Shift 1 / 2 / 3 (by hospital shift windows). */
function shiftMetaFromStart(raw: string): { label: string; kind: ShiftKind | null } {
  const p = parseDbStart(raw)
  if (!p) return { label: "—", kind: null }
  const t = p.totalMin
  if (t >= CA1_START && t <= CA1_END) return { label: "Shift 1", kind: 1 }
  if (t >= CA2_START && t <= CA2_END) return { label: "Shift 2", kind: 2 }
  return { label: "Shift 3", kind: 3 }
}

function shiftBadgeClass(kind: ShiftKind | null): string {
  if (kind === 1) return "border-cyan-200/90 bg-cyan-50 text-cyan-900 shadow-none"
  if (kind === 2) return "border-violet-200/90 bg-violet-50 text-violet-900 shadow-none"
  if (kind === 3) return "border-slate-200 bg-slate-100 text-slate-800 shadow-none"
  return "border-muted bg-muted/50 text-muted-foreground shadow-none"
}

function escapeCsvCell(value: string): string {
  const s = String(value ?? "")
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

/** UTF-8 BOM + CRLF so Excel opens Vietnamese text reliably. */
function downloadWorkShiftsCsv(rows: WorkShiftRow[], fileBase: string) {
  const headers = ["Date", "Shift", "Department", "Room", "Doctor", "Nurse", "Technician"]
  const lines = [headers.map(escapeCsvCell).join(",")]
  for (const s of rows) {
    const shift = shiftMetaFromStart(String(s.startTime))
    lines.push(
      [
        escapeCsvCell(formatDateDdMmYyyy(String(s.startTime))),
        escapeCsvCell(shift.label),
        escapeCsvCell(s.departmentName),
        escapeCsvCell(s.roomName),
        escapeCsvCell(s.doctorName),
        escapeCsvCell(s.nurseName),
        escapeCsvCell(s.technicianName),
      ].join(","),
    )
  }
  const csv = `\uFEFF${lines.join("\r\n")}`
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `${fileBase}.csv`
  a.rel = "noopener"
  a.click()
  URL.revokeObjectURL(url)
}

function downloadWorkShiftsXlsx(rows: WorkShiftRow[], fileBase: string) {
  const headers = ["Date", "Shift", "Department", "Room", "Doctor", "Nurse", "Technician"]
  const data: string[][] = [headers]
  for (const s of rows) {
    const shift = shiftMetaFromStart(String(s.startTime))
    data.push([
      formatDateDdMmYyyy(String(s.startTime)),
      shift.label,
      String(s.departmentName ?? ""),
      String(s.roomName ?? ""),
      String(s.doctorName ?? ""),
      String(s.nurseName ?? ""),
      String(s.technicianName ?? ""),
    ])
  }
  const ws = XLSX.utils.aoa_to_sheet(data)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, "Schedule")
  XLSX.writeFile(wb, `${fileBase}.xlsx`)
}

type ScheduleView = "upcoming" | "all" | "range"
type ExportFormat = "csv" | "xlsx"

const SELF_VALUE = "__self__"
const ALL_VALUE = "__all__"

type StaffScheduleScope = "self" | "all" | number

export default function StaffWorkShiftsPage() {
  const { user } = useAuth()
  const initialCustom = useMemo(() => defaultCustomRange(), [])
  const [scheduleView, setScheduleView] = useState<ScheduleView>("upcoming")
  const [rangeFrom, setRangeFrom] = useState(initialCustom.start)
  const [rangeTo, setRangeTo] = useState(initialCustom.end)
  const [shifts, setShifts] = useState<WorkShiftRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  const [staffScope, setStaffScope] = useState<StaffScheduleScope>("self")
  const [staffDirectory, setStaffDirectory] = useState<ClinicalStaffDirectoryRow[]>([])
  const [dirLoading, setDirLoading] = useState(true)
  const [dirError, setDirError] = useState<string | null>(null)
  const [exportMenuOpen, setExportMenuOpen] = useState(false)

  const apiRange = useMemo((): { startDate: string; endDate: string } => {
    const t = todayYmd()
    if (scheduleView === "upcoming") {
      return { startDate: t, endDate: addYearsYmd(t, 2) }
    }
    if (scheduleView === "all") {
      return { startDate: addYearsYmd(t, -3), endDate: addYearsYmd(t, 2) }
    }
    return { startDate: rangeFrom, endDate: rangeTo }
  }, [scheduleView, rangeFrom, rangeTo])

  const rangeInvalid = scheduleView === "range" && apiRange.startDate > apiRange.endDate

  const scheduleHint = useMemo(() => {
    if (scheduleView === "upcoming") {
      return "Only shifts from today through the loaded future window are requested."
    }
    if (scheduleView === "all") {
      return "Loads a wide past and future window (last 3 years through 2 years ahead)."
    }
    return "Loads shifts whose start time falls between the dates below (inclusive)."
  }, [scheduleView])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setDirLoading(true)
      setDirError(null)
      try {
        const r = await getClinicalStaffDirectory()
        if (!cancelled) setStaffDirectory(r.staff || [])
      } catch (e) {
        if (!cancelled) {
          setStaffDirectory([])
          setDirError(e instanceof Error ? e.message : "Could not load staff list")
        }
      } finally {
        if (!cancelled) setDirLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const forUserIdParam = useMemo((): number | "all" | undefined => {
    if (staffScope === "self") return undefined
    if (staffScope === "all") return "all"
    if (typeof staffScope === "number") {
      if (user?.id != null && staffScope === user.id) return undefined
      return staffScope
    }
    return undefined
  }, [staffScope, user?.id])

  const viewedStaffLabel = useMemo(() => {
    if (staffScope === "self") return "My schedule"
    if (staffScope === "all") return "All staff (whole roster)"
    if (typeof staffScope === "number") {
      const row = staffDirectory.find((s) => s.userId === staffScope)
      if (row) return `${row.displayName} (${row.roleLabel})`
      return `User #${staffScope}`
    }
    return "My schedule"
  }, [staffScope, staffDirectory])

  const load = useCallback(async () => {
    if (rangeInvalid) {
      setError("Start date must be on or before end date.")
      setShifts([])
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    setInfo(null)
    try {
      const { startDate, endDate } = apiRange
      const r = await getMyWorkShifts({ startDate, endDate, forUserId: forUserIdParam })
      setShifts(r.shifts || [])
      if (r.message) setInfo(r.message)
    } catch (e) {
      setShifts([])
      setError(e instanceof Error ? e.message : "Could not load shifts")
    } finally {
      setLoading(false)
    }
  }, [apiRange, rangeInvalid, forUserIdParam])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (loading || shifts.length === 0) setExportMenuOpen(false)
  }, [loading, shifts.length])

  const exportFileBase = useMemo(
    () => `work-shifts_${apiRange.startDate}_to_${apiRange.endDate}`,
    [apiRange.startDate, apiRange.endDate],
  )

  const runExport = useCallback(
    (format: ExportFormat) => {
      if (shifts.length === 0) return
      if (format === "csv") downloadWorkShiftsCsv(shifts, exportFileBase)
      else downloadWorkShiftsXlsx(shifts, exportFileBase)
      setExportMenuOpen(false)
    },
    [shifts, exportFileBase],
  )

  const canExport = !loading && shifts.length > 0

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 p-4 md:p-6">
      {info ? (
        <Alert>
          <AlertDescription>{info}</AlertDescription>
        </Alert>
      ) : null}

      <Card className="border-slate-200/80 shadow-sm">
        <CardHeader className="pb-2">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <History className="h-5 w-5 text-cyan-600 shrink-0" aria-hidden />
                <CardTitle className="text-lg">Work shift schedule</CardTitle>
              </div>
              <CardDescription>{scheduleHint}</CardDescription>
              <p className="text-xs text-muted-foreground">
                Viewing: <span className="font-medium text-foreground">{viewedStaffLabel}</span>
              </p>
            </div>
            <div className="flex w-full flex-col gap-2 sm:max-w-md lg:w-auto lg:max-w-none lg:shrink-0">
              <Label htmlFor="ws-view-staff" className="flex items-center gap-1.5 text-xs font-medium">
                <Users className="h-3.5 w-3.5" aria-hidden />
                Show schedule for
              </Label>
              <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:gap-2">
                <Select
                  value={
                    staffScope === "self" ? SELF_VALUE : staffScope === "all" ? ALL_VALUE : String(staffScope)
                  }
                  onValueChange={(v) => {
                    if (v === SELF_VALUE) setStaffScope("self")
                    else if (v === ALL_VALUE) setStaffScope("all")
                    else setStaffScope(Number(v))
                  }}
                  disabled={dirLoading || !!dirError}
                >
                  <SelectTrigger id="ws-view-staff" className="h-9 w-full text-left text-sm sm:min-w-[200px] sm:max-w-[280px]">
                    <SelectValue placeholder={dirLoading ? "Loading staff…" : "Choose staff member"} />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    <SelectItem value={SELF_VALUE}>My schedule</SelectItem>
                    <SelectItem value={ALL_VALUE} textValue="All staff shifts">
                      All
                    </SelectItem>
                    {staffDirectory.map((s) => (
                      <SelectItem
                        key={s.userId}
                        value={String(s.userId)}
                        textValue={`${s.displayName} ${s.roleLabel}`}
                      >
                        {s.displayName} — {s.roleLabel}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Popover open={exportMenuOpen} onOpenChange={setExportMenuOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      className="h-9 w-full shrink-0 gap-1.5 sm:w-auto"
                      disabled={!canExport}
                      title={
                        !canExport
                          ? loading
                            ? "Loading…"
                            : "No shifts to export in this range"
                          : "Export schedule as Excel or CSV"
                      }
                      aria-expanded={exportMenuOpen}
                      aria-haspopup="menu"
                    >
                      <Download className="h-4 w-4 shrink-0" aria-hidden />
                      <span className="min-w-0 truncate">Export</span>
                      <ChevronDown className="h-4 w-4 shrink-0 opacity-70" aria-hidden />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="end" side="bottom" className="w-44 p-1 sm:w-48">
                    <p className="px-2 py-1 text-xs font-medium text-muted-foreground">Export as</p>
                    <button
                      type="button"
                      className="flex w-full cursor-pointer items-center rounded-sm px-2 py-2 text-left text-sm text-popover-foreground outline-none transition-colors hover:bg-cyan-100 hover:text-slate-900 focus-visible:bg-cyan-100 focus-visible:text-slate-900 dark:hover:bg-cyan-950/60 dark:hover:text-cyan-50 dark:focus-visible:bg-cyan-950/60 dark:focus-visible:text-cyan-50"
                      onClick={() => runExport("xlsx")}
                    >
                      Excel (.xlsx)
                    </button>
                    <button
                      type="button"
                      className="flex w-full cursor-pointer items-center rounded-sm px-2 py-2 text-left text-sm text-popover-foreground outline-none transition-colors hover:bg-cyan-100 hover:text-slate-900 focus-visible:bg-cyan-100 focus-visible:text-slate-900 dark:hover:bg-cyan-950/60 dark:hover:text-cyan-50 dark:focus-visible:bg-cyan-950/60 dark:focus-visible:text-cyan-50"
                      onClick={() => runExport("csv")}
                    >
                      CSV (.csv)
                    </button>
                  </PopoverContent>
                </Popover>
              </div>
              {dirError ? <p className="text-xs text-destructive">{dirError}</p> : null}
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          <Tabs
            value={scheduleView}
            onValueChange={(v) => setScheduleView(v as ScheduleView)}
            className="w-full space-y-3"
          >
            <div className="flex w-full min-w-0 flex-row flex-wrap items-end gap-2 sm:flex-nowrap sm:gap-3 sm:overflow-x-auto sm:pb-0.5">
              <TabsList className="inline-flex h-9 w-auto shrink-0 p-1">
                <TabsTrigger value="upcoming" className="px-2.5 text-xs sm:px-3 sm:text-sm">
                  Today
                </TabsTrigger>
                <TabsTrigger value="all" className="px-2.5 text-xs sm:px-3 sm:text-sm">
                  View all
                </TabsTrigger>
                <TabsTrigger value="range" className="px-2.5 text-xs sm:px-3 sm:text-sm">
                  Date range
                </TabsTrigger>
              </TabsList>

              {scheduleView === "range" ? (
                <>
                  <div className="grid shrink-0 gap-1">
                    <Label htmlFor="ws-range-from" className="text-xs leading-none">
                      From
                    </Label>
                    <Input
                      id="ws-range-from"
                      type="date"
                      className="h-9 w-[11rem] min-w-[9.5rem]"
                      value={rangeFrom}
                      onChange={(e) => setRangeFrom(e.target.value)}
                    />
                  </div>
                  <div className="grid shrink-0 gap-1">
                    <Label htmlFor="ws-range-to" className="text-xs leading-none">
                      To
                    </Label>
                    <Input
                      id="ws-range-to"
                      type="date"
                      className="h-9 w-[11rem] min-w-[9.5rem]"
                      value={rangeTo}
                      onChange={(e) => setRangeTo(e.target.value)}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-9 shrink-0 gap-2"
                    disabled={loading || rangeInvalid}
                    onClick={() => void load()}
                  >
                    <RefreshCcw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                    Apply range
                  </Button>
                </>
              ) : null}
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-muted-foreground tabular-nums">
                API range:{" "}
                <span className="font-medium text-foreground">
                  {apiRange.startDate} → {apiRange.endDate}
                </span>
              </p>
              <Button type="button" variant="outline" className="gap-2 shrink-0" disabled={loading} onClick={() => void load()}>
                <RefreshCcw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                Refresh
              </Button>
            </div>
          </Tabs>

          {error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : shifts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No shifts in this range.</p>
          ) : (
            <TooltipProvider delayDuration={200}>
              <div className="overflow-hidden rounded-lg border">
                <Table className="w-full text-xs">
                  <TableHeader
                    className="text-white"
                    style={{ background: TABLE_HEADER_GRADIENT }}
                  >
                    <TableRow className="border-0 hover:bg-transparent">
                      <TableHead className="w-[110px] p-2 text-left text-xs font-semibold text-white">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="cursor-help underline decoration-white/70 decoration-dotted underline-offset-4">
                              Date
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-[220px] text-left text-xs">
                            Calendar date of the shift (dd-mm-yyyy), taken from the scheduled start time.
                          </TooltipContent>
                        </Tooltip>
                      </TableHead>
                      <TableHead className="min-w-[108px] p-2 text-left text-xs font-semibold text-white">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="cursor-help underline decoration-white/70 decoration-dotted underline-offset-4">
                              Shift
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-[260px] whitespace-pre-line text-left text-xs">
                            {SHIFT_TOOLTIP_LINES}
                          </TooltipContent>
                        </Tooltip>
                      </TableHead>
                      <TableHead className="p-2 text-left text-xs font-semibold text-white">Department</TableHead>
                      <TableHead className="p-2 text-left text-xs font-semibold text-white">Room</TableHead>
                      <TableHead className="p-2 text-left text-xs font-semibold text-white">Doctor</TableHead>
                      <TableHead className="p-2 text-left text-xs font-semibold text-white">Nurse</TableHead>
                      <TableHead className="p-2 text-left text-xs font-semibold text-white">Technician</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {shifts.map((s) => {
                      const shift = shiftMetaFromStart(String(s.startTime))
                      return (
                        <TableRow key={s.id} className="border-t hover:bg-slate-50/80">
                          <TableCell className="p-2 whitespace-nowrap tabular-nums align-middle">
                            {formatDateDdMmYyyy(String(s.startTime))}
                          </TableCell>
                          <TableCell className="p-2 whitespace-nowrap align-middle">
                            <Badge variant="outline" className={cn("font-semibold", shiftBadgeClass(shift.kind))}>
                              {shift.label}
                            </Badge>
                          </TableCell>
                          <TableCell className="max-w-0 p-2 align-middle leading-snug">
                            <span className="line-clamp-2" title={s.departmentName}>
                              {s.departmentName}
                            </span>
                          </TableCell>
                          <TableCell className="max-w-0 p-2 align-middle leading-snug">
                            <span className="line-clamp-2" title={s.roomName}>
                              {s.roomName}
                            </span>
                          </TableCell>
                          <TableCell className="max-w-0 p-2 align-middle leading-snug">
                            <span className="line-clamp-2" title={s.doctorName}>
                              {s.doctorName}
                            </span>
                          </TableCell>
                          <TableCell className="max-w-0 p-2 align-middle leading-snug">
                            <span className="line-clamp-2" title={s.nurseName}>
                              {s.nurseName}
                            </span>
                          </TableCell>
                          <TableCell className="max-w-0 p-2 align-middle leading-snug">
                            <span className="line-clamp-2" title={s.technicianName}>
                              {s.technicianName}
                            </span>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            </TooltipProvider>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
