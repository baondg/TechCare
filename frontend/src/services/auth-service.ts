import { apiClient } from "@/api/client"
import type { RegisterData } from "@/contexts/auth-context"

export const authService = {
  /** Nurse creates a patient account (signed-in staff only). */
  async registerPatient(data: RegisterData): Promise<{ success: boolean; error?: string }> {
    try {
      await apiClient.post("/api/auth/register-patient", data)
      return { success: true }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : "Could not create account" }
    }
  },

  /** Wrong current password / weak new password → Error with the server's message (400). */
  async changePassword(currentPassword: string, newPassword: string) {
    return apiClient.post<{ success: boolean; message: string }>("/api/auth/change-password", {
      currentPassword,
      newPassword,
    })
  },
}
