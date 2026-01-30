const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';

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
  drugAllergies?: string;
  foodAllergies?: string;
  otherAllergies?: string;
  
  // Medical history
  chronicConditions?: string;
  pastSurgeries?: string;
  familyHistory?: string;
  pastIllnesses?: string;
  vaccinations?: string;
  substanceAbuse?: string;
  
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

const getAuthHeader = () => {
  const token = localStorage.getItem('authToken');
  return {
    'Content-Type': 'application/json',
    'Authorization': token ? `Bearer ${token}` : '',
  };
};

export const healthInfoService = {
  async getHealthInfo(): Promise<HealthInfoResponse> {
    try {
      const user = localStorage.getItem('user');
      if (!user) {
        return { success: false, error: 'User not authenticated' };
      }
      
      const userId = JSON.parse(user).id;
      const response = await fetch(`${API_BASE_URL}/api/health-info/${userId}`, {
        method: 'GET',
        headers: getAuthHeader(),
      });

      if (!response.ok) {
        return { success: false, error: 'Failed to fetch health info' };
      }

      const data = await response.json();
      return {
        success: true,
        healthInfo: data.healthInfo || data,
      };
    } catch (error) {
      console.error('Get health info error:', error);
      return {
        success: false,
        error: 'Network error',
      };
    }
  },

  async updateHealthInfo(healthData: Partial<HealthInfo>): Promise<HealthInfoResponse> {
    try {
      const user = localStorage.getItem('user');
      if (!user) {
        return { success: false, error: 'User not authenticated' };
      }
      
      const userId = JSON.parse(user).id;
      const response = await fetch(`${API_BASE_URL}/api/health-info/${userId}`, {
        method: 'PUT',
        headers: getAuthHeader(),
        body: JSON.stringify(healthData),
      });

      if (!response.ok) {
        return { success: false, error: 'Failed to update health info' };
      }

      const data = await response.json();
      return {
        success: true,
        healthInfo: data.healthInfo || data,
      };
    } catch (error) {
      console.error('Update health info error:', error);
      return {
        success: false,
        error: 'Network error',
      };
    }
  },

  async createHealthInfo(healthData: Partial<HealthInfo>): Promise<HealthInfoResponse> {
    try {
      const user = localStorage.getItem('user');
      if (!user) {
        return { success: false, error: 'User not authenticated' };
      }
      
      const userId = JSON.parse(user).id;
      const response = await fetch(`${API_BASE_URL}/api/health-info`, {
        method: 'POST',
        headers: getAuthHeader(),
        body: JSON.stringify({ ...healthData, userId }),
      });

      if (!response.ok) {
        return { success: false, error: 'Failed to create health info' };
      }

      const data = await response.json();
      return {
        success: true,
        healthInfo: data.healthInfo || data,
      };
    } catch (error) {
      console.error('Create health info error:', error);
      return {
        success: false,
        error: 'Network error',
      };
    }
  },

  async getHealthHistory(page: number = 1, limit: number = 10): Promise<HealthHistoryResponse> {
    try {
      const user = localStorage.getItem('user');
      if (!user) {
        return { success: false, error: 'User not authenticated' };
      }
      
      const userId = JSON.parse(user).id;
      const response = await fetch(
        `${API_BASE_URL}/api/health-info/${userId}/history?page=${page}&limit=${limit}`,
        {
          method: 'GET',
          headers: getAuthHeader(),
        }
      );

      if (!response.ok) {
        return { success: false, error: 'Failed to fetch health history' };
      }

      const data = await response.json();
      return {
        success: true,
        history: data.history || [],
        pagination: data.pagination,
      };
    } catch (error) {
      console.error('Get health history error:', error);
      return {
        success: false,
        error: 'Network error',
      };
    }
  },
};
