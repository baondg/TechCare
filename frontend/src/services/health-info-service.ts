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
  status?: 'draft' | 'signed' | 'unsigned';
  
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
  if (!token) return null;
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
  };
};

export const healthInfoService = {
  async getHealthInfo(): Promise<HealthInfoResponse> {
    try {
      const user = localStorage.getItem('user');
      if (!user) {
        return { success: false, error: 'User not authenticated' };
      }
      const headers = getAuthHeader();
      if (!headers) {
        return { success: false, error: 'Session expired. Please log in again.' };
      }
      
      const userId = JSON.parse(user).id;
      const response = await fetch(`${API_BASE_URL}/api/health-info/${userId}`, {
        method: 'GET',
        headers,
      });

      if (!response.ok) {
        if (response.status === 401) {
          return { success: false, error: 'Session expired. Please log in again.' };
        }
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

  async updateHealthInfo(recordId: number, healthData: Partial<HealthInfo>): Promise<HealthInfoResponse> {
    try {
      const user = localStorage.getItem('user');
      if (!user) {
        return { success: false, error: 'User not authenticated' };
      }
      const headers = getAuthHeader();
      if (!headers) {
        return { success: false, error: 'Session expired. Please log in again.' };
      }
      
      const userId = JSON.parse(user).id;
      const response = await fetch(`${API_BASE_URL}/api/health-info/${userId}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ id: recordId, ...healthData }),
      });

      if (!response.ok) {
        if (response.status === 401) {
          return { success: false, error: 'Session expired. Please log in again.' };
        }
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
      const headers = getAuthHeader();
      if (!headers) {
        return { success: false, error: 'Session expired. Please log in again.' };
      }
      
      const userId = JSON.parse(user).id;
      const response = await fetch(`${API_BASE_URL}/api/health-info/${userId}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(healthData),
      });

      if (!response.ok) {
        if (response.status === 401) {
          return { success: false, error: 'Session expired. Please log in again.' };
        }
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
      const headers = getAuthHeader();
      if (!headers) {
        return { success: false, error: 'Session expired. Please log in again.' };
      }
      
      const userId = JSON.parse(user).id;
      const response = await fetch(
        `${API_BASE_URL}/api/health-info/${userId}`,
        {
          method: 'GET',
          headers,
        }
      );

      if (!response.ok) {
        if (response.status === 401) {
          return { success: false, error: 'Session expired. Please log in again.' };
        }
        return { success: false, error: 'Failed to fetch health history' };
      }

      const data = await response.json();
      const fullHistory: HealthInfo[] = data.history || [];
      const start = (page - 1) * limit;
      const end = start + limit;
      const paginatedHistory = fullHistory.slice(start, end);
      const total = fullHistory.length;

      return {
        success: true,
        history: paginatedHistory,
        pagination: {
          total,
          page,
          limit,
          totalPages: total > 0 ? Math.ceil(total / limit) : 1,
        },
      };
    } catch (error) {
      console.error('Get health history error:', error);
      return {
        success: false,
        error: 'Network error',
      };
    }
  },

  async deleteHealthRecords(recordIds: number[]): Promise<{ success: boolean; message?: string; error?: string }> {
    try {
      const user = localStorage.getItem('user');
      if (!user) {
        return { success: false, error: 'User not authenticated' };
      }

      const headers = getAuthHeader();
      if (!headers) {
        return { success: false, error: 'Session expired. Please log in again.' };
      }

      const userId = JSON.parse(user).id;

      const response = await fetch(`${API_BASE_URL}/api/health-info/${userId}`, {
        method: 'DELETE',
        headers,
        body: JSON.stringify({ ids: recordIds }),
      });

      if (!response.ok) {
        if (response.status === 401) {
          return { success: false, error: 'Session expired. Please log in again.' };
        }
        return { success: false, error: 'Failed to delete health records' };
      }

      const data = await response.json();
      return { success: true, message: data.message || 'Records deleted successfully' };
    } catch (error) {
      console.error('Delete health records error:', error);
      return { success: false, error: 'Network error' };
    }
  },

  async signHealthRecord(recordId: number): Promise<{ success: boolean; status?: 'signed'; error?: string }> {
    try {
      const user = localStorage.getItem('user');
      if (!user) return { success: false, error: 'User not authenticated' };
      const headers = getAuthHeader();
      if (!headers) return { success: false, error: 'Session expired. Please log in again.' };
      const userId = JSON.parse(user).id;
      const response = await fetch(`${API_BASE_URL}/api/health-info/${userId}/${recordId}/sign`, { method: 'PATCH', headers });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) return { success: false, error: data.message || data.error || 'Failed to sign record' };
      return { success: true, status: 'signed' };
    } catch (error) {
      console.error('Sign health record error:', error);
      return { success: false, error: 'Network error' };
    }
  },

  async unsignHealthRecord(recordId: number): Promise<{ success: boolean; status?: 'unsigned'; error?: string }> {
    try {
      const user = localStorage.getItem('user');
      if (!user) return { success: false, error: 'User not authenticated' };
      const headers = getAuthHeader();
      if (!headers) return { success: false, error: 'Session expired. Please log in again.' };
      const userId = JSON.parse(user).id;
      const response = await fetch(`${API_BASE_URL}/api/health-info/${userId}/${recordId}/unsign`, { method: 'PATCH', headers });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) return { success: false, error: data.message || data.error || 'Failed to unsign record' };
      return { success: true, status: 'unsigned' };
    } catch (error) {
      console.error('Unsign health record error:', error);
      return { success: false, error: 'Network error' };
    }
  },
};


