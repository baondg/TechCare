import { apiClient } from "@/api/client"

export const authService = {
  /** Wrong current password / weak new password → Error with the server's message (400). */
  async changePassword(currentPassword: string, newPassword: string) {
    return apiClient.post<{ success: boolean; message: string }>("/api/auth/change-password", {
      currentPassword,
      newPassword,
    })
  },
}
