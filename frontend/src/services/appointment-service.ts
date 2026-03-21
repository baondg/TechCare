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

export const appointmentService = {
  async getAppointments(): Promise<Appointment[]> {
    const data = await apiClient.get<{ success: boolean; appointments: Appointment[] }>('/api/appointments');
    return data.appointments;
  },

  async createAppointment(appointmentData: CreateAppointmentData): Promise<Appointment> {
    const data = await apiClient.post<{ success: boolean; appointment: Appointment }>('/api/appointments', appointmentData);
    return data.appointment;
  },

  async updateAppointment(id: number, updates: Partial<Appointment>): Promise<Appointment> {
    const data = await apiClient.put<{ success: boolean; appointment: Appointment }>(`/api/appointments/${id}`, updates);
    return data.appointment;
  },

  async deleteAppointment(id: number): Promise<void> {
    await apiClient.delete<{ success: boolean }>(`/api/appointments/${id}`);
  }
};


