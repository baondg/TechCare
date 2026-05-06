/**
 * NFR-aligned thresholds (see project NFR table):
 * - 80% patient record queries <= 5s  -> p(80) on name:patient_record
 * - 75% appointment write <= 7s       -> p(75) on name:appointment_write
 * - Scale: set K6_MAX_VUS (e.g. 300) for concurrent user target; compare to baseline via two runs and --summary-export (see k6/README.md).
 */
import { sleep } from 'k6';
import { commonSetup } from '../lib/setup.js';
import { runApiIteration } from '../lib/iteration.js';

const maxVus = Math.min(300, Math.max(1, Number(__ENV.K6_MAX_VUS || '30')));
const appointmentWriteMinSamples = Math.max(1, Number(__ENV.K6_APPOINTMENT_WRITE_MIN_SAMPLES || '100'));
const setupTimeout = String(__ENV.K6_SETUP_TIMEOUT || '300s');

export const options = {
  discardResponseBodies: true,
  setupTimeout,
  stages: [
    { duration: '20s', target: Math.min(5, maxVus) },
    { duration: '40s', target: maxVus },
    { duration: '40s', target: maxVus },
    { duration: '20s', target: 0 },
  ],
  thresholds: {
    http_req_failed: ['rate<0.01'],
    'http_req_duration{name:patient_record}': ['p(80)<=5000'],
    'http_req_duration{name:appointment_write}': ['p(75)<=7000'],
    appointment_write_samples: [`count>=${appointmentWriteMinSamples}`],
  },
};

export function setup() {
  return commonSetup();
}

export default function (data) {
  const hasAppointmentTraffic =
    (data.appointmentId && String(data.appointmentId).trim()) ||
    (Array.isArray(data.appointmentIds) && data.appointmentIds.length > 0);
  const parsedApptWriteProb = Number(__ENV.K6_APPOINTMENT_WRITE_PROB);
  const defaultApptWriteProb = 1;
  const apptWriteProb =
    Number.isFinite(parsedApptWriteProb) && parsedApptWriteProb >= 0 && parsedApptWriteProb <= 1
      ? parsedApptWriteProb
      : defaultApptWriteProb;
  const apptProb = hasAppointmentTraffic ? apptWriteProb : 0;
  runApiIteration(data, { appointmentWriteProbability: apptProb });
  sleep(0.25);
}
