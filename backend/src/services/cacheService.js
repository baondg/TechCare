const logger = require('../common/logger');
const { config } = require('../config/env');
const memoryCache = new Map();

let redisClient = null;
let redisConnectPromise = null;
let redisDisabled = false;

function nowMs() {
  return Date.now();
}

function useRedis() {
  return config.cache.patientRecordRedisEnabled;
}

async function getRedisClient() {
  if (!useRedis()) return null;
  if (redisDisabled) return null;
  if (redisClient) return redisClient;
  if (!redisConnectPromise) {
    redisConnectPromise = (async () => {
      const { createClient } = require('redis');
      const url = config.redis.url || 'redis://127.0.0.1:6379';
      const client = createClient({
        url,
        socket: {
          connectTimeout: config.redis.connectTimeoutMs,
          // Fail fast in local/dev when Redis is unavailable.
          reconnectStrategy: () => false,
        },
      });
      client.on('error', (err) => {
        logger.warn({ err }, '[cache] redis error');
      });
      await client.connect();
      redisClient = client;
      return client;
    })().catch((err) => {
      logger.warn({ err }, '[cache] redis unavailable, fallback to memory');
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
