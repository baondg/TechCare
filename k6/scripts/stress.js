/**
 * Stress profile: ramp beyond normal load. Use only against non-production.
 */
import { sleep } from 'k6';
import { commonSetup } from '../lib/setup.js';
import { runApiIteration } from '../lib/iteration.js';

const peak = Math.max(5, Number(__ENV.K6_STRESS_PEAK_VUS || '80'));

export const options = {
  discardResponseBodies: true,
  setupTimeout: '120s',
  stages: [
    { duration: '1m', target: Math.floor(peak / 4) },
    { duration: '2m', target: peak },
    { duration: '2m', target: peak },
    { duration: '1m', target: 0 },
  ],
  thresholds: {
    http_req_failed: ['rate<0.15'],
  },
};

export function setup() {
  return commonSetup();
}

export default function (data) {
  runApiIteration(data, { appointmentWriteProbability: 0 });
  sleep(0.15);
}
