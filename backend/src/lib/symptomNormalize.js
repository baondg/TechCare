const COMMON_SYMPTOM_KEYS = [
  'fever',
  'cough',
  'soreThroat',
  'shortnessOfBreath',
  'chestPain',
  'headache',
  'fatigue',
  'nausea',
];

const COMMON_SYMPTOM_API_NAMES = {
  fever: 'Fever',
  cough: 'Cough',
  soreThroat: 'Sore Throat',
  shortnessOfBreath: 'Shortness of Breath',
  chestPain: 'Chest Pain',
  headache: 'Headache',
  fatigue: 'Fatigue',
  nausea: 'Nausea',
};

const SYMPTOM_SEVERITY_VALUES = new Set(['mild', 'moderate', 'severe']);
const SYMPTOM_DURATION_VALUES = new Set(['less24h', '1to3days', '3to7days', 'moreThanWeek']);

const MIN_CUSTOM_SYMPTOM_LENGTH = 2;
const MAX_SYMPTOM_NAME_LENGTH = 80;

const SYMPTOM_ALIASES = {
  fever: 'fever',
  sot: 'fever',
  hot: 'fever',
  cough: 'cough',
  ho: 'cough',
  coughing: 'cough',
  sorethroat: 'soreThroat',
  sore: 'soreThroat',
  throatpain: 'soreThroat',
  dauhong: 'soreThroat',
  shortnessofbreath: 'shortnessOfBreath',
  shortofbreath: 'shortnessOfBreath',
  breathless: 'shortnessOfBreath',
  dyspnea: 'shortnessOfBreath',
  khot: 'shortnessOfBreath',
  'kho tho': 'shortnessOfBreath',
  chestpain: 'chestPain',
  chest: 'chestPain',
  daunguc: 'chestPain',
  'dau nguc': 'chestPain',
  headache: 'headache',
  headpain: 'headache',
  'dau dau': 'headache',
  daudau: 'headache',
  fatigue: 'fatigue',
  tired: 'fatigue',
  tiredness: 'fatigue',
  exhaustion: 'fatigue',
  'met moi': 'fatigue',
  metmoi: 'fatigue',
  nausea: 'nausea',
  vomit: 'nausea',
  vomiting: 'nausea',
  'buon non': 'nausea',
  buonnon: 'nausea',
};

function isCommonSymptomKey(id) {
  return COMMON_SYMPTOM_KEYS.includes(id);
}

function stripForSymptomMatch(value) {
  return String(value || '')
    .normalize('NFC')
    .replace(/đ/gi, 'd')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9+\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeSymptomText(raw) {
  return String(raw || '')
    .normalize('NFC')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, MAX_SYMPTOM_NAME_LENGTH);
}

function resolveToPresetKey(name) {
  if (isCommonSymptomKey(name)) return name;
  const matchKey = stripForSymptomMatch(name);
  return SYMPTOM_ALIASES[matchKey] || null;
}

function symptomApiName(name) {
  if (isCommonSymptomKey(name)) return COMMON_SYMPTOM_API_NAMES[name];
  const preset = resolveToPresetKey(name);
  if (preset) return COMMON_SYMPTOM_API_NAMES[preset];
  return normalizeSymptomText(name);
}

function symptomDedupeKey(name) {
  if (isCommonSymptomKey(name)) return `preset:${name}`;
  const preset = resolveToPresetKey(name);
  if (preset) return `preset:${preset}`;
  return `custom:${stripForSymptomMatch(name)}`;
}

/**
 * @param {Array<{ name?: string, severity?: string, duration?: string }>} items
 * @returns {Array<{ name: string, severity: string, duration: string }>}
 */
function normalizeSymptomsForAi(items) {
  if (!Array.isArray(items)) return [];
  const byKey = new Map();

  for (const item of items) {
    const severity = String(item?.severity || '').trim();
    const duration = String(item?.duration || '').trim();
    if (!SYMPTOM_SEVERITY_VALUES.has(severity) || !SYMPTOM_DURATION_VALUES.has(duration)) continue;

    const name = symptomApiName(item?.name);
    if (!name || name.length < MIN_CUSTOM_SYMPTOM_LENGTH) continue;

    const key = symptomDedupeKey(String(item?.name || name));
    byKey.set(key, { name, severity, duration });
  }

  return [...byKey.values()];
}

module.exports = {
  COMMON_SYMPTOM_KEYS,
  COMMON_SYMPTOM_API_NAMES,
  SYMPTOM_SEVERITY_VALUES,
  SYMPTOM_DURATION_VALUES,
  MIN_CUSTOM_SYMPTOM_LENGTH,
  normalizeSymptomsForAi,
  normalizeSymptomText,
  symptomApiName,
};
