const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';

export interface PatientProfile {
  id?: number;
  userId: number;
  fullName?: string;
  dateOfBirth?: string;
  sex?: string;
  phone?: string;
  email?: string;
  nationalId?: string;
  
  // Relative information
  relativeName?: string;
  relativeRelationship?: string;
  relativeDateOfBirth?: string;
  relativeSex?: string;
  relativePhone?: string;
  relativeEmail?: string;
  relativeNationalId?: string;
  
  // Insurance information
  insuranceId?: string;
  insuranceProvider?: string;
  insuranceExpiry?: string;
  
  createdAt?: string;
  updatedAt?: string;
}

const getAuthHeader = () => {
  const token = localStorage.getItem('authToken');
  return {
    'Content-Type': 'application/json',
    'Authorization': token ? `Bearer ${token}` : '',
  };
};

export const profileService = {
  async getProfile(userId: number): Promise<PatientProfile> {
    try {
      const response = await fetch(`${API_BASE_URL}/api/profile/${userId}`, {
        method: 'GET',
        headers: getAuthHeader(),
      });

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          localStorage.removeItem('authToken');
          localStorage.removeItem('user');
          window.location.href = '/login';
        }
        throw new Error('Failed to fetch profile');
      }

      const data = await response.json();
      return data.profile || data;
    } catch (error) {
      console.error('Get profile error:', error);
      throw error;
    }
  },

  async updateProfile(userId: number, profileData: Partial<PatientProfile>): Promise<PatientProfile> {
    try {
      const response = await fetch(`${API_BASE_URL}/api/profile/${userId}`, {
        method: 'PUT',
        headers: getAuthHeader(),
        body: JSON.stringify(profileData),
      });

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          localStorage.removeItem('authToken');
          localStorage.removeItem('user');
          window.location.href = '/login';
        }
        throw new Error('Failed to update profile');
      }

      const data = await response.json();
      return data.profile || data;
    } catch (error) {
      console.error('Update profile error:', error);
      throw error;
    }
  },

  async createProfile(userId: number, profileData: Partial<PatientProfile>): Promise<PatientProfile> {
    try {
      const response = await fetch(`${API_BASE_URL}/api/profile`, {
        method: 'POST',
        headers: getAuthHeader(),
        body: JSON.stringify({ ...profileData, userId }),
      });

      if (!response.ok) {
        throw new Error('Failed to create profile');
      }

      const data = await response.json();
      return data.profile || data;
    } catch (error) {
      console.error('Create profile error:', error);
      throw error;
    }
  },
};
