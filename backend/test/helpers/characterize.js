/**
 * Shared runner for HTTP characterization tests over the fake DB (see fakeDb.js).
 *
 * A scenario is `[name, method, path, body, rules, setup?]`. `setup(state)` may return
 * `{ headers }` to add request headers (`Authorization: null` sends none). For each scenario the
 * runner records the SQL / model calls the handler made, transaction events, and the HTTP answer
 * (status, body or error text, Set-Cookie), then compares the whole set with a committed snapshot.
 * Regenerate with `UPDATE_SNAPSHOTS=1 npm test` and review the diff.
 *
 * Outbound HTTP (LLM providers) never leaves the process: every fetch to another host is recorded
 * as `{ event: 'fetch', url, body }` and answered by `state.upstream(url, body)`, which returns
 * `{ status, json }` or an Error (network failure). Without a handler it fails like a refused
 * connection.
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

const JWT = /eyJ[\w-]+\.[\w-]+\.[\w-]+/g;
const HAS_JWT = /eyJ[\w-]+\.[\w-]+\.[\w-]+/;

/** Strip values that change per run (time, bcrypt salt, JWTs) so the snapshot is stable. */
function scrub(value, custom = () => undefined) {
  return JSON.parse(
    JSON.stringify(value, (key, v) => {
      const replaced = custom(key, v);
      if (replaced !== undefined) return replaced;
      if (typeof v === 'string' && HAS_JWT.test(v)) return v.replace(JWT, '<jwt>');
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

/**
 * Error bodies are compared by status + text (+ `code` when it is one the client acts on): the
 * standard AppError shape is an intended change.
 */
function describeResponse(res, body, codes, fullErrorBody) {
  const cookie = res.headers.get('set-cookie');
  const extra = cookie ? { cookie: cookie.replace(/Expires=(?!Thu, 01 Jan 1970)[^;]+/g, 'Expires=<date>') } : {};
  if (res.status < 400 || fullErrorBody) return { status: res.status, body, ...extra };
  const text = body?.message ?? body?.error ?? null;
  return {
    status: res.status,
    // Lower-cased so only wording, not capitalisation, of generic 5xx text matters.
    message: res.status >= 500 ? String(text).toLowerCase() : text,
    ...(codes.includes(body?.code) ? { code: body.code } : {}),
    ...extra,
  };
}

/**
 * Registers one node:test case that runs every scenario and checks it against `snapshotPath`.
 * @param {(rules: Array) => Array} [prepareRules] last-minute rule rewrite (e.g. today's date)
 * @param {(key: string, value: unknown) => unknown} [scrubValue] extra scrubbing; undefined = default
 * @param {string[]} [codes] error `code`s worth pinning (clients branch on them)
 * @param {boolean} [fullErrorBody] pin whole error bodies (endpoints whose error shape is a contract)
 */
function characterize(
  title,
  snapshotPath,
  scenarios,
  { prepareRules = (rules) => rules, scrubValue, codes = [], fullErrorBody = false } = {}
) {
  let server;
  let db;

  const realFetch = globalThis.fetch;

  test.before(async () => {
    db = installFakeDb();
    server = await startTestServer();
    globalThis.fetch = async (url, init = {}) => {
      if (String(url).startsWith(server.baseUrl)) return realFetch(url, init);
      let body = init.body;
      try {
        body = JSON.parse(init.body);
      } catch (_e) {
        // keep raw text
      }
      db.state.calls.push({ event: 'fetch', url: String(url), body });
      const reply = db.state.upstream ? db.state.upstream(String(url), body) : new TypeError('fetch failed');
      if (reply instanceof Error) throw reply;
      return new Response(JSON.stringify(reply.json ?? {}), {
        status: reply.status ?? 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };
  });

  test.after(async () => {
    globalThis.fetch = realFetch;
    await server?.close();
    db?.restore();
  });

  test(title, async () => {
    const token = adminToken();
    const actual = {};

    for (const [name, method, urlPath, body, rules, setup] of scenarios) {
      db.reset();
      db.state.rules = prepareRules(rules);
      const extraHeaders = (setup && setup(db.state))?.headers || {};

      const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...extraHeaders };
      for (const key of Object.keys(headers)) if (headers[key] == null) delete headers[key];
      const res = await fetch(`${server.baseUrl}${urlPath}`, {
        method,
        headers,
        body: body == null ? undefined : JSON.stringify(body),
      });
      const json = await res.json();
      actual[name] = scrub(
        {
          request: `${method} ${urlPath}`,
          response: describeResponse(res, json, codes, fullErrorBody),
          db: db.state.calls.filter((c) => !c.sql || !IGNORED_SQL.some((re) => re.test(c.sql))),
        },
        scrubValue
      );
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
