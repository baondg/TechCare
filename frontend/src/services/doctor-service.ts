const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';
import type { PatientMedicalRegimen } from './appointment-service';

// ─── Helpers ───

const getAuthHeader = () => {
  const token = localStorage.getItem('authToken');
  return {
    'Content-Type': 'application/json',
    Authorization: token ? `Bearer ${token}` : '',
  };
};

const handleUnauthorized = (status: number) => {
  if (status === 401 || status === 403) {
    localStorage.removeItem('authToken');
    localStorage.removeItem('user');
    window.location.href = '/login';
  }
};

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = String(reader.result || "")
      const idx = result.indexOf(",")
      resolve(idx >= 0 ? result.slice(idx + 1) : result)
    }
    reader.onerror = () => reject(new Error("Cannot read file"))
    reader.readAsDataURL(file)
  })
}

async function apiRequest<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...options,
    headers: { ...getAuthHeader(), ...(options?.headers || {}) },
  });

  if (!res.ok) {
    handleUnauthorized(res.status);
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(err.message || 'Request failed');
  }

  return res.json();
}

// ─── Types ───

export interface Patient {
  id: number;
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  age: number | null;
  gender: string | null;
  createdAt: string;
  latestDiagnosis: { icd10: string; interpretation: string } | null;
  latestVisit: string | null;
  doctor: string | null;
  bmi: number | null;
}

export interface PatientDetail extends Patient {
  latestDiagnosis: { icd10: string; interpretation: string; department: string } | null;
  dateOfBirth?: string | null;
  /** From PATIENT.in_department (enum in DB) */
  inDepartment?: string | null;
  /** HEALTH_INSURANCE.id */
  healthInsuranceId?: string | null;
  /** HEALTH_INSURANCE.expired_date */
  healthInsuranceExpiredDate?: string | null;
  bloodType: string | null;
  bmi: number | null;
}

export interface HealthInfo {
  id: number;
  patientId: number;
  height: number | null;
  weight: number | null;
  bmi: number | null;
  bloodPressureSys: number | null;
  bloodPressureDia: number | null;
  heartRate: number | null;
  respiratoryRate: number | null;
  temperature: number | null;
  spo2: number | null;
  bloodType: string | null;
  currentSymptoms: string | null;
  drugAllergies: string[];
  foodAllergies: string[];
  otherAllergies: string[];
  chronicConditions: string[];
  pastSurgeries: string[];
  familyHistory: string[];
  pastIllnesses: string[];
  vaccinations: string[];
  substanceAbuse: string[];
  status?: 'draft' | 'confirmed';
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Diagnosis {
  id: number;
  patientId: number;
  doctorId: number;
  doctorName: string;
  department: string;
  complaint: string;
  icd10: string;
  interpretation: string;
  note: string;
  createdAt: string;
  updatedAt: string;
}

export interface DiseaseCode {
  code: string;
  description: string;
}

export interface MedicineOption {
  id: number;
  name: string;
  /** From MEDICINE.unit (varchar) — normalized on the prescription form */
  unit?: string | null;
}

export interface Medication {
  id?: number;
  name: string;
  quantity: string;
  /** Days to take the medication (PRESCRIPTION_DETAIL.duration). */
  duration?: string;
  usage: string;
  unit: 'tablet' | 'capsule' | 'syrup' | 'injection' | 'drop' | 'cream' | 'ointment' | 'powder' | 'spray';
  note?: string;
}

export type PrescriptionSignatureStatus = 'draft' | 'signed' | 'voided';

export interface Prescription {
  id: number;
  patientId: number;
  doctorId: number;
  doctorName: string;
  department: string;
  /** MEDICAL_PRESCRIPTION.duration (days, whole order). */
  duration?: number;
  /** API compatibility: always "signed" after save (no MEDICAL_PRESCRIPTION.status column). */
  signatureStatus: PrescriptionSignatureStatus;
  medications: Medication[];
  createdAt: string;
  updatedAt: string;
}

export interface LabTest {
  id: number;
  patientId: number;
  technicianId?: number | null;
  testType: string;
  testDate: string;
  technicianName: string | null;
  resultSummary: string | null;
  fileUrl: string | null;
  note: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface TechnicianOption {
  technicianId: number
  technicianName: string
}

export interface DepartmentOption {
  id: number
  name: string
}

export interface LabTestDetail {
  testId: number
  no: number
  itemIndex: string
  result: string
  unit: string | null
}

/** Aligns with SURGERY + PROCEDURE_.note; type is SURGERY.type ENUM */
export interface SurgeryRecord {
  id: number;
  patientId: number;
  type:
    | 'Minor Surgery'
    | 'Intermediate Surgery'
    | 'Major Ambulatory Surgery'
    | 'Day Surgery'
    | string;
  start: string | null;
  end: string | null;
  surgeonName: string | null;
  urgency: string | null;
  result: string | null;
  note: string | null;
}

export interface DoctorAppointment {
  id: number;
  userId: number;
  doctor: string;
  /** Current assignee (same as logged-in doctor on this list) */
  assignedDoctorId?: number;
  department: string;
  date: string;
  time: string;
  status: string;
  room: string;
  symptoms: string;
  notes: string;
  patientName: string;
  patientId: number;
  doctorConfirmed?: boolean;
  /** Patient portal booking waiting for Accept / Decline */
  awaitingDoctorConfirmation?: boolean;
}

export interface DoctorDashboardSummary {
  summary: {
    appointmentsToday: number;
    diagnosesToday: number;
    prescriptionsToday: number;
    labTestsToday: number;
  };
  todaysSchedule: Array<{
    id: number;
    date: string;
    time: string;
    department: string;
    room: string;
    patientId: number;
    patientName: string;
    status: string;
  }>;
  recentPatients: Array<{
    patientId: number;
    patientName: string;
    lastTime: string;
  }>;
}

export interface Pagination {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// ─── Service ───

export const doctorService = {
  // ═══ Patients ═══

  async getPatients(search?: string, page = 1, limit = 50) {
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (search) params.set('search', search);

    return apiRequest<{
      success: boolean;
      patients: Patient[];
      pagination: Pagination;
    }>(`${API_BASE_URL}/api/doctor/patients?${params}`);
  },

  async getPatient(patientId: number | string) {
    return apiRequest<{
      success: boolean;
      patient: PatientDetail;
    }>(`${API_BASE_URL}/api/doctor/patients/${patientId}`);
  },

  async getActiveRegimen(patientId: number | string) {
    return apiRequest<{
      success: boolean;
      active: { regimenId: number; startAt: string } | null;
      /** Today’s check-in slot room (APPOINTMENT), or first treatment room on open visit — for clinic transfer “from”. */
      checkInRoom: { id: number; name: string } | null;
    }>(`${API_BASE_URL}/api/doctor/patients/${patientId}/regimen/active`);
  },

  async getDepartments() {
    return apiRequest<{
      success: boolean
      departments: DepartmentOption[]
    }>(`${API_BASE_URL}/api/doctor/departments`)
  },

  async closeOpenVisitRegimen(patientId: number | string) {
    return apiRequest<{ success: boolean; regimenId: number }>(
      `${API_BASE_URL}/api/doctor/patients/${patientId}/regimen/close`,
      { method: 'POST' }
    );
  },

  /** Persist PHIẾU HẸN KHÁM LẠI into the open regimen (merged patient/doctor PDF export). */
  async createFollowUpReexamSlip(patientId: number | string, slip: Record<string, unknown>) {
    return apiRequest<{ success: boolean; slip: { orderId: number; regimenId: number } }>(
      `${API_BASE_URL}/api/doctor/patients/${encodeURIComponent(String(patientId))}/follow-up-reexam-slip`,
      { method: 'POST', body: JSON.stringify({ slip }) }
    );
  },

  async getActiveRegimenDocuments(patientId: number | string) {
    return apiRequest<{
      success: boolean;
      regimen: null | {
        regimenId: number;
        regimenStart: string;
        treatments: Array<{
          treatmentId: number;
          visitAt: string;
          department: string;
          complaint: string;
          icd10: string;
          interpretation: string;
          doctorName: string;
          roomName: string;
        }>;
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
          testAt: string;
          testType: string;
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
        hospitalTransfers: Array<{
          orderId: number;
          reason: string;
          note: string;
          transferAt: string;
          toHospitalId: string | null;
          toHospitalName: string;
          transport: string | null;
          formPayload: Record<string, unknown> | null;
        }>;
        healthTrackingSlips: Array<{
          orderId: number;
          createdAt: string;
          createdByDoctor: string | null;
          rows: Array<{
            id: number;
            updatedAt: string;
            bloodPressure: string;
            pulse: number;
            temperature: number;
            weight: number;
            respiratoryRate: number;
            spo2: number;
            symptoms: string;
          }>;
          formPayload: Record<string, unknown> | null;
        }>;
      };
    }>(`${API_BASE_URL}/api/doctor/patients/${patientId}/regimen/active/documents`);
  },

  async getPatientMedicalRegimens(patientId: number | string): Promise<PatientMedicalRegimen[]> {
    const data = await apiRequest<{ success: boolean; regimens: PatientMedicalRegimen[] }>(
      `${API_BASE_URL}/api/doctor/patients/${patientId}/medical-regimens`
    );
    return (data.regimens ?? []).map((r) => ({
      ...r,
      hospitalTransfers: Array.isArray(r.hospitalTransfers) ? r.hospitalTransfers : [],
      healthTrackingSlips: Array.isArray((r as any).healthTrackingSlips) ? (r as any).healthTrackingSlips : [],
      followUpReexamSlips: Array.isArray((r as any).followUpReexamSlips) ? (r as any).followUpReexamSlips : [],
    }));
  },

  // ═══ Health Info ═══

  async getHealthInfo(patientId: number) {
    return apiRequest<{
      success: boolean;
      healthInfo: HealthInfo | null;
    }>(`${API_BASE_URL}/api/doctor/patients/${patientId}/health-info`);
  },

  async getHealthInfoHistory(patientId: number, page = 1, limit = 10) {
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    return apiRequest<{
      success: boolean;
      history: HealthInfo[];
      pagination: Pagination;
    }>(`${API_BASE_URL}/api/doctor/patients/${patientId}/health-info/history?${params}`);
  },

  async createHealthInfo(patientId: number, data: Partial<HealthInfo>) {
    return apiRequest<{
      success: boolean;
      healthInfo: HealthInfo;
    }>(`${API_BASE_URL}/api/doctor/patients/${patientId}/health-info`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async updateHealthInfo(patientId: number, id: number, data: Partial<HealthInfo>) {
    return apiRequest<{
      success: boolean;
      healthInfo: HealthInfo;
    }>(`${API_BASE_URL}/api/doctor/patients/${patientId}/health-info/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  async deleteHealthInfo(patientId: number, id: number) {
    return apiRequest<{ success: boolean; message: string }>(
      `${API_BASE_URL}/api/doctor/patients/${patientId}/health-info/${id}`,
      { method: 'DELETE' }
    );
  },

  async confirmHealthInfo(patientId: number | string, id: number | string) {
    return apiRequest<{ success: boolean; id: number; status: 'confirmed' }>(
      `${API_BASE_URL}/api/doctor/patients/${patientId}/health-info/${id}/confirm`,
      { method: 'PATCH' }
    );
  },

  // ═══ Diagnoses ═══

  async getDiagnoses(patientId: number | string) {
    return apiRequest<{
      success: boolean;
      diagnoses: Diagnosis[];
    }>(`${API_BASE_URL}/api/doctor/patients/${patientId}/diagnoses`);
  },

  async createDiagnosis(patientId: number | string, data: {
    complaint: string;
    icd10: string;
    interpretation?: string;
    note?: string;
    department?: string;
  }) {
    return apiRequest<{
      success: boolean;
      diagnosis: Diagnosis;
    }>(`${API_BASE_URL}/api/doctor/patients/${patientId}/diagnoses`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async updateDiagnosis(
    patientId: number | string,
    diagnosisId: number | string,
    data: {
      complaint: string;
      icd10: string;
      interpretation?: string;
      note?: string;
      department?: string;
    }
  ) {
    return apiRequest<{
      success: boolean;
      diagnosis: Diagnosis;
    }>(`${API_BASE_URL}/api/doctor/patients/${patientId}/diagnoses/${diagnosisId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  async getDiseaseCodes(q?: string) {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    return apiRequest<{
      success: boolean;
      diseases: DiseaseCode[];
    }>(`${API_BASE_URL}/api/doctor/diseases${params.toString() ? `?${params}` : ''}`);
  },

  async getMedicines(q?: string) {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    return apiRequest<{
      success: boolean;
      medicines: MedicineOption[];
    }>(`${API_BASE_URL}/api/doctor/medicines${params.toString() ? `?${params}` : ''}`);
  },

  // ═══ Prescriptions ═══

  async getPrescriptions(patientId: number | string) {
    return apiRequest<{
      success: boolean;
      prescriptions: Prescription[];
    }>(`${API_BASE_URL}/api/doctor/patients/${patientId}/prescriptions`);
  },

  async createPrescription(patientId: number | string, data: {
    department?: string;
    /** MEDICAL_PRESCRIPTION.duration (days); defaults on server if omitted. */
    duration?: number;
    medications: Omit<Medication, 'id'>[];
  }) {
    return apiRequest<{
      success: boolean;
      prescription: Prescription;
    }>(`${API_BASE_URL}/api/doctor/patients/${patientId}/prescriptions`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async updatePrescription(
    patientId: number | string,
    prescriptionId: number | string,
    data: {
      department?: string;
      duration?: number;
      medications: Omit<Medication, 'id'>[];
    }
  ) {
    return apiRequest<{
      success: boolean;
      prescription: Prescription;
    }>(`${API_BASE_URL}/api/doctor/patients/${patientId}/prescriptions/${prescriptionId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  // ═══ Lab tests ═══

  async getLabTests(patientId: number | string) {
    return apiRequest<{
      success: boolean;
      labTests: LabTest[];
    }>(`${API_BASE_URL}/api/doctor/patients/${patientId}/lab-tests`);
  },

  async getTechnicians() {
    return apiRequest<{
      success: boolean;
      technicians: TechnicianOption[];
    }>(`${API_BASE_URL}/api/doctor/technicians`);
  },

  async getLabTestDetails(patientId: number | string, testId: number | string) {
    return apiRequest<{
      success: boolean
      details: LabTestDetail[]
    }>(`${API_BASE_URL}/api/doctor/patients/${patientId}/lab-tests/${testId}/details`)
  },

  async uploadLabAttachment(file: File) {
    const dataBase64 = await fileToBase64(file)
    return apiRequest<{
      success: boolean
      fileUrl: string
      fileName: string
    }>(`${API_BASE_URL}/api/doctor/lab-attachments`, {
      method: "POST",
      body: JSON.stringify({
        fileName: file.name,
        mimeType: file.type || "application/octet-stream",
        dataBase64,
      }),
    })
  },

  async createLabTest(
    patientId: number | string,
    data: {
      testType: string;
      testDate: string;
      technicianId?: number | null;
      technicianName?: string;
      resultSummary?: string;
      fileUrl?: string;
      note?: string;
    }
  ) {
    return apiRequest<{ success: boolean; labTest: LabTest }>(
      `${API_BASE_URL}/api/doctor/patients/${patientId}/lab-tests`,
      { method: 'POST', body: JSON.stringify(data) }
    );
  },

  async updateLabTest(
    patientId: number | string,
    id: number,
    data: Partial<{
      testType: string;
      testDate: string;
      technicianId: number | null;
      technicianName: string | null;
      resultSummary: string | null;
      fileUrl: string | null;
      note: string | null;
    }>
  ) {
    return apiRequest<{ success: boolean; labTest: LabTest }>(
      `${API_BASE_URL}/api/doctor/patients/${patientId}/lab-tests/${id}`,
      { method: 'PUT', body: JSON.stringify(data) }
    );
  },

  // ═══ Surgeries ═══

  async getSurgeries(patientId: number | string) {
    return apiRequest<{
      success: boolean;
      surgeries: SurgeryRecord[];
    }>(`${API_BASE_URL}/api/doctor/patients/${patientId}/surgeries`);
  },

  async createSurgery(
    patientId: number | string,
    data: {
      type: string;
      start?: string | null;
      end?: string | null;
      surgeonName?: string | null;
      urgency?: string | null;
      result?: string | null;
      note?: string | null;
    }
  ) {
    return apiRequest<{ success: boolean; surgery: SurgeryRecord }>(
      `${API_BASE_URL}/api/doctor/patients/${patientId}/surgeries`,
      { method: 'POST', body: JSON.stringify(data) }
    );
  },

  async updateSurgery(
    patientId: number | string,
    id: number,
    data: Partial<{
      type: string;
      start: string | null;
      end: string | null;
      surgeonName: string | null;
      urgency: string | null;
      result: string | null;
      note: string | null;
    }>
  ) {
    return apiRequest<{ success: boolean; surgery: SurgeryRecord }>(
      `${API_BASE_URL}/api/doctor/patients/${patientId}/surgeries/${id}`,
      { method: 'PUT', body: JSON.stringify(data) }
    );
  },

  // ═══ Appointments ═══

  async getAppointments(params?: { status?: string; startDate?: string; endDate?: string }) {
    const query = new URLSearchParams();
    if (params?.status) query.set('status', params.status);
    if (params?.startDate) query.set('startDate', params.startDate);
    if (params?.endDate) query.set('endDate', params.endDate);

    return apiRequest<{
      success: boolean;
      appointments: DoctorAppointment[];
    }>(`${API_BASE_URL}/api/doctor/appointments?${query}`);
  },

  async createAppointment(data: {
    patientId: number | string;
    department: string;
    date: string;
    time: string;
    room?: string;
    symptoms?: string;
    notes?: string;
  }) {
    return apiRequest<{
      success: boolean;
      appointment: DoctorAppointment;
    }>(`${API_BASE_URL}/api/doctor/appointments`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async createPatientTransfer(
    patientId: number | string,
    data:
      | {
          kind: 'clinic';
          reason: string;
          note?: string;
          fromRoomId: number;
          toRoomId: number;
        }
      | {
          kind: 'hospital';
          reason: string;
          note?: string;
          toHospitalName: string;
          toHospitalId?: string;
          transport?: string;
          /** Lưu vào HOSPITAL_TRANSFERENCE.form_payload (JSON) */
          formPayload?: Record<string, unknown>;
        }
  ) {
    return apiRequest<{
      success: boolean;
      transfer: { orderId: number; treatmentId: number; kind: string };
    }>(`${API_BASE_URL}/api/doctor/patients/${encodeURIComponent(String(patientId))}/transfers`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async addHealthTrackingSlipToMedicalRecord(
    patientId: number | string,
    data: {
      recordIds: number[];
      note?: string;
      ms?: string;
      admissionNo?: string;
    }
  ) {
    return apiRequest<{
      success: boolean;
      slip: {
        orderId: number;
        regimenId: number;
        rowsCount: number;
      };
    }>(`${API_BASE_URL}/api/doctor/patients/${encodeURIComponent(String(patientId))}/health-tracking-slips`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  async cancelAppointment(id: number, reason: string) {
    return apiRequest<{
      success: boolean;
      appointment: DoctorAppointment;
    }>(`${API_BASE_URL}/api/doctor/appointments/${id}/cancel`, {
      method: 'PUT',
      body: JSON.stringify({ reason }),
    });
  },

  async coverAppointment(appointmentId: number, coverDoctorId: number, reason: string) {
    return apiRequest<{
      success: boolean;
      appointment: { id: number; doctorId: number; roomId: number };
    }>(`${API_BASE_URL}/api/doctor/appointments/${appointmentId}/cover`, {
      method: 'PUT',
      body: JSON.stringify({ coverDoctorId, reason }),
    });
  },

  async confirmAppointment(id: number) {
    return apiRequest<{
      success: boolean;
      appointment: DoctorAppointment;
    }>(`${API_BASE_URL}/api/doctor/appointments/${id}/confirm`, {
      method: 'PUT',
    });
  },

  async declineAppointment(id: number, reason: string) {
    return apiRequest<{
      success: boolean;
      appointment: { id: number; status: string };
    }>(`${API_BASE_URL}/api/doctor/appointments/${id}/decline`, {
      method: 'PUT',
      body: JSON.stringify({ reason }),
    });
  },

  async getDashboardSummary() {
    return apiRequest<{ success: boolean } & DoctorDashboardSummary>(`${API_BASE_URL}/api/doctor/dashboard/summary`);
  },

  // ═══════════════════════════════════════════════
  //  AI MEDICINE SUGGESTIONS
  // ═══════════════════════════════════════════════

  async getAiMedicineSuggestions(data: {
    diagnosis: string;
    symptoms: string;
    patientInfo?: string;
  }) {
    return apiRequest<{
      success: boolean;
      suggestions: Array<{
        name: string;
        quantity: string;
        unit: string;
        usage: string;
        note: string;
        /** Treatment days per line; defaults to 7 in UI if omitted */
        duration?: string | number;
      }>;
      raw: string;
      provider: string;
    }>(`${API_BASE_URL}/api/ai/suggest-medicine`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // ═══════════════════════════════════════════════
  //  DOCTOR SIGNATURE
  // ═══════════════════════════════════════════════

  async getSignature() {
    return apiRequest<{
      success: boolean;
      signature: string | null;
    }>(`${API_BASE_URL}/api/doctor/signature`);
  },

  async saveSignature(signatureDataUrl: string) {
    return apiRequest<{
      success: boolean;
    }>(`${API_BASE_URL}/api/doctor/signature`, {
      method: 'PUT',
      body: JSON.stringify({ signature: signatureDataUrl }),
    });
  },

  // ═══════════════════════════════════════════════
  //  COVER REQUESTS
  // ═══════════════════════════════════════════════

  async createCoverRequest(appointmentIds: number[], reason: string) {
    return apiRequest<{
      success: boolean;
      coverRequests: Array<{ id: number; appointmentId: number }>;
    }>(`${API_BASE_URL}/api/cover/request`, {
      method: 'POST',
      body: JSON.stringify({ appointmentIds, reason }),
    });
  },

  async getCoverRequests() {
    return apiRequest<{
      success: boolean;
      coverRequests: Array<{
        id: number;
        appointmentId: number;
        status: string;
        reason: string;
        createdAt: string;
        appointmentDate: string;
        appointmentTime: string;
        appointmentCondition: string;
        originalDoctorName: string;
        department: string;
        patientName: string;
        roomName: string;
      }>;
    }>(`${API_BASE_URL}/api/cover/requests`);
  },

  async getMyCoverRequests() {
    return apiRequest<{
      success: boolean;
      coverRequests: Array<{
        id: number;
        appointmentId: number;
        status: string;
        reason: string;
        createdAt: string;
        appointmentDate: string;
        appointmentTime: string;
        coverDoctorName: string;
      }>;
    }>(`${API_BASE_URL}/api/cover/my-requests`);
  },

  async acceptCoverRequest(id: number) {
    return apiRequest<{ success: boolean; message: string }>(
      `${API_BASE_URL}/api/cover/${id}/accept`,
      { method: 'PUT' }
    );
  },

  async rejectCoverRequest(id: number) {
    return apiRequest<{ success: boolean; message: string }>(
      `${API_BASE_URL}/api/cover/${id}/reject`,
      { method: 'PUT' }
    );
  },
};
