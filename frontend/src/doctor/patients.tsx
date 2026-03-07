"use client"

import { useState, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent} from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ChevronLeft, ChevronRight, CalendarIcon, Search,  } from "lucide-react"
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select"
import { DoctorLayout } from "@/components/doctor-layout"
import { Popover,  PopoverContent,  PopoverTrigger} from "@/components/ui/popover"
import { format } from "date-fns"
import { vi } from "date-fns/locale"
import { cn } from "@/lib/utils"
import { Calendar } from "@/components/ui/calendar"
import { useNavigate } from "react-router-dom"
import { Checkbox } from "@/components/ui/checkbox"
import {Tooltip,TooltipContent,TooltipProvider,TooltipTrigger,} from "@/components/ui/tooltip"


type Patient = {
  id: string
  name: string
  sex: "M" | "F"
  age: number
  latestVisit: string
  diagnosis: string
  doctor: string
  recoverDays: number
  recoverPercent: number
}

type ColumnKey = keyof Patient | "no"

const columns: {
  key: ColumnKey
  label: string
  sortable?: boolean
}[] = [
  { key: "no", label: "No." },
  { key: "id", label: "Patient ID", sortable: true },
  { key: "name", label: "Name", sortable: true },
  { key: "sex", label: "Sex", sortable: true },
  { key: "age", label: "Age", sortable: true },
  { key: "latestVisit", label: "Latest visit", sortable: true },
  { key: "diagnosis", label: "Diagnosis", sortable: true },
  { key: "doctor", label: "Doctor", sortable: true },
  { key: "recoverDays", label: "Remaining days", sortable: true },
  { key: "recoverPercent", label: "Progress (%)", sortable: true },
]

const ICD10_MAP: Record<string, string> = {
  "Z59.1": "Housing and economic circumstances",
  "J45.9": "Asthma, unspecified",
  "I10": "Essential (primary) hypertension",
  "E11.9": "Type 2 diabetes mellitus without complications",
  "K29.5": "Chronic gastritis, unspecified",
  "M79.1": "Myalgia",
  "J06.9": "Acute upper respiratory infection, unspecified",
  "I50.9": "Heart failure, unspecified",
  "N39.0": "Urinary tract infection, site not specified",
  "R51": "Headache",
}


export default function DoctorPatients() {
    const navigate = useNavigate()
    const [patients] = useState<Patient[]>([
        { id: "OP123456789", name: "Nguyß╗àn V─ân An", sex: "M", age: 46, latestVisit: "07/10/2025", diagnosis: "Z59.1", doctor: "Dr. Trß║ºn Thanh Nghiß╗çp", recoverDays: 2, recoverPercent: 70 },
        { id: "OP987654321", name: "Trß║ºn Thß╗ï B├¼nh", sex: "F", age: 38, latestVisit: "05/11/2025", diagnosis: "J45.9", doctor: "Dr. L├¬ Minh Tuß║Ñn", recoverDays: 5, recoverPercent: 85 },
        { id: "OP456789123", name: "L├¬ V─ân C├┤ng", sex: "M", age: 52, latestVisit: "01/12/2025", diagnosis: "I10", doctor: "Dr. Phß║ím Thß╗ï Hoa", recoverDays: 3, recoverPercent: 60 },
        { id: "OP321654987", name: "Phß║ím Thß╗ï Dung", sex: "F", age: 29, latestVisit: "20/09/2025", diagnosis: "E11.9", doctor: "Dr. Nguyß╗àn V─ân Hß║úi", recoverDays: 8, recoverPercent: 92 },
        { id: "OP789123456", name: "Ho├áng V─ân Em", sex: "M", age: 61, latestVisit: "15/10/2025", diagnosis: "K29.5", doctor: "Dr. Trß║ºn Thanh Nghiß╗çp", recoverDays: 4, recoverPercent: 75 },
        { id: "OP654321789", name: "V┼⌐ Thß╗ï Giang", sex: "F", age: 44, latestVisit: "28/11/2025", diagnosis: "M79.1", doctor: "Dr. L├¬ Minh Tuß║Ñn", recoverDays: 6, recoverPercent: 88 },
        { id: "OP147258369", name: "─Éß║╖ng V─ân H├╣ng", sex: "M", age: 35, latestVisit: "10/12/2025", diagnosis: "J06.9", doctor: "Dr. Phß║ím Thß╗ï Hoa", recoverDays: 2, recoverPercent: 95 },
        { id: "OP258369147", name: "Ng├┤ Thß╗ï Lan", sex: "F", age: 50, latestVisit: "03/10/2025", diagnosis: "I50.9", doctor: "Dr. Nguyß╗àn V─ân Hß║úi", recoverDays: 10, recoverPercent: 65 },
        { id: "OP369147258", name: "B├╣i V─ân Minh", sex: "M", age: 67, latestVisit: "18/11/2025", diagnosis: "N39.0", doctor: "Dr. Trß║ºn Thanh Nghiß╗çp", recoverDays: 7, recoverPercent: 80 },
        { id: "OP741852963", name: "─Éß╗ù Thß╗ï Nga", sex: "F", age: 41, latestVisit: "25/09/2025", diagnosis: "R51", doctor: "Dr. L├¬ Minh Tuß║Ñn", recoverDays: 3, recoverPercent: 90 },
    ])

    const [filters, setFilters] = useState({
        patientId: "",
        name: "",
        sex: "All",
        age: "",
        recoverDays: "",
        recoverPercent: "",
        latestVisit: null as Date | null,
        diagnosis: "",
        doctor: "",
        })

    const [currentPage, setCurrentPage] = useState(1)
    const [pageSize, setPageSize] = useState(10)

    const filteredPatients = useMemo(() => {
        return patients.filter(p => {
            const matchAge =
            !filters.age || p.age === Number(filters.age)

            const matchRecoverDays =
            !filters.recoverDays || p.recoverDays === Number(filters.recoverDays)

            const matchRecoverPercent =
            !filters.recoverPercent || p.recoverPercent === Number(filters.recoverPercent)

            return (
            p.id.toLowerCase().includes(filters.patientId.toLowerCase()) &&
            p.name.toLowerCase().includes(filters.name.toLowerCase()) &&
            p.diagnosis.toLowerCase().includes(filters.diagnosis.toLowerCase()) &&
            p.doctor.toLowerCase().includes(filters.doctor.toLowerCase()) &&
            matchAge &&
            matchRecoverDays &&
            matchRecoverPercent
            )
        })
    }, [patients, filters])

    const totalPages = Math.ceil(filteredPatients.length / pageSize)

    type SortKey = ColumnKey

    const [sortConfig, setSortConfig] = useState<{
      key: SortKey
      direction: "asc" | "desc"
    } | null>(null)

    const handleSort = (key: SortKey) => {
      setSortConfig(prev => {
        if (prev?.key === key) {
          return {
            key,
            direction: prev.direction === "asc" ? "desc" : "asc",
          }
        }
        return { key, direction: "asc" }
      })
    }

    const allColumns = columns.map(c => c.key)

    const [visibleColumns, setVisibleColumns] = useState<ColumnKey[]>(allColumns)

    const sortedPatients = useMemo(() => {
      if (!sortConfig) return filteredPatients

      const { key, direction } = sortConfig

      return [...filteredPatients].sort((a, b) => {
        let aValue: any
        let bValue: any

        if (key === "no") return 0

        aValue = a[key]
        bValue = b[key]

        if (aValue == null) return 1
        if (bValue == null) return -1

        if (typeof aValue === "string") {
          return direction === "asc"
            ? aValue.localeCompare(bValue)
            : bValue.localeCompare(aValue)
        }

        return direction === "asc"
          ? aValue > bValue ? 1 : -1
          : aValue < bValue ? 1 : -1
      })
    }, [filteredPatients, sortConfig])

    const paginatedPatients = sortedPatients.slice(
      (currentPage - 1) * pageSize,
      currentPage * pageSize
    )

    const SortIcon = ({ column }: { column: SortKey }) => {
      if (sortConfig?.key !== column) return <span className="ml-1">Γçà</span>
      return <span className="ml-1">{sortConfig.direction === "asc" ? "Γåæ" : "Γåô"}</span>
    }




  return (
    <DoctorLayout>
      <div className="p-1 space-y-1">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold">Patient List</h2>
            <div className="flex flex-wrap gap-4">
              <Checkbox
                label="Show All"
                checked={visibleColumns.length === allColumns.length}
                onChange={(checked) => {
                  if (checked) {
                    setVisibleColumns(allColumns)
                  }
                }}
              />
              {columns.filter(col => col.key !== "no").map(col => (
                <Checkbox
                  key={col.key}
                  label={col.label}
                  checked={visibleColumns.includes(col.key)}
                  onChange={(checked) =>
                    setVisibleColumns(prev =>
                      checked
                        ? [...prev, col.key]
                        : prev.filter(k => k !== col.key)
                    )
                  }
                />
              ))}
            </div>
          </div>
          <div className="flex items-center gap-4">
            <Select defaultValue="All">
              <SelectTrigger className="w-32 btn-outline transition-transform duration-500 text-xl px-7 py-4">
                <SelectValue placeholder="All" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="All">All</SelectItem>
                <SelectItem value="Active">Active</SelectItem>
                <SelectItem value="Recovered">Recovered</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Bß║úng ch├¡nh */}
        <div className="">
          <Card className="h-[560px]">
            <CardContent className="p-0 h-full flex flex-col">
              <div className="flex-1 overflow-y-auto">
                <Table>
                  <TableHeader
                    className="sticky top-0 z-20 text-white"
                    style={{
                      background: "linear-gradient(135deg, #06b6d4 0%, #0891b2 100%)"
                    }}
                  >
                    <TableRow>
                      {columns.map(col =>
                        visibleColumns.includes(col.key) ? (
                          <TableHead
                            key={col.key}
                            onClick={() => col.sortable && handleSort(col.key)}
                            className="cursor-pointer select-none whitespace-nowrap text-white transition"
                          >
                            {col.label}
                            {col.sortable && <SortIcon column={col.key} />}
                          </TableHead>
                        ) : null
                      )}
                    </TableRow>
                    <TableRow className="border-b hover:bg-white transition-colors">
                      {columns.map(col =>
                        visibleColumns.includes(col.key) ? (
                          <TableHead key={col.key}>
                            {col.key === "no" && null}

                            {col.key === "id" && (
                              <div className="relative">
                                <Search className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                <Input
                                  value={filters.patientId}
                                  onChange={(e) =>
                                    setFilters({ ...filters, patientId: e.target.value })
                                  }
                                  className="h-8 text-xs pr-8"
                                />
                              </div>
                            )}

                            {col.key === "name" && (
                              <div className="relative">
                                <Search className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                <Input
                                  value={filters.name}
                                  onChange={(e) =>
                                    setFilters({ ...filters, name: e.target.value })
                                  }
                                  className="h-8 text-xs pr-8"
                                />
                              </div>
                            )}

                            {col.key === "sex" && (
                              <Select
                                value={filters.sex}
                                onValueChange={(value) =>
                                  setFilters({ ...filters, sex: value })
                                }
                              >
                                <SelectTrigger className="h-8 text-xs w-16 mx-auto">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="All">All</SelectItem>
                                  <SelectItem value="M">M</SelectItem>
                                  <SelectItem value="F">F</SelectItem>
                                </SelectContent>
                              </Select>
                            )}

                            {col.key === "age" && (
                              <Input
                                type="number"
                                value={filters.age}
                                onChange={(e) =>
                                  setFilters({ ...filters, age: e.target.value })
                                }
                                className="h-8 text-xs text-center"
                              />
                            )}

                            {col.key === "latestVisit" && (
                              <Popover>
                                <PopoverTrigger asChild>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-8 w-full text-xs justify-start"
                                  >
                                    <CalendarIcon className="mr-2 h-4 w-4" />
                                    {filters.latestVisit
                                      ? format(filters.latestVisit, "dd/MM/yyyy", { locale: vi })
                                      : "Select"}
                                  </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0">
                                  <Calendar
                                    mode="single"
                                    selected={filters.latestVisit ?? undefined}
                                    onSelect={(date) =>
                                      setFilters({ ...filters, latestVisit: date ?? null })
                                    }
                                    locale={vi}
                                  />
                                </PopoverContent>
                              </Popover>
                            )}

                            {col.key === "diagnosis" && (
                              <div className="relative">
                                <Search className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                <Input
                                  value={filters.diagnosis}
                                  onChange={(e) =>
                                    setFilters({ ...filters, diagnosis: e.target.value })
                                  }
                                  className="h-8 text-xs"
                                />
                              </div>
                            )}

                            {col.key === "doctor" && (
                              <div className="relative">
                                <Search className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                <Input
                                  value={filters.doctor}
                                  onChange={(e) =>
                                    setFilters({ ...filters, doctor: e.target.value })
                                  }
                                  className="h-8 text-xs pr-8"
                                />
                              </div>
                            )}

                            {col.key === "recoverDays" && (
                              <Input
                                type="number"
                                value={filters.recoverDays}
                                onChange={(e) =>
                                  setFilters({ ...filters, recoverDays: e.target.value })
                                }
                                className="h-8 text-xs text-center"
                              />
                            )}

                            {col.key === "recoverPercent" && (
                              <Input
                                type="number"
                                value={filters.recoverPercent}
                                onChange={(e) =>
                                  setFilters({ ...filters, recoverPercent: e.target.value })
                                }
                                className="h-8 text-xs text-center"
                              />
                            )}
                          </TableHead>
                        ) : null
                      )}
                    </TableRow>
                  </TableHeader>

                  <TableBody>
                    {paginatedPatients.map((patient, index) => (
                      <TableRow
                        key={patient.id}
                        onClick={() =>
                          navigate(`/doctor/medical_records/${patient.id}/dashboard`)
                        }
                        className="hover:bg-muted/50 cursor-pointer h-14 transition-colors"
                      >
                        {visibleColumns.includes("no") && (
                          <TableCell className="text-center font-medium">
                            {(currentPage - 1) * pageSize + index + 1}
                          </TableCell>
                        )}

                        {visibleColumns.includes("id") && (
                          <TableCell className="font-medium">{patient.id}</TableCell>
                        )}

                        {visibleColumns.includes("name") && (
                          <TableCell>{patient.name}</TableCell>
                        )}

                        {visibleColumns.includes("sex") && (
                          <TableCell className="text-center">{patient.sex}</TableCell>
                        )}

                        {visibleColumns.includes("age") && (
                          <TableCell className="text-center">{patient.age}</TableCell>
                        )}

                        {visibleColumns.includes("latestVisit") && (
                          <TableCell className="text-center">{patient.latestVisit}</TableCell>
                        )}

                        {visibleColumns.includes("diagnosis") && (
                          <TableCell className="text-center">
                            <TooltipProvider delayDuration={0}>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="cursor-help underline decoration-dotted">
                                    {patient.diagnosis}
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="bg-linear-to-br from-[#06b6d4] to-[#0891b2]">
                                  <b className="text-sm max-w-xs ">
                                    {ICD10_MAP[patient.diagnosis] ?? "No description"}
                                  </b>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </TableCell>
                        )}

                        {visibleColumns.includes("doctor") && (
                          <TableCell>{patient.doctor}</TableCell>
                        )}

                        {visibleColumns.includes("recoverDays") && (
                          <TableCell className="text-center">
                            {patient.recoverDays} days
                          </TableCell>
                        )}

                        {visibleColumns.includes("recoverPercent") && (
                          <TableCell className="text-center">
                            {patient.recoverPercent}%
                          </TableCell>
                        )}
                      </TableRow>
                    ))}

                    {paginatedPatients.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={visibleColumns.length} className="text-center py-10 text-muted-foreground">
                          No patients found.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              <div className="flex items-center justify-between px-6 py-4 bg-gray-50 border-t text-sm">
                <div className="flex items-center gap-3">
                  <span>Show</span>
                  <Select
                    value={pageSize.toString()}
                    onValueChange={(v) => {
                      setPageSize(Number(v))
                      setCurrentPage(1)
                    }}
                  >
                    <SelectTrigger className="w-20 h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="10">10</SelectItem>
                      <SelectItem value="25">25</SelectItem>
                      <SelectItem value="50">50</SelectItem>
                    </SelectContent>
                  </Select>
                  <span>entries</span>
                </div>

                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>

                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                    <Button
                      key={page}
                      size="sm"
                      className={currentPage === page ? "btn-gradient" : "btn-outline"}
                      onClick={() => setCurrentPage(page)}
                    >
                      {page}
                    </Button>
                  ))}

                  <Button
                    variant="outline"
                    size="sm"
                    disabled={currentPage === totalPages}
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </DoctorLayout>
  )
}
