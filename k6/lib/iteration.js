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
  const writeEvery = appointmentWriteProbability > 0 ? Math.max(1, Math.round(1 / appointmentWriteProbability)) : 0;
  const shouldWriteThisIteration = writeEvery > 0 && ((__ITER + __VU) % writeEvery === 0);
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
  }
  const ids = Array.isArray(data.appointmentIds) ? data.appointmentIds : [];
  const selectedAppointmentId = ids.length ? ids[(__VU + __ITER) % ids.length] : data.appointmentId;
  if (selectedAppointmentId && String(selectedAppointmentId).trim() && shouldWriteThisIteration) {
    const writeToken = data.appointmentWriteToken || data.token;
    putAppointmentStatus(data.baseUrl, writeToken, selectedAppointmentId, 'Confirmed');
  }
  sleep(0.3 + Math.random() * 1.2);
}
