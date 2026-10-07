/**
 * In-process fake for the database layer, for HTTP-level characterization tests without MySQL.
 *
 * Stubs, on the compiled modules in dist/ (the same instances the app uses):
 *   - sequelize.query       → answered by `rules`, every call recorded
 *   - sequelize.transaction → fake tx with commit/rollback, recorded
 *   - Session / Account models used by authMiddleware → a valid admin session
 *
 * A rule is `[regex, result]` matched against the whitespace-collapsed SQL; `result` is a value
 * or `(call) => value`. Unmatched queries return [] ([{}, null] for upserts) so a test never
 * fails on a missing rule.
 */
const path = require('node:path');
const jwt = require('jsonwebtoken');

const DIST = path.join(__dirname, '..', '..', 'dist');

const sequelize = require(path.join(DIST, 'common', 'database'));
const Session = require(path.join(DIST, 'models', 'Session'));
const Account = require(path.join(DIST, 'models', 'Account'));
const { getJwtSecret } = require(path.join(DIST, 'security', 'jwtConfig'));

const ADMIN_USER_ID = 1;

function normalizeSql(sql) {
  return String(sql).replace(/\s+/g, ' ').trim();
}

function installFakeDb() {
  const original = {
    query: sequelize.query,
    transaction: sequelize.transaction,
    sessionFindOne: Session.findOne,
    sessionDestroy: Session.destroy,
    accountFindOne: Account.findOne,
  };

  const state = { rules: [], calls: [], sessionRows: new Map(), destroyResult: 1, txSeq: 0 };

  sequelize.query = async (sql, options = {}) => {
    // Model methods (upsert…) pass `{ query, bind }` instead of a string.
    const text = typeof sql === 'object' && sql !== null ? sql.query : sql;
    const bind = options.bind ?? (typeof sql === 'object' && sql !== null ? sql.bind : undefined);
    const call = {
      sql: normalizeSql(text),
      replacements: options.replacements ?? null,
      ...(bind !== undefined ? { bind } : {}),
      type: options.type ?? null,
      tx: options.transaction ? options.transaction.id : null,
    };
    state.calls.push(call);
    // Model.upsert destructures `[record, created]`.
    let value = call.type === 'UPSERT' ? [{}, null] : [];
    for (const [re, result] of state.rules) {
      if (re.test(call.sql)) {
        value = typeof result === 'function' ? result(call) : result;
        if (value instanceof Error) throw value;
        break;
      }
    }
    // Model.findOne asks for a single row (`plain: true`).
    return options.plain && Array.isArray(value) ? (value[0] ?? null) : value;
  };

  sequelize.transaction = async () => {
    state.txSeq += 1;
    const id = `tx${state.txSeq}`;
    state.calls.push({ event: 'begin', tx: id });
    return {
      id,
      commit: async () => state.calls.push({ event: 'commit', tx: id }),
      rollback: async () => state.calls.push({ event: 'rollback', tx: id }),
    };
  };

  const adminSession = {
    id: 999,
    userId: ADMIN_USER_ID,
    expiresAt: new Date(Date.now() + 3600_000),
    update: async () => {},
  };

  Session.findOne = async (opts) => {
    // authMiddleware looks up by token; revokeSession looks up by id.
    if (opts?.where?.token) return adminSession;
    const id = opts?.where?.id;
    state.calls.push({ event: 'Session.findOne', where: opts?.where ?? null });
    return state.sessionRows.get(id) ?? null;
  };
  Session.destroy = async (opts) => {
    state.calls.push({ event: 'Session.destroy', where: serializeWhere(opts?.where) });
    return state.destroyResult;
  };
  Account.findOne = async () => ({ status: 1, getDataValue: () => 1 });

  return {
    state,
    /** Reset recorded calls and rules between scenarios. */
    reset() {
      state.rules = [];
      state.calls = [];
      state.sessionRows = new Map();
      state.destroyResult = 1;
      state.txSeq = 0;
    },
    restore() {
      sequelize.query = original.query;
      sequelize.transaction = original.transaction;
      Session.findOne = original.sessionFindOne;
      Session.destroy = original.sessionDestroy;
      Account.findOne = original.accountFindOne;
    },
  };
}

/** Sequelize `where` objects may hold Symbol keys (Op.notIn); make them JSON-friendly. */
function serializeWhere(where) {
  if (where == null || typeof where !== 'object') return where ?? null;
  const out = {};
  for (const key of Reflect.ownKeys(where)) {
    const name = typeof key === 'symbol' ? `[${key.description}]` : key;
    out[name] = serializeWhere(where[key]);
  }
  return Array.isArray(where) ? Object.values(out) : out;
}

function adminToken(userId = ADMIN_USER_ID) {
  return jwt.sign({ userId, role: 'ADM', type: 'access' }, getJwtSecret(), { expiresIn: '1h' });
}

module.exports = { installFakeDb, adminToken, normalizeSql, ADMIN_USER_ID };
