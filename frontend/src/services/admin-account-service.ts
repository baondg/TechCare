import { apiClient } from "@/api/client"

export interface AdminAccountRow {
  id: number
  userId: number
  username: string
  roleCode: string
  role: string
  status: boolean
  createdTime: string | null
  createdBy: number | null
  nationalId: string
  name: string
  sex: "Male" | "Female" | null
  dob: string | null
  phone: string
  email: string
  doctorId?: number | null
  doctorSpecifications?: string
  doctorQualifications?: string
  doctorDepartmentIds?: number[]
}

export interface SaveAdminAccountPayload {
  username: string
  roleCode: "ADM" | "PAT" | "DOC" | "NUR" | "TEC"
  name: string
  sex: "Male" | "Female" | null
  dob: string
  phone: string
  email: string
  enabled: boolean
  /** Chỉ dùng khi roleCode === "DOC" — map tới DOCTOR / DOCTOR_DEPARTMENT */
  doctorSpecifications?: string
  doctorQualifications?: string
  doctorDepartmentIds?: number[]
}

export interface AdminDepartmentOption {
  id: number
  name: string
}

export interface AdminAccountQuery {
  page?: number
  limit?: number
  userId?: string
  name?: string
  username?: string
  roleCode?: string
  sex?: string
  dob?: string
  phone?: string
  email?: string
  enabled?: string
  sortBy?: string
  sortDirection?: "asc" | "desc"
}

export interface AdminDashboardSummary {
  totalUsers: number
  activeUsers: number
  inactiveUsers: number
  systemStatus: "Healthy" | "Degraded" | string
  roleBreakdown: Array<{
    roleCode: string
    roleLabel: string
    total: number
  }>
  recentActivity: Array<{
    id: number
    message: string
    createdTime: string | null
    status: "Enabled" | "Disabled" | string
  }>
}

export interface AdminFeedbackRow {
  id: number
  userId: number
  username: string
  userName: string
  roleCode: string
  role: string
  type: string
  content: string
  rating: number
  time: string | null
  status: boolean
  response: string
}

export const adminAccountService = {
  async getAccounts(query: AdminAccountQuery = {}) {
    const params = new URLSearchParams()
    Object.entries(query).forEach(([key, value]) => {
      if (value === undefined || value === null) return
      const normalized = String(value).trim()
      if (!normalized) return
      params.set(key, normalized)
    })
    const qs = params.toString()
    return apiClient.get<{
      success: boolean
      accounts: AdminAccountRow[]
      pagination: { page: number; limit: number; total: number; totalPages: number }
    }>(`/api/admin/accounts${qs ? `?${qs}` : ""}`)
  },

  async getDepartments() {
    return apiClient.get<{ success: boolean; departments: AdminDepartmentOption[] }>(
      "/api/admin/departments"
    )
  },

  async updateAccountStatus(id: number, status: boolean) {
    return apiClient.patch<{ success: boolean; id: number; status: boolean }>(
      `/api/admin/accounts/${id}/status`,
      { status }
    )
  },

  async createAccount(data: SaveAdminAccountPayload) {
    return apiClient.post<{ success: boolean; account: AdminAccountRow }>("/api/admin/accounts", data)
  },

  async updateAccount(id: number, data: SaveAdminAccountPayload) {
    return apiClient.patch<{ success: boolean; account: AdminAccountRow }>(
      `/api/admin/accounts/${id}`,
      data
    )
  },

  async getDashboardSummary() {
    return apiClient.get<{ success: boolean; summary: AdminDashboardSummary }>(
      "/api/admin/dashboard-summary"
    )
  },

  async getFeedbacks() {
    return apiClient.get<{ success: boolean; feedbacks: AdminFeedbackRow[] }>("/api/admin/feedbacks")
  },

  async updateFeedback(id: number, payload: { response?: string; status?: boolean }) {
    return apiClient.patch<{ success: boolean; feedback: AdminFeedbackRow }>(
      `/api/admin/feedbacks/${id}`,
      payload
    )
  },
}
