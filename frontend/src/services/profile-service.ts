import { API_BASE_URL } from '@/lib/api-base';

export interface PatientProfile {
  id?: number;
  userId: number;
  /** Legacy combined name; prefer firstName + lastName from API. */
  fullName?: string;
  firstName?: string;
  lastName?: string;
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
      const p = data.profile || {};

      return {
        userId: p.user_id ?? userId,
        firstName: p.firstName ?? '',
        lastName: p.lastName ?? '',
        fullName: p.fullName,
        dateOfBirth: p.dateOfBirth,
        sex: p.sex,
        phone: p.phone,
        email: p.email,
        nationalId: p.nationalId != null ? String(p.nationalId) : '',

        // map relative
        relativeName: data.relative?.name,
        relativeRelationship: data.relative?.relationship,
        relativeDateOfBirth: data.relative?.dob,
        relativeSex: data.relative?.sex,
        relativePhone: data.relative?.tel,
        relativeEmail: data.relative?.email,
        relativeNationalId: data.relative?.idcard != null ? String(data.relative.idcard) : '',

        // map insurance
        insuranceId: data.insurance?.id,
        insuranceProvider: data.insurance?.initial_hospital,
        insuranceExpiry: data.insurance?.expired_date,
      };
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
        let detail = 'Failed to update profile';
        try {
          const errBody = (await response.json()) as { message?: string };
          if (errBody?.message) detail = String(errBody.message);
        } catch {
          /* ignore */
        }
        if (response.status === 401 || response.status === 403) {
          localStorage.removeItem('authToken');
          localStorage.removeItem('user');
          window.location.href = '/login';
        }
        throw new Error(detail);
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
