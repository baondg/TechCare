import { useCallback, useEffect, useMemo, useState } from "react"
import { RefreshCcw } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { getMyWorkShifts, type WorkShiftRow } from "@/services/work-shift-service"

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

function pad2(n: number) {
  return String(n).padStart(2, "0")
}

/** Local calendar YYYY-MM-DD (avoid toISOString UTC day shift). */
function toYmdLocal(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

function defaultRange(): { start: string; end: string } {
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

export default function StaffWorkShiftsPage() {
  const initial = useMemo(() => defaultRange(), [])
  const [startDate, setStartDate] = useState(initial.start)
  const [endDate, setEndDate] = useState(initial.end)
  const [shifts, setShifts] = useState<WorkShiftRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    setInfo(null)
    try {
      const r = await getMyWorkShifts({ startDate, endDate })
      setShifts(r.shifts || [])
      if (r.message) setInfo(r.message)
    } catch (e) {
      setShifts([])
      setError(e instanceof Error ? e.message : "Could not load shifts")
    } finally {
      setLoading(false)
    }
  }, [startDate, endDate])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 p-4 md:p-6">
      {info ? (
        <Alert>
          <AlertDescription>{info}</AlertDescription>
        </Alert>
      ) : null}

      <Card className="border-slate-200/80 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Date range</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end">
          <div className="grid gap-2">
            <Label htmlFor="ws-start">Start date</Label>
            <Input
              id="ws-start"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="ws-end">End date</Label>
            <Input id="ws-end" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
          <Button type="button" variant="outline" className="gap-2" disabled={loading} onClick={() => void load()}>
            <RefreshCcw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </CardContent>
      </Card>

      <Card className="border-slate-200/80 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Shifts</CardTitle>
        </CardHeader>
        <CardContent>
          {error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : shifts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No shifts in this range.</p>
          ) : (
            <TooltipProvider delayDuration={200}>
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[110px]">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="cursor-help underline decoration-dotted decoration-muted-foreground underline-offset-4">
                              Date
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-[220px] text-left text-xs">
                            Calendar date of the shift (dd-mm-yyyy), taken from the scheduled start time.
                          </TooltipContent>
                        </Tooltip>
                      </TableHead>
                      <TableHead className="min-w-[108px]">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="cursor-help underline decoration-dotted decoration-muted-foreground underline-offset-4">
                              Shift
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-[260px] whitespace-pre-line text-left text-xs">
                            {SHIFT_TOOLTIP_LINES}
                          </TooltipContent>
                        </Tooltip>
                      </TableHead>
                      <TableHead>Department</TableHead>
                      <TableHead>Room</TableHead>
                      <TableHead>Doctor</TableHead>
                      <TableHead>Nurse</TableHead>
                      <TableHead>Technician</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {shifts.map((s) => {
                      const shift = shiftMetaFromStart(String(s.startTime))
                      return (
                      <TableRow key={s.id}>
                        <TableCell className="whitespace-nowrap tabular-nums">
                          {formatDateDdMmYyyy(String(s.startTime))}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          <Badge variant="outline" className={cn("font-semibold", shiftBadgeClass(shift.kind))}>
                            {shift.label}
                          </Badge>
                        </TableCell>
                        <TableCell>{s.departmentName}</TableCell>
                        <TableCell>{s.roomName}</TableCell>
                        <TableCell>{s.doctorName}</TableCell>
                        <TableCell>{s.nurseName}</TableCell>
                        <TableCell>{s.technicianName}</TableCell>
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
