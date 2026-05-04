import { sleep } from 'k6';
import { commonSetup } from '../lib/setup.js';
import { runApiIteration } from '../lib/iteration.js';

export const options = {
  discardResponseBodies: true,
  setupTimeout: '120s',
  stages: [
    { duration: '30s', target: Number(__ENV.K6_STAGE_TARGET || '10') },
    { duration: '1m', target: Number(__ENV.K6_STAGE_TARGET || '10') },
    { duration: '20s', target: 0 },
  ],
  thresholds: {
    http_req_failed: ['rate<0.05'],
    'http_req_duration{name:health}': ['p(95)<3000'],
  },
};

export function setup() {
  return commonSetup();
}

export default function (data) {
  runApiIteration(data, { appointmentWriteProbability: 0 });
  sleep(0.2);
}
