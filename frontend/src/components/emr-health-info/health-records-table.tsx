import { useState } from "react"
import { Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import type { HealthRecord } from "./health-records"

type Filters = {
  date: string
  height: string
  weight: string
  bmi: string
  bloodPressure: string
  heartRate: string
  respiratoryRate: string
  temperature: string
  spo2: string
  symptoms: string
  status: string
}

const NO_FILTERS: Filters = {
  date: "",
  height: "",
  weight: "",
  bmi: "",
  bloodPressure: "",
  heartRate: "",
  respiratoryRate: "",
  temperature: "",
  spo2: "",
  symptoms: "",
  status: "",
}

/** Text filters, in column order after "No.". */
const TEXT_FILTERS: { key: Exclude<keyof Filters, "status">; align?: "center" }[] = [
  { key: "date" },
  { key: "height", align: "center" },
  { key: "weight", align: "center" },
  { key: "bmi", align: "center" },
  { key: "bloodPressure", align: "center" },
  { key: "heartRate", align: "center" },
  { key: "respiratoryRate", align: "center" },
  { key: "temperature", align: "center" },
  { key: "spo2", align: "center" },
  { key: "symptoms" },
]

function matches(r: HealthRecord, f: Filters): boolean {
  const status = r.status === "confirmed" ? "Confirmed" : "Draft"
  return (
    (!f.date || r.updatedAt.toLocaleDateString("vi-VN").includes(f.date)) &&
    (!f.height || r.height.toString().includes(f.height)) &&
    (!f.weight || r.weight.toString().includes(f.weight)) &&
    (!f.bmi || r.bmi.toFixed(1).includes(f.bmi)) &&
    (!f.bloodPressure || r.bloodPressure.includes(f.bloodPressure)) &&
    (!f.heartRate || r.heartRate.toString().includes(f.heartRate)) &&
    (!f.respiratoryRate || r.respiratoryRate.toString().includes(f.respiratoryRate)) &&
    (!f.temperature || r.temperature.toString().includes(f.temperature)) &&
    (!f.spo2 || r.spo2.toString().includes(f.spo2)) &&
    (!f.symptoms || r.symptoms.toLowerCase().includes(f.symptoms.toLowerCase())) &&
    (f.status === "All" || !f.status || status === f.status)
  )
}

/** Vital-sign history with per-column filters, paging and row selection (checkboxes). */
export function HealthRecordsTable({
  records,
  current,
  selected,
  onOpen,
  onSelectedChange,
}: {
  records: HealthRecord[]
  /** Row loaded into the form. */
  current: HealthRecord | null
  /** Rows ticked for export / delete / charts. */
  selected: HealthRecord[]
  onOpen: (record: HealthRecord) => void
  onSelectedChange: (next: HealthRecord[]) => void
}) {
  const [filters, setFilters] = useState<Filters>(NO_FILTERS)
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  const filtered = records.filter((r) => matches(r, filters))
  const pageCount = Math.ceil(filtered.length / pageSize)
  const paginated = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize)
  const setFilter = (key: keyof Filters, value: string) => setFilters((f) => ({ ...f, [key]: value }))

  return (
    <Card className="flex flex-col h-fit">
      <CardContent className="flex-1 p-0 overflow-hidden">
        <div className="h-full overflow-auto">
          <Table>
            <TableHeader
              className="sticky top-0 z-20 text-white"
              style={{ background: "linear-gradient(135deg, #06b6d4 0%, #0891b2 100%)" }}
            >
              <TableRow>
                <TableHead className="w-12 text-center text-white">No.</TableHead>
                <TableHead className="w-40 text-white">Updated Time</TableHead>
                <TableHead className="w-24 text-center text-white">Height</TableHead>
                <TableHead className="w-24 text-center text-white">Weight</TableHead>
                <TableHead className="w-20 text-center text-white">BMI</TableHead>
                <TableHead className="w-32 text-center text-white">BP</TableHead>
                <TableHead className="w-24 text-center text-white">HR</TableHead>
                <TableHead className="w-28 text-center text-white">Resp.</TableHead>
                <TableHead className="w-28 text-center text-white">Temp</TableHead>
                <TableHead className="w-24 text-center text-white">SpO2</TableHead>
                <TableHead className="text-white">Symptoms</TableHead>
                <TableHead className="w-28 text-white">Status</TableHead>
                <TableHead className="w-12 text-center text-white">Select</TableHead>
              </TableRow>
              <TableRow className="border-b hover:bg-white transition-colors">
                <TableHead />
                {TEXT_FILTERS.map(({ key, align }) => (
                  <TableHead key={key}>
                    <div className="relative">
                      <Input
                        className={`h-8 text-xs ${align === "center" ? "text-center" : ""} ${key === "date" ? "" : "pr-8"}`}
                        value={filters[key]}
                        onChange={(e) => setFilter(key, e.target.value)}
                        onInput={(e) => setFilter(key, (e.target as HTMLInputElement).value)}
                      />
                      {key === "date" ? null : (
                        <Search className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      )}
                    </div>
                  </TableHead>
                ))}
                <TableHead>
                  <Select value={filters.status} onValueChange={(value) => setFilter("status", value)}>
                    <SelectTrigger className="h-8 text-xs w-full">
                      <SelectValue placeholder="All" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="All">All</SelectItem>
                      <SelectItem value="Draft">Draft</SelectItem>
                      <SelectItem value="Signed">Signed</SelectItem>
                      <SelectItem value="Voided">Voided</SelectItem>
                    </SelectContent>
                  </Select>
                </TableHead>
                <TableHead className="text-center w-12">
                  <input
                    type="checkbox"
                    checked={selected.length > 0 && selected.length === paginated.length}
                    onChange={(e) => onSelectedChange(e.target.checked ? paginated : [])}
                  />
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginated.map((r, i) => (
                <TableRow
                  key={r.id}
                  onClick={() => onOpen(r)}
                  className={`cursor-pointer transition-all h-14 hover:bg-cyan-50 hover:border-l-4 hover:border-l-cyan-500 ${
                    current?.id === r.id ? "bg-cyan-50 border-l-4 border-l-cyan-600" : ""
                  }`}
                >
                  <TableCell className="text-center font-medium">{(currentPage - 1) * pageSize + i + 1}</TableCell>
                  <TableCell className="text-sm">
                    {r.updatedAt.toLocaleDateString("vi-VN")}
                    <br />
                    <span className="text-muted-foreground text-xs">
                      {r.updatedAt.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </TableCell>
                  <TableCell className="text-center">{r.height}</TableCell>
                  <TableCell className="text-center">{r.weight}</TableCell>
                  <TableCell className="text-center font-semibold">{r.bmi.toFixed(1)}</TableCell>
                  <TableCell className="text-center">{r.bloodPressure}</TableCell>
                  <TableCell className="text-center">{r.heartRate}</TableCell>
                  <TableCell className="text-center">{r.respiratoryRate}</TableCell>
                  <TableCell className="text-center">{r.temperature.toFixed(1)}°C</TableCell>
                  <TableCell className="text-center">
                    <span className={r.spo2 >= 95 ? "text-green-600" : "text-red-600"}>{r.spo2}%</span>
                  </TableCell>
                  <TableCell className="text-sm max-w-xs truncate" title={r.symptoms}>
                    {r.symptoms || "-"}
                  </TableCell>
                  <TableCell>
                    <span
                      className={`px-2 py-1 text-xs rounded-full ${
                        r.status === "confirmed" ? "bg-green-100 text-green-800" : "bg-yellow-100 text-yellow-800"
                      }`}
                    >
                      {r.status === "confirmed" ? "Confirmed" : "Draft"}
                    </span>
                  </TableCell>
                  <TableCell className="text-center">
                    <input
                      type="checkbox"
                      checked={selected.some((row) => row.id === r.id)}
                      onChange={(e) =>
                        onSelectedChange(e.target.checked ? [...selected, r] : selected.filter((row) => row.id !== r.id))
                      }
                      // Ticking a box must not also load the row into the form.
                      onClick={(e) => e.stopPropagation()}
                    />
                  </TableCell>
                </TableRow>
              ))}
              {paginated.length === 0 && (
                <TableRow>
                  <TableCell colSpan={12} className="text-center py-12 text-gray-500">
                    No records found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>

          <div className="flex items-center justify-between px-6 py-3 bg-gray-50 border-t text-sm">
            <div className="flex items-center gap-3">
              <span>Show</span>
              <Select
                value={pageSize.toString()}
                onValueChange={(v) => {
                  setPageSize(Number(v))
                  setCurrentPage(1)
                }}
              >
                <SelectTrigger className="w-20 h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="5">5</SelectItem>
                  <SelectItem value="10">10</SelectItem>
                  <SelectItem value="25">25</SelectItem>
                </SelectContent>
              </Select>
              <span>entries</span>
            </div>
            <div className="flex gap-1">
              <Button className="btn-outline" size="sm" disabled={currentPage === 1} onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}>
                Previous
              </Button>
              {Array.from({ length: pageCount }, (_, i) => (
                <Button
                  key={i + 1}
                  className={currentPage === i + 1 ? "btn-gradient" : "btn-outline"}
                  size="sm"
                  onClick={() => setCurrentPage(i + 1)}
                >
                  {i + 1}
                </Button>
              ))}
              <Button
                className="btn-outline"
                size="sm"
                disabled={currentPage === pageCount}
                onClick={() => setCurrentPage((p) => Math.min(pageCount, p + 1))}
              >
                Next
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
