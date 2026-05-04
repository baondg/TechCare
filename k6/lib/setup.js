import { getBaseUrl, requireAuthEnv } from './config.js';
import { login, parseLoginResponse } from './auth.js';

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
  return {
    baseUrl,
    skipAuth: false,
    token: session.token,
    userId: session.userId,
    role: session.role,
    username: session.username,
    patientRecordId: __ENV.K6_PATIENT_RECORD_ID || '',
    appointmentId: __ENV.K6_APPOINTMENT_ID || '',
  };
}
