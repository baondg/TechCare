const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:3000"

const authHeader = () => {
  const token = localStorage.getItem("authToken")
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

export type WorkShiftRow = {
  id: number
  startTime: string
  endTime: string
  roomId: number
  roomName: string
  departmentName: string
  doctorId: number
  nurseId: number
  technicianId: number
  doctorName: string
  nurseName: string
  technicianName: string
}

export type WorkShiftsResponse = {
  success: boolean
  shifts: WorkShiftRow[]
  startDate?: string
  endDate?: string
  staffRole?: string
  /** USER.id of the schedule being shown (may differ from caller when viewing another staff member). */
  viewedUserId?: number | null
  participantRole?: "doctor" | "nurse" | "technician" | null
  /** True when every shift in the date range is returned (forUserId=all). */
  viewAll?: boolean
  message?: string
}

export type ClinicalStaffDirectoryRow = {
  userId: number
  firstName: string
  lastName: string
  accountType: string
  roleLabel: string
  displayName: string
}

export type StaffDirectoryResponse = {
  success: boolean
  staff: ClinicalStaffDirectoryRow[]
}

export async function getClinicalStaffDirectory(): Promise<StaffDirectoryResponse> {
  const res = await fetch(`${API_BASE_URL}/api/work-shifts/staff-directory`, {
    headers: authHeader(),
  })
  const data = (await res.json().catch(() => ({}))) as StaffDirectoryResponse & { error?: string; message?: string }
  if (!res.ok) {
    throw new Error(data.message || data.error || "Failed to load staff directory")
  }
  return data
}

export async function getMyWorkShifts(params: {
  startDate: string
  endDate: string
  /** Load shifts for this USER.id, or `"all"` for every shift in the range. */
  forUserId?: number | "all" | null
}): Promise<WorkShiftsResponse> {
  const q = new URLSearchParams({ startDate: params.startDate, endDate: params.endDate })
  if (params.forUserId === "all") {
    q.set("forUserId", "all")
  } else if (params.forUserId != null && Number.isFinite(params.forUserId)) {
    q.set("forUserId", String(params.forUserId))
  }
  const res = await fetch(`${API_BASE_URL}/api/work-shifts?${q}`, {
    headers: authHeader(),
  })
  const data = (await res.json().catch(() => ({}))) as WorkShiftsResponse & { error?: string }
  if (!res.ok) {
    throw new Error(data.message || data.error || "Failed to load work shifts")
  }
  return data
}
