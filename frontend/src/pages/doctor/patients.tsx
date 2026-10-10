"use client"

import { useState, useMemo, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent} from "@/components/ui/card"
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { CalendarIcon, Search, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react"
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select"
import { DoctorLayout } from "@/components/doctor-layout"
import { Popover,  PopoverContent,  PopoverTrigger} from "@/components/ui/popover"
import { format } from "date-fns"
import { Calendar } from "@/components/ui/calendar"
import { useNavigate } from "react-router-dom"
import { useTranslation } from "react-i18next"
import {Tooltip,TooltipContent,TooltipProvider,TooltipTrigger,} from "@/components/ui/tooltip"
import { PATIENT_IN_DEPARTMENT_OPTIONS, translatePatientInDepartment } from "@/lib/patient-departments"
import { cn } from "@/lib/utils"
import { doctorService } from "@/services/doctor-service"


type Patient = {
  id: string
  name: string
  sex: "M" | "F"
  age: number
  latestVisit: string
  diagnosis: string
  diagnosisDescription: string
  doctor: string
  /** PATIENT.in_department */
  department: string | null
}

type ColumnKey = keyof Patient | "no"

type PatientStored = Omit<Patient, "latestVisit"> & {
  latestVisitIso: string | null
}

/** Percent widths for `table-fixed`; must sum to 100% so columns fill the card. */
const columnWidthClassEn: Partial<Record<ColumnKey, string>> = {
  no: "w-[5%] min-w-0",
  id: "w-[11%] min-w-0",
  name: "w-[20%] min-w-0",
  sex: "w-[8%] min-w-0",
  age: "w-[7%] min-w-0",
  latestVisit: "w-[12%] min-w-0",
  diagnosis: "w-[17%] min-w-0",
  doctor: "w-[20%] min-w-0",
}

/** Wider sex/age/last-visit columns for Vietnamese labels and filters. */
const columnWidthClassVi: Partial<Record<ColumnKey, string>> = {
  no: "w-[4%] min-w-0",
  id: "w-[10%] min-w-0",
  name: "w-[18%] min-w-0",
  sex: "w-[9%] min-w-0",
  age: "w-[7%] min-w-0",
  latestVisit: "w-[18%] min-w-0",
  diagnosis: "w-[16%] min-w-0",
  doctor: "w-[18%] min-w-0",
}

export default function DoctorPatients() {
    const navigate = useNavigate()
    const { t, i18n } = useTranslation()
    const isVi = Boolean(i18n.language?.toLowerCase().startsWith("vi"))
    const columnWidthClass = isVi ? columnWidthClassVi : columnWidthClassEn
    const tableMinWidthClass = isVi ? "min-w-[1000px]" : "min-w-0"
    const [storedPatients, setStoredPatients] = useState<PatientStored[]>([])

    const [filters, setFilters] = useState({
        patientId: "",
        name: "",
        sex: "All",
        age: "",
        latestVisit: null as Date | null,
        diagnosis: "",
        doctor: "",
        department: "All" as "All" | (typeof PATIENT_IN_DEPARTMENT_OPTIONS)[number],
        status: "All" as "All" | "Active" | "Recovered",
        })

    const [currentPage, setCurrentPage] = useState(1)
    const [pageSize, setPageSize] = useState(10)

    type SortKey = ColumnKey

    const [sortConfig, setSortConfig] = useState<{
      key: SortKey
      direction: "asc" | "desc"
    } | null>(null)

    const columns: {
      key: ColumnKey
      label: string
      sortable?: boolean
    }[] = useMemo(
      () => [
        { key: "no", label: t("doctor.patients.colNo") },
        { key: "id", label: t("doctor.patients.colPatientId"), sortable: true },
        { key: "name", label: t("doctor.patients.colName"), sortable: true },
        { key: "sex", label: t("doctor.patients.colSex"), sortable: true },
        { key: "age", label: t("doctor.patients.colAge"), sortable: true },
        { key: "latestVisit", label: t("doctor.patients.colLatestVisit"), sortable: true },
        { key: "diagnosis", label: t("doctor.patients.colDiagnosis"), sortable: true },
        { key: "doctor", label: t("doctor.patients.colDoctor"), sortable: true },
      ],
      [t]
    )

    const visitLocale = i18n.language?.startsWith("vi") ? "vi-VN" : "en-US"

    const patients = useMemo(
      () =>
        storedPatients.map(({ latestVisitIso, ...rest }) => ({
          ...rest,
          latestVisit: latestVisitIso
            ? new Date(latestVisitIso).toLocaleDateString(visitLocale)
            : "",
        })),
      [storedPatients, visitLocale]
    )

    useEffect(() => {
      const fetchPatients = async () => {
        try {
          const data = await doctorService.getPatients(undefined, 1, 500)

          if (data.success) {
            const mapped: PatientStored[] = data.patients.map((p) => ({
              id: "OP" + String(p.id).padStart(9, "0"),
              name: `${p.lastName || ""} ${p.firstName || ""}`.trim() || p.username,
              sex: (p.gender === "M" || p.gender === "F" ? p.gender : "M") as Patient["sex"],
              age: p.age || 0,
              latestVisitIso: p.latestVisit ? String(p.latestVisit) : null,
              diagnosis: p.latestDiagnosis?.icd10 || "",
              diagnosisDescription: p.latestDiagnosis?.interpretation || "",
              doctor: p.doctor || "",
              department: p.inDepartment != null ? String(p.inDepartment) : null,
            }))

            setStoredPatients(mapped)
          }
        } catch (err) {
          console.error("Fetch patients error:", err)
        }
      }

      void fetchPatients()
    }, [])

    const filteredPatients = useMemo(() => {
        return patients.filter(p => {
            const matchAge =
            !filters.age || p.age === Number(filters.age)

            const matchDepartment =
              filters.department === "All" ||
              (p.department != null && p.department === filters.department)

            const matchSex = filters.sex === "All" || p.sex === filters.sex

            const matchLatestVisit =
              !filters.latestVisit ||
              (!!p.latestVisit &&
                p.latestVisit === format(filters.latestVisit, "dd/MM/yyyy"))

            return (
            p.id.toLowerCase().includes(filters.patientId.toLowerCase()) &&
            p.name.toLowerCase().includes(filters.name.toLowerCase()) &&
            String(p.diagnosis ?? "")
              .toLowerCase()
              .includes(String(filters.diagnosis ?? "").toLowerCase()) &&
            String(p.doctor ?? "")
              .toLowerCase()
              .includes(String(filters.doctor ?? "").toLowerCase()) &&
            matchSex &&
            matchLatestVisit &&
            matchAge &&
            matchDepartment
            )
        })
    }, [patients, filters])

    const totalPages = Math.max(1, Math.ceil(filteredPatients.length / pageSize))

    useEffect(() => {
      setCurrentPage(1)
    }, [filters])

    useEffect(() => {
      setCurrentPage((p) => Math.min(p, totalPages))
    }, [totalPages])

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

    const visibleColumns = columns.map((c) => c.key)

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
      if (sortConfig?.key !== column) {
        return (
          <span className="ml-1 inline-flex text-slate-300">
            <ArrowUpDown className="w-3 h-3" aria-hidden />
          </span>
        )
      }
      return (
        <span className="ml-1 inline-flex">
          {sortConfig.direction === "asc" ? (
            <ArrowUp className="w-3 h-3" aria-hidden />
          ) : (
            <ArrowDown className="w-3 h-3" aria-hidden />
          )}
        </span>
      )
    }

    const startItem = filteredPatients.length === 0 ? 0 : (currentPage - 1) * pageSize + 1
    const endItem = Math.min(currentPage * pageSize, filteredPatients.length)


  return (
    <DoctorLayout>
      <div className="w-full max-w-none space-y-2 px-1 pb-1">
        <div className="flex flex-wrap items-center gap-3 px-2 py-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-slate-600 whitespace-nowrap">{t("doctor.patients.department")}</span>
            <Select
              value={filters.department}
              onValueChange={(value) =>
                setFilters({
                  ...filters,
                  department: value as typeof filters.department,
                })
              }
            >
              <SelectTrigger className="h-9 w-[min(12rem,42vw)] btn-outline text-sm border-slate-300">
                <SelectValue placeholder={t("doctor.patients.all")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="All">{t("doctor.patients.all")}</SelectItem>
                {PATIENT_IN_DEPARTMENT_OPTIONS.map((d) => (
                  <SelectItem key={d} value={d}>
                    {translatePatientInDepartment(d, t)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-slate-600 whitespace-nowrap">{t("doctor.patients.status")}</span>
            <Select
              value={filters.status}
              onValueChange={(value) =>
                setFilters({
                  ...filters,
                  status: value as typeof filters.status,
                })
              }
            >
              <SelectTrigger className="h-9 w-[8.5rem] btn-outline text-sm border-slate-300">
                <SelectValue placeholder={t("doctor.patients.all")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="All">{t("doctor.patients.all")}</SelectItem>
                <SelectItem value="Active">{t("doctor.patients.active")}</SelectItem>
                <SelectItem value="Recovered">{t("doctor.patients.recovered")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <Card className="flex flex-col">
          <CardContent className="p-0 overflow-hidden">
            <div className="flex flex-col rounded-xl border border-slate-200 bg-white overflow-hidden">
              <div className="w-full min-w-0 flex flex-col">
                  <table className={cn("w-full table-fixed caption-bottom text-sm", tableMinWidthClass)}>
                    <TableHeader
                      className="z-20 text-white"
                      style={{
                        background: "linear-gradient(135deg, #06b6d4 0%, #0891b2 100%)",
                      }}
                    >
                      <TableRow>
                        {columns.map((col) =>
                          visibleColumns.includes(col.key) ? (
                            <TableHead
                              key={col.key}
                              onClick={() => col.sortable && handleSort(col.key)}
                              className={cn(
                                "h-auto min-h-10 select-none px-3 py-2.5 align-middle text-white transition",
                                isVi && col.key === "latestVisit"
                                  ? "whitespace-normal leading-snug"
                                  : "whitespace-nowrap",
                                col.sortable && "cursor-pointer",
                                columnWidthClass[col.key]
                              )}
                            >
                              {col.label}
                              {col.sortable && <SortIcon column={col.key} />}
                            </TableHead>
                          ) : null
                        )}
                      </TableRow>
                      <TableRow className="border-b hover:bg-white transition-colors">
                        {columns.map((col) =>
                          visibleColumns.includes(col.key) ? (
                            <TableHead
                              key={col.key}
                              className={cn(
                                "px-3 py-2 align-middle",
                                columnWidthClass[col.key]
                              )}
                            >
                              {col.key === "no" && null}

                              {col.key === "id" && (
                                <div className="relative">
                                  <Search className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                  <Input
                                    value={filters.patientId}
                                    onChange={(e) =>
                                      setFilters({ ...filters, patientId: e.target.value })
                                    }
                                    className="h-8 text-xs pr-8 border-slate-300 focus-visible:ring-1 focus-visible:ring-cyan-400"
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
                                    className="h-8 text-xs pr-8 border-slate-300 focus-visible:ring-1 focus-visible:ring-cyan-400"
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
                                  <SelectTrigger className="h-8 text-xs w-full border-slate-300 focus-visible:ring-1 focus-visible:ring-cyan-400">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="All">{t("doctor.patients.all")}</SelectItem>
                                    <SelectItem value="M">{t("doctor.patients.sexMale")}</SelectItem>
                                    <SelectItem value="F">{t("doctor.patients.sexFemale")}</SelectItem>
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
                                  className="h-8 text-xs text-center border-slate-300 focus-visible:ring-1 focus-visible:ring-cyan-400"
                                />
                              )}

                              {col.key === "latestVisit" && (
                                <Popover>
                                  <PopoverTrigger asChild>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="h-8 w-full text-xs justify-start border-slate-300"
                                    >
                                      <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
                                      {filters.latestVisit
                                        ? format(filters.latestVisit, "dd/MM/yyyy")
                                        : t("doctor.patients.selectDate")}
                                    </Button>
                                  </PopoverTrigger>
                                  <PopoverContent className="w-auto p-0">
                                    <Calendar
                                      mode="single"
                                      selected={filters.latestVisit ?? undefined}
                                      onSelect={(date) =>
                                        setFilters({ ...filters, latestVisit: date ?? null })
                                      }
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
                                    className="h-8 text-xs pr-8 border-slate-300 focus-visible:ring-1 focus-visible:ring-cyan-400"
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
                                    className="h-8 text-xs pr-8 border-slate-300 focus-visible:ring-1 focus-visible:ring-cyan-400"
                                  />
                                </div>
                              )}

                            </TableHead>
                          ) : null
                        )}
                      </TableRow>
                    </TableHeader>
                  </table>

                  <div
                    className="overflow-y-auto overflow-x-auto overscroll-y-contain h-[360px] pb-2 min-w-0"
                    onWheel={(e) => e.stopPropagation()}
                  >
                    <table className={cn("w-full table-fixed caption-bottom text-sm", tableMinWidthClass)}>
                      <TableBody className="[&_td]:px-3 [&_td]:py-2.5">
                        {paginatedPatients.map((patient, index) => (
                          <TableRow
                            key={patient.id}
                            onClick={() =>
                              navigate(`/doctor/medical_records/${patient.id}/dashboard`)
                            }
                            className="cursor-pointer hover:bg-gray-100 transition-colors"
                          >
                            {visibleColumns.includes("no") && (
                              <TableCell className={cn(columnWidthClass.no, "text-center font-medium")}>
                                {(currentPage - 1) * pageSize + index + 1}
                              </TableCell>
                            )}

                            {visibleColumns.includes("id") && (
                              <TableCell
                                className={cn(
                                  columnWidthClass.id,
                                  "font-medium whitespace-nowrap overflow-hidden text-ellipsis"
                                )}
                              >
                                {patient.id}
                              </TableCell>
                            )}

                            {visibleColumns.includes("name") && (
                              <TableCell
                                className={cn(
                                  columnWidthClass.name,
                                  "whitespace-nowrap overflow-hidden text-ellipsis"
                                )}
                              >
                                {patient.name}
                              </TableCell>
                            )}

                            {visibleColumns.includes("sex") && (
                              <TableCell className={cn(columnWidthClass.sex, "text-center")}>
                                {patient.sex === "M"
                                  ? t("doctor.patients.sexMale")
                                  : patient.sex === "F"
                                    ? t("doctor.patients.sexFemale")
                                    : patient.sex}
                              </TableCell>
                            )}

                            {visibleColumns.includes("age") && (
                              <TableCell className={cn(columnWidthClass.age, "text-center")}>
                                {patient.age}
                              </TableCell>
                            )}

                            {visibleColumns.includes("latestVisit") && (
                              <TableCell className={cn(columnWidthClass.latestVisit, "text-center")}>
                                {patient.latestVisit || t("common.notAvailable")}
                              </TableCell>
                            )}

                            {visibleColumns.includes("diagnosis") && (
                              <TableCell className={cn(columnWidthClass.diagnosis, "text-center")}>
                                <TooltipProvider delayDuration={0}>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <span className="cursor-help underline decoration-dotted">
                                        {patient.diagnosis}
                                      </span>
                                    </TooltipTrigger>
                                    <TooltipContent
                                      side="top"
                                      className="bg-linear-to-br from-[#06b6d4] to-[#0891b2]"
                                    >
                                      <b className="text-sm max-w-xs ">
                                        {patient.diagnosisDescription || t("doctor.patients.noDescription")}
                                      </b>
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              </TableCell>
                            )}

                            {visibleColumns.includes("doctor") && (
                              <TableCell
                                className={cn(
                                  columnWidthClass.doctor,
                                  "whitespace-nowrap overflow-hidden text-ellipsis"
                                )}
                              >
                                {patient.doctor}
                              </TableCell>
                            )}

                          </TableRow>
                        ))}

                        {paginatedPatients.length === 0 && (
                          <TableRow>
                            <TableCell
                              colSpan={visibleColumns.length}
                              className="text-center py-10 text-muted-foreground"
                            >
                              {t("doctor.patients.noPatientsFound")}
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </table>
                  </div>
              </div>

              <div className="mt-1 flex flex-wrap items-center justify-start gap-3 px-4 py-3 bg-gray-50 border-t text-xs rounded-b-xl">
                <div className="flex items-center gap-2">
                  <span className="text-gray-700 whitespace-nowrap">{t("doctor.patients.show")}</span>
                  <Select
                    value={pageSize.toString()}
                    onValueChange={(v) => {
                      setPageSize(Number(v))
                      setCurrentPage(1)
                    }}
                  >
                    <SelectTrigger className="w-16 h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="5">5</SelectItem>
                      <SelectItem value="10">10</SelectItem>
                      <SelectItem value="25">25</SelectItem>
                      <SelectItem value="50">50</SelectItem>
                      <SelectItem value="100">100</SelectItem>
                    </SelectContent>
                  </Select>
                  <span className="text-gray-700 whitespace-nowrap">{t("doctor.patients.entries")}</span>
                </div>

                <div className="text-gray-700 whitespace-nowrap">
                  {t("doctor.patients.showingRange", {
                    start: startItem,
                    end: endItem,
                    total: filteredPatients.length,
                  })}
                </div>

                <div className="flex items-center gap-1 ml-auto">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="btn-outline h-8 px-2.5 text-xs"
                  >
                    {t("doctor.patients.previous")}
                  </Button>

                  {(() => {
                    const pages = []
                    const maxVisible = 5
                    let startPage = Math.max(1, currentPage - Math.floor(maxVisible / 2))
                    const endPage = Math.min(totalPages, startPage + maxVisible - 1)
                    if (endPage - startPage + 1 < maxVisible) {
                      startPage = Math.max(1, endPage - maxVisible + 1)
                    }
                    for (let i = startPage; i <= endPage; i++) {
                      pages.push(
                        <Button
                          key={i}
                          variant={currentPage === i ? "default" : "outline"}
                          size="sm"
                          className={cn(
                            "h-8 min-w-8 px-2 text-xs",
                            currentPage === i ? "btn-gradient" : "btn-outline"
                          )}
                          onClick={() => setCurrentPage(i)}
                        >
                          {i}
                        </Button>
                      )
                    }
                    return pages
                  })()}

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="btn-outline h-8 px-2.5 text-xs"
                  >
                    {t("doctor.patients.next")}
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </DoctorLayout>
  )
}
