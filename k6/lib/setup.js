import { getBaseUrl, requireAuthEnv } from './config.js';
import { login, parseLoginResponse } from './auth.js';
import http from 'k6/http';

function parseOwnedAppointmentIds(res) {
  if (res.status !== 200) {
    throw new Error(
      `Preflight failed: GET /api/appointments for write user returned HTTP ${res.status}.`
    );
  }
  let payload;
  try {
    payload = res.json();
  } catch (_error) {
    throw new Error('Preflight failed: /api/appointments response is not valid JSON.');
  }
  const appointments = Array.isArray(payload?.appointments) ? payload.appointments : [];
  const ownedIds = new Set();
  for (const appt of appointments) {
    const id = appt?.id;
    if (id !== undefined && id !== null && String(id).trim()) {
      ownedIds.add(String(id).trim());
    }
  }
  return ownedIds;
}

function resolveStaffPatientRecordId(baseUrl, token) {
  const res = http.get(`${baseUrl}/api/doctor/patients?limit=1&page=1`, {
    timeout: `${__ENV.K6_TIMEOUT_MS || 60000}ms`,
    responseType: 'text',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(String(__ENV.K6_BENCHMARK_RUN || '').trim() === '1' ? { 'X-Benchmark-Run': '1' } : {}),
    },
    tags: { name: 'patient_record_preflight' },
  });
  if (res.status !== 200) return '';
  try {
    const payload = res.json();
    const first = Array.isArray(payload?.patients) ? payload.patients[0] : null;
    const id = first?.id;
    return id !== undefined && id !== null ? String(id).trim() : '';
  } catch (_error) {
    return '';
  }
}

/**
 * @returns {{ baseUrl: string, skipAuth: true } | { baseUrl: string, skipAuth: false, token: string, userId: number, role: string, username: string, patientRecordId?: string, appointmentId?: string }}
 */
export function commonSetup() {
  const baseUrl = getBaseUrl();
  const auth = requireAuthEnv();
  if (!auth.ok) {
    return { baseUrl, skipAuth: true };
  }
  const res = login(baseUrl, auth.username, auth.password);
  const session = parseLoginResponse(res);
  const writeUsername = String(__ENV.K6_WRITE_USERNAME || __ENV.K6_PATIENT_USERNAME || '').trim();
  const writePassword = String(__ENV.K6_WRITE_PASSWORD || __ENV.K6_PATIENT_PASSWORD || '').trim();
  const appointmentIds = String(__ENV.K6_APPOINTMENT_IDS || '')
    .split(',')
    .map((v) => String(v).trim())
    .filter(Boolean);
  const fallbackAppointmentId = String(__ENV.K6_APPOINTMENT_ID || '').trim();
  if (!appointmentIds.length && fallbackAppointmentId) {
    appointmentIds.push(fallbackAppointmentId);
  }
  let appointmentWriteToken = null;
  if (writeUsername && writePassword) {
    const writeLoginRes = login(baseUrl, writeUsername, writePassword);
    const writeSession = parseLoginResponse(writeLoginRes);
    if (String(writeSession.role || '').toLowerCase() !== 'patient') {
      throw new Error(`K6_WRITE_USERNAME must be a patient account. Received role: ${writeSession.role}`);
    }
    appointmentWriteToken = writeSession.token;
    if (appointmentIds.length > 0) {
      const listRes = http.get(`${baseUrl}/api/appointments`, {
        timeout: `${__ENV.K6_TIMEOUT_MS || 60000}ms`,
        responseType: 'text',
        headers: {
          Authorization: `Bearer ${appointmentWriteToken}`,
          'Content-Type': 'application/json',
          ...(String(__ENV.K6_BENCHMARK_RUN || '').trim() === '1' ? { 'X-Benchmark-Run': '1' } : {}),
        },
        tags: { name: 'appointments_preflight' },
      });
      const ownedIds = parseOwnedAppointmentIds(listRes);
      const missing = appointmentIds.filter((id) => !ownedIds.has(String(id)));
      if (missing.length > 0) {
        throw new Error(
          `Preflight failed: K6_WRITE_USERNAME=${writeUsername} does not own appointment IDs: ${missing.join(
            ', '
          )}.`
        );
      }
    }
  } else if (String(session.role || '').toLowerCase() === 'patient') {
    appointmentWriteToken = session.token;
  }

  let patientRecordId = String(__ENV.K6_PATIENT_RECORD_ID || '').trim();
  const normalizedRole = String(session.role || '').toLowerCase();
  if (!patientRecordId && ['doctor', 'admin', 'nurse', 'technician'].includes(normalizedRole)) {
    patientRecordId = resolveStaffPatientRecordId(baseUrl, session.token);
  }

  return {
    baseUrl,
    skipAuth: false,
    token: session.token,
    userId: session.userId,
    role: session.role,
    username: session.username,
    patientRecordId,
    appointmentId: fallbackAppointmentId,
    appointmentIds,
    appointmentWriteToken,
  };
}
