const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:3000"

const getAuthHeader = () => {
  const token = localStorage.getItem("authToken")
  return {
    "Content-Type": "application/json",
    Authorization: token ? `Bearer ${token}` : "",
  }
}

async function apiRequest<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...options,
    headers: { ...getAuthHeader(), ...(options?.headers || {}) },
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }))
    throw new Error(err.message || "Request failed")
  }
  return res.json()
}

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
  async getAccounts() {
    return apiRequest<{ success: boolean; accounts: AdminAccountRow[] }>(
      `${API_BASE_URL}/api/admin/accounts`
    )
  },

  async getDepartments() {
    return apiRequest<{ success: boolean; departments: AdminDepartmentOption[] }>(
      `${API_BASE_URL}/api/admin/departments`
    )
  },

  async updateAccountStatus(id: number, status: boolean) {
    return apiRequest<{ success: boolean; id: number; status: boolean }>(
      `${API_BASE_URL}/api/admin/accounts/${id}/status`,
      {
        method: "PATCH",
        body: JSON.stringify({ status }),
      }
    )
  },

  async createAccount(data: SaveAdminAccountPayload) {
    return apiRequest<{ success: boolean; account: AdminAccountRow }>(
      `${API_BASE_URL}/api/admin/accounts`,
      {
        method: "POST",
        body: JSON.stringify(data),
      }
    )
  },

  async updateAccount(id: number, data: SaveAdminAccountPayload) {
    return apiRequest<{ success: boolean; account: AdminAccountRow }>(
      `${API_BASE_URL}/api/admin/accounts/${id}`,
      {
        method: "PATCH",
        body: JSON.stringify(data),
      }
    )
  },

  async getDashboardSummary() {
    return apiRequest<{ success: boolean; summary: AdminDashboardSummary }>(
      `${API_BASE_URL}/api/admin/dashboard-summary`
    )
  },

  async getFeedbacks() {
    return apiRequest<{ success: boolean; feedbacks: AdminFeedbackRow[] }>(
      `${API_BASE_URL}/api/admin/feedbacks`
    )
  },

  async updateFeedback(id: number, payload: { response?: string; status?: boolean }) {
    return apiRequest<{ success: boolean; feedback: AdminFeedbackRow }>(
      `${API_BASE_URL}/api/admin/feedbacks/${id}`,
      {
        method: "PATCH",
        body: JSON.stringify(payload),
      }
    )
  },
}

