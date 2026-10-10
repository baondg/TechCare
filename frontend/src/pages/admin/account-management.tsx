// src/pages/reception/PatientManagement.tsx

import { useState, useEffect, useMemo, useLayoutEffect, useCallback } from "react"
import { createPortal } from "react-dom"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { UserPlus, Save, X, ArrowUp, ArrowDown, ArrowUpDown, Search, Calendar as CalendarIcon, KeyRound } from "lucide-react"
import { TemporaryPasswordDialog, type IssuedPassword } from "@/components/admin/temporary-password-dialog"
import { useAuth } from "@/contexts/auth-context"
import { AdminLayout } from "@/components/admin-layout"
import { Checkbox } from "@/components/ui/checkbox"
import { Switch } from "@/components/ui/switch"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Calendar } from "@/components/ui/calendar"
import {
  adminAccountService,
  type AdminAccountRow,
  type AdminDepartmentOption,
  type SaveAdminAccountPayload,
} from "@/services/admin-account-service"
import { cn } from "@/lib/utils"
import { usePauseableToast, type PauseableToastEntry } from "@/hooks/use-pauseable-toast"
import { useTranslation } from "react-i18next"
import { differenceInYears, format, isValid, parse, startOfDay } from "date-fns"
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

/** Completed full years from today; null if missing or not a valid calendar Y-M-D. */
function completedAgeYearsFromDob(dobRaw: string): number | null {
  const ymd = normalizeDobForStorage(dobRaw)
  if (!ymd || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null
  const birth = parse(ymd, "yyyy-MM-dd", new Date())
  if (!isValid(birth)) return null
  return differenceInYears(new Date(), birth)
}

/** Date of birth must be strictly before the current calendar day (local). */
function isDobYmdBeforeToday(ymdRaw: string): boolean {
  const ymd = normalizeDobForStorage(ymdRaw)
  if (!ymd || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return false
  const birth = parse(ymd, "yyyy-MM-dd", new Date())
  if (!isValid(birth)) return false
  return startOfDay(birth).getTime() < startOfDay(new Date()).getTime()
}

function isDateBeforeToday(d: Date): boolean {
  return isValid(d) && startOfDay(d).getTime() < startOfDay(new Date()).getTime()
}

function mapAccountToPatientRow(a: AdminAccountRow): Patient {
  const createdByDisplay =
    a.createdByName?.trim() ||
    (a.createdBy === null || a.createdBy === undefined ? "System" : String(a.createdBy))

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

function departmentIdsEqual(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false
  const sortedA = [...a].sort((x, y) => x - y)
  const sortedB = [...b].sort((x, y) => x - y)
  return sortedA.every((id, i) => id === sortedB[i])
}

function hasProfileChangesBetween(original: Patient, draft: Patient): boolean {
  if (original.name.trim() !== draft.name.trim()) return true
  if (original.sex !== draft.sex) return true
  if (normalizeDobForStorage(original.dob) !== normalizeDobForStorage(draft.dob)) return true
  if (original.phone.trim() !== draft.phone.trim()) return true
  if (original.email.trim() !== draft.email.trim()) return true
  if (original.enabled !== draft.enabled) return true
  if (original.roleCode === "DOC") {
    if (original.doctorSpecifications.trim() !== draft.doctorSpecifications.trim()) return true
    if (original.doctorQualifications.trim() !== draft.doctorQualifications.trim()) return true
    if (!departmentIdsEqual(original.doctorDepartmentIds, draft.doctorDepartmentIds)) return true
  }
  return false
}

export default function UserManagement() {
  const { t, i18n } = useTranslation()
  const { toast, isExiting, showSuccess, showError, onMouseEnter, onMouseLeave } = usePauseableToast()
  const { user: currentUser } = useAuth()
  const [issuedPassword, setIssuedPassword] = useState<IssuedPassword | null>(null)
  const [resettingPassword, setResettingPassword] = useState(false)
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
  const [formMode, setFormMode] = useState<FormMode>("view")
  const [draftPatient, setDraftPatient] = useState<Patient | null>(null)
  const [savingAccount, setSavingAccount] = useState(false)
  const [departments, setDepartments] = useState<AdminDepartmentOption[]>([])
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)  // 
  const [totalEntries, setTotalEntries] = useState(0)

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

  const [sortConfig, setSortConfig] = useState<{
    key: keyof Patient | "no"
    direction: "asc" | "desc"
  } | null>(null)

  const loadAccounts = useCallback(async (cancelRef: { cancelled: boolean }) => {
    const sortBy =
      sortConfig?.key === "no" || !sortConfig?.key ? "createdTime" : String(sortConfig.key)
    const sortDirection = sortConfig?.direction || "desc"
    const res = await adminAccountService.getAccounts({
      page: currentPage,
      limit: pageSize,
      userId: filters.userId,
      name: filters.name,
      username: filters.username,
      roleCode: filters.roleCode,
      sex: filters.sex,
      dob: filters.dob,
      phone: filters.phone,
      email: filters.email,
      enabled: filters.enabled,
      sortBy,
      sortDirection,
    })
    if (cancelRef.cancelled) return
    const rows = (res.accounts || []).map(mapAccountToPatientRow)
    setPatients(rows)
    setTotalEntries(Number(res.pagination?.total || 0))
    setSelectedPatient((prev) => {
      if (!prev) return rows[0] || null
      return rows.find((x) => x.accountId === prev.accountId) || rows[0] || null
    })
  }, [currentPage, pageSize, filters, sortConfig])

  useEffect(() => {
    const cancelRef = { cancelled: false }
    void (async () => {
      try {
        await loadAccounts(cancelRef)
      } catch (e) {
        console.error("Load accounts failed:", e)
        showError(e instanceof Error ? e.message : t("admin.accounts.failedLoadAccounts"))
      }
    })()
    return () => {
      cancelRef.cancelled = true
    }
  }, [loadAccounts, showError, t])

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

  const totalPages = Math.max(1, Math.ceil(totalEntries / pageSize))

  useEffect(() => setCurrentPage(1), [filters])
  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages)
  }, [currentPage, totalPages])

  const startItem = (currentPage - 1) * pageSize + 1
  const endItem = Math.min(currentPage * pageSize, totalEntries)

  type ColumnKey = "no" | "role" | "userId" | "name" | "username" | "sex" | "dob" | "phone" | "email" | "createdBy" | "enabled"

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
    { key: "createdBy", label: t("admin.accounts.createdBy") },
    { key: "enabled", label: t("admin.accounts.status") },
  ]

  const visibleColumns = columns.map(c => c.key)

  type SortKey = keyof Patient | "no"

  const columnWidthClass: Record<ColumnKey, string> = {
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
  const canEditProfileFields = formMode === "add" || formMode === "edit"
  const canEditRoleFields = formMode === "add"
  const canToggleAccountStatus = formMode === "add" || formMode === "edit"
  const canSubmitOrCancel = isEditing && !savingAccount
  const hasEditProfileChange =
    formMode === "edit" &&
    !!selectedPatient &&
    !!draftPatient &&
    hasProfileChangesBetween(selectedPatient, draftPatient)
  const canSubmitForm =
    canSubmitOrCancel && (formMode === "add" || hasEditProfileChange)
  const calendarLocale = i18n.language?.startsWith("vi") ? vi : enUS
  const isViCalendar = i18n.language?.startsWith("vi")
  const dobCalendarClassName = cn(
    "p-3 sm:p-4",
    isViCalendar ? "[--cell-size:2.5rem] sm:[--cell-size:2.625rem]" : "[--cell-size:2.875rem] sm:[--cell-size:3.125rem]",
  )
  const isDobCalendarDayDisabled = (d: Date) => startOfDay(d).getTime() >= startOfDay(new Date()).getTime()

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

  const openUserEdit = (patient: Patient) => {
    setFormMode("edit")
    setSelectedPatient(patient)
    setDraftPatient({ ...patient })
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

  const validateDraftDob = (dob: string): boolean => {
    const ageYears = completedAgeYearsFromDob(dob)
    if (ageYears === null) {
      showError(t("admin.accounts.invalidDob"))
      return false
    }
    if (!isDobYmdBeforeToday(dob)) {
      showError(t("admin.accounts.dobMustBeBeforeToday"))
      return false
    }
    if (ageYears <= 1) {
      showError(t("admin.accounts.ageMustBeGreaterThanOne"))
      return false
    }
    return true
  }

  const handleSubmit = async () => {
    if (!draftPatient || !canSubmitOrCancel || !canSubmitForm) return
    if (!validateDraftDob(draftPatient.dob)) return
    if (formMode === "edit" && (!selectedPatient || !hasEditProfileChange)) return

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

      if (formMode === "edit") {
        await adminAccountService.updateAccount(draftPatient.userId, payload)
        await loadAccounts({ cancelled: false })
        setFormMode("view")
        setIsDetailModalOpen(false)
        showSuccess(t("admin.accounts.profileUpdated"))
        return
      }

      const created = await adminAccountService.createAccount(payload)
      await loadAccounts({ cancelled: false })
      setFormMode("view")
      setIsDetailModalOpen(false)
      showSuccess("Account created successfully")
      setIssuedPassword({ username: draftPatient.username, password: created.temporaryPassword })
    } catch (e) {
      console.error("Save account failed:", e)
      showError(e instanceof Error ? e.message : "Failed to save account")
    } finally {
      setSavingAccount(false)
    }
  }

  const handleResetPassword = async (account: Patient) => {
    if (!window.confirm(t("admin.accounts.resetPasswordConfirm", { username: account.username }))) return
    setResettingPassword(true)
    try {
      const { temporaryPassword } = await adminAccountService.resetPassword(account.userId)
      setIssuedPassword({ username: account.username, password: temporaryPassword })
    } catch (e) {
      showError(e instanceof Error ? e.message : "Failed to reset password")
    } finally {
      setResettingPassword(false)
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
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4">
          <Card className="flex flex-col">
            <CardContent className="p-0 overflow-hidden">
              <div className="flex flex-col rounded-xl border border-slate-200 bg-white overflow-hidden">
                <div className="w-full overflow-x-auto">
                  <div className="min-w-[1482px]">
                    <table className="table-fixed w-[1482px] caption-bottom text-sm">
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
                                onClick={() => handleSort(col.key as SortKey)}
                                className={cn(
                                  "cursor-pointer select-none whitespace-nowrap text-white transition",
                                  columnWidthClass[col.key],
                                )}
                              >
                                {col.label}
                                <SortIcon column={col.key as SortKey} />
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
                    </table>

                    <div
                      className="overflow-y-auto overflow-x-hidden overscroll-y-contain h-[360px]"
                      onWheel={(e) => e.stopPropagation()}
                    >
                      <table className="table-fixed w-[1482px] caption-bottom text-sm">
                        <TableBody>
                          {patients.map((patient, idx) => (
                            <TableRow
                              key={patient.accountId}
                              onClick={() => openUserEdit(patient)}
                              className={cn(
                                "cursor-pointer hover:bg-gray-100",
                                selectedPatient?.accountId === patient.accountId && isDetailModalOpen && "bg-cyan-50",
                              )}
                            >
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
                    Showing {totalEntries === 0 ? 0 : startItem} to {endItem} of {totalEntries} entries
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
              <DialogContent
                className="w-[96vw] max-w-4xl max-h-[90vh] p-0 flex flex-col overflow-hidden"
                onOpenAutoFocus={(e) => e.preventDefault()}
              >
                <DialogHeader className="border-b px-6 py-4 shrink-0">
                  <div className="flex flex-wrap justify-between items-center gap-3">
                    <DialogTitle className="flex items-center gap-3">
                      <UserPlus className="w-6 h-6 text-gray-700" />
                      {formMode === "add"
                        ? t("admin.accounts.add")
                        : formMode === "edit"
                          ? t("admin.accounts.edit")
                          : activePatient.roleCode === "DOC"
                            ? "Doctor Account Information"
                            : `${activePatient.role || "User"} Account Information`}
                    </DialogTitle>
                    <DialogDescription className="sr-only">
                      {formMode === "add"
                        ? "Create a new user account"
                        : formMode === "edit"
                          ? "Edit user account status and details"
                          : "View user account details"}
                    </DialogDescription>
                  </div>
                </DialogHeader>
                <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain space-y-5 px-6 py-5">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Name</label>
                    <Input
                      id="name"
                      value={activePatient.name}
                      disabled={!canEditProfileFields}
                      className="bg-gray-50"
                      onChange={(e) => updateDraftField("name", e.target.value)}
                      onInput={(e) => updateDraftField("name", (e.target as HTMLInputElement).value)}
                      onBlur={(e) => updateDraftField("name", e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Role</label>
                    {canEditRoleFields ? (
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
                      disabled={!canEditProfileFields}
                      className="bg-gray-50"
                      onChange={(e) => updateDraftField("username", e.target.value)}
                      onInput={(e) => updateDraftField("username", (e.target as HTMLInputElement).value)}
                      onBlur={(e) => updateDraftField("username", e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Password</label>
                    {formMode === "add" ? (
                      <p className="text-sm text-muted-foreground py-2">{t("admin.accounts.passwordGeneratedOnCreate")}</p>
                    ) : (
                      <div className="flex gap-2">
                        <Input id="password" type="password" value="********" disabled className="bg-gray-50" />
                        <Button
                          type="button"
                          variant="outline"
                          disabled={
                            formMode !== "view" || resettingPassword || activePatient.userId === currentUser?.id
                          }
                          onClick={() => void handleResetPassword(activePatient)}
                        >
                          <KeyRound className="w-4 h-4 mr-1.5" />
                          {t("admin.accounts.resetPassword")}
                        </Button>
                      </div>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Sex</label>
                    {canEditProfileFields ? (
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
                            disabled={!canEditProfileFields}
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
                            disabled={isDobCalendarDayDisabled}
                            onSelect={(d) => {
                              if (!d || !canEditProfileFields) return
                              if (!isDateBeforeToday(d)) return
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
                        disabled={!canEditProfileFields}
                        className="w-full bg-gray-50 pr-10"
                        value={dobText}
                        onChange={(e) => {
                          if (!canEditProfileFields) return
                          const nextText = formatDdMmYyyyInput(e.target.value)
                          setDobText(nextText)
                          if (nextText === "") {
                            updateDraftField("dob", "")
                            return
                          }
                          if (nextText.length === 10) {
                            const d = parseDdMmYyyyStrict(nextText)
                            if (d && isDateBeforeToday(d)) updateDraftField("dob", format(d, "yyyy-MM-dd"))
                            else if (d && !isDateBeforeToday(d)) updateDraftField("dob", "")
                          }
                        }}
                        onBlur={() => {
                          if (!canEditProfileFields) return
                          if (dobText.length === 10) {
                            const d = parseDdMmYyyyStrict(dobText)
                            if (d && !isDateBeforeToday(d)) {
                              setDobText("")
                              updateDraftField("dob", "")
                              return
                            }
                          }
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
                      disabled={!canEditProfileFields}
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
                      disabled={!canEditProfileFields}
                      className="bg-gray-50"
                      onChange={(e) => updateDraftField("email", e.target.value)}
                      onInput={(e) => updateDraftField("email", (e.target as HTMLInputElement).value)}
                      onBlur={(e) => updateDraftField("email", e.target.value)}
                    />
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50/60 px-4 py-3">
                  <div>
                    <div className="text-sm font-medium text-gray-800">{t("admin.accounts.accountStatus")}</div>
                    <p className="text-xs text-muted-foreground">{t("admin.accounts.accountStatusHint")}</p>
                  </div>
                  {canToggleAccountStatus ? (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-600">
                        {activePatient.enabled ? t("admin.accounts.active") : t("admin.accounts.inactive")}
                      </span>
                      <Switch
                        checked={activePatient.enabled}
                        disabled={
                          savingAccount ||
                          (String(activePatient.roleCode || "").toUpperCase() === "ADM" && activePatient.enabled)
                        }
                        onCheckedChange={(v) => updateDraftField("enabled", v)}
                        aria-label={t("admin.accounts.accountStatus")}
                      />
                    </div>
                  ) : (
                    <span
                      className={
                        activePatient.enabled ? "text-sm font-medium text-emerald-700" : "text-sm font-medium text-rose-700"
                      }
                    >
                      {activePatient.enabled ? t("admin.accounts.active") : t("admin.accounts.inactive")}
                    </span>
                  )}
                </div>

                {activePatient.roleCode === "DOC" && (
                  <div className="space-y-4 rounded-lg border border-slate-200 bg-slate-50/80 p-4">
                    <div className="text-sm font-semibold text-slate-800">Doctor profile</div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Specifications</label>
                      <Textarea
                        value={activePatient.doctorSpecifications}
                        disabled={!canEditProfileFields}
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
                        disabled={!canEditProfileFields}
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
                              className={canEditProfileFields ? "" : "pointer-events-none opacity-70"}
                            >
                              <Checkbox
                                label={d.name}
                                compact
                                checked={activePatient.doctorDepartmentIds.includes(d.id)}
                                onChange={() => {
                                  if (canEditProfileFields) toggleDoctorDepartment(d.id)
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
                      disabled={!canSubmitForm}
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
  <TemporaryPasswordDialog issued={issuedPassword} onClose={() => setIssuedPassword(null)} />
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
        "pointer-events-auto fixed bottom-5 right-5 z-[118] max-w-md rounded-lg border px-4 py-3 text-sm shadow-lg transition-opacity duration-300 ease-out",
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
