const sequelize = require('../common/database');
const defineSystemConfig = require('../models/SystemConfig');
const SystemConfig = defineSystemConfig(sequelize);
const { getRedisClient, isRedisAvailable } = require('../common/redis');

// Fallback: In-memory store nếu Redis không khả dụng
const rateLimitStore = new Map();

// Làm sạch các entry cũ định kỳ (chỉ cho in-memory)
setInterval(() => {
  if (!isRedisAvailable()) {
    const now = Date.now();
    for (const [key, value] of rateLimitStore.entries()) {
      if (value.resetTime < now) {
        rateLimitStore.delete(key);
      }
    }
  }
}, 60000); // Cleanup mỗi phút

// Helper function để lấy count và reset time từ Redis hoặc memory
const getRateLimitInfo = async (key) => {
  const redis = getRedisClient();
  
  if (isRedisAvailable() && redis) {
    try {
      const count = await redis.get(key);
      const ttl = await redis.ttl(key);
      
      if (count !== null) {
        const now = Date.now();
        const resetTime = now + (ttl * 1000);
        return {
          count: parseInt(count),
          resetTime: resetTime
        };
      }
      return null;
    } catch (error) {
      console.error('Redis get error:', error);
      const record = rateLimitStore.get(key);
      return record ? { count: record.count, resetTime: record.resetTime } : null;
    }
  }
  
  const record = rateLimitStore.get(key);
  return record ? { count: record.count, resetTime: record.resetTime } : null;
};

// Helper function để tăng counter và set TTL
const incrementRateLimit = async (key, ttlSeconds) => {
  const redis = getRedisClient();
  
  if (isRedisAvailable() && redis) {
    try {
      const count = await redis.incr(key);
      if (count === 1) {
        // Set TTL cho key mới
        await redis.expire(key, ttlSeconds);
      }
      return count;
    } catch (error) {
      console.error('Redis increment error:', error);
      // Fallback to memory
      const record = rateLimitStore.get(key);
      if (record) {
        record.count++;
        rateLimitStore.set(key, record);
        return record.count;
      } else {
        const now = Date.now();
        const newRecord = {
          count: 1,
          resetTime: now + (ttlSeconds * 1000),
          firstRequest: now
        };
        rateLimitStore.set(key, newRecord);
        return 1;
      }
    }
  }
  
  // In-memory fallback
  const record = rateLimitStore.get(key);
  if (record) {
    record.count++;
    rateLimitStore.set(key, record);
    return record.count;
  } else {
    const now = Date.now();
    const newRecord = {
      count: 1,
      resetTime: now + (ttlSeconds * 1000),
      firstRequest: now
    };
    rateLimitStore.set(key, newRecord);
    return 1;
  }
};

// Middleware rate limiting có thể cấu hình với Redis
exports.rateLimit = async (req, res, next) => {
  try {
    // Lấy cấu hình rate limit từ database
    const rateLimitConfig = await SystemConfig.findOne({ 
      where: { key: 'rateLimitRequests' } 
    });
    const windowConfig = await SystemConfig.findOne({ 
      where: { key: 'rateLimitWindowMinutes' } 
    });
    
    const maxRequests = rateLimitConfig ? parseInt(rateLimitConfig.value) : 100;
    const windowMinutes = windowConfig ? parseInt(windowConfig.value) : 15;
    const windowSeconds = windowMinutes * 60;
    const windowMs = windowMinutes * 60 * 1000;
    
    // Tạo key dựa trên IP và user ID (nếu có)
    const token = req.headers.authorization?.replace('Bearer ', '');
    let identifier = req.ip || req.connection.remoteAddress || 'unknown';
    
    if (token) {
      try {
        const jwt = require('jsonwebtoken');
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
        identifier = `user_${decoded.userId}`;
      } catch (error) {
        // Token không hợp lệ, dùng IP
      }
    }
    
    const key = `ratelimit:${req.path}:${identifier}`;
    const now = Date.now();
    
    // Kiểm tra record hiện tại
    const record = await getRateLimitInfo(key);
    
    if (!record || now > record.resetTime) {
      // Tạo record mới hoặc reset - increment sẽ tự tạo key mới
      const count = await incrementRateLimit(key, windowSeconds);
      const resetTime = now + windowMs;
      
      res.setHeader('X-RateLimit-Limit', maxRequests);
      res.setHeader('X-RateLimit-Remaining', maxRequests - count);
      res.setHeader('X-RateLimit-Reset', new Date(resetTime).toISOString());
      return next();
    }
    
    // Tăng counter
    const count = await incrementRateLimit(key, windowSeconds);
    
    if (count > maxRequests) {
      const retryAfter = Math.ceil((record.resetTime - now) / 1000);
      return res.status(429).json({
        success: false,
        error: 'Too many requests. Please try again later.',
        retryAfter: retryAfter,
        limit: maxRequests,
        windowMinutes: windowMinutes
      });
    }
    
    // Thêm headers thông tin rate limit
    res.setHeader('X-RateLimit-Limit', maxRequests);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, maxRequests - count));
    res.setHeader('X-RateLimit-Reset', new Date(record.resetTime).toISOString());
    
    next();
  } catch (error) {
    console.error('Rate limit error:', error);
    // Nếu có lỗi, cho phép request đi qua (fail open)
    next();
  }
};

// Rate limit cho API endpoints cụ thể với Redis
exports.apiRateLimit = async (req, res, next) => {
  try {
    // Lấy cấu hình riêng cho API endpoints
    const apiRateLimitConfig = await SystemConfig.findOne({ 
      where: { key: 'apiRateLimitRequests' } 
    });
    const apiWindowConfig = await SystemConfig.findOne({ 
      where: { key: 'apiRateLimitWindowMinutes' } 
    });
    
    const maxRequests = apiRateLimitConfig ? parseInt(apiRateLimitConfig.value) : 60;
    const windowMinutes = apiWindowConfig ? parseInt(apiWindowConfig.value) : 1;
    const windowSeconds = windowMinutes * 60;
    const windowMs = windowMinutes * 60 * 1000;
    
    const token = req.headers.authorization?.replace('Bearer ', '');
    let identifier = req.ip || req.connection.remoteAddress || 'unknown';
    
    if (token) {
      try {
        const jwt = require('jsonwebtoken');
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
        identifier = `user_${decoded.userId}`;
      } catch (error) {
        // Token không hợp lệ, dùng IP
      }
    }
    
    const key = `apiratelimit:${req.path}:${identifier}`;
    const now = Date.now();
    
    const record = await getRateLimitInfo(key);
    
    if (!record || now > record.resetTime) {
      // Tạo record mới hoặc reset
      const count = await incrementRateLimit(key, windowSeconds);
      const resetTime = now + windowMs;
      
      res.setHeader('X-RateLimit-Limit', maxRequests);
      res.setHeader('X-RateLimit-Remaining', maxRequests - count);
      res.setHeader('X-RateLimit-Reset', new Date(resetTime).toISOString());
      return next();
    }
    
    const count = await incrementRateLimit(key, windowSeconds);
    
    if (count > maxRequests) {
      const retryAfter = Math.ceil((record.resetTime - now) / 1000);
      return res.status(429).json({
        success: false,
        error: 'API rate limit exceeded. Please slow down your requests.',
        retryAfter: retryAfter,
        limit: maxRequests,
        windowMinutes: windowMinutes
      });
    }
    
    res.setHeader('X-RateLimit-Limit', maxRequests);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, maxRequests - count));
    res.setHeader('X-RateLimit-Reset', new Date(record.resetTime).toISOString());
    
    next();
  } catch (error) {
    console.error('API rate limit error:', error);
    next();
  }
};

// Middleware quản lý rate limiting với Redis: giới hạn số lượng request trong một khoảng thời gian, tự động fallback về in-memory nếu Redis không khả dụng