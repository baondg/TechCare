const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const sequelize = require('../common/database');
const defineUser = require('../models/User');
const defineSession = require('../models/Session');
const defineSystemConfig = require('../models/SystemConfig');
const defineProfile = require('../models/Profile');
const User = defineUser(sequelize);
const Session = defineSession(sequelize);
const SystemConfig = defineSystemConfig(sequelize);
const Profile = defineProfile(sequelize);

// Security constants
const SALT_ROUNDS = 12;
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_TIME_MINUTES = 15;
const ACCESS_TOKEN_EXPIRY = '15m'; // Short-lived access token
const REFRESH_TOKEN_EXPIRY = '7d'; // Long-lived refresh token

// Password validation
const validatePassword = (password) => {
  if (password.length < 8) {
    return { valid: false, error: 'Password must be at least 8 characters long' };
  }
  if (!/[A-Z]/.test(password)) {
    return { valid: false, error: 'Password must contain at least one uppercase letter' };
  }
  if (!/[a-z]/.test(password)) {
    return { valid: false, error: 'Password must contain at least one lowercase letter' };
  }
  if (!/[0-9]/.test(password)) {
    return { valid: false, error: 'Password must contain at least one number' };
  }
  return { valid: true };
};

// Hash password using bcrypt
const hashPassword = async (password) => {
  return await bcrypt.hash(password, SALT_ROUNDS);
};

// Verify password
const verifyPassword = async (password, hash) => {
  return await bcrypt.compare(password, hash);
};

// Generate tokens
const generateAccessToken = (username, userId, role) =>
  jwt.sign({ username, userId, role, type: 'access' }, process.env.JWT_SECRET || 'your-secret-key', { expiresIn: ACCESS_TOKEN_EXPIRY });

const generateRefreshToken = (username, userId) =>
  jwt.sign({ username, userId, type: 'refresh' }, process.env.JWT_SECRET || 'your-secret-key', { expiresIn: REFRESH_TOKEN_EXPIRY });

exports.register = async (req, res) => {
  try {
    const { username, email, password, firstName, lastName, age } = req.body;

    
    // Validate required fields
    if (!username || !email || !password || !firstName || !lastName) {
      return res.status(400).json({ 
        success: false, 
        error: 'All fields are required' 
      });
    }
    
    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid email format' 
      });
    }
    
    // Validate password strength
    const passwordValidation = validatePassword(password);
    if (!passwordValidation.valid) {
      return res.status(400).json({ 
        success: false, 
        error: passwordValidation.error 
      });
    }
    
    // Check if username or email already exists
    const existingUser = await User.findOne({
      where: {
        [require('sequelize').Op.or]: [
          { username },
          { email }
        ]
      }
    });
    
    if (existingUser) {
      return res.status(409).json({ 
        success: false, 
        error: existingUser.username === username 
          ? 'Username already taken' 
          : 'Email already registered'
      });
    }
    
    // Hash password
    const hashedPassword = await hashPassword(password);
    const encryptedPassword = encryptPassword(password);

    
    // SECURITY: Always create as 'patient', never allow role to be set from request
    const user = await User.create({
      username,
      email,
      password: hashedPassword,
      firstName,
      lastName,
      age,

      role: 'patient', // Force patient role for public registration
      loginAttempts: 0,
      lockUntil: null

    });
    
    // Create empty profile for new user
    await Profile.create({ userId: user.user_id, email: user.email });

    // Generate tokens
    const accessToken = generateAccessToken(username, user.user_id, user.role);
    const refreshToken = generateRefreshToken(username, user.user_id);
    
    // Create session
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days for refresh token
    
    await Session.create({
      userId: user.user_id,
      token: accessToken,
      refreshToken: refreshToken,
      expiresAt: expiresAt,
      lastActivity: new Date(),
      ipAddress: req.ip || req.connection?.remoteAddress,
      userAgent: req.headers['user-agent']
    });
    
    res.status(201).json({
      success: true,
      user: { 
        id: user.user_id, 
        username: user.username, 
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role
      },
      token: accessToken,
      refreshToken: refreshToken,
      expiresAt: expiresAt.toISOString()
    });
  } catch (err) {
    console.error('Registration error:', err);
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

    const user = await User.findOne({ where: { username } });

    console.log("LOGIN USERNAME:", username);
console.log("USER FROM DB:", user);
console.log("HASH IN DB:", user?.password);

    if (!user) {
      return res.status(401).json({ 
        success: false, 
        error: 'Invalid username or password' 
      });
    }
    
    // Check if account is locked
    if (user.lockUntil && user.lockUntil > new Date()) {
      const minutesLeft = Math.ceil((user.lockUntil - new Date()) / 60000);
      return res.status(423).json({ 
        success: false, 
        error: `Account locked due to multiple failed login attempts. Try again in ${minutesLeft} minutes.`,
        lockUntil: user.lockUntil
      });
    }
    
    // Verify password
    const isValidPassword = await verifyPassword(password, user.password);
    console.log("INPUT PASSWORD:", password);
console.log("PASSWORD MATCH:", isValidPassword);

    if (!isValidPassword) {
      // Increment failed login attempts
      const attempts = (user.loginAttempts || 0) + 1;
      const updates = { loginAttempts: attempts };
      
      // Lock account if max attempts reached
      if (attempts >= MAX_LOGIN_ATTEMPTS) {
        const lockUntil = new Date();
        lockUntil.setMinutes(lockUntil.getMinutes() + LOCKOUT_TIME_MINUTES);
        updates.lockUntil = lockUntil;
        
        await user.update(updates);
        
        return res.status(423).json({ 
          success: false, 
          error: `Account locked for ${LOCKOUT_TIME_MINUTES} minutes due to multiple failed login attempts.`,
          lockUntil: lockUntil
        });
      }
      
      await user.update(updates);
      
      return res.status(401).json({ 
        success: false, 
        error: `Invalid username or password. ${MAX_LOGIN_ATTEMPTS - attempts} attempts remaining.`,
        attemptsRemaining: MAX_LOGIN_ATTEMPTS - attempts
      });
    }
    
    // Reset login attempts on successful login
    if (user.loginAttempts > 0 || user.lockUntil) {
      await user.update({ loginAttempts: 0, lockUntil: null });
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
    
    // Xóa session cũ của user này nếu không có rememberMe hoặc là single session mode
    // In production, you might want to keep multiple sessions
    await Session.destroy({
      where: { userId: user.user_id }
    });
        
    // Generate tokens
    const accessToken = generateAccessToken(username, user.user_id, user.role);
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
    
    // Update last login time
    await user.update({ lastLogin: new Date() });
    
    res.json({
      success: true,
      user: { 
        id: user.user_id, 
        username: user.username, 
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role
      },
      token: accessToken,
      refreshToken: refreshToken,
      expiresAt: expiresAt.toISOString()
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ success: false, error: 'Login failed. Please try again.' });
  }
};

exports.logout = async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '') || 
                  req.body.token;
    const { allDevices = false } = req.body;
    
    if (allDevices && req.user) {
      // Logout from all devices
      await Session.destroy({ where: { userId: req.user.userId } });
    } else if (token) {
      // Logout from current device only
      await Session.destroy({ where: { token } });
    }
    
    res.json({
      success: true,
      message: allDevices ? 'Logged out from all devices' : 'Logged out successfully'
    });
  } catch (err) {
    console.error('Logout error:', err);
    res.status(500).json({ success: false, error: 'Logout failed' });
  }
};

// Refresh access token using refresh token
exports.refreshToken = async (req, res) => {
  try {
    const { refreshToken } = req.body;
    
    if (!refreshToken) {
      return res.status(400).json({ 
        success: false, 
        error: 'Refresh token is required' 
      });
    }
    
    // Verify refresh token
    let decoded;
    try {
      decoded = jwt.verify(refreshToken, process.env.JWT_SECRET || 'your-secret-key');
      if (decoded.type !== 'refresh') {
        throw new Error('Invalid token type');
      }
    } catch (err) {
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
      return res.status(403).json({ 
        success: false, 
        error: 'Session not found or expired' 
      });
    }
    
    // Check if session is expired
    if (new Date() > new Date(session.expiresAt)) {
      await Session.destroy({ where: { id: session.id } });
      return res.status(403).json({ 
        success: false, 
        error: 'Session expired. Please login again.' 
      });
    }
    
    // Get user details
    const user = await User.findByPk(decoded.userId);
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        error: 'User not found' 
      });
    }
    
    // Generate new access token
    const newAccessToken = generateAccessToken(user.username, user.user_id, user.role);
    
    // Update session with new access token and activity time
    await session.update({
      token: newAccessToken,
      lastActivity: new Date()
    });
    
    res.json({
      success: true,
      token: newAccessToken,
      user: {
        id: user.user_id,
        username: user.username,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role
      }
    });
  } catch (err) {
    console.error('Token refresh error:', err);
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
    
    const user = await User.findByPk(req.user.userId, {
      attributes: ['id', 'username', 'email', 'firstName', 'lastName', 'role', 'lastLogin']
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
        userId: user.user_id,
        expiresAt: {
          [require('sequelize').Op.gt]: new Date()
        }
      },
      attributes: ['id', 'lastActivity', 'ipAddress', 'userAgent', 'expiresAt'],
      order: [['lastActivity', 'DESC']]
    });
    
    res.json({
      success: true,
      user: user.toJSON(),
      sessions: sessions.map(s => s.toJSON())
    });
  } catch (err) {
    console.error('Get session error:', err);
    res.status(500).json({ success: false, error: 'Failed to get session info' });
  }
};

// Controller quản lý authentication với best practices: bcrypt hashing, refresh tokens, password validation, account lockout, và session management