// src/pages/reception/PatientManagement.tsx

import { useState, useEffect, useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { UserPlus, Trash2, Save, X, Edit3, CheckCircle, ChevronLeft, ChevronRight } from "lucide-react"
import { AdminLayout } from "@/components/admin-layout"

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

// Dữ liệu mẫu – fix lỗi as const bằng cách tạo hàm helper
const createPatient = (i: number): Patient => ({
  id: `OP1234568${String(10 + i).padStart(2, "0")}`,
  nationalId: `OP1234568${String(10 + i).padStart(2, "0")}`,
  name: i % 2 === 0 ? "Nguyen Van An" : "Tran Thi Be",
  username: i % 2 === 0 ? "anpv1977" : "betran1985",
  sex: i % 2 === 0 ? "Male" : "Female",   // TypeScript tự hiểu là literal type → không cần as const
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
  const [pageSize, setPageSize] = useState(10)  // ← Thêm dòng này

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
  const paginatedPatients = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return filteredPatients.slice(start, start + pageSize)
  }, [filteredPatients, currentPage])

  useEffect(() => setCurrentPage(1), [filters])
  useEffect(() => {
    if (patients.length > 0 && !selectedPatient) setSelectedPatient(patients[0])
  }, [patients, selectedPatient])

  const startItem = (currentPage - 1) * pageSize + 1
  const endItem = Math.min(currentPage * pageSize, filteredPatients.length)

  return (
  <AdminLayout>
    <div className="max-w-7xl space-y-6">
        {/* Header */}
        <div className="flex justify-between items-center">
          <h2 className="text-3xl font-bold text-gray-900">Account Management</h2>
          <div className="flex gap-3">
            <Button className="bg-[#0086C4] hover:bg-[#06b6d4]">
              <UserPlus className="w-5 h-5 mr-2" /> Add New Account
            </Button>
            <Button variant="outline"><Trash2 className="w-5 h-5 mr-2" /> Clear</Button>
            <Button className="bg-[#0086C4] hover:bg-[#06b6d4]"><Save className="w-5 h-5 mr-2" /> Save</Button>
            <Button className="bg-[#0086C4] hover:bg-[#06b6d4]"><X className="w-5 h-5 mr-2" /> Cancel</Button>
          </div>
        </div>

        {/* Grid 2 cột */}
        <div className="grid lg:grid-cols-2 gap-6">
          <Card className="flex flex-col h-[820px]">
            <CardContent className="flex-1 p-0 overflow-hidden">
              {/* Dùng div với overflow thay vì ScrollArea để tránh bug layout */}
              <div className="h-full overflow-auto">
                <Table>
                  {/* Header cố định */}
                  <TableHeader className="sticky top-0 z-10 bg-gray-50 border-b">
                    <TableRow>
                      <TableHead className="w-16 px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">No.</TableHead>
                      <TableHead className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">National ID</TableHead>
                      <TableHead className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</TableHead>
                      <TableHead className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Username</TableHead>
                      <TableHead className="w-24 px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Sex</TableHead>
                      <TableHead className="w-32 px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">DOB</TableHead>
                      <TableHead className="w-40 px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Phone</TableHead>
                      <TableHead className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Email</TableHead>
                    </TableRow>
                    <TableRow>
                      <TableHead className="px-2 py-2"></TableHead>
                      <TableHead className="px-2 py-2">
                        <Input placeholder="Search ID..." value={filters.nationalId} onChange={e => setFilters(f => ({...f, nationalId: e.target.value}))} className="h-8 text-xs" />
                      </TableHead>
                      <TableHead className="px-2 py-2">
                        <Input placeholder="Name..." value={filters.name} onChange={e => setFilters(f => ({...f, name: e.target.value}))} className="h-8 text-xs" />
                      </TableHead>
                      <TableHead className="px-2 py-2">
                        <Input placeholder="Username..." value={filters.username} onChange={e => setFilters(f => ({...f, username: e.target.value}))} className="h-8 text-xs" />
                      </TableHead>
                      <TableHead className="px-2 py-2">
                        <Select value={filters.sex} onValueChange={v => setFilters(f => ({...f, sex: v}))}>
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue placeholder="All" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="All">All</SelectItem>
                            <SelectItem value="Male">Male</SelectItem>
                            <SelectItem value="Female">Female</SelectItem>
                            <SelectItem value="Other">Other</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableHead>
                      <TableHead className="px-2 py-2">
                        <Input placeholder="dd/mm/yyyy" value={filters.dob} onChange={e => setFilters(f => ({...f, dob: e.target.value}))} className="h-8 text-xs" />
                      </TableHead>
                      <TableHead className="px-2 py-2">
                        <Input placeholder="Phone..." value={filters.phone} onChange={e => setFilters(f => ({...f, phone: e.target.value}))} className="h-8 text-xs" />
                      </TableHead>
                      <TableHead className="px-2 py-2">
                        <Input placeholder="Email..." value={filters.email} onChange={e => setFilters(f => ({...f, email: e.target.value}))} className="h-8 text-xs" />
                      </TableHead>
                    </TableRow>
                  </TableHeader>

                  <TableBody>
                    {paginatedPatients.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center py-10 text-gray-500">
                          No patients found.
                        </TableCell>
                      </TableRow>
                    ) : (
                      paginatedPatients.map((patient, idx) => (
                        <TableRow
                          key={patient.id}
                          onClick={() => setSelectedPatient(patient)}
                          className={`cursor-pointer transition-colors h-14 hover:bg-muted/50 ${
                            selectedPatient?.id === patient.id ? "bg-cyan-50 border-l-4 border-[#06b6d4]" : ""
                          }`}
                        >
                          <TableCell className="px-4 py-3 text-sm font-medium">{startItem + idx}</TableCell>
                          <TableCell className="px-4 py-3 text-sm">{patient.nationalId}</TableCell>
                          <TableCell className="px-4 py-3 text-sm font-medium">{patient.name}</TableCell>
                          <TableCell className="px-4 py-3 text-sm">{patient.username}</TableCell>
                          <TableCell className="px-4 py-3 text-sm">{patient.sex || "-"}</TableCell>
                          <TableCell className="px-4 py-3 text-sm">{patient.dob}</TableCell>
                          <TableCell className="px-4 py-3 text-sm">{patient.phone}</TableCell>
                          <TableCell className="px-4 py-3 text-sm truncate max-w-xs" title={patient.email}>
                            {patient.email}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
                {/* PHÂN TRANG */}
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

                  {/* Hiển thị kết quả */}
                  <div className="text-gray-700 whitespace-nowrap">
                    Showing {startItem} to {endItem} of {filteredPatients.length} entries
                  </div>

                  {/* Nút phân trang – căn phải cùng hàng (nhưng vẫn trong flex nên tự động xuống dòng nếu hẹp) */}
                  <div className="flex items-center gap-1 ml-auto">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                      className="h-9 px-3"
                    >
                      Previous
                    </Button>

                    {/* Các số trang */}
                    {(() => {
                      const pages = []
                      const maxVisible = 5
                      let startPage = Math.max(1, currentPage - Math.floor(maxVisible / 2))
                      let endPage = Math.min(totalPages, startPage + maxVisible - 1)
                      if (endPage - startPage + 1 < maxVisible) {
                        startPage = Math.max(1, endPage - maxVisible + 1)
                      }

                      for (let i = startPage; i <= endPage; i++) {
                        pages.push(
                          <Button
                            key={i}
                            variant={currentPage === i ? "default" : "outline"}
                            size="sm"
                            className={`h-9 w-9 ${currentPage === i ? "bg-[#06b6d4] hover:bg-[#0891b2]" : ""}`}
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
                      className="h-9 px-3"
                    >
                      Next
                    </Button>
                  </div>
                </div>
              </div>

              {/* Pagination */}
              <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-t text-sm">
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

          {/* Chi tiết bệnh nhân */}
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <CardTitle className="flex items-center gap-3">
                  <UserPlus className="w-6 h-6 text-gray-700" />
                  Account Information
                </CardTitle>
                <div className="flex gap-3 items-center">
                  <Button size="sm" className="bg-[#0086C4] hover:bg-[#06b6d4]">
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
                    {/* Overlay làm nền đậm khi hover */}
                    <span className="absolute inset-0 bg-black opacity-0 hover:opacity-30 transition-opacity" />

                    {/* Icon và Text – luôn trắng khi hover */}
                    <CheckCircle className="w-4 h-4 mr-2 transition-colors duration-200 group-hover:text-white" />
                    <span className="relative z-10 transition-colors duration-200 group-hover:text-white">
                      {selectedPatient?.enabled ? "Enabled" : "Disabled"}
                    </span>
                  </Button>
                </div>
              </div>
            </CardHeader>

            <CardContent className="space-y-5">
              {selectedPatient ? (
                <>
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

                  {/* Trạng thái tài khoản */}
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
                </>
              ) : (
                <div className="text-center py-12 text-gray-500">
                  Select a patient to view details
                </div>
              )}
            </CardContent>
          </Card>
        </div>
    </div>
  </AdminLayout>
  )
}