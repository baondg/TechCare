import { apiClient } from '@/api/client'

export interface AppNotification {
  id: number
  type: string
  content: string
  time: string
  status: string
}

export interface NotificationsResponse {
  success: boolean
  notifications: AppNotification[]
  unreadCount: number
}

export async function fetchNotifications(): Promise<NotificationsResponse> {
  return apiClient.get<NotificationsResponse>('/api/notifications')
}

export async function markNotificationRead(id: number): Promise<void> {
  await apiClient.patch(`/api/notifications/${id}/read`, {})
}
