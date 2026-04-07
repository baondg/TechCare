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
  message?: string
}

export async function getMyWorkShifts(params: {
  startDate: string
  endDate: string
}): Promise<WorkShiftsResponse> {
  const q = new URLSearchParams({ startDate: params.startDate, endDate: params.endDate })
  const res = await fetch(`${API_BASE_URL}/api/work-shifts?${q}`, {
    headers: authHeader(),
  })
  const data = (await res.json().catch(() => ({}))) as WorkShiftsResponse & { error?: string }
  if (!res.ok) {
    throw new Error(data.message || data.error || "Failed to load work shifts")
  }
  return data
}
