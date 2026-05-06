#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

function readJson(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
  return JSON.parse(raw);
}

function getMetricAvg(summary, metricName) {
  const metric = summary?.metrics?.[metricName];
  if (!metric) return null;
  if (typeof metric.avg === 'number') return metric.avg;
  if (typeof metric?.values?.avg === 'number') return metric.values.avg;
  return null;
}

function getMetricStat(summary, metricName, statName) {
  const metric = summary?.metrics?.[metricName];
  if (!metric) return null;
  if (typeof metric[statName] === 'number') return metric[statName];
  if (typeof metric?.values?.[statName] === 'number') return metric.values[statName];
  return null;
}

function getConservativePercentileProxy(summary, metricName) {
  const p90 = getMetricStat(summary, metricName, 'p(90)');
  if (Number.isFinite(p90)) {
    return { value: p90, source: 'p(90)' };
  }
  const p95 = getMetricStat(summary, metricName, 'p(95)');
  if (Number.isFinite(p95)) {
    return { value: p95, source: 'p(95)' };
  }
  const avg = getMetricStat(summary, metricName, 'avg');
  if (Number.isFinite(avg)) {
    return { value: avg, source: 'avg' };
  }
  return { value: null, source: 'unavailable' };
}

function getMetricRate(summary, metricName) {
  const metric = summary?.metrics?.[metricName];
  if (!metric) return null;
  if (typeof metric.value === 'number') return metric.value;
  if (typeof metric.rate === 'number') return metric.rate;
  if (typeof metric?.values?.rate === 'number') return metric.values.rate;
  return null;
}

function evaluateExplicitChecks(baseline, load300) {
  const failures = [];
  const checks = [];

  const baselineP80 = getConservativePercentileProxy(baseline, 'http_req_duration{name:patient_record}');
  const loadP80 = getConservativePercentileProxy(load300, 'http_req_duration{name:patient_record}');
  checks.push({
    id: 'patient_record_p80_baseline',
    limit: '<=5000',
    value: baselineP80.value,
    source: baselineP80.source,
    pass: Number.isFinite(baselineP80.value) && baselineP80.value <= 5000,
  });
  checks.push({
    id: 'patient_record_p80_300vu',
    limit: '<=5000',
    value: loadP80.value,
    source: loadP80.source,
    pass: Number.isFinite(loadP80.value) && loadP80.value <= 5000,
  });

  const baselineP75 = getConservativePercentileProxy(baseline, 'http_req_duration{name:appointment_write}');
  const loadP75 = getConservativePercentileProxy(load300, 'http_req_duration{name:appointment_write}');
  checks.push({
    id: 'appointment_write_p75_baseline',
    limit: '<=7000',
    value: baselineP75.value,
    source: baselineP75.source,
    pass: Number.isFinite(baselineP75.value) && baselineP75.value <= 7000,
  });
  checks.push({
    id: 'appointment_write_p75_300vu',
    limit: '<=7000',
    value: loadP75.value,
    source: loadP75.source,
    pass: Number.isFinite(loadP75.value) && loadP75.value <= 7000,
  });

  const minSamples = Number(process.env.K6_APPOINTMENT_WRITE_MIN_SAMPLES || '100');
  const baselineSamples = getMetricStat(baseline, 'appointment_write_samples', 'count');
  const loadSamples = getMetricStat(load300, 'appointment_write_samples', 'count');
  checks.push({
    id: 'appointment_write_samples_baseline',
    limit: `>=${minSamples}`,
    value: baselineSamples,
    pass: Number.isFinite(baselineSamples) && baselineSamples >= minSamples,
  });
  checks.push({
    id: 'appointment_write_samples_300vu',
    limit: `>=${minSamples}`,
    value: loadSamples,
    pass: Number.isFinite(loadSamples) && loadSamples >= minSamples,
  });

  const baselineFailRate = getMetricRate(baseline, 'http_req_failed');
  const loadFailRate = getMetricRate(load300, 'http_req_failed');
  checks.push({
    id: 'http_req_failed_baseline',
    limit: '<0.01',
    value: baselineFailRate,
    pass: Number.isFinite(baselineFailRate) && baselineFailRate < 0.01,
  });
  checks.push({
    id: 'http_req_failed_300vu',
    limit: '<0.01',
    value: loadFailRate,
    pass: Number.isFinite(loadFailRate) && loadFailRate < 0.01,
  });

  for (const check of checks) {
    if (!check.pass) failures.push(`${check.id} :: expected ${check.limit}, got ${check.value}`);
  }
  return { checks, failures };
}

function main() {
  const baselinePath = process.argv[2];
  const loadPath = process.argv[3];
  const outPathArg = process.argv[4];

  if (!baselinePath || !loadPath) {
    console.error('Usage: node k6/scripts/validate-nfr-results.js <baseline.json> <load300.json> [report.json]');
    process.exit(2);
  }

  const baseline = readJson(path.resolve(baselinePath));
  const load300 = readJson(path.resolve(loadPath));

  const metricName = process.env.K6_DELTA_METRIC || 'http_req_duration{name:patient_record}';
  const maxDeltaMs = Number(process.env.K6_MAX_300VU_DELTA_MS || '3000');

  const baselineAvg = getMetricAvg(baseline, metricName);
  const loadAvg = getMetricAvg(load300, metricName);
  if (!Number.isFinite(baselineAvg) || !Number.isFinite(loadAvg)) {
    console.error(`Missing avg metric "${metricName}" in one of the summaries.`);
    process.exit(2);
  }

  const deltaMs = loadAvg - baselineAvg;
  const deltaPass = deltaMs <= maxDeltaMs;
  const explicit = evaluateExplicitChecks(baseline, load300);
  const thresholdFailures = explicit.failures;

  const report = {
    generatedAt: new Date().toISOString(),
    metricName,
    baselineAvgMs: baselineAvg,
    load300AvgMs: loadAvg,
    deltaMs,
    maxAllowedDeltaMs: maxDeltaMs,
    deltaPass,
    thresholdFailures,
    explicitChecks: explicit.checks,
    pass: deltaPass && thresholdFailures.length === 0,
  };

  const outPath = path.resolve(outPathArg || path.join('k6', 'out', 'nfr-validated-report.json'));
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));

  if (!report.pass) {
    console.error('NFR validation failed.');
    console.error(JSON.stringify(report, null, 2));
    process.exit(1);
  }

  console.log('NFR validation passed.');
  console.log(JSON.stringify(report, null, 2));
}

main();
