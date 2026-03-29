import { apiClient } from '@/api/client';

export interface Appointment {
  id: number;
  userId: number;
  doctor: string;
  patient: string;
  department: string;
  date: string;
  time: string;
  status: 'Upcoming' | 'Done' | 'Cancelled' | "Confirmed" | "Rejected" | "Pending";
  room?: string;
  symptoms?: string;
  notes?: string;
}

export interface CreateAppointmentData {
  doctor: string;
  department: string;
  date: string;
  time: string;
  room?: string;
  symptoms?: string;
  notes?: string;
}

export interface DoctorOption {
  id: number;
  username: string;
  firstName?: string;
  lastName?: string;
  department?: string;
  room?: string;
}

export interface PatientDashboardSummary {
  summary: {
    nextAppointment: {
      id: number;
      date: string;
      time: string;
      department: string;
      room: string;
      doctor: string;
    } | null;
    currentDiagnosis: {
      icd10: string;
      interpretation: string;
    } | null;
    activePrescriptions: number;
    labResults: number;
  };
  /** Each item is one prescription (order) with its line items — not merged into a single list. */
  activePrescriptionsList: Array<{
    id: number;
    prescribedAt: string;
    medications: Array<{
      id: string;
      name: string;
      frequency: string;
      quantity: string;
    }>;
  }>;
  upcomingAppointments: Array<{
    id: number;
    date: string;
    time: string;
    department: string;
    room: string;
    doctor: string;
    status: string;
  }>;
}

export const appointmentService = {
  async getAppointments(): Promise<Appointment[]> {
    const data = await apiClient.get<{ success: boolean; appointments: Appointment[] }>('/api/appointments');
    return data.appointments;
  },

  async createAppointment(appointmentData: CreateAppointmentData): Promise<Appointment> {
    const data = await apiClient.post<{ success: boolean; appointment: Appointment }>('/api/appointments', appointmentData);
    return data.appointment;
  },

  async getDoctors(): Promise<DoctorOption[]> {
    const data = await apiClient.get<{ success: boolean; doctors: DoctorOption[] }>('/api/appointments/doctors');
    return data.doctors || [];
  },

  async getBookedSlots(date: string): Promise<Array<{ doctor: string; time: string }>> {
    const data = await apiClient.get<{ success: boolean; slots: Array<{ doctor: string; time: string }> }>(
      `/api/appointments/booked-slots?date=${encodeURIComponent(date)}`
    );
    return data.slots || [];
  },

  async getPatientDashboardSummary(): Promise<PatientDashboardSummary> {
    const data = await apiClient.get<{ success: boolean } & PatientDashboardSummary>('/api/appointments/dashboard-summary');
    return data;
  },

  async updateAppointment(id: number, updates: Partial<Appointment>): Promise<Appointment> {
    const data = await apiClient.put<{ success: boolean; appointment: Appointment }>(`/api/appointments/${id}`, updates);
    return data.appointment;
  },

  async deleteAppointment(id: number): Promise<void> {
    await apiClient.delete<{ success: boolean }>(`/api/appointments/${id}`);
  }
};


