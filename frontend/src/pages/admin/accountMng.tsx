// src/pages/reception/PatientManagement.tsx

import { useState, useEffect, useMemo, useLayoutEffect } from "react"
import { createPortal } from "react-dom"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { UserPlus, Trash2, Save, X, Edit3, ArrowUp, ArrowDown, ArrowUpDown, Search, Calendar as CalendarIcon } from "lucide-react"
import { AdminLayout } from "@/components/admin-layout"
import { Checkbox } from "@/components/ui/checkbox"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Calendar } from "@/components/ui/calendar"
import {
  adminAccountService,
  type AdminAccountRow,
  type AdminDepartmentOption,
  type SaveAdminAccountPayload,
} from "@/services/admin-account-service"
import { cn } from "@/lib/utils"
import { usePauseableToast, type PauseableToastEntry } from "@/hooks/usePauseableToast"
import { useTranslation } from "react-i18next"
import { format, isValid, parse } from "date-fns"
import { enUS, vi } from "date-fns/locale"
import { formatDdMmYyyyInput, parseDdMmYyyyStrict } from "@/lib/date-range"

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

function withCreatedByName(rows: Patient[]): Patient[] {
  const nameByUserId = new Map<number, string>()
  rows.forEach((row) => {
    nameByUserId.set(row.userId, row.name || row.username || "")
  })
  return rows.map((row) => {
    const creatorId = Number(row.createdBy)
    const creatorName =
      Number.isFinite(creatorId) && creatorId > 0 ? nameByUserId.get(creatorId) : ""
    return {
      ...row,
      createdBy: creatorName?.trim() || "System",
    }
  })
}

export default function UserManagement() {
  const { t, i18n } = useTranslation()
  const { toast, isExiting, showSuccess, showError, onMouseEnter, onMouseLeave } = usePauseableToast()
  const ROLE_FILTER_OPTIONS = [
    { value: "ADM", label: t("admin.accounts.roleFilter.admin") },
    { value: "DOC", label: t("admin.accounts.roleFilter.doctor") },
    { value: "NUR", label: t("admin.accounts.roleFilter.nurse") },
    { value: "PAT", label: t("admin.accounts.roleFilter.patient") },
    { value: "TEC", label: t("admin.accounts.roleFilter.technician") },
  ]
  const [patients, setPatients] = useState<Patient[]>([])
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null)
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false)
  const [selectedAccountIds, setSelectedAccountIds] = useState<number[]>([])
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
        const rows = withCreatedByName(
          (res.accounts || [])
            .filter((account) => account.status)
            .map(mapAccountToPatientRow)
        )
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

  type ColumnKey = "select" | "no" | "role" | "userId" | "name" | "username" | "sex" | "dob" | "phone" | "email" | "createdBy" | "enabled"

  const columns: {
    key: ColumnKey
    label: string
  }[] = [
    { key: "select", label: "" },
    { key: "no", label: t("admin.accounts.no") },
    { key: "role", label: t("admin.accounts.role") },
    { key: "userId", label: t("admin.accounts.userId") },
    { key: "name", label: t("admin.accounts.name") },
    { key: "username", label: t("admin.accounts.username") },
    { key: "sex", label: t("admin.accounts.sex") },
    { key: "dob", label: t("admin.accounts.dob") },
    { key: "phone", label: t("admin.accounts.phone") },
    { key: "email", label: t("admin.accounts.email") },
    { key: "createdBy", label: t("admin.accounts.createdBy") },
    { key: "enabled", label: t("admin.accounts.status") },
  ]

  const visibleColumns = columns.map(c => c.key)

  type SortKey = keyof Patient | "no"

  const columnWidthClass: Record<ColumnKey, string> = {
    select: "w-[64px] min-w-[64px]",
    no: "w-[30px] min-w-[30px]",
    role: "w-[142px] min-w-[142px]",
    userId: "w-[130px] min-w-[130px]",
    name: "w-[240px] min-w-[240px]",
    username: "w-[140px] min-w-[140px]",
    sex: "w-[90px] min-w-[90px]",
    dob: "w-[120px] min-w-[120px]",
    phone: "w-[130px] min-w-[130px]",
    email: "w-[170px] min-w-[170px]",
    createdBy: "w-[170px] min-w-[170px]",
    enabled: "w-[120px] min-w-[120px]",
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

  const paginatedAccountIds = useMemo(
    () => paginatedPatients.map((p) => p.accountId),
    [paginatedPatients]
  )
  const allCurrentPageSelected =
    paginatedAccountIds.length > 0 && paginatedAccountIds.every((id) => selectedAccountIds.includes(id))
  const someCurrentPageSelected =
    paginatedAccountIds.some((id) => selectedAccountIds.includes(id)) && !allCurrentPageSelected

  const toggleSelectOne = (accountId: number, checked: boolean) => {
    setSelectedAccountIds((prev) => {
      if (checked) return prev.includes(accountId) ? prev : [...prev, accountId]
      return prev.filter((id) => id !== accountId)
    })
  }

  const toggleSelectAllCurrentPage = (checked: boolean) => {
    setSelectedAccountIds((prev) => {
      if (checked) {
        const set = new Set([...prev, ...paginatedAccountIds])
        return [...set]
      }
      const pageSet = new Set(paginatedAccountIds)
      return prev.filter((id) => !pageSet.has(id))
    })
  }

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
      case "select":
        return null
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
              className="h-8 text-xs pr-8 border-slate-300 focus-visible:ring-1 focus-visible:ring-cyan-400"
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
              className="h-8 text-xs pr-8 border-slate-300 focus-visible:ring-1 focus-visible:ring-cyan-400"
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
              className="h-8 text-xs pr-8 border-slate-300 focus-visible:ring-1 focus-visible:ring-cyan-400"
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
            <SelectTrigger className="h-8 text-xs border-slate-300 focus-visible:ring-1 focus-visible:ring-cyan-400">
              <SelectValue placeholder={t("admin.accounts.roleFilter.all")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">{t("admin.accounts.roleFilter.all")}</SelectItem>
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
            <SelectTrigger className="h-8 text-xs border-slate-300 focus-visible:ring-1 focus-visible:ring-cyan-400">
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
            <CalendarIcon className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              value={filters.dob}
              onChange={e =>
                setFilters(f => ({ ...f, dob: e.target.value }))
              }
              onInput={e =>
                setFilters(f => ({ ...f, dob: (e.target as HTMLInputElement).value }))
              }
              className="h-8 text-xs pr-8 border-slate-300 focus-visible:ring-1 focus-visible:ring-cyan-400"
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
              className="h-8 text-xs pr-8 border-slate-300 focus-visible:ring-1 focus-visible:ring-cyan-400"
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
              className="h-8 text-xs pr-8 border-slate-300 focus-visible:ring-1 focus-visible:ring-cyan-400"
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
            <SelectTrigger className="h-8 text-xs border-slate-300 focus-visible:ring-1 focus-visible:ring-cyan-400">
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
  const canEdit = formMode === "view" && selectedAccountIds.length === 1
  const canEditFields = isEditing
  const canSubmitOrCancel = isEditing && !savingAccount
  const canDelete = formMode === "view" && selectedAccountIds.length > 0

  const calendarLocale = i18n.language?.startsWith("vi") ? vi : enUS
  const isViCalendar = i18n.language?.startsWith("vi")
  const dobCalendarClassName = cn(
    "p-3 sm:p-4",
    isViCalendar ? "[--cell-size:2.5rem] sm:[--cell-size:2.625rem]" : "[--cell-size:2.875rem] sm:[--cell-size:3.125rem]",
  )

  const activeDobYmd = useMemo(() => normalizeDobForStorage(activePatient?.dob || ""), [activePatient?.dob])
  const activeDobDate = useMemo(() => {
    if (!activeDobYmd || !/^\d{4}-\d{2}-\d{2}$/.test(activeDobYmd)) return undefined
    const d = parse(activeDobYmd, "yyyy-MM-dd", new Date())
    return isValid(d) ? d : undefined
  }, [activeDobYmd])

  const [dobText, setDobText] = useState("")
  useEffect(() => {
    setDobText(activeDobDate ? format(activeDobDate, "dd/MM/yyyy") : "")
  }, [activeDobDate])

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
    setIsDetailModalOpen(true)
  }

  const startEdit = () => {
    if (!canEdit) return
    const editTarget = patients.find((p) => p.accountId === selectedAccountIds[0]) || null
    if (!editTarget) return
    setFormMode("edit")
    setSelectedPatient(editTarget)
    setDraftPatient({ ...editTarget })
    setIsDetailModalOpen(true)
  }

  const handleResetDraft = () => {
    if (!canSubmitOrCancel) return
    if (formMode === "add") {
      setDraftPatient({ ...EMPTY_PATIENT_DRAFT })
      return
    }
    setDraftPatient(selectedPatient ? { ...selectedPatient } : null)
  }

  const handleCancel = () => {
    if (!canSubmitOrCancel) return
    setFormMode("view")
    setDraftPatient(selectedPatient ? { ...selectedPatient } : null)
    setIsDetailModalOpen(false)
  }

  const handleSubmit = async () => {
    if (!draftPatient || !canSubmitOrCancel) return
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
      const existingMap = new Map<number, string>(
        patients.map((p) => [p.userId, p.name || p.username || ""])
      )
      const creatorId = Number(savedRow.createdBy)
      if (Number.isFinite(creatorId) && creatorId > 0) {
        savedRow.createdBy = existingMap.get(creatorId)?.trim() || "System"
      } else {
        savedRow.createdBy = "System"
      }
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
      setIsDetailModalOpen(false)
      showSuccess(formMode === "add" ? "Account created successfully" : "Account updated successfully")
    } catch (e) {
      console.error("Save account failed:", e)
      showError(e instanceof Error ? e.message : "Failed to save account")
    } finally {
      setSavingAccount(false)
    }
  }

  const handleDelete = async () => {
    if (!canDelete) return
    const ids = selectedAccountIds
    if (!ids.length) return

    setSavingAccount(true)
    try {
      await Promise.all(ids.map((id) => adminAccountService.updateAccountStatus(id, false)))
      setPatients((prev) => prev.filter((p) => !ids.includes(p.accountId)))
      setSelectedAccountIds((prev) => prev.filter((id) => !ids.includes(id)))
      setSelectedPatient((prev) => (prev && ids.includes(prev.accountId) ? null : prev))
      showSuccess(ids.length > 1 ? "Selected accounts deleted" : "Account deleted")
    } catch (e) {
      console.error("Delete account failed:", e)
      showError(e instanceof Error ? e.message : "Failed to delete account")
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
          <div className="flex flex-wrap items-center justify-end gap-2 ml-auto">
            <Button
              className="btn-gradient transition-transform duration-500 text-sm px-4 h-9"
              disabled={!canAdd}
              onClick={startAdd}
            >
              <UserPlus className="w-4 h-4 mr-2" /> {t("admin.accounts.add")}
            </Button>
            <Button
              size="sm"
              className="btn-gradient transition-transform duration-500 text-sm px-4 h-9"
              disabled={!canEdit}
              onClick={startEdit}
            >
              <Edit3 className="w-4 h-4 mr-2" /> {t("admin.accounts.edit")}
            </Button>
            <Button
              className="btn-outline transition-transform duration-500 text-sm px-4 h-9"
              disabled={!canDelete || savingAccount}
              onClick={() => void handleDelete()}
            ><Trash2 className="w-4 h-4 mr-2" /> {t("admin.accounts.delete")}</Button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4">
          <Card className="flex flex-col">
            <CardContent className="p-0 overflow-hidden">
              <div className="flex flex-col rounded-xl border border-slate-200 bg-white overflow-hidden">
                <div className="w-full overflow-x-auto">
                  <div className="min-w-[1546px]">
                    <table className="table-fixed w-[1546px] caption-bottom text-sm">
                      <TableHeader
                        className="z-20 text-white"
                        style={{
                          background: "linear-gradient(135deg, #06b6d4 0%, #0891b2 100%)"
                        }}
                      >
                        <TableRow>
                          {columns.map(col =>
                            visibleColumns.includes(col.key) ? (
                              <TableHead
                                key={col.key}
                                onClick={col.key === "select" ? undefined : () => handleSort(col.key as SortKey)}
                                className={cn(
                                  "select-none whitespace-nowrap text-white transition",
                                  col.key !== "select" && "cursor-pointer",
                                  columnWidthClass[col.key]
                                )}
                              >
                                {col.label}
                                {col.key !== "select" && <SortIcon column={col.key as SortKey} />}
                              </TableHead>
                            ) : null
                          )}
                        </TableRow>
                        <TableRow className="border-b hover:bg-white transition-colors">
                          {columns.map(col =>
                            visibleColumns.includes(col.key) ? (
                              <TableHead key={col.key} className={`px-2 py-2 ${columnWidthClass[col.key]}`}>
                                {col.key === "select" ? (
                                  <Checkbox
                                    checked={allCurrentPageSelected || someCurrentPageSelected}
                                    label=""
                                    compact
                                    onChange={(checked) => toggleSelectAllCurrentPage(checked)}
                                  />
                                ) : (
                                  renderFilterCell(col.key)
                                )}
                              </TableHead>
                            ) : null
                          )}
                        </TableRow>
                      </TableHeader>
                    </table>

                    <div
                      className="overflow-y-auto overflow-x-hidden overscroll-y-contain h-[360px]"
                      onWheel={(e) => e.stopPropagation()}
                    >
                      <table className="table-fixed w-[1546px] caption-bottom text-sm">
                        <TableBody>
                          {paginatedPatients.map((patient, idx) => (
                            <TableRow key={patient.id}
                              onClick={() => {
                                setSelectedPatient(patient)
                                setFormMode("view")
                                setDraftPatient({ ...patient })
                                setIsDetailModalOpen(true)
                              }}
                              className={`cursor-pointer hover:bg-gray-100 ${
                                selectedPatient?.id === patient.id ? "bg-cyan-50" : ""
                              }`}
                            >
                              {visibleColumns.includes("select") && (
                                <TableCell className={columnWidthClass.select}>
                                  <div onClick={(e) => e.stopPropagation()}>
                                    <Checkbox
                                      checked={selectedAccountIds.includes(patient.accountId)}
                                      label=""
                                      compact
                                      onChange={(checked) => toggleSelectOne(patient.accountId, checked)}
                                    />
                                  </div>
                                </TableCell>
                              )}

                              {visibleColumns.includes("no") && (
                                <TableCell className={columnWidthClass.no}>{startItem + idx}</TableCell>
                              )}

                              {visibleColumns.includes("role") && (
                                <TableCell className={columnWidthClass.role}>{patient.role}</TableCell>
                              )}

                              {visibleColumns.includes("userId") && (
                                <TableCell className={`${columnWidthClass.userId} whitespace-nowrap overflow-hidden text-ellipsis`}>
                                  {patient.userId}
                                </TableCell>
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

                              {visibleColumns.includes("createdBy") && (
                                <TableCell className={`${columnWidthClass.createdBy} whitespace-nowrap overflow-hidden text-ellipsis`}>
                                  {patient.createdBy || "System"}
                                </TableCell>
                              )}

                              {visibleColumns.includes("enabled") && (
                                <TableCell className={columnWidthClass.enabled}>
                                  <span className={patient.enabled ? "text-emerald-700 font-medium" : "text-rose-700 font-medium"}>
                                    {patient.enabled ? t("admin.accounts.active") : t("admin.accounts.inactive")}
                                  </span>
                                </TableCell>
                              )}
                            </TableRow>
                          ))}
                        </TableBody>
                      </table>
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-start gap-3 px-4 py-2 bg-gray-50 border-t text-xs rounded-b-xl">
                  {/* Show X entries */}
                  <div className="flex items-center gap-2">
                    <span className="text-gray-700 whitespace-nowrap">Show</span>
                    <Select value={pageSize.toString()} onValueChange={(v) => {
                      setPageSize(Number(v))
                      setCurrentPage(1)
                    }}>
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
                      className="btn-outline h-8 px-2.5 text-xs"
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
                      onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                      className="btn-outline h-8 px-2.5 text-xs"
                    >
                      Next
                    </Button>
                  </div>
                </div>
              </div>

            </CardContent>
          </Card>
          {activePatient && (
            <Dialog
              open={isDetailModalOpen}
              onOpenChange={(open) => {
                setIsDetailModalOpen(open)
                if (!open) {
                  setFormMode("view")
                  setDraftPatient(selectedPatient ? { ...selectedPatient } : null)
                }
              }}
            >
              <DialogContent className="w-[96vw] max-w-4xl max-h-[90vh] p-0 flex flex-col overflow-hidden">
                <DialogHeader className="border-b px-6 py-4 shrink-0">
                  <div className="flex flex-wrap justify-between items-center gap-3">
                    <DialogTitle className="flex items-center gap-3">
                      <UserPlus className="w-6 h-6 text-gray-700" />
                      {activePatient.roleCode === "DOC" ? "Doctor Account Information" : `${activePatient.role || "User"} Account Information`}
                    </DialogTitle>
                  </div>
                </DialogHeader>
                <div className="space-y-5 px-6 py-5 overflow-y-auto">
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
                    <div className="relative min-w-0">
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            disabled={!canEditFields}
                            className="absolute right-1 top-1/2 h-8 w-8 -translate-y-1/2 rounded-md text-slate-500 shadow-none hover:bg-slate-100 hover:text-slate-800 disabled:opacity-50"
                            aria-label="Open date of birth calendar"
                          >
                            <CalendarIcon className="h-4 w-4" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent
                          align="start"
                          className="w-auto max-w-[calc(100vw-1rem)] rounded-xl border border-slate-200/80 p-0 shadow-md"
                        >
                          <Calendar
                            mode="single"
                            locale={calendarLocale}
                            className={dobCalendarClassName}
                            selected={activeDobDate}
                            onSelect={(d) => {
                              if (!d || !canEditFields) return
                              updateDraftField("dob", format(d, "yyyy-MM-dd"))
                              setDobText(format(d, "dd/MM/yyyy"))
                            }}
                            captionLayout="dropdown"
                          />
                        </PopoverContent>
                      </Popover>
                      <Input
                        id="dob-picker"
                        type="text"
                        inputMode="numeric"
                        autoComplete="off"
                        placeholder="dd/mm/yyyy"
                        disabled={!canEditFields}
                        className="w-full bg-gray-50 pr-10"
                        value={dobText}
                        onChange={(e) => {
                          if (!canEditFields) return
                          const nextText = formatDdMmYyyyInput(e.target.value)
                          setDobText(nextText)
                          if (nextText === "") {
                            updateDraftField("dob", "")
                            return
                          }
                          if (nextText.length === 10) {
                            const d = parseDdMmYyyyStrict(nextText)
                            if (d) updateDraftField("dob", format(d, "yyyy-MM-dd"))
                          }
                        }}
                        onBlur={() => {
                          // If user leaves incomplete/invalid input, snap back to stored value.
                          if (!canEditFields) return
                          if (dobText && (dobText.length !== 10 || !parseDdMmYyyyStrict(dobText))) {
                            setDobText(activeDobDate ? format(activeDobDate, "dd/MM/yyyy") : "")
                          }
                        }}
                      />
                    </div>
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

                </div>
                {isEditing && (
                  <div className="border-t px-6 py-3 flex items-center justify-end gap-2 shrink-0 bg-white">
                    <Button
                      size="sm"
                      className="btn-outline text-sm h-8 px-3"
                      disabled={!canSubmitOrCancel}
                      onClick={handleCancel}
                    >
                      <X className="w-4 h-4 mr-1.5" /> Cancel
                    </Button>
                    <Button
                      size="sm"
                      className="btn-gradient text-sm h-8 px-3"
                      disabled={!canSubmitOrCancel}
                      onClick={() => void handleSubmit()}
                    >
                      <Save className="w-4 h-4 mr-1.5" /> Submit
                    </Button>
                  </div>
                )}
              </DialogContent>
            </Dialog>
          )}
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
