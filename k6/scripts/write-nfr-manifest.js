#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

function main() {
  const outPath = process.argv[2] || 'k6/out/nfr-run-manifest.json';
  const manifest = {
    generatedAt: new Date().toISOString(),
    script: 'k6/scripts/nfr-performance.js',
    environment: {
      BASE_URL: process.env.BASE_URL || null,
      K6_USERNAME: process.env.K6_USERNAME ? '<set>' : '<unset>',
      K6_WRITE_USERNAME: process.env.K6_WRITE_USERNAME ? '<set>' : '<unset>',
      K6_MAX_VUS: process.env.K6_MAX_VUS || null,
      K6_APPOINTMENT_IDS: process.env.K6_APPOINTMENT_IDS || null,
      K6_APPOINTMENT_WRITE_PROB: process.env.K6_APPOINTMENT_WRITE_PROB || '1',
      K6_APPOINTMENT_WRITE_MIN_SAMPLES: process.env.K6_APPOINTMENT_WRITE_MIN_SAMPLES || '100',
      K6_MAX_300VU_DELTA_MS: process.env.K6_MAX_300VU_DELTA_MS || '3000',
    },
    interpretation: {
      thresholdsMustPass: true,
      appointmentWriteSampleGate: 'appointment_write_samples threshold must pass',
      baselineVs300Gate: 'run validate-nfr-results.js and require pass=true',
    },
  };
  const absOut = path.resolve(outPath);
  fs.mkdirSync(path.dirname(absOut), { recursive: true });
  fs.writeFileSync(absOut, JSON.stringify(manifest, null, 2));
  console.log(`Wrote manifest: ${absOut}`);
}

main();
