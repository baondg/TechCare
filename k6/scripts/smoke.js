/**
 * Smoke test — expects TechCare backend reachable at BASE_URL (default http://localhost:5000).
 * Start the stack first, e.g. `.\scripts\docker.ps1 -Action up` from the repo root.
 */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { getBaseUrl } from '../lib/config.js';
import { login, parseLoginResponse } from '../lib/auth.js';
import {
  getHealth,
  getRoot,
  staffReadMix,
  isStaffRole,
  getDoctorPatient,
  getProfile,
  expectForbidden,
} from '../lib/requests.js';

export const options = {
  vus: 1,
  iterations: 1,
  thresholds: {
    http_req_failed: ['rate<0.01'],
    'http_req_duration{name:health}': ['p(95)<3000'],
  },
};

export default function () {
  const baseUrl = getBaseUrl();
  getHealth(baseUrl);

  const root = getRoot(baseUrl);
  check(root, { 'root 2xx': (r) => r.status >= 200 && r.status < 300 });

  const user = __ENV.K6_USERNAME;
  const pass = __ENV.K6_PASSWORD;
  if (!user || !pass) {
    return;
  }

  const loginRes = login(baseUrl, user, pass);
  check(loginRes, { 'login 200': (r) => r.status === 200 });
  if (loginRes.status !== 200) {
    return;
  }
  let session;
  try {
    session = parseLoginResponse(loginRes);
  } catch (_e) {
    return;
  }

  if (isStaffRole(session.role)) {
    staffReadMix(baseUrl, session.token);
    const pr = __ENV.K6_PATIENT_RECORD_ID;
    if (pr) {
      getDoctorPatient(baseUrl, session.token, pr);
    }
  } else {
    getProfile(baseUrl, session.token, session.userId);
  }

  const patientUser = __ENV.K6_PATIENT_USERNAME;
  const patientPass = __ENV.K6_PATIENT_PASSWORD;
  if (patientUser && patientPass && isStaffRole(session.role)) {
    const pRes = login(baseUrl, patientUser, patientPass);
    if (pRes.status === 200) {
      try {
        const pSession = parseLoginResponse(pRes);
        const docProbe = http.get(`${baseUrl}/api/doctor/diseases`, {
          headers: { Authorization: `Bearer ${pSession.token}` },
          tags: { name: 'rbac_patient_doctor' },
        });
        expectForbidden(docProbe);
      } catch (_e) {
        /* ignore optional RBAC probe */
      }
    }
  }

  sleep(0.2);
}