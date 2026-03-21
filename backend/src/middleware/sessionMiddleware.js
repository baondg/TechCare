const jwt = require('jsonwebtoken');
const sequelize = require('../common/database');
const Session = require('../models/Session');



// Làm sạch các session đã hết hạn
const cleanupExpiredSessions = async () => {
  try {
    await Session.destroy({
      where: {
        expiresAt: {
          [require('sequelize').Op.lt]: new Date()
        }
      }
    });
  } catch (error) {
    console.error('Error cleaning up expired sessions:', error);
  }
};

// Kiểm tra và làm sạch session định kỳ (mỗi 5 phút)
setInterval(cleanupExpiredSessions, 5 * 60 * 1000);

// Middleware kiểm tra session timeout
exports.checkSessionTimeout = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '') || 
                  req.query.token || 
                  req.body.token;
    
    if (!token) {
      return next();
    }
    
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
      const session = await Session.findOne({ 
        where: { token, userId: decoded.userId } 
      });
      
      if (!session) {
        return next();
      }
      
      // Kiểm tra session đã hết hạn chưa
      if (new Date() > new Date(session.expiresAt)) {
        await Session.destroy({ where: { id: session.id } });
        return res.status(401).json({
          success: false,
          error: 'Session expired. Please login again.'
        });
      }
      
      // Cập nhật lastActivity
      session.lastActivity = new Date();
      await session.save();
      
      req.session = session;
      req.userId = decoded.userId;
    } catch (error) {
      // Token không hợp lệ, bỏ qua
    }
    
    next();
  } catch (error) {
    next();
  }
};

// Kiểm tra số lượng user đồng thời
exports.checkConcurrentUsers = async (req, res, next) => {
  try {
    // Làm sạch session hết hạn trước
    await cleanupExpiredSessions();
    
    const config = await SystemConfig.findOne({ 
      where: { key: 'maxConcurrentUsers' } 
    });
    const maxUsers = config ? parseInt(config.value) : 500;
    
    const activeSessions = await Session.count({
      where: {
        expiresAt: {
          [require('sequelize').Op.gt]: new Date()
        }
      }
    });
    
    if (activeSessions >= maxUsers) {
      return res.status(503).json({
        success: false,
        error: `Maximum concurrent users (${maxUsers}) reached. Please try again later.`
      });
    }
    
    req.maxConcurrentUsers = maxUsers;
    req.currentActiveUsers = activeSessions;
    next();
  } catch (error) {
    console.error('Error checking concurrent users:', error);
    next();
  }
};

// Middleware quản lý session: kiểm tra timeout, làm sạch session hết hạn, và kiểm tra giới hạn số user đồng thời
