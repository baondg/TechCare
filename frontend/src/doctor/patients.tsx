"use client"

import { useState, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Search, ChevronLeft, ChevronRight, CalendarIcon } from "lucide-react"
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select"
import { PatientLayout } from "@/components/patient-layout"  // giữ nguyên nếu bạn đang dùng
import { DoctorLayout } from "@/components/doctor-layout"
import { Popover,  PopoverContent,  PopoverTrigger} from "@/components/ui/popover"
import { format } from "date-fns"
import { vi } from "date-fns/locale"
import { cn } from "@/lib/utils"
import { Calendar } from "@/components/ui/calendar"
import { useNavigate } from "react-router-dom"


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

export default function PatientListPage() {
    const navigate = useNavigate()
    const [patients] = useState<Patient[]>([
        { id: "OP123456789", name: "Nguyễn Văn An", sex: "M", age: 46, latestVisit: "07/10/2025", diagnosis: "Z59.1", doctor: "Dr. Trần Thanh Nghiệp", recoverDays: 2, recoverPercent: 70 },
        { id: "OP987654321", name: "Trần Thị Bình", sex: "F", age: 38, latestVisit: "05/11/2025", diagnosis: "J45.9", doctor: "Dr. Lê Minh Tuấn", recoverDays: 5, recoverPercent: 85 },
        { id: "OP456789123", name: "Lê Văn Công", sex: "M", age: 52, latestVisit: "01/12/2025", diagnosis: "I10", doctor: "Dr. Phạm Thị Hoa", recoverDays: 3, recoverPercent: 60 },
        { id: "OP321654987", name: "Phạm Thị Dung", sex: "F", age: 29, latestVisit: "20/09/2025", diagnosis: "E11.9", doctor: "Dr. Nguyễn Văn Hải", recoverDays: 8, recoverPercent: 92 },
        { id: "OP789123456", name: "Hoàng Văn Em", sex: "M", age: 61, latestVisit: "15/10/2025", diagnosis: "K29.5", doctor: "Dr. Trần Thanh Nghiệp", recoverDays: 4, recoverPercent: 75 },
        { id: "OP654321789", name: "Vũ Thị Giang", sex: "F", age: 44, latestVisit: "28/11/2025", diagnosis: "M79.1", doctor: "Dr. Lê Minh Tuấn", recoverDays: 6, recoverPercent: 88 },
        { id: "OP147258369", name: "Đặng Văn Hùng", sex: "M", age: 35, latestVisit: "10/12/2025", diagnosis: "J06.9", doctor: "Dr. Phạm Thị Hoa", recoverDays: 2, recoverPercent: 95 },
        { id: "OP258369147", name: "Ngô Thị Lan", sex: "F", age: 50, latestVisit: "03/10/2025", diagnosis: "I50.9", doctor: "Dr. Nguyễn Văn Hải", recoverDays: 10, recoverPercent: 65 },
        { id: "OP369147258", name: "Bùi Văn Minh", sex: "M", age: 67, latestVisit: "18/11/2025", diagnosis: "N39.0", doctor: "Dr. Trần Thanh Nghiệp", recoverDays: 7, recoverPercent: 80 },
        { id: "OP741852963", name: "Đỗ Thị Nga", sex: "F", age: 41, latestVisit: "25/09/2025", diagnosis: "R51", doctor: "Dr. Lê Minh Tuấn", recoverDays: 3, recoverPercent: 90 },
    ])

    const [filters, setFilters] = useState({
        patientId: "",
        name: "",
        sex: "All",
        age: "",
        recoverDays: "",
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

            return (
            p.id.toLowerCase().includes(filters.patientId.toLowerCase()) &&
            p.name.toLowerCase().includes(filters.name.toLowerCase()) &&
            p.diagnosis.toLowerCase().includes(filters.diagnosis.toLowerCase()) &&
            p.doctor.toLowerCase().includes(filters.doctor.toLowerCase()) &&
            matchAge &&
            matchRecoverDays
            )
        })
    }, [patients, filters])

    const paginatedPatients = filteredPatients.slice(
        (currentPage - 1) * pageSize,
        currentPage * pageSize
    )

    const totalPages = Math.ceil(filteredPatients.length / pageSize)

  return (
    <DoctorLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold">Patient List</h2>
            <p className="text-muted-foreground">View and manage patient records</p>
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

        {/* Bảng chính */}
        <Card className="overflow-hidden">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-gray-50 sticky top-0 z-10">
                    <TableRow>
                        <TableHead className="w-12 text-center">No.</TableHead>
                        <TableHead className="w-40">Patient ID</TableHead>
                        <TableHead className="w-24 text-center">Name</TableHead>
                        <TableHead className="w-24 text-center">Sex</TableHead>
                        <TableHead className="w-20 text-center">Age</TableHead>
                        <TableHead className="w-32 text-center">Lastest visit</TableHead>
                        <TableHead className="w-24 text-center">Diagnosis</TableHead>
                        <TableHead className="text-center">Doctor</TableHead>
                        <TableHead className="w-28">No of recover days</TableHead>
                    </TableRow>
                  <TableRow>
                    <TableHead className="w-16 text-center"></TableHead>
                    <TableHead className="min-w-[140px]">
                      <div className="mt-1">
                        <Input
                          placeholder="Search ID..."
                          value={filters.patientId}
                          onChange={(e) => setFilters({ ...filters, patientId: e.target.value })}
                          className="h-8 text-xs"
                        />
                      </div>
                    </TableHead>
                    <TableHead className="min-w-[180px]">
                      <div className="mt-1">
                        <Input
                          placeholder="Search name..."
                          value={filters.name}
                          onChange={(e) => setFilters({ ...filters, name: e.target.value })}
                          className="h-8 text-xs"
                        />
                      </div>
                    </TableHead>
                    <TableHead className="w-20 text-center">
                        <Select
                        value={filters.sex}
                        onValueChange={(value) => setFilters({ ...filters, sex: value })}
                      >
                        <SelectTrigger className="h-8 text-xs w-16 mx-auto">
                          <SelectValue placeholder="All" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="All">All</SelectItem>
                          <SelectItem value="M">M</SelectItem>
                          <SelectItem value="F">F</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableHead>
                    <TableHead className="w-20 text-center">
                        <div className="mt-1">
                            <Input
                            type="number"
                            placeholder="Age"
                            value={filters.age}
                            onChange={(e) =>
                                setFilters({ ...filters, age: e.target.value })
                            }
                            className="h-8 text-xs text-center"
                            />
                        </div>
                    </TableHead>
                    <TableHead className="min-w-[110px] text-center">
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button
                                variant="outline"
                                size="sm"
                                className={cn(
                                    "h-8 w-full justify-start text-left font-normal text-xs",
                                    !filters.latestVisit && "text-muted-foreground"
                                )}
                                >
                                <CalendarIcon className="mr-2 h-4 w-4" />
                                {filters.latestVisit
                                    ? format(filters.latestVisit, "dd/MM/yyyy", { locale: vi })
                                    : "Select"}
                                </Button>
                            </PopoverTrigger>

                            <PopoverContent className="w-auto p-0" align="start">
                                <Calendar
                                mode="single"
                                selected={filters.latestVisit ?? undefined}   
                                onSelect={(date) => {
                                    setFilters({ ...filters, latestVisit: date ?? null })
                                }}
                                initialFocus
                                locale={vi}               
                                />
                            </PopoverContent>
                        </Popover>
                    </TableHead>
                    <TableHead className="min-w-[100px]">
                      <div className="mt-1">
                        <Input
                          placeholder="Search..."
                          value={filters.diagnosis}
                          onChange={(e) => setFilters({ ...filters, diagnosis: e.target.value })}
                          className="h-8 text-xs"
                        />
                      </div>
                    </TableHead>
                    <TableHead className="min-w-40">
                      <div className="mt-1">
                        <Input
                          placeholder="Search doctor..."
                          value={filters.doctor}
                          onChange={(e) => setFilters({ ...filters, doctor: e.target.value })}
                          className="h-8 text-xs"
                        />
                      </div>
                    </TableHead>
                    <TableHead className="min-w-[140px] text-center">
                        <div className="mt-1">
                            <Input
                            type="number"
                            placeholder="Days"
                            value={filters.recoverDays}
                            onChange={(e) =>
                                setFilters({ ...filters, recoverDays: e.target.value })
                            }
                            className="h-8 text-xs text-center"
                            />
                        </div>
                    </TableHead>
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {paginatedPatients.map((patient, index) => (
                    <TableRow
                        key={patient.id}
                        onClick={() =>
                            navigate(`/doctor/medical_records/${patient.id}`)
                        }
                        className="hover:bg-muted/50 cursor-pointer h-14 transition-colors"
                        >
                      <TableCell className="text-center font-medium">
                        {(currentPage - 1) * pageSize + index + 1}
                      </TableCell>
                      <TableCell className="font-medium">{patient.id}</TableCell>
                      <TableCell>{patient.name}</TableCell>
                      <TableCell className="text-center">{patient.sex}</TableCell>
                      <TableCell className="text-center">{patient.age}</TableCell>
                      <TableCell className="text-center">{patient.latestVisit}</TableCell>
                      <TableCell className="text-center">{patient.diagnosis}</TableCell>
                      <TableCell>{patient.doctor}</TableCell>
                      <TableCell className="text-center">
                        {patient.recoverDays} days ({patient.recoverPercent}%)
                      </TableCell>
                    </TableRow>
                  ))}

                  {paginatedPatients.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center py-10 text-muted-foreground">
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
                    variant={currentPage === page ? "default" : "outline"}
                    size="sm"
                    className={currentPage === page ? "bg-primary hover:bg-primary/90" : ""}
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
    </DoctorLayout>
  )
}