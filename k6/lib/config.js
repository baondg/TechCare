/**
 * @returns {string} Base URL without trailing slash
 */
export function getBaseUrl() {
  const raw = __ENV.BASE_URL || 'http://localhost:5000';
  return String(raw).replace(/\/+$/, '');
}

export function getTimeout() {
  const t = Number(__ENV.K6_TIMEOUT_MS || '60000');
  return Number.isFinite(t) && t > 0 ? t : 60000;
}

export function requireAuthEnv() {
  const user = __ENV.K6_USERNAME;
  const pass = __ENV.K6_PASSWORD;
  if (!user || !pass) {
    return { ok: false, error: 'Set K6_USERNAME and K6_PASSWORD for authenticated scenarios.' };
  }
  return { ok: true, username: user, password: pass };
}
