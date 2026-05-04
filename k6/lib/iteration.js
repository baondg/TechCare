import { sleep } from 'k6';
import {
  getHealth,
  staffReadMix,
  isStaffRole,
  getDoctorPatient,
  getDoctorPatientsList,
  getProfile,
  getHealthInfo,
  getAppointments,
  putAppointmentStatus,
} from './requests.js';

/**
 * One mixed API iteration for load / NFR scripts.
 * @param {object} data - from commonSetup()
 * @param {{ appointmentWriteProbability?: number }} opts
 */
export function runApiIteration(data, opts = {}) {
  const appointmentWriteProbability = opts.appointmentWriteProbability ?? 0;
  getHealth(data.baseUrl);
  if (data.skipAuth) {
    return;
  }
  const r = Math.random();
  if (isStaffRole(data.role)) {
    staffReadMix(data.baseUrl, data.token);
    if (data.patientRecordId) {
      if (r < 0.55) {
        getDoctorPatient(data.baseUrl, data.token, data.patientRecordId);
      }
    } else if (r < 0.2) {
      getDoctorPatientsList(data.baseUrl, data.token);
    }
  } else {
    getProfile(data.baseUrl, data.token, data.userId);
    if (r < 0.45) {
      getHealthInfo(data.baseUrl, data.token, data.userId);
    }
    if (r < 0.55) {
      getAppointments(data.baseUrl, data.token);
    }
    if (
      data.appointmentId &&
      String(data.appointmentId).trim() &&
      r < appointmentWriteProbability
    ) {
      putAppointmentStatus(data.baseUrl, data.token, data.appointmentId, 'Confirmed');
    }
  }
  sleep(0.3 + Math.random() * 1.2);
}
