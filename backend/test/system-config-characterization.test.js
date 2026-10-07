/**
 * Characterization of the key/value /api/system-config endpoints (config, AI model registry,
 * AI model catalog, per-feature defaults) over the fake DB. The SYSTEM_CONFIGURATION model's
 * generated SQL is recorded as-is. Snapshot captured before these controllers moved onto a
 * repository + services (G3 step B); see helpers/characterize.js.
 */
const path = require('node:path');

const { characterize, dbError, legacySchemaError } = require('./helpers/characterize');

const SNAPSHOT = path.join(__dirname, 'fixtures', 'system-config-sql.snapshot.json');

const ALL_ROWS = /FROM `SYSTEM_CONFIGURATION` AS `SYSTEM_CONFIGURATION`;$/;
const UPSERT = /^INSERT INTO `SYSTEM_CONFIGURATION`/;
const row = (key, value) => [{ id: 1, key, value, description: null }];
const keyRule = (key, value) => [new RegExp(`\`key\` = '${key}';$`), row(key, value)];

const MODELS = [
  { provider: 'groq', modelId: 'llama', featureScope: 'chat', enabled: true },
  { provider: 'local', modelId: 'qwen', featureScope: 'symptom', enabled: false },
];
const CATALOG = [{ provider: 'groq', modelId: 'llama', label: 'Llama', enabled: true }];
const DEFAULTS = { chat: { provider: 'groq', modelId: 'llama' } };

const STORED = [
  keyRule('aiModels', JSON.stringify(MODELS)),
  keyRule('aiModelCatalog', JSON.stringify(CATALOG)),
  keyRule('aiDefaultModelByFeature', JSON.stringify(DEFAULTS)),
];

const SCENARIOS = [
  // ---- config
  [
    'get config merges stored values over defaults',
    'GET',
    '/api/system-config',
    null,
    [[ALL_ROWS, [{ key: 'maxConcurrentUsers', value: '42' }, { key: 'custom', value: 'x' }]]],
  ],
  ['get config, legacy schema', 'GET', '/api/system-config', null, [[ALL_ROWS, legacySchemaError]]],
  ['get config, db down', 'GET', '/api/system-config', null, [[ALL_ROWS, dbError]]],
  ['update config, empty', 'PUT', '/api/system-config', {}, []],
  ['update config, unknown keys', 'PUT', '/api/system-config', { maxConcurrentUsers: 5, foo: 1, aiModelCatalog: [] }, []],
  ['update config, bad boolean', 'PUT', '/api/system-config', { rateLimitEnabled: 'maybe' }, []],
  ['update config, number out of range', 'PUT', '/api/system-config', { sessionTimeoutMinutes: 2 }, []],
  ['update config, number not numeric', 'PUT', '/api/system-config', { loginRateLimitRequests: 'many' }, []],
  ['update config, aiModels invalid JSON', 'PUT', '/api/system-config', { aiModels: '[oops' }, []],
  ['update config, aiModels not an array', 'PUT', '/api/system-config', { aiModels: '{}' }, []],
  ['update config, aiModels wrong type', 'PUT', '/api/system-config', { aiModels: 5 }, []],
  ['update config, defaults is an array', 'PUT', '/api/system-config', { aiDefaultModelByFeature: '[]' }, []],
  ['update config, defaults wrong type', 'PUT', '/api/system-config', { aiDefaultModelByFeature: 7 }, []],
  [
    'update config, validation stops at the first bad key',
    'PUT',
    '/api/system-config',
    { maxConcurrentUsers: '10', rateLimitIpBased: 'nope', sessionTimeoutMinutes: 1 },
    [],
  ],
  [
    'update config, several keys',
    'PUT',
    '/api/system-config',
    {
      rateLimitEnabled: 'TRUE',
      rateLimitIpBased: 0,
      maxConcurrentUsers: 50,
      sessionTimeoutMinutes: '45min',
      aiModels: [{ provider: 'groq' }],
      aiDefaultModelByFeature: '{"chat":{"provider":"groq","modelId":"x"}}',
    },
    [],
  ],
  ['update config, legacy schema', 'PUT', '/api/system-config', { maxConcurrentUsers: 10 }, [[UPSERT, legacySchemaError]]],
  ['update config, db down', 'PUT', '/api/system-config', { maxConcurrentUsers: 10 }, [[UPSERT, dbError]]],

  // ---- AI models: reads
  ['get ai models', 'GET', '/api/system-config/ai-models', null, STORED],
  ['get ai models, nothing stored', 'GET', '/api/system-config/ai-models', null, []],
  [
    'get ai models, corrupt JSON',
    'GET',
    '/api/system-config/ai-models',
    null,
    [keyRule('aiModels', '{"a":1}'), keyRule('aiModelCatalog', '[oops'), keyRule('aiDefaultModelByFeature', '5')],
  ],
  ['get ai models, legacy schema', 'GET', '/api/system-config/ai-models', null, [[/./, legacySchemaError]]],
  ['get ai models, db down', 'GET', '/api/system-config/ai-models', null, [[/./, dbError]]],
  ['get ai model catalog', 'GET', '/api/system-config/ai-model-catalog', null, STORED],
  ['get ai model catalog, db down', 'GET', '/api/system-config/ai-model-catalog', null, [[/./, dbError]]],

  // ---- AI model catalog: writes
  ['upsert catalog, missing fields', 'PUT', '/api/system-config/ai-model-catalog', { provider: 'groq' }, []],
  ['upsert catalog, bad provider', 'PUT', '/api/system-config/ai-model-catalog', { provider: 'openai', modelId: 'gpt' }, []],
  [
    'upsert catalog, new entry',
    'PUT',
    '/api/system-config/ai-model-catalog',
    { provider: ' LOCAL ', modelId: ' qwen ', label: '  ', enabled: 'no' },
    STORED,
  ],
  [
    'upsert catalog, update entry',
    'PUT',
    '/api/system-config/ai-model-catalog',
    { provider: 'groq', modelId: 'llama', label: 'Llama 3', enabled: false },
    STORED,
  ],
  [
    'upsert catalog, legacy schema on save is ignored',
    'PUT',
    '/api/system-config/ai-model-catalog',
    { provider: 'groq', modelId: 'new' },
    [[UPSERT, legacySchemaError]],
  ],
  ['upsert catalog, db down', 'PUT', '/api/system-config/ai-model-catalog', { provider: 'groq', modelId: 'm' }, [[/./, dbError]]],
  ['delete catalog, missing fields', 'DELETE', '/api/system-config/ai-model-catalog?provider=groq', null, []],
  ['delete catalog, not found', 'DELETE', '/api/system-config/ai-model-catalog', { provider: 'groq', modelId: 'nope' }, STORED],
  [
    'delete catalog entry cascades to models and defaults',
    'DELETE',
    '/api/system-config/ai-model-catalog?provider=GROQ&modelId=llama',
    null,
    STORED,
  ],
  [
    'delete catalog entry without bound models',
    'DELETE',
    '/api/system-config/ai-model-catalog',
    { provider: 'groq', modelId: 'llama' },
    [keyRule('aiModelCatalog', JSON.stringify(CATALOG)), keyRule('aiModels', JSON.stringify([MODELS[1]]))],
  ],

  // ---- AI model registry: writes
  ['upsert model, missing enabled', 'PUT', '/api/system-config/ai-models', { provider: 'groq', modelId: 'm' }, []],
  [
    'upsert model, new (default scope chat)',
    'PUT',
    '/api/system-config/ai-models',
    { provider: 'Groq', modelId: 'mixtral', enabled: 'true' },
    STORED,
  ],
  [
    'upsert model, update existing scope',
    'PUT',
    '/api/system-config/ai-models',
    { provider: 'local', modelId: 'qwen', enabled: 1, featureScope: ' SYMPTOM ' },
    STORED,
  ],
  ['upsert model, db down', 'PUT', '/api/system-config/ai-models', { provider: 'g', modelId: 'm', enabled: true }, [[/./, dbError]]],
  ['set default, missing fields', 'PUT', '/api/system-config/ai-models/default', { feature: 'chat' }, []],
  [
    'set default, model disabled for feature',
    'PUT',
    '/api/system-config/ai-models/default',
    { feature: 'symptom', provider: 'local', modelId: 'qwen' },
    STORED,
  ],
  [
    'set default',
    'PUT',
    '/api/system-config/ai-models/default',
    { feature: 'CHAT', provider: 'groq', modelId: 'llama' },
    STORED,
  ],
  ['delete model, missing fields', 'DELETE', '/api/system-config/ai-models', { provider: 'groq', modelId: 'llama' }, []],
  [
    'delete model, not found',
    'DELETE',
    '/api/system-config/ai-models?provider=groq&modelId=llama&featureScope=symptom',
    null,
    STORED,
  ],
  [
    'delete model clears its default',
    'DELETE',
    '/api/system-config/ai-models',
    { provider: 'groq', modelId: 'llama', featureScope: 'chat' },
    STORED,
  ],
  [
    'delete model keeps other defaults',
    'DELETE',
    '/api/system-config/ai-models',
    { provider: 'local', modelId: 'qwen', featureScope: 'symptom' },
    STORED,
  ],
  [
    'delete model, db down',
    'DELETE',
    '/api/system-config/ai-models',
    { provider: 'local', modelId: 'qwen', featureScope: 'symptom' },
    [[/./, dbError]],
  ],
];

characterize('system-config key/value endpoints send the same SQL and answer the same', SNAPSHOT, SCENARIOS);
