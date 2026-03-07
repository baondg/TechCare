const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';

<<<<<<< HEAD
function authHeaders(): Record<string, string> {
  const token = localStorage.getItem('authToken');
  return {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  };
}

function handleAuthError(response: Response) {
  if (response.status === 401 || response.status === 403) {
    localStorage.removeItem('authToken');
    localStorage.removeItem('user');
    window.location.href = '/login';
  }
}

export interface Doctor {
  id: number;
  username: string;
  firstName: string;
  lastName: string;
  department: string | null;
}

export interface BookedSlot {
  doctor: string;
  time: string;
}

=======
>>>>>>> 9d41cd19 (TC-2801: Fix the FE branch and modify gitignore)
export interface Appointment {
  id: number;
  userId: number;
  doctor: string;
<<<<<<< HEAD
<<<<<<< HEAD
  patient: string;
  department: string;
  date: string;
  time: string;
  status: 'Pending' | 'Confirmed' | 'Done' | 'Cancelled' | 'Rejected';
=======
  department: string;
  date: string;
  time: string;
  status: 'Upcoming' | 'Done' | 'Cancelled';
>>>>>>> 9d41cd19 (TC-2801: Fix the FE branch and modify gitignore)
=======
  patient: string;
  department: string;
  date: string;
  time: string;
  status: 'Upcoming' | 'Done' | 'Cancelled' | "Confirmed" | "Rejected" | "Pending";
>>>>>>> d0e85e3f (add technician portal + appointment page)
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
<<<<<<< HEAD
  /** Get all doctors available for booking */
  async getDoctors(): Promise<Doctor[]> {
    const response = await fetch(`${API_BASE_URL}/api/appointments/doctors`, {
      headers: authHeaders()
    });
    if (!response.ok) {
      handleAuthError(response);
      throw new Error('Failed to fetch doctors');
    }
    const data = await response.json();
    return data.doctors;
  },

  /** Get already-booked slots for a specific date */
  async getBookedSlots(date: string): Promise<BookedSlot[]> {
    const response = await fetch(`${API_BASE_URL}/api/appointments/booked-slots?date=${date}`, {
      headers: authHeaders()
    });
    if (!response.ok) {
      handleAuthError(response);
      throw new Error('Failed to fetch booked slots');
    }
    const data = await response.json();
    return data.slots;
  },

  async getAppointments(): Promise<Appointment[]> {
    const response = await fetch(`${API_BASE_URL}/api/appointments`, {
      headers: authHeaders()
    });
    if (!response.ok) {
      handleAuthError(response);
      const error = await response.json();
      throw new Error(error.message || 'Failed to fetch appointments');
    }
=======
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
    
>>>>>>> 9d41cd19 (TC-2801: Fix the FE branch and modify gitignore)
    const data = await response.json();
    return data.appointments;
  },

  async createAppointment(appointmentData: CreateAppointmentData): Promise<Appointment> {
<<<<<<< HEAD
    const response = await fetch(`${API_BASE_URL}/api/appointments`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(appointmentData)
    });
    if (!response.ok) {
      handleAuthError(response);
      const error = await response.json();
      throw new Error(error.message || 'Failed to create appointment');
    }
=======
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
    
>>>>>>> 9d41cd19 (TC-2801: Fix the FE branch and modify gitignore)
    const data = await response.json();
    return data.appointment;
  },

  async updateAppointment(id: number, updates: Partial<Appointment>): Promise<Appointment> {
<<<<<<< HEAD
    const response = await fetch(`${API_BASE_URL}/api/appointments/${id}`, {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify(updates)
    });
=======
    const token = localStorage.getItem('authToken');
    const response = await fetch(`${API_BASE_URL}/api/appointments/${id}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(updates)
    });
    
>>>>>>> 9d41cd19 (TC-2801: Fix the FE branch and modify gitignore)
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to update appointment');
    }
<<<<<<< HEAD
=======
    
>>>>>>> 9d41cd19 (TC-2801: Fix the FE branch and modify gitignore)
    const data = await response.json();
    return data.appointment;
  },

  async deleteAppointment(id: number): Promise<void> {
<<<<<<< HEAD
    const response = await fetch(`${API_BASE_URL}/api/appointments/${id}`, {
      method: 'DELETE',
      headers: authHeaders()
    });
=======
    const token = localStorage.getItem('authToken');
    const response = await fetch(`${API_BASE_URL}/api/appointments/${id}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
>>>>>>> 9d41cd19 (TC-2801: Fix the FE branch and modify gitignore)
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to delete appointment');
    }
  }
<<<<<<< HEAD
};
<<<<<<< HEAD
=======
};
>>>>>>> 9d41cd19 (TC-2801: Fix the FE branch and modify gitignore)
=======


>>>>>>> d0e85e3f (add technician portal + appointment page)
