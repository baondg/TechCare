/**
 * In-process fake for the database layer, for HTTP-level characterization tests without MySQL.
 *
 * Stubs, on the compiled modules in dist/ (the same instances the app uses):
 *   - sequelize.query       → answered by `rules`, every call recorded
 *   - sequelize.transaction → fake tx with commit/rollback (managed callbacks too), recorded
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
const User = require(path.join(DIST, 'models', 'Users'));
const Patient = require(path.join(DIST, 'models', 'Patient'));
const MedicalRecord = require(path.join(DIST, 'models', 'MedicalRecord'));
const Relative = require(path.join(DIST, 'models', 'Relative'));
const cacheService = require(path.join(DIST, 'services', 'cacheService'));
const { getJwtSecret } = require(path.join(DIST, 'security', 'jwtConfig'));

const ADMIN_USER_ID = 1;

function normalizeSql(sql) {
  return String(sql).replace(/\s+/g, ' ').trim();
}

/** Model statics replaced by recording stubs (they bypass sequelize.query). */
const MODEL_STUBS = {
  Session: { model: Session, methods: ['findOne', 'findAll', 'count', 'create', 'destroy'] },
  Account: { model: Account, methods: ['findOne', 'create'] },
  User: { model: User, methods: ['create', 'findAndCountAll', 'findOne', 'findByPk'] },
  Patient: { model: Patient, methods: ['findOrCreate', 'findByPk', 'findOne'] },
  MedicalRecord: { model: MedicalRecord, methods: ['findOne', 'findAndCountAll', 'create', 'destroy'] },
  Relative: { model: Relative, methods: ['destroy', 'create'] },
};

/** cacheService (Redis / memory) is replaced by a per-scenario Map; reads and writes are recorded. */
const CACHE_METHODS = ['getJson', 'setJson', 'del'];

function installFakeDb() {
  const original = { query: sequelize.query, transaction: sequelize.transaction, models: {}, cache: {} };
  for (const method of CACHE_METHODS) original.cache[method] = cacheService[method];
  for (const [name, { model, methods }] of Object.entries(MODEL_STUBS)) {
    for (const method of methods) original.models[`${name}.${method}`] = model[method];
  }

  /**
   * `models['Account.findOne'] = (opts) => value` answers that model call (and records it).
   * Without a handler: Session.findOne by id reads `sessionRows`, destroy returns `destroyResult`,
   * create echoes its values, and Account.findOne silently returns an active account.
   */
  const state = {
    rules: [],
    calls: [],
    models: {},
    cache: new Map(),
    sessionRows: new Map(),
    destroyResult: 1,
    txSeq: 0,
  };

  cacheService.getJson = async (key) => {
    const hit = state.cache.has(key);
    state.calls.push({ event: 'cache.get', key, hit });
    return hit ? state.cache.get(key) : null;
  };
  cacheService.setJson = async (key, value, ttlSeconds) => {
    state.calls.push({ event: 'cache.set', key, ttlSeconds });
    state.cache.set(key, value);
  };
  cacheService.del = async (key) => {
    state.calls.push({ event: 'cache.del', key });
    state.cache.delete(key);
  };

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

  /** Unmanaged (`await transaction()`) or managed (`transaction(async (t) => …)`: commit / rollback + rethrow). */
  sequelize.transaction = async (work) => {
    state.txSeq += 1;
    const id = `tx${state.txSeq}`;
    state.calls.push({ event: 'begin', tx: id });
    const tx = {
      id,
      commit: async () => state.calls.push({ event: 'commit', tx: id }),
      rollback: async () => state.calls.push({ event: 'rollback', tx: id }),
    };
    if (typeof work !== 'function') return tx;
    try {
      const result = await work(tx);
      await tx.commit();
      return result;
    } catch (error) {
      await tx.rollback();
      throw error;
    }
  };

  const adminSession = {
    id: 999,
    userId: ADMIN_USER_ID,
    expiresAt: new Date(Date.now() + 3600_000),
    update: async () => {},
  };

  const record = (event, opts, extra = {}) =>
    state.calls.push({ event, ...describeOptions(opts), ...extra, tx: opts?.transaction ? opts.transaction.id : null });

  const defaults = {
    'Session.findOne': (opts) => state.sessionRows.get(opts?.where?.id) ?? null,
    'Session.destroy': () => state.destroyResult,
    'Session.findAll': () => [],
    'Session.count': () => 0,
    'User.findAndCountAll': () => ({ count: 0, rows: [] }),
    'MedicalRecord.findAndCountAll': () => ({ count: 0, rows: [] }),
  };

  for (const [name, { model, methods }] of Object.entries(MODEL_STUBS)) {
    for (const method of methods) {
      const key = `${name}.${method}`;
      model[method] = async (first, second) => {
        // authMiddleware: session by access token, then the account's status. Not recorded.
        if (key === 'Session.findOne' && first?.where?.token) return adminSession;
        if (key === 'Account.findOne' && !state.models[key]) return { status: 1, getDataValue: () => 1 };

        const isCreate = method === 'create';
        const isByPk = method === 'findByPk';
        const opts = isCreate || isByPk ? second : first;
        record(key, opts, isCreate ? { values: first } : isByPk ? { pk: first } : {});
        const handler = state.models[key] ?? defaults[key];
        const value = handler ? handler(opts, first) : isCreate ? fakeInstance(name, { id: 500, ...first }, state) : null;
        if (value instanceof Error) throw value;
        return value;
      };
    }
  }

  return {
    state,
    /** Reset recorded calls and rules between scenarios. */
    reset() {
      state.rules = [];
      state.calls = [];
      state.models = {};
      state.cache = new Map();
      state.upstream = null;
      state.sessionRows = new Map();
      state.destroyResult = 1;
      state.txSeq = 0;
    },
    restore() {
      sequelize.query = original.query;
      sequelize.transaction = original.transaction;
      for (const [name, { model, methods }] of Object.entries(MODEL_STUBS)) {
        for (const method of methods) model[method] = original.models[`${name}.${method}`];
      }
      for (const method of CACHE_METHODS) cacheService[method] = original.cache[method];
    },
  };
}

/**
 * A model instance stand-in: plain fields plus update() / getDataValue() / toJSON().
 * update() is recorded as `<Model>#update`; `failUpdate` makes it throw like a missing column.
 */
function fakeInstance(modelName, fields, state, { failUpdate = false } = {}) {
  const instance = {
    ...fields,
    getDataValue: (k) => instance[k],
    toJSON: () => ({ ...fields }),
    destroy: async () => {
      state.calls.push({ event: `${modelName}#destroy`, id: fields.id ?? null });
    },
    update: async (changes) => {
      state.calls.push({ event: `${modelName}#update`, id: fields.id ?? fields.user_id ?? null, values: changes });
      if (failUpdate) throw Object.assign(new Error('Unknown column'), { original: { code: 'ER_BAD_FIELD_ERROR' } });
      Object.assign(instance, changes);
      return instance;
    },
  };
  return instance;
}

/** The parts of a model call's options that define the query. */
function describeOptions(opts) {
  if (!opts) return {};
  const out = {};
  if (opts.where !== undefined) out.where = serializeWhere(opts.where);
  if (opts.attributes) out.attributes = opts.attributes;
  if (opts.include) {
    out.include = opts.include.map((i) => ({
      model: i.model?.name,
      attributes: i.attributes,
      ...(i.required !== undefined ? { required: i.required } : {}),
      ...(i.where ? { where: serializeWhere(i.where) } : {}),
    }));
  }
  if (opts.order) out.order = opts.order;
  if (opts.limit !== undefined) out.limit = opts.limit;
  if (opts.offset !== undefined) out.offset = opts.offset;
  if (opts.defaults) out.defaults = opts.defaults;
  return out;
}

/** Sequelize `where` objects may hold Symbol keys (Op.notIn); make them JSON-friendly. */
function serializeWhere(where) {
  if (where instanceof Date) return '<date>';
  if (where == null || typeof where !== 'object') return where ?? null;
  const out = {};
  for (const key of Reflect.ownKeys(where)) {
    const name = typeof key === 'symbol' ? `[${key.description}]` : key;
    out[name] = serializeWhere(where[key]);
  }
  return Array.isArray(where) ? Object.values(out) : out;
}

/** Signed access token; authMiddleware accepts it while the fake DB is installed. */
function accessToken({ userId = ADMIN_USER_ID, role = 'ADM', username = 'admin' } = {}) {
  return jwt.sign({ username, userId, role, type: 'access' }, getJwtSecret(), { expiresIn: '1h' });
}

function adminToken(userId = ADMIN_USER_ID) {
  return accessToken({ userId });
}

function refreshToken({ userId = 42, username = 'jdoe' } = {}) {
  return jwt.sign({ username, userId, type: 'refresh' }, getJwtSecret(), { expiresIn: '7d' });
}

module.exports = { installFakeDb, fakeInstance, accessToken, adminToken, refreshToken, normalizeSql, ADMIN_USER_ID };
