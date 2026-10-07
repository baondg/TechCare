const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const sequelize = require('../common/database');
const defineSystemConfig = require('../models/SystemConfig');
const { Op } = require('sequelize');

const Account = require('../models/Account');
const Session = require('../models/Session');
const User = require('../models/Users');
const { createPatientAccountRecords } = require('../services/patientRegistrationService');
const { normalizeRoleFromCode } = require('../security/roleMapping');
const { getJwtSecret } = require('../security/jwtConfig');
const { isAccountStatusActive } = require('../common/accountStatus');
const logger = require('../common/logger');


const SystemConfig = defineSystemConfig(sequelize);

// Security constants
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_TIME_MINUTES = 15;
const ACCESS_TOKEN_EXPIRY = '15m'; // Short-lived access token
const REFRESH_TOKEN_EXPIRY = '7d'; // Long-lived refresh token
const REFRESH_COOKIE_NAME = 'refreshToken';

// Verify password
const verifyPassword = async (password, hash) => {
  return await bcrypt.compare(password, hash);
};

// Generate tokens
const generateAccessToken = (username, userId, role) =>
  jwt.sign({ username, userId, role, type: 'access' }, getJwtSecret(), { expiresIn: ACCESS_TOKEN_EXPIRY });

const generateRefreshToken = (username, userId) =>
  jwt.sign({ username, userId, type: 'refresh' }, getJwtSecret(), { expiresIn: REFRESH_TOKEN_EXPIRY });

const resolveSameSite = () => {
  const raw = String(process.env.AUTH_REFRESH_COOKIE_SAMESITE || '').trim().toLowerCase();
  if (raw === 'lax' || raw === 'strict' || raw === 'none') return raw;
  return process.env.NODE_ENV === 'production' ? 'none' : 'lax';
};

const shouldUseSecureCookies = () => {
  if (process.env.AUTH_REFRESH_COOKIE_SECURE !== undefined) {
    return String(process.env.AUTH_REFRESH_COOKIE_SECURE).toLowerCase() === 'true';
  }
  return process.env.NODE_ENV === 'production';
};

const getRefreshCookieOptions = (expiresAt) => ({
  httpOnly: true,
  secure: shouldUseSecureCookies(),
  sameSite: resolveSameSite(),
  path: '/api/auth',
  expires: expiresAt,
});

const setRefreshCookie = (res, refreshToken, expiresAt) => {
  res.cookie(REFRESH_COOKIE_NAME, refreshToken, getRefreshCookieOptions(expiresAt));
};

const clearRefreshCookie = (res) => {
  res.clearCookie(REFRESH_COOKIE_NAME, {
    ...getRefreshCookieOptions(new Date(0)),
    expires: new Date(0),
  });
};

const getRefreshTokenFromRequest = (req) => {
  const fromCookie = req.cookies?.[REFRESH_COOKIE_NAME];
  if (fromCookie) return String(fromCookie);
  const fromBody = req.body?.refreshToken;
  if (fromBody) return String(fromBody);
  return null;
};

const getNumericConfig = async (key, fallback) => {
  try {
    const config = await SystemConfig.findOne({ where: { key } });
    if (!config) return fallback;
    const parsed = Number.parseInt(String(config.value), 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  } catch (error) {
    // Fail open for auth flow when optional config storage is unavailable.
    return fallback;
  }
};

exports.register = async (req, res) => {
  try {
    const t = await sequelize.transaction();
    let result;
    try {
      result = await createPatientAccountRecords(req.body, {
        transaction: t,
        createdByUserId: null,
      });
      if (!result.ok) {
        await t.rollback();
        return res.status(result.status).json({ success: false, error: result.error });
      }
      await t.commit();
    } catch (error) {
      await t.rollback();
      throw error;
    }

    const user = result.account;
    const loginUsername = user.username;

    // Generate tokens (outside transaction)
    const accessToken = generateAccessToken(loginUsername, user.user_id, user.type);
    const refreshToken = generateRefreshToken(loginUsername, user.user_id);
      
      // Create session
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7); // 7 days for refresh token
      
      await Session.create({
        userId: user.user_id,
        token: accessToken,
        refreshToken: refreshToken,
        expiresAt: expiresAt,
        lastActivity: new Date(),
      });
      
      setRefreshCookie(res, refreshToken, expiresAt);
      res.status(201).json({
        success: true,
        user: {
          id: user.user_id,
          username: user.username,
          type: user.type
        },
        token: accessToken,
        expiresAt: expiresAt.toISOString()
      });
  } catch (err) {
    logger.error({ err, sqlMessage: err?.original?.sqlMessage }, 'Registration error');
    res.status(500).json({ success: false, error: 'Registration failed. Please try again.' });
  }
}

/** Nurse (authenticated) creates a patient USER + ACCOUNT + PATIENT; sets ACCOUNT.created_by. */
exports.registerPatientByNurse = async (req, res) => {
  try {
    const role = String(req.user?.role || '').toLowerCase();
    if (role !== 'nurse') {
      return res.status(403).json({ success: false, error: 'Nurse access only' });
    }

    const staffUserId = Number(req.user.userId);
    if (!Number.isFinite(staffUserId)) {
      return res.status(400).json({ success: false, error: 'Invalid session' });
    }

    const t = await sequelize.transaction();
    let result;
    try {
      result = await createPatientAccountRecords(req.body, {
        transaction: t,
        createdByUserId: staffUserId,
      });
      if (!result.ok) {
        await t.rollback();
        return res.status(result.status).json({ success: false, error: result.error });
      }
      await t.commit();
    } catch (error) {
      await t.rollback();
      throw error;
    }

    const account = result.account;
    return res.status(201).json({
      success: true,
      userId: account.user_id,
      username: account.username,
    });
  } catch (err) {
    logger.error({ err, sqlMessage: err?.original?.sqlMessage }, 'Nurse register patient error');
    res.status(500).json({ success: false, error: 'Registration failed. Please try again.' });
  }
};


exports.login = async (req, res) => {
  try {
    const { username, password, rememberMe = false } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ 
        success: false, 
        error: 'Username and password are required' 
      });
    }

    const user = await Account.findOne({
      attributes: ['user_id', 'username', 'password', 'type', 'created_by', 'created_time', 'status'],
      where: { username },
      include: [{
        model: User,
        attributes: ['first_name', 'last_name']
      }]
    });

    if (!user) {
      return res.status(401).json({ 
        success: false, 
        error: 'Invalid email or password' 
      });
    }
    
    // Verify password
    const isValidPassword = await verifyPassword(password, user.password);

    if (!isValidPassword) {
      return res.status(401).json({ 
        success: false, 
        error: 'Invalid username or password.'
      });
    }

    // Only after correct password: reveal deactivated state (same rules as authMiddleware)
    const rawStatus = user.getDataValue ? user.getDataValue('status') : user.status;
    if (!isAccountStatusActive(rawStatus)) {
      return res.status(403).json({
        success: false,
        error:
          'This account has been deactivated. Please contact your administrator if you need access.',
        code: 'ACCOUNT_DEACTIVATED',
      });
    }

    // Kiểm tra số lượng user đồng thời
    // const config = await SystemConfig.findOne({ 
    //   where: { key: 'maxConcurrentUsers' } 
    // });
    // const maxUsers = config ? parseInt(config.value) : 500;
    
    // Làm sạch session hết hạn
    await Session.destroy({
      where: {
        expiresAt: {
          [Op.lt]: new Date()
        }
      }
    });
    
    // Đếm số session đang hoạt động
    // const activeSessions = await Session.count({
    //   where: {
    //     expiresAt: {
    //       [require('sequelize').Op.gt]: new Date()
    //     }
    //   }
    // });
    
    // if (activeSessions >= maxUsers) {
    //   return res.status(503).json({
    //     success: false,
    //     error: `Maximum concurrent users (${maxUsers}) reached. Please try again later.`
    //   });
    // }

    // Lấy session timeout từ config
    // const timeoutConfig = await SystemConfig.findOne({ 
    //   where: { key: 'sessionTimeoutMinutes' } 
    // });
    // const timeoutMinutes = timeoutConfig ? parseInt(timeoutConfig.value) : 1440; // Default 24 hours

    const timeoutMinutes = await getNumericConfig('sessionTimeoutMinutes', 30);
    
    // Xóa session cũ của user này nếu không có rememberMe hoặc là single session mode
    // In production, you might want to keep multiple sessions
    await Session.destroy({
      where: { userId: user.user_id }
    });
        
    // Generate tokens
    const accessToken = generateAccessToken(username, user.user_id, user.type);
    const refreshToken = generateRefreshToken(username, user.user_id);
    
    // Set expiry based on rememberMe
    const expiresAt = new Date();
    if (rememberMe) {
      expiresAt.setDate(expiresAt.getDate() + 7); // 7 days
    } else {
      expiresAt.setMinutes(expiresAt.getMinutes() + timeoutMinutes);
    }
    
    // Create session with refresh token
    await Session.create({
      userId: user.user_id,
      token: accessToken,
      refreshToken: refreshToken,
      expiresAt: expiresAt,
      lastActivity: new Date(),
      ipAddress: req.ip || req.connection?.remoteAddress,
      userAgent: req.headers['user-agent']
    });
    
    // Update last login when schema supports it.
    try {
      await user.update({ lastLogin: new Date() });
    } catch (_error) {
      // Ignore when legacy schema does not have last_login column.
    }
    // Normalize role names for RBAC capability checks.
    const role = normalizeRoleFromCode(user.type) || 'patient';
    
    const profile = user.User || user.user;
    const firstName = (profile?.first_name || '').trim();
    const lastName = (profile?.last_name || '').trim();
    const displayName = [lastName, firstName].filter(Boolean).join(' ').trim();

    setRefreshCookie(res, refreshToken, expiresAt);
    res.json({
      success: true,
      user: {
        id: user.user_id,
        username: user.username,
        firstName: user.User?.first_name,
        lastName: user.User?.last_name,
        fullName: user.User ? `${user.User.last_name || ''} ${user.User.first_name || ''}`.trim() : null,
        type: user.type,
        role: role
      },
      token: accessToken,
      expiresAt: expiresAt.toISOString()
    });
  } catch (err) {
    logger.error({ err }, 'Login error');
    res.status(500).json({ success: false, error: 'Login failed. Please try again.' });
  }
};

exports.logout = async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '') || 
                  req.body.token;
    const refreshToken = getRefreshTokenFromRequest(req);
    const { allDevices = false } = req.body;
    
    if (allDevices && req.user) {
      // Logout from all devices
      await Session.destroy({ where: { userId: req.user.userId } });
    } else if (token) {
      // Logout from current device only
      await Session.destroy({ where: { token } });
    } else if (refreshToken) {
      await Session.destroy({ where: { refreshToken } });
    }
    clearRefreshCookie(res);
    
    res.json({
      success: true,
      message: allDevices ? 'Logged out from all devices' : 'Logged out successfully'
    });
  } catch (err) {
    logger.error({ err }, 'Logout error');
    res.status(500).json({ success: false, error: 'Logout failed' });
  }
};

// Refresh access token using refresh token
exports.refreshToken = async (req, res) => {
  try {
    const refreshToken = getRefreshTokenFromRequest(req);
    
    if (!refreshToken) {
      return res.status(400).json({ 
        success: false, 
        error: 'Refresh token is required' 
      });
    }
    
    // Verify refresh token
    let decoded;
    try {
      decoded = jwt.verify(refreshToken, getJwtSecret());
      if (decoded.type !== 'refresh') {
        throw new Error('Invalid token type');
      }
    } catch (err) {
      clearRefreshCookie(res);
      return res.status(403).json({ 
        success: false, 
        error: 'Invalid or expired refresh token' 
      });
    }
    
    // Check if session exists with this refresh token
    const session = await Session.findOne({ 
      where: { 
        refreshToken,
        userId: decoded.userId 
      } 
    });
    
    if (!session) {
      clearRefreshCookie(res);
      return res.status(403).json({ 
        success: false, 
        error: 'Session not found or expired' 
      });
    }
    
    // Check if session is expired
    if (new Date() > new Date(session.expiresAt)) {
      await Session.destroy({ where: { id: session.id } });
      clearRefreshCookie(res);
      return res.status(403).json({ 
        success: false, 
        error: 'Session expired. Please login again.' 
      });
    }
    
    // Get user details
    const user = await Account.findOne({ where: { user_id: decoded.userId } });
    if (!user) {
      clearRefreshCookie(res);
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Generate new access token + rotate refresh token
    const newAccessToken = generateAccessToken(user.username, user.user_id, user.type);
    const newRefreshToken = generateRefreshToken(user.username, user.user_id);
    
    // Update session with rotated refresh token
    await session.update({
      token: newAccessToken,
      refreshToken: newRefreshToken,
      lastActivity: new Date()
    });
    setRefreshCookie(res, newRefreshToken, session.expiresAt);
    
    res.json({
      success: true,
      token: newAccessToken,
      user: {
        id: user.user_id,
        username: user.username,
        type: user.type
      }
    });
  } catch (err) {
    logger.error({ err }, 'Token refresh error');
    res.status(500).json({ success: false, error: 'Token refresh failed' });
  }
};

// Get current user session info
exports.getSession = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ 
        success: false, 
        error: 'Not authenticated' 
      });
    }
    
    const user = await Account.findOne({ where: { user_id: req.user.userId } }, { // Use user_id (Users table ID) instead of PK (Account table ID)
      attributes: ['user_id', 'username', 'type']
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Get active sessions
    const sessions = await Session.findAll({
      where: {
        userId: user.user_id, // This is correct, Session.userId == Users.id
        expiresAt: {
          [require('sequelize').Op.gt]: new Date()
        }
      },
      attributes: ['id', 'lastActivity', 'ipAddress', 'userAgent', 'expiresAt'],
      order: [['lastActivity', 'DESC']]
    });

    res.json({
      success: true,
      user: {
        id: user.user_id,
        username: user.username,
        type: user.type
      },
      sessions: sessions.map(s => s.toJSON())
    });
  } catch (err) {
    logger.error({ err }, 'Get session error');
    res.status(500).json({ success: false, error: 'Failed to get session info' });
  }
};

// Controller quản lý authentication với best practices: bcrypt hashing, refresh tokens, password validation, account lockout, và session management