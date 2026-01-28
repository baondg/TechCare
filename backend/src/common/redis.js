const { createClient } = require('redis');

// Tạo Redis client
let redisClient = null;

// Khởi tạo Redis connection
const initRedis = async () => {
  try {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    
    redisClient = createClient({
      url: redisUrl,
      socket: {
        reconnectStrategy: (retries) => {
          if (retries > 10) {
            console.error('❌ Redis: Too many reconnection attempts');
            return new Error('Too many retries');
          }
          return Math.min(retries * 100, 3000);
        }
      }
    });

    redisClient.on('error', (err) => {
      console.error('❌ Redis Client Error:', err);
    });

    redisClient.on('connect', () => {
      console.log('🔄 Redis: Connecting...');
    });

    redisClient.on('ready', () => {
      console.log('✅ Redis: Connected and ready');
    });

    redisClient.on('reconnecting', () => {
      console.log('🔄 Redis: Reconnecting...');
    });

    await redisClient.connect();
    return redisClient;
  } catch (error) {
    console.error('❌ Redis connection failed:', error.message);
    console.log('⚠️  Falling back to in-memory storage');
    return null;
  }
};

// Lấy Redis client (hoặc null nếu không kết nối được)
const getRedisClient = () => {
  return redisClient;
};

// Kiểm tra Redis có sẵn không
const isRedisAvailable = () => {
  return redisClient !== null && redisClient.isReady;
};

// Đóng kết nối Redis
const closeRedis = async () => {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
  }
};

module.exports = {
  initRedis,
  getRedisClient,
  isRedisAvailable,
  closeRedis
};

// Redis client: quản lý kết nối Redis để lưu trữ rate limit và session cache, hỗ trợ fallback về in-memory nếu Redis không khả dụng

