import { apiClient } from '@/api/client';

export interface HealthInfo {
  id: number;
  userId: number;
  
  // Vital signs
  height?: number;
  weight?: number;
  bmi?: number;
  bloodPressureSys?: number;
  bloodPressureDia?: number;
  heartRate?: number;
  respiratoryRate?: number;
  temperature?: number;
  spo2?: number;
  bloodType?: string;
  
  // Current symptoms
  currentSymptoms?: string;
  
  // Allergies
  drugAllergies?: string | string[];
  foodAllergies?: string | string[];
  otherAllergies?: string | string[];
  
  // Medical history
  chronicConditions?: string | string[];
  pastSurgeries?: string | string[];
  familyHistory?: string | string[];
  pastIllnesses?: string | string[];
  vaccinations?: string | string[];
  substanceAbuse?: string | string[];
  status?: 'draft' | 'confirmed';
  
  // Metadata
  updatedBy?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface HealthInfoResponse {
  success: boolean;
  healthInfo?: HealthInfo;
  error?: string;
}

export interface HealthHistoryResponse {
  success: boolean;
  history?: HealthInfo[];
  pagination?: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
  error?: string;
}

function currentUserId(): number | null {
  const user = localStorage.getItem('user');
  return user ? (JSON.parse(user) as { id: number }).id : null;
}

const NOT_AUTHENTICATED = { success: false, error: 'User not authenticated' } as const;

/** apiClient already handles 401 (refresh / redirect); callers here get `{ success: false, error }`. */
function failure(context: string, error: unknown) {
  console.error(`${context} error:`, error);
  return { success: false as const, error: error instanceof Error ? error.message : 'Network error' };
}

type HealthInfoBody = { healthInfo?: HealthInfo } & Partial<HealthInfo>;

export const healthInfoService = {
  async getHealthInfo(): Promise<HealthInfoResponse> {
    const userId = currentUserId();
    if (userId == null) return NOT_AUTHENTICATED;
    try {
      const data = await apiClient.get<HealthInfoBody>(`/api/health-info/${userId}`);
      return { success: true, healthInfo: (data.healthInfo || data) as HealthInfo };
    } catch (error) {
      return failure('Get health info', error);
    }
  },

  async updateHealthInfo(recordId: number, healthData: Partial<HealthInfo>): Promise<HealthInfoResponse> {
    const userId = currentUserId();
    if (userId == null) return NOT_AUTHENTICATED;
    try {
      const data = await apiClient.put<HealthInfoBody>(`/api/health-info/${userId}`, { id: recordId, ...healthData });
      return { success: true, healthInfo: (data.healthInfo || data) as HealthInfo };
    } catch (error) {
      return failure('Update health info', error);
    }
  },

  async createHealthInfo(healthData: Partial<HealthInfo>): Promise<HealthInfoResponse> {
    const userId = currentUserId();
    if (userId == null) return NOT_AUTHENTICATED;
    try {
      const data = await apiClient.post<HealthInfoBody>(`/api/health-info/${userId}`, healthData);
      return { success: true, healthInfo: (data.healthInfo || data) as HealthInfo };
    } catch (error) {
      return failure('Create health info', error);
    }
  },

  async getHealthHistory(page: number = 1, limit: number = 10): Promise<HealthHistoryResponse> {
    const userId = currentUserId();
    if (userId == null) return NOT_AUTHENTICATED;
    try {
      const data = await apiClient.get<{ history?: HealthInfo[] }>(`/api/health-info/${userId}`);
      const fullHistory = data.history || [];
      const start = (page - 1) * limit;
      const total = fullHistory.length;
      return {
        success: true,
        history: fullHistory.slice(start, start + limit),
        pagination: {
          total,
          page,
          limit,
          totalPages: total > 0 ? Math.ceil(total / limit) : 1,
        },
      };
    } catch (error) {
      return failure('Get health history', error);
    }
  },

  async deleteHealthRecords(recordIds: number[]): Promise<{ success: boolean; message?: string; error?: string }> {
    const userId = currentUserId();
    if (userId == null) return NOT_AUTHENTICATED;
    try {
      const data = await apiClient.delete<{ message?: string }>(`/api/health-info/${userId}`, { ids: recordIds });
      return { success: true, message: data?.message || 'Records deleted successfully' };
    } catch (error) {
      return failure('Delete health records', error);
    }
  },

  async confirmHealthRecord(recordId: number): Promise<{ success: boolean; status?: 'confirmed'; error?: string }> {
    const userId = currentUserId();
    if (userId == null) return NOT_AUTHENTICATED;
    try {
      await apiClient.patch(`/api/health-info/${userId}/${recordId}/confirm`, undefined);
      return { success: true, status: 'confirmed' };
    } catch (error) {
      return failure('Confirm health record', error);
    }
  },
};
