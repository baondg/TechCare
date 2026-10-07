/**
 * Shared runner for HTTP characterization tests over the fake DB (see fakeDb.js).
 *
 * A scenario is `[name, method, path, body, rules, setup?]`. For each one the runner records the
 * SQL the handler sent, the transaction events and the HTTP answer, then compares the whole set
 * with a committed snapshot. Regenerate with `UPDATE_SNAPSHOTS=1 npm test` and review the diff.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const { startTestServer } = require('./app');
const { installFakeDb, adminToken } = require('./fakeDb');

/**
 * App-level middleware queries, not part of any endpoint's behaviour. The rate limiter reloads
 * its policy on a timer, so whether they show up depends on how long the run takes.
 */
const IGNORED_SQL = [/AS configKey, value FROM SYSTEM_CONFIGURATION/, /SELECT rate_limit AS rateLimit/];

const dbError = () => Object.assign(new Error('boom'), { name: 'SequelizeDatabaseError' });

/** What older MySQL schemas raise for SYSTEM_CONFIGURATION key/value access. */
const legacySchemaError = () =>
  Object.assign(new Error('Unknown column'), { name: 'SequelizeDatabaseError', original: { code: 'ER_BAD_FIELD_ERROR' } });

/** Strip values that change per run (time, bcrypt salt) so the snapshot is stable. */
function scrub(value) {
  return JSON.parse(
    JSON.stringify(value, (key, v) => {
      if (key === 'password' && typeof v === 'string' && v.startsWith('$2')) return '<bcrypt>';
      if (key === 'idcard') return '<idcard>';
      if (key === 'clinicToday') return '<today>';
      if (key === 'date' && /^\d{4}-\d{2}-\d{2}$/.test(String(v))) return '<date>';
      if (key === 'updatedAt' && /^\d{4}-\d{2}-\d{2}T/.test(String(v))) return '<now>';
      if (typeof v === 'string') return v.replace(/"updatedAt":"\d{4}-\d{2}-\d{2}T[^"]*"/g, '"updatedAt":"<now>"');
      return v;
    })
  );
}

/** Error bodies are compared by status + text: the standard AppError shape is an intended change. */
function describeResponse(status, body) {
  if (status < 400) return { status, body };
  const text = body?.message ?? body?.error ?? null;
  // 5xx text is generic either way; only its presence matters.
  return { status, message: status >= 500 ? String(text).toLowerCase() : text };
}

/**
 * Registers one node:test case that runs every scenario and checks it against `snapshotPath`.
 * @param {(rules: Array) => Array} [prepareRules] last-minute rule rewrite (e.g. today's date)
 */
function characterize(title, snapshotPath, scenarios, { prepareRules = (rules) => rules } = {}) {
  let server;
  let db;

  test.before(async () => {
    db = installFakeDb();
    server = await startTestServer();
  });

  test.after(async () => {
    await server?.close();
    db?.restore();
  });

  test(title, async () => {
    const token = adminToken();
    const actual = {};

    for (const [name, method, urlPath, body, rules, setup] of scenarios) {
      db.reset();
      db.state.rules = prepareRules(rules);
      if (setup) setup(db.state);

      const res = await fetch(`${server.baseUrl}${urlPath}`, {
        method,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: body == null ? undefined : JSON.stringify(body),
      });
      const json = await res.json();
      actual[name] = scrub({
        request: `${method} ${urlPath}`,
        response: describeResponse(res.status, json),
        db: db.state.calls.filter((c) => !c.sql || !IGNORED_SQL.some((re) => re.test(c.sql))),
      });
    }

    if (process.env.UPDATE_SNAPSHOTS === '1' || !fs.existsSync(snapshotPath)) {
      fs.writeFileSync(snapshotPath, `${JSON.stringify(actual, null, 2)}\n`);
    }
    const expected = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
    for (const name of Object.keys(expected)) {
      assert.deepEqual(actual[name], expected[name], `scenario: ${name}`);
    }
    assert.deepEqual(Object.keys(actual), Object.keys(expected));
  });
}

module.exports = { characterize, dbError, legacySchemaError };
