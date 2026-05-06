import http from 'k6/http';
import { check } from 'k6';
import { Counter } from 'k6/metrics';
import { getTimeout } from './config.js';

export const appointmentWriteSamples = new Counter('appointment_write_samples');

function isBenchmarkRun() {
  const raw = String(__ENV.K6_BENCHMARK_RUN || '').trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
}

export function authParams(token, nameTag) {
  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
  if (isBenchmarkRun()) {
    headers['X-Benchmark-Run'] = '1';
  }
  return {
    timeout: `${getTimeout()}ms`,
    headers,
    tags: { name: nameTag },
  };
}

export function getHealth(baseUrl) {
  const res = http.get(`${baseUrl}/health`, {
    timeout: `${getTimeout()}ms`,
    tags: { name: 'health' },
  });
  check(res, { 'health 200': (r) => r.status === 200 });
  return res;
}

export function getRoot(baseUrl) {
  return http.get(`${baseUrl}/`, {
    timeout: `${getTimeout()}ms`,
    tags: { name: 'root' },
  });
}

const STAFF_ROLES = new Set(['doctor', 'admin', 'nurse', 'technician']);

export function isStaffRole(role) {
  return STAFF_ROLES.has(String(role || '').toLowerCase());
}

/** Dictionary / read-only doctor endpoints */
export function staffReadMix(baseUrl, token) {
  const paths = [
    ['/api/doctor/diseases', 'doctor_diseases'],
    ['/api/doctor/medicines', 'doctor_medicines'],
    ['/api/doctor/departments', 'doctor_departments'],
    ['/api/doctor/technicians', 'doctor_technicians'],
  ];
  const i = Math.floor(Math.random() * paths.length);
  const [path, tag] = paths[i];
  const res = http.get(`${baseUrl}${path}`, authParams(token, tag));
  check(res, { [`${tag} status 200`]: (r) => r.status === 200 });
  return res;
}

/**
 * Tagged as patient_record for NFR (single patient chart when id provided).
 * @param {string} patientRouteId - numeric patient_id or OP-prefixed id as in UI
 */
export function getDoctorPatient(baseUrl, token, patientRouteId) {
  const id = encodeURIComponent(String(patientRouteId));
  const res = http.get(`${baseUrl}/api/doctor/patients/${id}`, authParams(token, 'patient_record'));
  check(res, { 'patient_record status 200': (r) => r.status === 200 });
  return res;
}

export function getDoctorPatientsList(baseUrl, token) {
  const res = http.get(`${baseUrl}/api/doctor/patients`, authParams(token, 'patient_record'));
  check(res, { 'patient_record list 200': (r) => r.status === 200 });
  return res;
}

export function getProfile(baseUrl, token, userId) {
  const res = http.get(`${baseUrl}/api/profile/${userId}`, authParams(token, 'patient_record'));
  check(res, { 'patient_record profile 200': (r) => r.status === 200 });
  return res;
}

export function getHealthInfo(baseUrl, token, userId) {
  const res = http.get(`${baseUrl}/api/health-info/${userId}`, authParams(token, 'patient_record'));
  check(res, { 'patient_record health_info 200': (r) => r.status === 200 });
  return res;
}

export function getAppointments(baseUrl, token) {
  const res = http.get(`${baseUrl}/api/appointments`, authParams(token, 'appointments_list'));
  check(res, { 'appointments_list 200': (r) => r.status === 200 });
  return res;
}

/**
 * PUT /api/appointments/:id — lightweight status update (maps to scheduled).
 * @param {string|number} appointmentId
 */
export function putAppointmentStatus(baseUrl, token, appointmentId, status) {
  const body = JSON.stringify({ status: status || 'Confirmed' });
  const res = http.put(
    `${baseUrl}/api/appointments/${appointmentId}`,
    body,
    authParams(token, 'appointment_write')
  );
  check(res, {
    'appointment_write 2xx': (r) => r.status >= 200 && r.status < 300,
  });
  if (res.status >= 200 && res.status < 300) {
    appointmentWriteSamples.add(1);
  }
  return res;
}

/** RBAC: patient token should not access doctor diseases */
export function expectForbidden(res) {
  return check(res, { 'forbidden 403': (r) => r.status === 403 });
}
