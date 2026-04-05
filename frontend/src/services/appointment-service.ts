import { apiClient } from '@/api/client';
import type { LabTestDetail } from '@/services/doctor-service';
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
  /** Parsed from DOCTOR.department (MySQL SET) */
  departments?: string[];
  /** Convenience: first department, or legacy single label */
  department?: string;
  room?: string;
}

export interface NurseOpenSlot {
  id: number;
  date: string;
  time: string;
  doctorId: number;
  doctorName: string;
  department: string;
  roomId: number | null;
  roomName: string;
  patientId: number | null;
  patientName: string;
  status: 'open' | 'booked' | 'cancelled';
}

/** Nurse check-in dialog: one APPOINTMENT row (booked or open slot). */
export interface NurseCheckInSlot {
  id: number;
  slotTime: string;
  timeDisplay: string;
  dateDisplay: string;
  doctorId: number;
  doctorName: string;
  department: string;
  roomId: number | null;
  roomName: string;
  condition: string;
}

export interface NurseCheckInOptionsResponse {
  success: boolean;
  today: string;
  patientBookings: NurseCheckInSlot[];
  openSlots: NurseCheckInSlot[];
}

export interface ClinicRoomOption {
  id: number;
  name: string;
  capacity?: number | null;
  /** From CLINIC_ROOM.department_id + DEPARTMENT.name */
  departmentId?: number | null;
  departmentName?: string | null;
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
    /** Prescribing doctor (from TREATMENT.doctor_id) */
    doctorName?: string;
    medications: Array<{
      id: string;
      name: string;
      frequency: string;
      quantity: string;
      /** Days (PRESCRIPTION_DETAIL.duration). */
      duration?: string;
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
  userId?: number;
  userName?: string;
  content: string;
  type: string;
  time: string | null;
  status: boolean;
  rating: number;
  response?: string;
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

/** One clinical visit (TREATMENT) with nested orders — patient portal medical history. */
export interface PatientMedicalVisit {
  treatmentId: number;
  visitAt: string;
  department: string;
  complaint: string;
  doctorName: string;
  roomName: string;
  icd10: string;
  interpretation: string;
  vitals: {
    recordId: number;
    recordedAt: string;
    heightCm: number;
    weightKg: number;
    bmi: number | null;
    bloodPressureSys: number | null;
    bloodPressureDia: number | null;
    heartRate: number | null;
    respiratoryRate: number | null;
    temperature: number | null;
    spo2: number | null;
    symptomsNote: string;
    status: string;
  } | null;
  prescriptions: Array<{
    id: number;
    prescribedAt: string;
    signatureStatus: string;
    medications: Array<{
      id: string;
      name: string;
      quantity: string;
      frequency: string;
      unit: string;
      duration?: string;
    }>;
  }>;
  labTests: Array<{
    id: number;
    testType: string;
    testAt: string;
    resultSummary: string;
    note: string;
    fileUrl: string | null;
    technicianName: string;
  }>;
  surgeries: Array<{
    id: number;
    surgeryType: string;
    start: string;
    end: string;
    result: string;
    surgeon: string;
    note: string;
    urgency: string;
  }>;
}

/** One completed encounter (REGIMEN with end set); aggregates treatments in that regimen. */
export type PatientMedicalRegimen = PatientMedicalVisit & {
  regimenId: number;
  visitEnd: string;
};

export interface PatientSymptomLog {
  id: number;
  time: string;
  condition: string;
  suggestion: string;
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

  async getClinicRooms(): Promise<ClinicRoomOption[]> {
    const data = await apiClient.get<{ success: boolean; rooms: ClinicRoomOption[] }>('/api/appointments/clinic-rooms');
    return data.rooms || [];
  },

  async getBookedSlots(date: string): Promise<Array<{ doctor: string; time: string }>> {
    const data = await apiClient.get<{ success: boolean; slots: Array<{ doctor: string; time: string }> }>(
      `/api/appointments/booked-slots?date=${encodeURIComponent(date)}`
    );
    return data.slots || [];
  },

  async getOpenSlots(params?: { startDate?: string; endDate?: string }): Promise<NurseOpenSlot[]> {
    const q = new URLSearchParams();
    if (params?.startDate) q.set('startDate', params.startDate);
    if (params?.endDate) q.set('endDate', params.endDate);
    const data = await apiClient.get<{ success: boolean; slots: NurseOpenSlot[] }>(
      `/api/appointments/open-slots${q.toString() ? `?${q.toString()}` : ''}`
    );
    return data.slots || [];
  },

  async createOpenSlot(payload: { doctorId: number; date: string; time: string; roomId?: number; condition?: string }) {
    return apiClient.post<{ success: boolean; slot: NurseOpenSlot }>('/api/appointments/open-slots', payload);
  },

  async updateOpenSlot(id: number, payload: { date: string; time: string; roomId?: number }) {
    return apiClient.put<{ success: boolean; id: number; date: string; time: string }>(
      `/api/appointments/open-slots/${id}`,
      payload
    );
  },

  async deleteOpenSlot(id: number) {
    return apiClient.delete<{ success: boolean; id: number }>(`/api/appointments/open-slots/${id}`);
  },

  async getPatientDashboardSummary(): Promise<PatientDashboardSummary> {
    const data = await apiClient.get<{ success: boolean } & PatientDashboardSummary>('/api/appointments/dashboard-summary');
    return data;
  },

  async getPatientMedicalVisits(): Promise<PatientMedicalVisit[]> {
    const data = await apiClient.get<{ success: boolean; visits: PatientMedicalVisit[] }>(
      '/api/appointments/medical-visits'
    );
    return data.visits ?? [];
  },

  async getPatientMedicalRegimens(): Promise<PatientMedicalRegimen[]> {
    const data = await apiClient.get<{ success: boolean; regimens: PatientMedicalRegimen[] }>(
      '/api/appointments/medical-regimens'
    );
    return data.regimens ?? [];
  },

  async getPatientSymptomLogs(): Promise<PatientSymptomLog[]> {
    const data = await apiClient.get<{ success: boolean; logs: PatientSymptomLog[] }>(
      '/api/appointments/symptom-logs'
    );
    return data.logs ?? [];
  },

  async getPatientLabTestDetails(testId: number): Promise<LabTestDetail[]> {
    const data = await apiClient.get<{ success: boolean; details: LabTestDetail[] }>(
      `/api/appointments/lab-tests/${testId}/details`
    );
    return data.details ?? [];
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

  async getVisibleFeedbacks(): Promise<PatientFeedback[]> {
    const data = await apiClient.get<{ success: boolean; feedbacks: PatientFeedback[] }>('/api/appointments/feedback/visible');
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

  async getNurseCheckInOptions(patientIdParam: string): Promise<NurseCheckInOptionsResponse> {
    return apiClient.get<NurseCheckInOptionsResponse>(
      `/api/appointments/nurse/check-in-options?patientId=${encodeURIComponent(patientIdParam)}`
    );
  },

  async postNurseCheckInAccept(body: { patientId: string | number; appointmentId: number }) {
    return apiClient.post<{ success: boolean; appointment: NurseCheckInSlot; regimenId: number }>(
      '/api/appointments/nurse/check-in-accept',
      body
    );
  },

  async postNurseCheckInAssign(body: { patientId: string | number; appointmentId: number; condition?: string }) {
    return apiClient.post<{ success: boolean; appointment: NurseCheckInSlot; regimenId: number }>(
      '/api/appointments/nurse/check-in-assign',
      body
    );
  },

  async postNurseCheckInReschedule(body: {
    patientId: string | number;
    fromAppointmentId: number;
    toAppointmentId: number;
  }) {
    return apiClient.post<{ success: boolean; appointment: NurseCheckInSlot; regimenId: number }>(
      '/api/appointments/nurse/check-in-reschedule',
      body
    );
  },

  async postNurseRegimenCheckout(body: { patientId: string | number; regimenId: number }) {
    return apiClient.post<{ success: boolean; regimenId: number }>(
      '/api/appointments/nurse/regimen/checkout',
      body
    );
  },
};


