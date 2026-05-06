const memoryCache = new Map();

let redisClient = null;
let redisConnectPromise = null;
let redisDisabled = false;

function nowMs() {
  return Date.now();
}

function useRedis() {
  return process.env.ENABLE_PATIENT_RECORD_CACHE === '1';
}

async function getRedisClient() {
  if (!useRedis()) return null;
  if (redisDisabled) return null;
  if (redisClient) return redisClient;
  if (!redisConnectPromise) {
    redisConnectPromise = (async () => {
      const { createClient } = require('redis');
      const url = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
      const client = createClient({
        url,
        socket: {
          connectTimeout: Number(process.env.REDIS_CONNECT_TIMEOUT_MS || 1500),
          // Fail fast in local/dev when Redis is unavailable.
          reconnectStrategy: () => false,
        },
      });
      client.on('error', (err) => {
        console.warn('[cache] redis error:', err?.message || err);
      });
      await client.connect();
      redisClient = client;
      return client;
    })().catch((err) => {
      console.warn('[cache] redis unavailable, fallback to memory:', err?.message || err);
      redisDisabled = true;
      redisConnectPromise = null;
      return null;
    });
  }
  return redisConnectPromise;
}

async function getJson(key) {
  const client = await getRedisClient();
  if (client) {
    const value = await client.get(key);
    if (!value) return null;
    return JSON.parse(value);
  }
  const row = memoryCache.get(key);
  if (!row || row.expiresAt <= nowMs()) {
    memoryCache.delete(key);
    return null;
  }
  return row.value;
}

async function setJson(key, value, ttlSeconds) {
  const client = await getRedisClient();
  if (client) {
    await client.setEx(key, ttlSeconds, JSON.stringify(value));
    return;
  }
  memoryCache.set(key, {
    value,
    expiresAt: nowMs() + ttlSeconds * 1000,
  });
}

async function del(key) {
  const client = await getRedisClient();
  if (client) {
    await client.del(key);
    return;
  }
  memoryCache.delete(key);
}

module.exports = {
  getJson,
  setJson,
  del,
};
