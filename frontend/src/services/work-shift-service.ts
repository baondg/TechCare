import { apiClient } from "@/api/client"

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
  return apiClient.get<StaffDirectoryResponse>("/api/work-shifts/staff-directory")
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
  return apiClient.get<WorkShiftsResponse>(`/api/work-shifts?${q}`)
}
