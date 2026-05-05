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

export const options = {
  discardResponseBodies: true,
  setupTimeout: '120s',
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
  },
};

export function setup() {
  return commonSetup();
}

export default function (data) {
  const apptProb = data.appointmentId ? 0.15 : 0;
  runApiIteration(data, { appointmentWriteProbability: apptProb });
  sleep(0.25);
}
