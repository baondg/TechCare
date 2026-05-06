import http from 'k6/http';
import { getBaseUrl, getTimeout } from './config.js';

/**
 * POST /api/auth/login — returns k6 Response
 * @param {string} [baseUrl]
 * @param {string} username
 * @param {string} password
 */
export function login(baseUrl, username, password) {
  const base = baseUrl || getBaseUrl();
  const url = `${base}/api/auth/login`;
  const body = JSON.stringify({
    username,
    password,
    rememberMe: false,
  });
  return http.post(url, body, {
    timeout: `${getTimeout()}ms`,
    // Required when scenarios set discardResponseBodies=true and setup() still needs JSON parsing.
    responseType: 'text',
    headers: { 'Content-Type': 'application/json' },
    tags: { name: 'auth_login' },
  });
}

/**
 * Parse login JSON; throws if login failed or token missing.
 */
export function parseLoginResponse(res) {
  if (res.status !== 200) {
    throw new Error(`Login failed: HTTP ${res.status} body=${String(res.body).slice(0, 200)}`);
  }
  let body;
  try {
    body = res.json();
  } catch (_e) {
    throw new Error('Login response is not JSON');
  }
  if (!body || body.success !== true || !body.token) {
    throw new Error(`Login failed: ${JSON.stringify(body).slice(0, 300)}`);
  }
  return {
    token: body.token,
    refreshToken: body.refreshToken,
    userId: body.user && body.user.id,
    role: (body.user && body.user.role) || 'patient',
    username: body.user && body.user.username,
  };
}
