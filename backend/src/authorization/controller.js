const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const sequelize = require('../common/database');
const defineUser = require('../models/User');
const defineSession = require('../models/Session');
const defineSystemConfig = require('../models/SystemConfig');
const defineProfile = require('../models/Profile');
const User = defineUser(sequelize);
const Session = defineSession(sequelize);
const SystemConfig = defineSystemConfig(sequelize);
const Profile = defineProfile(sequelize);

const encryptPassword = (password) =>
  crypto.createHash('sha256').update(password).digest('hex');

const generateAccessToken = (username, userId) =>
  jwt.sign({ username, userId }, process.env.JWT_SECRET || 'your-secret-key', { expiresIn: '24h' });

exports.register = async (req, res) => {
  try {
    const { username, email, password, firstName, lastName, age } = req.body;
    const encryptedPassword = encryptPassword(password);
    
    // SECURITY: Always create as 'patient', never allow role to be set from request
    const user = await User.create({
      username,
      email,
      password: encryptedPassword,
      firstName,
      lastName,
      age,
      role: 'patient' // Force patient role for public registration
    });
    
    // Create empty profile for new user
    await Profile.create({ userId: user.id, email: user.email });
    
    const accessToken = generateAccessToken(username, user.id);
    res.status(201).json({
      success: true,
      user: { 
        id: user.id, 
        username: user.username, 
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role
      },
      token: accessToken
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

exports.login = async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ 
        success: false, 
        error: 'Username and password are required' 
      });
    }

    const encryptedPassword = encryptPassword(password);
    const user = await User.findOne({ where: { username } });

    if (!user) {
      return res.status(401).json({ 
        success: false, 
        error: 'Invalid username or password' 
      });
    }

    if (user.password !== encryptedPassword) {
      return res.status(401).json({ 
        success: false, 
        error: 'Invalid username or password' 
      });
    }

    // Kiểm tra số lượng user đồng thời
    const config = await SystemConfig.findOne({ 
      where: { key: 'maxConcurrentUsers' } 
    });
    const maxUsers = config ? parseInt(config.value) : 500;
    
    // Làm sạch session hết hạn
    await Session.destroy({
      where: {
        expiresAt: {
          [require('sequelize').Op.lt]: new Date()
        }
      }
    });
    
    // Đếm số session đang hoạt động
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

    // Lấy session timeout từ config
    const timeoutConfig = await SystemConfig.findOne({ 
      where: { key: 'sessionTimeoutMinutes' } 
    });
    const timeoutMinutes = timeoutConfig ? parseInt(timeoutConfig.value) : 30;
    
    // Xóa session cũ của user này (single session per user)
    await Session.destroy({ where: { userId: user.id } });
    
    // Tạo token và session
    const accessToken = generateAccessToken(username, user.id);
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + timeoutMinutes);
    
    await Session.create({
      userId: user.id,
      token: accessToken,
      expiresAt: expiresAt,
      lastActivity: new Date(),
      ipAddress: req.ip || req.connection.remoteAddress,
      userAgent: req.headers['user-agent']
    });
    
    res.json({
      success: true,
      user: { 
        id: user.id, 
        username: user.username, 
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role
      },
      token: accessToken,
      expiresAt: expiresAt.toISOString()
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

exports.logout = async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '') || 
                  req.body.token;
    
    if (token) {
      await Session.destroy({ where: { token } });
    }
    
    res.json({
      success: true,
      message: 'Logged out successfully'
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// Controller quản lý authentication: đăng ký, đăng nhập với kiểm tra concurrent users và session timeout, và đăng xuất