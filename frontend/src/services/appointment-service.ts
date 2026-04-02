import { apiClient } from '@/api/client';
import type { ChatMessage, SymptomAnalysisResponse, SymptomInput } from '@/types/ai-types';

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
  /** Signed prescriptions only (patient portal); each item is one order with line items. */
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

export interface PatientFeedback {
  id: number;
  content: string;
  type: string;
  time: string | null;
  status: string;
  rating: number;
}

export interface PatientAiRecommendation {
  id: number;
  type: "chatbot" | "symptomchecker" | "recoveryprediction" | "clinicsuggestion" | "transfersuggestion" | "other";
  content: string;
  time: string | null;
  modelName: string;
  modelProvider: string;
  treatmentId: number | null;
  feedback: string | null;
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
  },

  async getFeedbacks(): Promise<PatientFeedback[]> {
    const data = await apiClient.get<{ success: boolean; feedbacks: PatientFeedback[] }>('/api/appointments/feedback');
    return data.feedbacks || [];
  },

  async createFeedback(payload: { content: string; type: string; rating: number }): Promise<PatientFeedback> {
    const data = await apiClient.post<{ success: boolean; feedback: PatientFeedback }>(
      '/api/appointments/feedback',
      payload
    );
    return data.feedback;
  },

  async getAiRecommendations(): Promise<PatientAiRecommendation[]> {
    const data = await apiClient.get<{ success: boolean; recommendations: PatientAiRecommendation[] }>(
      '/api/appointments/ai-recommendations'
    );
    return data.recommendations || [];
  },

  async updateAiRecommendationFeedback(id: number, feedback: string): Promise<void> {
    await apiClient.patch<{ success: boolean }>(`/api/appointments/ai-recommendations/${id}/feedback`, { feedback });
  },

  async sendPatientChatMessage(messages: ChatMessage[], userMessage: string): Promise<{ message: string; recommendationId: number | null }> {
    const data = await apiClient.post<{ success: boolean; message: string; recommendationId?: number }>(
      '/api/appointments/ai/chat',
      { messages, userMessage }
    );
    return {
      message: data.message || '',
      recommendationId: Number.isFinite(Number(data.recommendationId)) ? Number(data.recommendationId) : null,
    };
  },

  async analyzeSymptomsPersisted(symptoms: SymptomInput[]): Promise<SymptomAnalysisResponse> {
    const data = await apiClient.post<{ success: boolean; analysis: SymptomAnalysisResponse }>(
      '/api/appointments/ai/symptom-analysis',
      { symptoms }
    );
    return data.analysis;
  },

  async getAiDoctorRecommendation(data: {
    symptoms: string;
    department?: string;
    preferredDate?: string;
    availableDoctors: DoctorOption[];
  }) {
    return apiClient.post<{
      success: boolean;
      recommendations?: Array<{
        doctorName: string;
        department: string;
        reason: string;
        priority: number;
      }>;
      generalAdvice?: string;
      raw?: string;
    }>('/api/ai/recommend-doctor', data);
  },
};


