const { createClient } = require('redis');

// Tạo Redis client
let redisClient = null;
let redisConnected = false;

// Khởi tạo Redis connection
const initRedis = async () => {
  try {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    
    redisClient = createClient({
      url: redisUrl,
      socket: {
        connectTimeout: 5000,
        reconnectStrategy: (retries) => {
          if (retries > 3) {
            console.log('⚠️  Redis: Max retries reached, using in-memory fallback');
            redisConnected = false;
            return false; // Stop reconnecting
          }
          return Math.min(retries * 100, 3000);
        }
      }
    });

    redisClient.on('error', (err) => {
      if (redisConnected) {
        console.error('❌ Redis Client Error:', err.message);
      }
      redisConnected = false;
    });

    redisClient.on('connect', () => {
      console.log('🔄 Redis: Connecting...');
    });

    redisClient.on('ready', () => {
      console.log('✅ Redis: Connected and ready');
      redisConnected = true;
    });

    redisClient.on('end', () => {
      console.log('⚠️  Redis: Connection closed');
      redisConnected = false;
    });

    await redisClient.connect();
    return redisClient;
  } catch (error) {
    console.log('⚠️  Redis connection failed:', error.message);
    console.log('⚠️  Falling back to in-memory storage');
    redisClient = null;
    redisConnected = false;
    return null;
  }
};

// Lấy Redis client (hoặc null nếu không kết nối được)
const getRedisClient = () => {
  return redisConnected ? redisClient : null;
};

// Kiểm tra Redis có sẵn không
const isRedisAvailable = () => {
  return redisConnected && redisClient !== null && redisClient.isReady;
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

