const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';

export interface Appointment {
  id: number;
  userId: number;
  doctor: string;
  department: string;
  date: string;
  time: string;
  status: 'Upcoming' | 'Done' | 'Cancelled';
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
    const token = localStorage.getItem('authToken');
    const response = await fetch(`${API_BASE_URL}/api/appointments`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        localStorage.removeItem('authToken');
        localStorage.removeItem('user');
        window.location.href = '/login';
      }
      const error = await response.json();
      throw new Error(error.message || 'Failed to fetch appointments');
    }
    
    const data = await response.json();
    return data.appointments;
  },

  async createAppointment(appointmentData: CreateAppointmentData): Promise<Appointment> {
    const token = localStorage.getItem('authToken');
    const response = await fetch(`${API_BASE_URL}/api/appointments`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(appointmentData)
    });
    
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        localStorage.removeItem('authToken');
        localStorage.removeItem('user');
        window.location.href = '/login';
      }
      const error = await response.json();
      throw new Error(error.message || 'Failed to create appointment');
    }
    
    const data = await response.json();
    return data.appointment;
  },

  async updateAppointment(id: number, updates: Partial<Appointment>): Promise<Appointment> {
    const token = localStorage.getItem('authToken');
    const response = await fetch(`${API_BASE_URL}/api/appointments/${id}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(updates)
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to update appointment');
    }
    
    const data = await response.json();
    return data.appointment;
  },

  async deleteAppointment(id: number): Promise<void> {
    const token = localStorage.getItem('authToken');
    const response = await fetch(`${API_BASE_URL}/api/appointments/${id}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to delete appointment');
    }
  }
};
