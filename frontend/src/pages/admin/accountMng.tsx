// src/pages/reception/PatientManagement.tsx

import { useState, useEffect, useMemo, useLayoutEffect } from "react"
import { createPortal } from "react-dom"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { UserPlus, Trash2, Save, X, Edit3, CheckCircle, ArrowUp, ArrowDown, ArrowUpDown, Search, Calendar } from "lucide-react"
import { AdminLayout } from "@/components/admin-layout"
import { Checkbox } from "@/components/ui/checkbox"
import {
  adminAccountService,
  type AdminAccountRow,
  type AdminDepartmentOption,
  type SaveAdminAccountPayload,
} from "@/services/admin-account-service"
import { cn } from "@/lib/utils"
import { usePauseableToast, type PauseableToastEntry } from "@/hooks/usePauseableToast"
import { useTranslation } from "react-i18next"

interface Patient {
  accountId: number
  userId: number
  roleCode: string
  role: string
  id: string
  name: string
  username: string
  sex: "Male" | "Female" | null
  dob: string
  phone: string
  email: string
  enabled: boolean
  createdTime: string
  createdBy: string
  /** Bác sĩ — DOCTOR.specifications / qualifications / DOCTOR_DEPARTMENT */
  doctorSpecifications: string
  doctorQualifications: string
  doctorDepartmentIds: number[]
}

const EMPTY_PATIENT_DRAFT: Patient = {
  accountId: 0,
  userId: 0,
  roleCode: "PAT",
  role: "Patient",
  id: "",
  name: "",
  username: "",
  sex: null,
  dob: "",
  phone: "",
  email: "",
  enabled: true,
  createdTime: "",
  createdBy: "System",
  doctorSpecifications: "",
  doctorQualifications: "",
  doctorDepartmentIds: [],
}

type FormMode = "view" | "add" | "edit"

function normalizeDobForStorage(value: string): string {
  const s = String(value || "").trim()
  if (!s) return ""
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  const dmy = s.match(/^(\d{2})-(\d{2})-(\d{4})$/)
  if (dmy) return `${dmy[3]}-${dmy[2]}-${dmy[1]}`
  return s
}

function mapAccountToPatientRow(a: AdminAccountRow): Patient {
  const createdByDisplay =
    a.createdBy === null || a.createdBy === undefined ? "System" : String(a.createdBy)

  return {
    accountId: a.id,
    userId: a.userId,
    roleCode: a.roleCode || "",
    role: a.role || a.roleCode || "—",
    id: String(a.userId),
    name: a.name || "",
    username: a.username || "",
    sex: a.sex,
    dob: a.dob ? String(a.dob).slice(0, 10) : "",
    phone: a.phone || "",
    email: a.email || "",
    enabled: !!a.status,
    createdTime: a.createdTime ? String(a.createdTime).replace("T", " ").slice(0, 19) : "",
    createdBy: createdByDisplay,
    doctorSpecifications: a.doctorSpecifications ?? "",
    doctorQualifications: a.doctorQualifications ?? "",
    doctorDepartmentIds: Array.isArray(a.doctorDepartmentIds) ? [...a.doctorDepartmentIds] : [],
  }
}

export default function UserManagement() {
  const { t } = useTranslation()
  const { toast, isExiting, showSuccess, showError, onMouseEnter, onMouseLeave } = usePauseableToast()
  const ROLE_FILTER_OPTIONS = [
    { value: "ADM", label: t("layout.adminPortal") },
    { value: "DOC", label: t("layout.doctorPortal") },
    { value: "NUR", label: t("layout.nursePortal") },
    { value: "PAT", label: t("layout.patientPortal") },
    { value: "TEC", label: t("layout.technicianPortal") },
  ]
  const [patients, setPatients] = useState<Patient[]>([])
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null)
  const [formMode, setFormMode] = useState<FormMode>("view")
  const [draftPatient, setDraftPatient] = useState<Patient | null>(null)
  const [savingAccount, setSavingAccount] = useState(false)
  const [departments, setDepartments] = useState<AdminDepartmentOption[]>([])
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)  // 

  const [filters, setFilters] = useState({
    userId: "",
    name: "",
    username: "",
    roleCode: "",
    sex: "",
    dob: "",
    phone: "",
    email: "",
    enabled: "",
  })

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const res = await adminAccountService.getAccounts()
        if (cancelled) return
        const rows = (res.accounts || []).map(mapAccountToPatientRow)
        setPatients(rows)
        setSelectedPatient((prev) => {
          if (!prev) return rows[0] || null
          return rows.find((x) => x.accountId === prev.accountId) || rows[0] || null
        })
      } catch (e) {
        console.error("Load accounts failed:", e)
        showError(e instanceof Error ? e.message : t("admin.accounts.failedLoadAccounts"))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [showError])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const res = await adminAccountService.getDepartments()
        if (cancelled) return
        setDepartments(res.departments || [])
      } catch (e) {
        console.error("Load departments failed:", e)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (formMode === "view") {
      setDraftPatient(selectedPatient ? { ...selectedPatient } : null)
    }
  }, [selectedPatient, formMode])

  const filteredPatients = useMemo(() => {
    return patients.filter((p) =>
      String(p.userId).includes(filters.userId.trim()) &&
      p.name.toLowerCase().includes(filters.name.toLowerCase()) &&
      p.username.toLowerCase().includes(filters.username.toLowerCase()) &&
      (filters.roleCode === "" || p.roleCode === filters.roleCode) &&
      (filters.sex === "" || p.sex === filters.sex) &&
      p.dob.includes(filters.dob) &&
      p.phone.includes(filters.phone) &&
      p.email.toLowerCase().includes(filters.email.toLowerCase()) &&
      (filters.enabled === "" ||
        (filters.enabled === "active" ? p.enabled : !p.enabled))
    )
  }, [patients, filters])

  const totalPages = Math.max(1, Math.ceil(filteredPatients.length / pageSize))

  useEffect(() => setCurrentPage(1), [filters])

  const startItem = (currentPage - 1) * pageSize + 1
  const endItem = Math.min(currentPage * pageSize, filteredPatients.length)

  type ColumnKey = "no" | "role" | "userId" | "name" | "username" | "sex" | "dob" | "phone" | "email" | "enabled"

  const columns: {
    key: ColumnKey
    label: string
  }[] = [
    { key: "no", label: t("admin.accounts.no") },
    { key: "role", label: t("admin.accounts.role") },
    { key: "userId", label: t("admin.accounts.userId") },
    { key: "name", label: t("admin.accounts.name") },
    { key: "username", label: t("admin.accounts.username") },
    { key: "sex", label: t("admin.accounts.sex") },
    { key: "dob", label: t("admin.accounts.dob") },
    { key: "phone", label: t("admin.accounts.phone") },
    { key: "email", label: t("admin.accounts.email") },
    { key: "enabled", label: t("admin.accounts.active") },
  ]

  const allColumns = columns.map(c => c.key)

  const [visibleColumns, setVisibleColumns] = useState<ColumnKey[]>(allColumns)

  type SortKey = keyof Patient | "no"

  const columnWidthClass: Record<ColumnKey, string> = {
    no: "w-[30px] min-w-[30px]",
    role: "w-[80px] min-w-[80px]",
    userId: "w-[80px] min-w-[80px]",
    name: "w-[210px] min-w-[210px]",
    username: "w-[130px] min-w-[130px]",
    sex: "w-[90px] min-w-[90px]",
    dob: "w-[120px] min-w-[120px]",
    phone: "w-[130px] min-w-[130px]",
    email: "w-[170px] min-w-[170px]",
    enabled: "w-[95px] min-w-[95px]",
  }

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
    if (sortConfig?.key !== column) {
      return (
        <span className="ml-1 inline-flex text-slate-400">
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

  const renderFilterCell = (key: ColumnKey) => {
    switch (key) {
      case "no":
        return null

      case "userId":
        return (
          <div className="relative">
            <Search className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              value={filters.userId}
              onChange={e =>
                setFilters(f => ({ ...f, userId: e.target.value }))
              }
              onInput={e =>
                setFilters(f => ({ ...f, userId: (e.target as HTMLInputElement).value }))
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
              onInput={e =>
                setFilters(f => ({ ...f, name: (e.target as HTMLInputElement).value }))
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
              onInput={e =>
                setFilters(f => ({ ...f, username: (e.target as HTMLInputElement).value }))
              }
              className="h-8 text-xs pr-8"
            />
          </div>
        )

      case "role":
        return (
          <Select
            value={filters.roleCode || "ALL"}
            onValueChange={v =>
              setFilters(f => ({ ...f, roleCode: v === "ALL" ? "" : v }))
            }
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="All roles" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All roles</SelectItem>
              {ROLE_FILTER_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
              onInput={e =>
                setFilters(f => ({ ...f, dob: (e.target as HTMLInputElement).value }))
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
              onInput={e =>
                setFilters(f => ({ ...f, phone: (e.target as HTMLInputElement).value }))
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
              onInput={e =>
                setFilters(f => ({ ...f, email: (e.target as HTMLInputElement).value }))
              }
              className="h-8 text-xs pr-8"
            />
          </div>
        )

      case "enabled":
        return (
          <Select
            value={filters.enabled || "ALL"}
            onValueChange={v =>
              setFilters(f => ({ ...f, enabled: v === "ALL" ? "" : v }))
            }
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="All" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
        )

      default:
        return null
    }
  }

  const isEditing = formMode === "add" || formMode === "edit"
  const activePatient = isEditing ? draftPatient : selectedPatient
  const canAdd = formMode === "view"
  const canEdit = formMode === "view" && !!selectedPatient
  const canEditFields = isEditing
  const canSaveOrClearOrCancel = isEditing && !savingAccount

  const updateDraftField = <K extends keyof Patient>(key: K, value: Patient[K]) => {
    setDraftPatient((prev) => (prev ? { ...prev, [key]: value } : prev))
  }

  const toggleDoctorDepartment = (depId: number) => {
    setDraftPatient((prev) => {
      if (!prev) return prev
      const set = new Set(prev.doctorDepartmentIds)
      if (set.has(depId)) set.delete(depId)
      else set.add(depId)
      return { ...prev, doctorDepartmentIds: [...set].sort((a, b) => a - b) }
    })
  }

  const startAdd = () => {
    if (!canAdd) return
    setFormMode("add")
    setDraftPatient({ ...EMPTY_PATIENT_DRAFT })
  }

  const startEdit = () => {
    if (!selectedPatient || !canEdit) return
    setFormMode("edit")
    setDraftPatient({ ...selectedPatient })
  }

  const handleClear = () => {
    if (!canSaveOrClearOrCancel) return
    if (formMode === "add") {
      setDraftPatient({ ...EMPTY_PATIENT_DRAFT })
      return
    }
    setDraftPatient(selectedPatient ? { ...selectedPatient } : null)
  }

  const handleCancel = () => {
    if (!canSaveOrClearOrCancel) return
    setFormMode("view")
    setDraftPatient(selectedPatient ? { ...selectedPatient } : null)
  }

  const handleSave = async () => {
    if (!draftPatient || !canSaveOrClearOrCancel) return
    setSavingAccount(true)
    try {
      const payload: SaveAdminAccountPayload = {
        username: draftPatient.username.trim(),
        roleCode: (draftPatient.roleCode || "PAT") as "ADM" | "PAT" | "DOC" | "NUR" | "TEC",
        name: draftPatient.name.trim(),
        sex: draftPatient.sex,
        dob: normalizeDobForStorage(draftPatient.dob),
        phone: draftPatient.phone.trim(),
        email: draftPatient.email.trim(),
        enabled: !!draftPatient.enabled,
      }
      if (draftPatient.roleCode === "DOC") {
        payload.doctorSpecifications = draftPatient.doctorSpecifications
        payload.doctorQualifications = draftPatient.doctorQualifications
        payload.doctorDepartmentIds = [...draftPatient.doctorDepartmentIds]
      }

      const result =
        formMode === "add"
          ? await adminAccountService.createAccount(payload)
          : await adminAccountService.updateAccount(draftPatient.accountId, payload)

      const savedRow = mapAccountToPatientRow(result.account)
      if (formMode === "add") {
        setPatients((prev) => [savedRow, ...prev])
      } else {
        setPatients((prev) =>
          prev.map((x) => (x.accountId === savedRow.accountId ? savedRow : x))
        )
      }
      setSelectedPatient(savedRow)
      setDraftPatient({ ...savedRow })
      setFormMode("view")
      showSuccess(formMode === "add" ? "Account created successfully" : "Account updated successfully")
    } catch (e) {
      console.error("Save account failed:", e)
      showError(e instanceof Error ? e.message : "Failed to save account")
    } finally {
      setSavingAccount(false)
    }
  }

  const pauseableToast =
    toast &&
    typeof document !== "undefined" &&
    createPortal(
      <AdminPageToast
        toast={toast}
        isExiting={isExiting}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
      />,
      document.body
    )

  return (
  <>
  <AdminLayout>
    <div className="w-full max-w-none space-y-2">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 p-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <Checkbox
              label="Show All"
              checked={visibleColumns.length === allColumns.length}
              compact
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
                  compact
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

          <div className="flex flex-wrap items-center justify-end gap-2 ml-auto">
            <Button
              className="btn-gradient transition-transform duration-500 text-sm px-4 h-9"
              disabled={!canAdd}
              onClick={startAdd}
            >
              <UserPlus className="w-4 h-4 mr-2" /> Add
            </Button>
            <Button
              size="sm"
              className="btn-gradient transition-transform duration-500 text-sm px-4 h-9"
              disabled={!canEdit}
              onClick={startEdit}
            >
              <Edit3 className="w-4 h-4 mr-2" /> Edit
            </Button>
            <Button
              className="btn-outline transition-transform duration-500 text-sm px-4 h-9"
              disabled={!canSaveOrClearOrCancel}
              onClick={handleClear}
            ><Trash2 className="w-4 h-4 mr-2" /> Clear</Button>
            <Button
              className="btn-gradient transition-transform duration-500 text-sm px-4 h-9"
              disabled={!canSaveOrClearOrCancel}
              onClick={() => void handleSave()}
            ><Save className="w-4 h-4 mr-2" /> Save</Button>
            <Button
              className="btn-gradient transition-transform duration-500 text-sm px-4 h-9"
              disabled={!canSaveOrClearOrCancel}
              onClick={handleCancel}
            ><X className="w-4 h-4 mr-2" /> Cancel</Button>
          </div>
        </div>

        {/* 2-column grid */}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
          <Card className="flex flex-col h-[calc(100vh-120px)] min-h-[620px] xl:col-span-6">
            <CardContent className="flex-1 p-0 overflow-hidden">
              <div className="h-full overflow-y-auto">
                <Table className="table-fixed w-full min-w-[980px]">
                  {/* Fixed header */}
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
                            className={`cursor-pointer select-none whitespace-nowrap text-white transition ${columnWidthClass[col.key]}`}
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
                          <TableHead key={col.key} className={`px-2 py-2 ${columnWidthClass[col.key]}`}>
                            {renderFilterCell(col.key)}
                          </TableHead>
                        ) : null
                      )}
                    </TableRow>
                  </TableHeader>

                  <TableBody>
                    {paginatedPatients.map((patient, idx) => (
                      <TableRow key={patient.id} 
                        onClick={() => {
                          if (isEditing) return
                          setSelectedPatient(patient)
                        }} 
                        className={`cursor-pointer hover:bg-gray-100 ${
                          selectedPatient?.id === patient.id ? "bg-cyan-50" : ""
                        }`}
                      > 
                        <TableCell className={columnWidthClass.no}>{startItem + idx}</TableCell>

                        {visibleColumns.includes("role") && (
                          <TableCell className={columnWidthClass.role}>{patient.role}</TableCell>
                        )}

                        {visibleColumns.includes("userId") && (
                          <TableCell className={columnWidthClass.userId}>{patient.userId}</TableCell>
                        )}

                        {visibleColumns.includes("name") && (
                          <TableCell className={`${columnWidthClass.name} font-medium whitespace-nowrap overflow-hidden text-ellipsis`}>
                            {patient.name}
                          </TableCell>
                        )}

                        {visibleColumns.includes("username") && (
                          <TableCell className={columnWidthClass.username}>{patient.username}</TableCell>
                        )}

                        {visibleColumns.includes("sex") && (
                          <TableCell className={columnWidthClass.sex}>{patient.sex}</TableCell>
                        )}

                        {visibleColumns.includes("dob") && (
                          <TableCell className={columnWidthClass.dob}>{patient.dob}</TableCell>
                        )}

                        {visibleColumns.includes("phone") && (
                          <TableCell className={columnWidthClass.phone}>{patient.phone}</TableCell>
                        )}

                        {visibleColumns.includes("email") && (
                          <TableCell className={`${columnWidthClass.email} truncate max-w-xs`}>
                            {patient.email}
                          </TableCell>
                        )}

                        {visibleColumns.includes("enabled") && (
                          <TableCell className={columnWidthClass.enabled}>
                            <span className={patient.enabled ? "text-emerald-700 font-medium" : "text-rose-700 font-medium"}>
                              {patient.enabled ? "Active" : "Inactive"}
                            </span>
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

                  {/* Render results */}
                  <div className="text-gray-700 whitespace-nowrap">
                    Showing {startItem} to {endItem} of {filteredPatients.length} entries
                  </div>

                  {/* Pagination */}
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

                    {/* Page numbers */}
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

            </CardContent>
          </Card>
          {/* Patient details (only when selected) */}
          {activePatient ? (
            <Card className="h-[calc(100vh-120px)] min-h-[620px] overflow-y-auto xl:col-span-6">
              <CardHeader>
                <div className="flex justify-between items-center gap-3">
                  <CardTitle className="flex items-center gap-3">
                    <UserPlus className="w-6 h-6 text-gray-700" />
                    Account Information
                  </CardTitle>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!isEditing || savingAccount}
                    className={`relative w-30 overflow-hidden font-medium transition-all duration-200 border h-9
                      ${activePatient?.enabled
                        ? "bg-[#E9FFE9] hover:bg-[#388E3C] text-[#388E3C]"
                        : "bg-[#FFEBEB] hover:bg-[#D32F2F] text-[#D32F2F]"
                      }`}
                    onClick={() => {
                      if (!activePatient || !isEditing || savingAccount) return
                      const next = !activePatient.enabled
                      updateDraftField("enabled", next)
                    }}
                  >
                    <CheckCircle className="w-4 h-4 mr-2 transition-colors duration-200 group-hover:text-white" />
                    <span className="relative z-10 transition-colors duration-200 group-hover:text-white">
                      {activePatient?.enabled ? "Enabled" : "Disabled"}
                    </span>
                  </Button>
                </div>
              </CardHeader>

              <CardContent className="space-y-5">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Name</label>
                    <Input
                      id="name"
                      value={activePatient.name}
                      disabled={!canEditFields}
                      className="bg-gray-50"
                      onChange={(e) => updateDraftField("name", e.target.value)}
                      onInput={(e) => updateDraftField("name", (e.target as HTMLInputElement).value)}
                      onBlur={(e) => updateDraftField("name", e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Role</label>
                    {canEditFields ? (
                      <Select
                        value={activePatient.roleCode || "PAT"}
                        onValueChange={(v) => {
                          const selected = ROLE_FILTER_OPTIONS.find((x) => x.value === v)
                          setDraftPatient((prev) => {
                            if (!prev) return prev
                            const next: Patient = {
                              ...prev,
                              roleCode: v,
                              role: selected?.label || v,
                            }
                            if (v !== "DOC") {
                              next.doctorSpecifications = ""
                              next.doctorQualifications = ""
                              next.doctorDepartmentIds = []
                            }
                            return next
                          })
                        }}
                      >
                        <SelectTrigger className="bg-gray-50">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ROLE_FILTER_OPTIONS.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input value={activePatient.role} disabled className="bg-gray-50" />
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Username</label>
                    <Input
                      id="username"
                      value={activePatient.username}
                      disabled={!canEditFields}
                      className="bg-gray-50"
                      onChange={(e) => updateDraftField("username", e.target.value)}
                      onInput={(e) => updateDraftField("username", (e.target as HTMLInputElement).value)}
                      onBlur={(e) => updateDraftField("username", e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Password</label>
                    <Input id="password" type="password" value="********" disabled className="bg-gray-50" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Sex</label>
                    {canEditFields ? (
                      <Select
                        value={activePatient.sex || "UNKNOWN"}
                        onValueChange={(v) =>
                          updateDraftField("sex", v === "UNKNOWN" ? null : (v as "Male" | "Female"))
                        }
                      >
                        <SelectTrigger className="bg-gray-50">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="UNKNOWN">Unknown</SelectItem>
                          <SelectItem value="Male">Male</SelectItem>
                          <SelectItem value="Female">Female</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input value={activePatient.sex || ""} disabled className="bg-gray-50" />
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Date of Birth</label>
                    <Input
                      id="dob-picker"
                      type="date"
                      disabled={!canEditFields}
                      className="w-full bg-gray-50"
                      value={
                        /^\d{4}-\d{2}-\d{2}$/.test(normalizeDobForStorage(activePatient.dob))
                          ? normalizeDobForStorage(activePatient.dob)
                          : ""
                      }
                      onChange={(e) => updateDraftField("dob", e.target.value)}
                      onInput={(e) => updateDraftField("dob", (e.target as HTMLInputElement).value)}
                      onBlur={(e) => updateDraftField("dob", e.target.value)}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Phone Number</label>
                    <Input
                      id="phone"
                      value={activePatient.phone}
                      disabled={!canEditFields}
                      className="bg-gray-50"
                      onChange={(e) => updateDraftField("phone", e.target.value)}
                      onInput={(e) => updateDraftField("phone", (e.target as HTMLInputElement).value)}
                      onBlur={(e) => updateDraftField("phone", e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Email</label>
                    <Input
                      id="email"
                      value={activePatient.email}
                      disabled={!canEditFields}
                      className="bg-gray-50"
                      onChange={(e) => updateDraftField("email", e.target.value)}
                      onInput={(e) => updateDraftField("email", (e.target as HTMLInputElement).value)}
                      onBlur={(e) => updateDraftField("email", e.target.value)}
                    />
                  </div>
                </div>

                {activePatient.roleCode === "DOC" && (
                  <div className="space-y-4 rounded-lg border border-slate-200 bg-slate-50/80 p-4">
                    <div className="text-sm font-semibold text-slate-800">Doctor profile</div>
                    <p className="text-xs text-muted-foreground">
                      Mapped to <code className="text-[11px]">DOCTOR.specifications</code>,{" "}
                      <code className="text-[11px]">DOCTOR.qualifications</code>, and{" "}
                      <code className="text-[11px]">DOCTOR_DEPARTMENT</code>.
                    </p>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Specifications</label>
                      <Textarea
                        value={activePatient.doctorSpecifications}
                        disabled={!canEditFields}
                        className="bg-gray-50 min-h-[72px]"
                        placeholder="e.g. Cardiology, interventional procedures"
                        onChange={(e) => updateDraftField("doctorSpecifications", e.target.value)}
                        onInput={(e) => updateDraftField("doctorSpecifications", (e.target as HTMLTextAreaElement).value)}
                        onBlur={(e) => updateDraftField("doctorSpecifications", e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Qualifications</label>
                      <Textarea
                        value={activePatient.doctorQualifications}
                        disabled={!canEditFields}
                        className="bg-gray-50 min-h-[72px]"
                        placeholder="e.g. MD, board certifications"
                        onChange={(e) => updateDraftField("doctorQualifications", e.target.value)}
                        onInput={(e) => updateDraftField("doctorQualifications", (e.target as HTMLTextAreaElement).value)}
                        onBlur={(e) => updateDraftField("doctorQualifications", e.target.value)}
                      />
                    </div>
                    <div>
                      <div className="block text-sm font-medium text-gray-700 mb-2">Departments</div>
                      {departments.length === 0 ? (
                        <p className="text-xs text-muted-foreground">No departments loaded.</p>
                      ) : (
                        <div className="max-h-40 overflow-y-auto rounded-md border bg-white p-2 space-y-2">
                          {departments.map((d) => (
                            <div
                              key={d.id}
                              className={canEditFields ? "" : "pointer-events-none opacity-70"}
                            >
                              <Checkbox
                                label={d.name}
                                compact
                                checked={activePatient.doctorDepartmentIds.includes(d.id)}
                                onChange={() => {
                                  if (canEditFields) toggleDoctorDepartment(d.id)
                                }}
                              />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Trß║íng th├íi t├ái khoß║ún */}
                <div className="rounded-lg border-2 border-cyan-200 bg-gradient-to-br from-cyan-50 via-sky-50 to-indigo-50 p-4 space-y-3 shadow-sm">
                  <div className="text-sm font-semibold text-cyan-800">Audit Information</div>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <div className="text-cyan-700">Account ID</div>
                      <div className="font-semibold text-slate-900">{activePatient.accountId || "—"}</div>
                    </div>
                    <div>
                      <div className="text-cyan-700">User ID</div>
                      <div className="font-semibold text-slate-900">{activePatient.userId || "—"}</div>
                    </div>
                    <div>
                      <div className="text-cyan-700">Created Time</div>
                      <div className="font-semibold text-slate-900">{activePatient.createdTime || "—"}</div>
                    </div>
                    <div>
                      <div className="text-cyan-700">Created By</div>
                      <div className="font-semibold text-slate-900">{activePatient.createdBy || "—"}</div>
                    </div>
                    <div>
                      <div className="text-cyan-700">Current Mode</div>
                      <div className="font-semibold text-slate-900 uppercase">{formMode}</div>
                    </div>
                    <div>
                      <div className="text-cyan-700">Status</div>
                      <div className={`font-semibold ${activePatient.enabled ? "text-emerald-700" : "text-rose-700"}`}>
                        {activePatient.enabled ? "Enabled" : "Disabled"}
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : null}
        </div>
    </div>
  </AdminLayout>
  {pauseableToast}
  </>
  )
}

function AdminPageToast({
  toast,
  isExiting,
  onMouseEnter,
  onMouseLeave,
}: {
  toast: PauseableToastEntry
  isExiting: boolean
  onMouseEnter: () => void
  onMouseLeave: () => void
}) {
  const [entered, setEntered] = useState(false)

  useLayoutEffect(() => {
    setEntered(false)
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => setEntered(true))
    })
    return () => cancelAnimationFrame(id)
  }, [toast.id])

  const visible = entered && !isExiting

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "pointer-events-auto fixed bottom-6 left-6 z-[100] max-w-md rounded-lg border px-4 py-3 text-sm shadow-lg transition-opacity duration-300 ease-out",
        visible ? "opacity-100" : "opacity-0",
        toast.variant === "success" && "bg-[#34A853] text-white",
        toast.variant === "error" && "bg-[#EA4335] text-white"
      )}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {toast.message}
    </div>
  )
}
