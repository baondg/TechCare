"use client"

import { useState, useEffect, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ChevronLeft, ChevronRight, CalendarIcon, Search,  } from "lucide-react"
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select"
import { DoctorLayout } from "@/components/doctor-layout"
import { cn } from "@/lib/utils"
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
  "R07.9": "Chest pain, unspecified",
}

type ColumnKey = "no" | "id" | "name" | "age" | "latestVisit" | "diagnosis" | "doctor" | "bmi"

const columns: { key: ColumnKey; label: string; sortable?: boolean }[] = [
  { key: "no", label: "No." },
  { key: "id", label: "Patient ID", sortable: true },
  { key: "name", label: "Name", sortable: true },
  { key: "age", label: "Age", sortable: true },
  { key: "latestVisit", label: "Latest visit", sortable: true },
  { key: "diagnosis", label: "Diagnosis", sortable: true },
  { key: "doctor", label: "Doctor", sortable: true },
  { key: "bmi", label: "BMI", sortable: true },
]

export default function DoctorPatients() {
  const navigate = useNavigate()
  const [patients, setPatients] = useState<Patient[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  const [filters, setFilters] = useState({
    name: "",
    age: "",
    diagnosis: "",
    doctor: "",
  })

  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [sortConfig, setSortConfig] = useState<{ key: ColumnKey; direction: "asc" | "desc" } | null>(null)
  const [visibleColumns, setVisibleColumns] = useState<ColumnKey[]>(columns.map(c => c.key))

  useEffect(() => {
    loadPatients()
  }, [])

  const loadPatients = async () => {
    try {
      setLoading(true)
      setError("")
      const res = await doctorService.getPatients()
      setPatients(res.patients)
    } catch (err: any) {
      setError(err.message || "Failed to load patients")
    } finally {
      setLoading(false)
    }
  }

  const filteredPatients = useMemo(() => {
    return patients.filter(p => {
      const name = `${p.firstName || ""} ${p.lastName || ""}`.toLowerCase()
      const matchAge = !filters.age || (p.age != null && p.age === Number(filters.age))
      const diagnosis = p.latestDiagnosis?.icd10 || ""
      const doctor = p.doctor || ""

      return (
        name.includes(filters.name.toLowerCase()) &&
        diagnosis.toLowerCase().includes(filters.diagnosis.toLowerCase()) &&
        doctor.toLowerCase().includes(filters.doctor.toLowerCase()) &&
        matchAge
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
      let aVal: any, bVal: any

      switch (key) {
        case "name":
          aVal = `${a.firstName} ${a.lastName}`; bVal = `${b.firstName} ${b.lastName}`; break
        case "age":
          aVal = a.age ?? 0; bVal = b.age ?? 0; break
        case "latestVisit":
          aVal = a.latestVisit || ""; bVal = b.latestVisit || ""; break
        case "diagnosis":
          aVal = a.latestDiagnosis?.icd10 || ""; bVal = b.latestDiagnosis?.icd10 || ""; break
        case "doctor":
          aVal = a.doctor || ""; bVal = b.doctor || ""; break
        case "bmi":
          aVal = a.bmi ?? 0; bVal = b.bmi ?? 0; break
        default: return 0
      }

      if (typeof aVal === "string") return direction === "asc" ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal)
      return direction === "asc" ? (aVal > bVal ? 1 : -1) : (aVal < bVal ? 1 : -1)
    })
  }, [filteredPatients, sortConfig])

  const paginatedPatients = sortedPatients.slice((currentPage - 1) * pageSize, currentPage * pageSize)

  const SortIcon = ({ column }: { column: ColumnKey }) => {
    if (sortConfig?.key !== column) return <span className="ml-1">⇅</span>
    return <span className="ml-1">{sortConfig.direction === "asc" ? "↑" : "↓"}</span>
  }

  return (
    <DoctorLayout>
      <div className="p-1 space-y-1">
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
                    setVisibleColumns(prev => checked ? [...prev, col.key] : prev.filter(k => k !== col.key))
                  }
                />
              ))}
            </div>
          </div>
          <Button onClick={loadPatients} variant="outline" disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Refresh
          </Button>
        </div>

        {error && <div className="bg-red-50 text-red-700 px-4 py-2 rounded">{error}</div>}

        <Card className="h-[560px]">
          <CardContent className="p-0 h-full flex flex-col">
            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <div className="flex items-center justify-center h-full text-slate-500">
                  <Loader2 className="h-6 w-6 animate-spin mr-2" /> Loading patients...
                </div>
              ) : (
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
                      <TableRow key={patient.id} onClick={() => navigate(`/doctor/medical_records/${patient.id}/dashboard`)}
                        className="hover:bg-muted/50 cursor-pointer h-14 transition-colors">
                        {visibleColumns.includes("no") && <TableCell className="text-center font-medium">{(currentPage - 1) * pageSize + index + 1}</TableCell>}
                        {visibleColumns.includes("id") && <TableCell className="font-medium">{patient.username}</TableCell>}
                        {visibleColumns.includes("name") && <TableCell>{`${patient.firstName || ""} ${patient.lastName || ""}`}</TableCell>}
                        {visibleColumns.includes("age") && <TableCell className="text-center">{patient.age ?? "-"}</TableCell>}
                        {visibleColumns.includes("latestVisit") && (
                          <TableCell className="text-center">
                            {patient.latestVisit ? new Date(patient.latestVisit).toLocaleDateString("en-GB") : "-"}
                          </TableCell>
                        )}
                        {visibleColumns.includes("diagnosis") && (
                          <TableCell className="text-center">
                            {patient.latestDiagnosis ? (
                              <TooltipProvider delayDuration={0}>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span className="cursor-help underline decoration-dotted">{patient.latestDiagnosis.icd10}</span>
                                  </TooltipTrigger>
                                  <TooltipContent side="top" className="bg-linear-to-br from-[#06b6d4] to-[#0891b2]">
                                    <b className="text-sm max-w-xs">{ICD10_MAP[patient.latestDiagnosis.icd10] || patient.latestDiagnosis.interpretation || "No description"}</b>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            ) : "-"}
                          </TableCell>
                        )}
                        {visibleColumns.includes("doctor") && <TableCell>{patient.doctor || "-"}</TableCell>}
                        {visibleColumns.includes("bmi") && <TableCell className="text-center">{patient.bmi != null ? patient.bmi.toFixed(1) : "-"}</TableCell>}
                      </TableRow>
                    ))}

                    {paginatedPatients.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={visibleColumns.length} className="text-center py-10 text-muted-foreground">No patients found.</TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              )}
            </div>

            <div className="flex items-center justify-between px-6 py-4 bg-gray-50 border-t text-sm">
              <div className="flex items-center gap-3">
                <span>Show</span>
                <Select value={pageSize.toString()} onValueChange={v => { setPageSize(Number(v)); setCurrentPage(1) }}>
                  <SelectTrigger className="w-20 h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="10">10</SelectItem>
                    <SelectItem value="25">25</SelectItem>
                    <SelectItem value="50">50</SelectItem>
                  </SelectContent>
                </Select>
                <span>entries</span>
              </div>

              <div className="flex items-center gap-1">
                <Button variant="outline" size="sm" disabled={currentPage === 1} onClick={() => setCurrentPage(p => Math.max(1, p - 1))}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                  <Button key={page} size="sm" className={currentPage === page ? "btn-gradient" : "btn-outline"} onClick={() => setCurrentPage(page)}>
                    {page}
                  </Button>
                ))}
                <Button variant="outline" size="sm" disabled={currentPage === totalPages || totalPages === 0} onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </DoctorLayout>
  )
}
