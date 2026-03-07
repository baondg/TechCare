// src/pages/reception/PatientManagement.tsx

import { useState, useEffect, useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { UserPlus, Trash2, Save, X, Edit3, CheckCircle, ChevronLeft, ChevronRight, ArrowUp, ArrowDown, ArrowUpDown, Search, Calendar } from "lucide-react"
import { AdminLayout } from "@/components/admin-layout"
import { Checkbox } from "@/components/ui/checkbox"

interface Patient {
  id: string
  nationalId: string
  name: string
  username: string
  sex: "Male" | "Female" | null
  dob: string
  phone: string
  email: string
  enabled: boolean  
}

// Dß╗» liß╗çu mß║½u ΓÇô fix lß╗ùi as const bß║▒ng c├ích tß║ío h├ám helper
const createPatient = (i: number): Patient => ({
  id: `OP1234568${String(10 + i).padStart(2, "0")}`,
  nationalId: `OP1234568${String(10 + i).padStart(2, "0")}`,
  name: i % 2 === 0 ? "Nguyen Van An" : "Tran Thi Be",
  username: i % 2 === 0 ? "anpv1977" : "betran1985",
  sex: i % 2 === 0 ? "Male" : "Female",   // TypeScript tß╗▒ hiß╗âu l├á literal type ΓåÆ kh├┤ng cß║ºn as const
  dob: i % 2 === 0 ? "22/12/1977" : "15/03/1985",
  phone: i % 2 === 0 ? "0123456789" : "0987654321",
  email: i % 2 === 0 ? "patient@example.com" : "be.tran@gmail.com",
  enabled: i % 2 === 0 ? true : false,
})

const initialPatients: Patient[] = [
  { id: "OP123456789", nationalId: "OP123456789", name: "Nguyen Van An", username: "anpv1977", sex: "Male", dob: "22/12/1977", phone: "0123456789", email: "patient@example.com",enabled: true },
  { id: "OP123456790", nationalId: "OP123456790", name: "Tran Thi Be", username: "betran1985", sex: "Female", dob: "15/03/1985", phone: "0987654321", email: "be.tran@gmail.com",enabled: false },
  { id: "OP123456791", nationalId: "OP123456791", name: "Le Van Cuong", username: "cuonglv", sex: "Male", dob: "10/08/1992", phone: "0909090909", email: "cuong.le@outlook.com",enabled: true },
  { id: "OP123456792", nationalId: "OP123456792", name: "Pham Thi Dung", username: "dungpham", sex: "Female", dob: "05/11/1988", phone: "0912345678", email: "dung.pham@yahoo.com",enabled: false },
  { id: "OP123456793", nationalId: "OP123456793", name: "Hoang Van Em", username: "emhv1990", sex: "Male", dob: "30/06/1990", phone: "0933333333", email: "em.hoang@gmail.com",enabled: true },
  ...Array.from({ length: 35 }, (_, i) => createPatient(i)),
]

export default function UserManagement() {
  const [patients] = useState<Patient[]>(initialPatients)
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)  // ΓåÉ Th├¬m d├▓ng n├áy

  const [filters, setFilters] = useState({
    nationalId: "",
    name: "",
    username: "",
    sex: "",
    dob: "",
    phone: "",
    email: "",
  })

  const filteredPatients = useMemo(() => {
    return patients.filter((p) =>
      p.nationalId.toLowerCase().includes(filters.nationalId.toLowerCase()) &&
      p.name.toLowerCase().includes(filters.name.toLowerCase()) &&
      p.username.toLowerCase().includes(filters.username.toLowerCase()) &&
      (filters.sex === "" || p.sex === filters.sex) &&
      p.dob.includes(filters.dob) &&
      p.phone.includes(filters.phone) &&
      p.email.toLowerCase().includes(filters.email.toLowerCase())
    )
  }, [patients, filters])

  const totalPages = Math.max(1, Math.ceil(filteredPatients.length / pageSize))

  useEffect(() => setCurrentPage(1), [filters])

  const startItem = (currentPage - 1) * pageSize + 1
  const endItem = Math.min(currentPage * pageSize, filteredPatients.length)

  type ColumnKey = keyof Patient | "no"

  const columns: {
    key: ColumnKey
    label: string
  }[] = [
    { key: "no", label: "No." },
    { key: "nationalId", label: "National ID" },
    { key: "name", label: "Name" },
    { key: "username", label: "Username" },
    { key: "sex", label: "Sex" },
    { key: "dob", label: "DOB" },
    { key: "phone", label: "Phone" },
    { key: "email", label: "Email" },
  ]

  const allColumns = columns.map(c => c.key)

  const [visibleColumns, setVisibleColumns] = useState<ColumnKey[]>(allColumns)

  type SortKey = keyof Patient | "no"

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

  const sortedPatients = useMemo(() => {
    if (!sortConfig) return filteredPatients

    const { key, direction } = sortConfig

    return [...filteredPatients].sort((a, b) => {
      let aValue: any
      let bValue: any

      if (key === "no") {
        aValue = a.id
        bValue = b.id
      } else {
        aValue = a[key]
        bValue = b[key]
      }

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


  const paginatedPatients = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return sortedPatients.slice(start, start + pageSize)
  }, [sortedPatients, currentPage, pageSize])

  const SortIcon = ({ column }: { column: SortKey }) => {
    if (sortConfig?.key !== column) return <span className="ml-1">Γçà</span>
    return (
      <span className="ml-1">
        {sortConfig.direction === "asc" 
    ? <ArrowUp className="w-3 h-3" />
    : <ArrowDown className="w-3 h-3" /> }
      </span>
    )
  }

  const renderFilterCell = (key: ColumnKey) => {
    switch (key) {
      case "no":
        return null

      case "nationalId":
        return (
          <div className="relative">
            <Search className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              value={filters.nationalId}
              onChange={e =>
                setFilters(f => ({ ...f, nationalId: e.target.value }))
              }
              className="h-8 text-xs pr-8"
            />
          </div>
        )

      case "name":
        return (
          <div className="relative">
            <Search className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              value={filters.name}
              onChange={e =>
                setFilters(f => ({ ...f, name: e.target.value }))
              }
              className="h-8 text-xs pr-8"
            />
          </div>
        )

      case "username":
        return (
          <div className="relative">
            <Search className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              value={filters.username}
              onChange={e =>
                setFilters(f => ({ ...f, username: e.target.value }))
              }
              className="h-8 text-xs pr-8"
            />
          </div>
        )

      case "sex":
        return (
          <Select
            value={filters.sex || "ALL"}
            onValueChange={v =>
              setFilters(f => ({ ...f, sex: v === "ALL" ? "" : v }))
            }
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="All" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All</SelectItem>
              <SelectItem value="Male">Male</SelectItem>
              <SelectItem value="Female">Female</SelectItem>
            </SelectContent>
          </Select>
        )

      case "dob":
        return (
          <div className="relative">
            <Calendar className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              value={filters.dob}
              onChange={e =>
                setFilters(f => ({ ...f, dob: e.target.value }))
              }
              className="h-8 text-xs pr-8"
            />
          </div>
        )

      case "phone":
        return (
          <div className="relative">
            <Search className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              value={filters.phone}
              onChange={e =>
                setFilters(f => ({ ...f, phone: e.target.value }))
              }
              className="h-8 text-xs pr-8"
            />
          </div>
        )

      case "email":
        return (
          <div className="relative">
            <Search className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              value={filters.email}
              onChange={e =>
                setFilters(f => ({ ...f, email: e.target.value }))
              }
              className="h-8 text-xs pr-8"
            />
          </div>
        )

      default:
        return null
    }
  }



  return (
  <AdminLayout>
    <div className="max-w-7xl space-y-1">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div className="p-4">
            <div className="flex flex-wrap gap-4">
              <div className="flex flex-wrap gap-2">
                <Checkbox
                  label="Show All"
                  checked={visibleColumns.length === allColumns.length}
                  onChange={(checked) => {
                    if (checked) {
                      setVisibleColumns(allColumns)
                    }
                  }}
                />

                {columns
                  .filter(col => col.key !== "no")
                  .map(col => (
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
          </div>
          <div className="flex gap-3">
            <Button className="btn-gradient transition-transform duration-500 text-xl px-7 py-4">
              <UserPlus className="w-5 h-5 mr-2" /> Add New Account
            </Button>
            <Button className="btn-outline transition-transform duration-500 text-xl px-7 py-4"><Trash2 className="w-5 h-5 mr-2" /> Clear</Button>
            <Button className="btn-gradient transition-transform duration-500 text-xl px-7 py-4"><Save className="w-5 h-5 mr-2" /> Save</Button>
            <Button className="btn-gradient transition-transform duration-500 text-xl px-7 py-4"><X className="w-5 h-5 mr-2" /> Cancel</Button>
          </div>
        </div>

        {/* Grid 2 cß╗Öt */}
        <div className="grid lg:grid-cols-2 gap-6">
          <Card className="flex flex-col h-[560px]">
            <CardContent className="flex-1 p-0 overflow-hidden">
              <div className="h-full overflow-y-auto">
                <Table className="table-fixed w-max">
                  {/* Header cß╗æ ─æß╗ïnh */}
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
                            onClick={() => handleSort(col.key)}
                            className="cursor-pointer select-none whitespace-nowrap text-white transition"
                          >
                            {col.label}
                            <SortIcon column={col.key} />
                          </TableHead>
                        ) : null
                      )}
                    </TableRow>
                    <TableRow className="border-b hover:bg-white transition-colors">
                      {columns.map(col =>
                        visibleColumns.includes(col.key) ? (
                          <TableHead key={col.key} className="px-2 py-2">
                            {renderFilterCell(col.key)}
                          </TableHead>
                        ) : null
                      )}
                    </TableRow>
                  </TableHeader>

                  <TableBody>
                    {paginatedPatients.map((patient, idx) => (
                      <TableRow key={patient.id} 
                        onClick={() => setSelectedPatient(patient)} 
                        className={`cursor-pointer hover:bg-gray-100 ${
                          selectedPatient?.id === patient.id ? "bg-cyan-50" : ""
                        }`}
                      > 
                        <TableCell>{startItem + idx}</TableCell>

                        {visibleColumns.includes("nationalId") && (
                          <TableCell>{patient.nationalId}</TableCell>
                        )}

                        {visibleColumns.includes("name") && (
                          <TableCell className="font-medium">{patient.name}</TableCell>
                        )}

                        {visibleColumns.includes("username") && (
                          <TableCell>{patient.username}</TableCell>
                        )}

                        {visibleColumns.includes("sex") && (
                          <TableCell>{patient.sex}</TableCell>
                        )}

                        {visibleColumns.includes("dob") && (
                          <TableCell>{patient.dob}</TableCell>
                        )}

                        {visibleColumns.includes("phone") && (
                          <TableCell>{patient.phone}</TableCell>
                        )}

                        {visibleColumns.includes("email") && (
                          <TableCell className="truncate max-w-xs">
                            {patient.email}
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {/* PH├éN TRANG */}
                <div className="flex flex-wrap items-center justify-start gap-4 px-6 py-4 bg-gray-50 border-t text-sm">
                  {/* Show X entries */}
                  <div className="flex items-center gap-3">
                    <span className="text-gray-700 whitespace-nowrap">Show</span>
                    <Select value={pageSize.toString()} onValueChange={(v) => {
                      setPageSize(Number(v))
                      setCurrentPage(1)
                    }}>
                      <SelectTrigger className="w-20 h-9">
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
                    <span className="text-gray-700 whitespace-nowrap">entries</span>
                  </div>

                  {/* Hiß╗ân thß╗ï kß║┐t quß║ú */}
                  <div className="text-gray-700 whitespace-nowrap">
                    Showing {startItem} to {endItem} of {filteredPatients.length} entries
                  </div>

                  {/* N├║t ph├ón trang ΓÇô c─ân phß║úi c├╣ng h├áng (nh╞░ng vß║½n trong flex n├¬n tß╗▒ ─æß╗Öng xuß╗æng d├▓ng nß║┐u hß║╣p) */}
                  <div className="flex items-center gap-1 ml-auto">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                      className="btn-outline transition-transform duration-500 text-xl px-7 py-4"
                    >
                      Previous
                    </Button>

                    {/* C├íc sß╗æ trang */}
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
                            className={`h-9 w-9 ${currentPage === i ? "btn-gradient text-xl py-4" : "btn-outline transition-transform duration-500 text-xl px-7 py-4"}`}
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
                      onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                      className="btn-outline transition-transform duration-500 text-xl px-7 py-4"
                    >
                      Next
                    </Button>
                  </div>
                </div>
              </div>

              {/* Pagination */}
              <div className="flex flex-wrap items-center justify-start gap-4 px-6 py-4 bg-gray-50 border-t text-sm">
                <div className="text-gray-700">
                  Showing {startItem} - {endItem} of {filteredPatients.length} patients
                </div>
                <div className="flex gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    const page = currentPage <= 3 ? i + 1 : currentPage > totalPages - 3 ? totalPages - 4 + i : currentPage - 2 + i
                    if (page < 1 || page > totalPages) return null
                    return (
                      <Button
                        key={page}
                        variant={currentPage === page ? "default" : "outline"}
                        size="sm"
                        className={currentPage === page ? "bg-[#06b6d4] hover:bg-[#0891b2]" : ""}
                        onClick={() => setCurrentPage(page)}
                      >
                        {page}
                      </Button>
                    )
                  })}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
          {/* Chi tiß║┐t bß╗çnh nh├ón - chß╗ë hiß╗çn khi c├│ selectedPatient */}
          {selectedPatient ? (
            <Card>
              <CardHeader>
                <div className="flex justify-between items-center">
                  <CardTitle className="flex items-center gap-3">
                    <UserPlus className="w-6 h-6 text-gray-700" />
                    Account Information
                  </CardTitle>
                  <div className="flex gap-3 items-center">
                    <Button size="sm" className="btn-gradient transition-transform duration-500 text-xl px-7 py-4">
                      <Edit3 className="w-4 h-4 mr-2" /> Edit
                    </Button>

                    {/* TOGGLE ENABLE/DISABLE */}
                    <Button
                      size="sm"
                      variant="outline"
                      className={`relative w-30 overflow-hidden font-medium transition-all duration-200 border
                        ${selectedPatient?.enabled
                          ? "bg-[#E9FFE9] hover:bg-[#388E3C] text-[#388E3C]"
                          : "bg-[#FFEBEB] hover:bg-[#D32F2F] text-[#D32F2F]"
                        }`}
                      onClick={() => {
                        if (selectedPatient) {
                          setSelectedPatient({ ...selectedPatient, enabled: !selectedPatient.enabled })
                        }
                      }}
                    >
                      {/* Overlay l├ám nß╗ün ─æß║¡m khi hover */}
                      <span className="absolute inset-0 bg-black opacity-0 hover:opacity-30 transition-opacity" />

                      {/* Icon v├á Text ΓÇô lu├┤n trß║»ng khi hover */}
                      <CheckCircle className="w-4 h-4 mr-2 transition-colors duration-200 group-hover:text-white" />
                      <span className="relative z-10 transition-colors duration-200 group-hover:text-white">
                        {selectedPatient?.enabled ? "Enabled" : "Disabled"}
                      </span>
                    </Button>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="space-y-5">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">User ID</label>
                    <Input value={selectedPatient.id} disabled className="bg-gray-50" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Role</label>
                    <Input value="Patient" disabled className="bg-gray-50" />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Name</label>
                  <Input value={selectedPatient.name} disabled className="bg-gray-50" />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Username</label>
                    <Input value={selectedPatient.username} disabled className="bg-gray-50" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Password</label>
                    <Input type="password" value="********" disabled className="bg-gray-50" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Sex</label>
                    <Input value={selectedPatient.sex || ""} disabled className="bg-gray-50" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Date of Birth</label>
                    <Input value={selectedPatient.dob} disabled className="bg-gray-50" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Phone Number</label>
                    <Input value={selectedPatient.phone} disabled className="bg-gray-50" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Email</label>
                    <Input value={selectedPatient.email} disabled className="bg-gray-50" />
                  </div>
                </div>

                {/* Trß║íng th├íi t├ái khoß║ún */}
                <div className="pt-4 border-t">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-700">Account Status</span>
                    <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                      selectedPatient.enabled 
                        ? "bg-green-100 text-[#388E3C]" 
                        : "bg-red-100 text-[#D32F2F]"
                    }`}>
                      {selectedPatient.enabled ? "Active" : "Inactive"}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : null}
        </div>
    </div>
  </AdminLayout>
  )
}
