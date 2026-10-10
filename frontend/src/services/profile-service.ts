import { apiClient } from '@/api/client';

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

/** GET /api/profile/:userId; relative / insurance only for patients. */
type ProfileResponse = {
  profile?: {
    user_id?: number;
    firstName?: string;
    lastName?: string;
    fullName?: string;
    dateOfBirth?: string;
    sex?: string;
    phone?: string;
    email?: string;
    nationalId?: string | number | null;
  };
  relative?: {
    name?: string;
    relationship?: string;
    dob?: string;
    sex?: string;
    tel?: string;
    email?: string;
    idcard?: string | number | null;
  } | null;
  insurance?: { id?: string; initial_hospital?: string; expired_date?: string } | null;
};

export const profileService = {
  async getProfile(userId: number): Promise<PatientProfile> {
    try {
      const data = await apiClient.get<ProfileResponse>(`/api/profile/${userId}`);
      const p: ProfileResponse['profile'] = data.profile || {};

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
      const data = await apiClient.put<{ profile?: PatientProfile } & PatientProfile>(`/api/profile/${userId}`, profileData);
      return data.profile || data;
    } catch (error) {
      console.error('Update profile error:', error);
      throw error;
    }
  },
};
