const jwt = require('jsonwebtoken');
<<<<<<< HEAD
=======
<<<<<<< HEAD
>>>>>>> backend
const sequelize = require('../common/database');
const defineSession = require('../models/Session');
const defineUser = require('../models/User');
const Session = defineSession(sequelize);
const User = defineUser(sequelize);
<<<<<<< HEAD

const authenticateToken = async (req, res, next) => {
=======

const authenticateToken = async (req, res, next) => {
=======

const authenticateToken = (req, res, next) => {
>>>>>>> 9d41cd19 (TC-2801: Fix the FE branch and modify gitignore)
>>>>>>> backend
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
<<<<<<< HEAD
=======
<<<<<<< HEAD
>>>>>>> backend
    return res.status(401).json({ 
      success: false,
      error: 'Authentication required',
      code: 'NO_TOKEN'
    });
<<<<<<< HEAD
=======
  }

  try {
    // Verify JWT token
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    
    // Check token type is access token
    if (decoded.type !== 'access') {
      return res.status(403).json({ 
        success: false,
        error: 'Invalid token type',
        code: 'INVALID_TOKEN_TYPE'
      });
    }
    
    // Check if session exists and is valid
    const session = await Session.findOne({
      where: { 
        token,
        userId: decoded.userId
      }
    });
    
    if (!session) {
      return res.status(403).json({ 
        success: false,
        error: 'Session not found or expired',
        code: 'INVALID_SESSION'
      });
    }
    
    // Check if session is expired
    if (new Date() > new Date(session.expiresAt)) {
      await Session.destroy({ where: { id: session.id } });
      return res.status(401).json({ 
        success: false,
        error: 'Session expired. Please login again.',
        code: 'SESSION_EXPIRED'
      });
    }
    
    // Check if user is active
    const user = await User.findByPk(decoded.userId);
    if (!user || !user.isActive) {
      return res.status(403).json({ 
        success: false,
        error: 'Account is inactive or not found',
        code: 'ACCOUNT_INACTIVE'
      });
    }
    
    // Update last activity
    await session.update({ lastActivity: new Date() });
    
    // Attach user info to request
    req.user = decoded;
    req.session = session;
    next();
  } catch (err) {
    console.error('Token verification failed:', err.message);
    
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        success: false,
        error: 'Token expired',
        code: 'TOKEN_EXPIRED'
      });
    }
    
    if (err.name === 'JsonWebTokenError') {
      return res.status(403).json({ 
        success: false,
        error: 'Invalid token',
        code: 'INVALID_TOKEN'
      });
    }
    
    return res.status(500).json({ 
      success: false,
      error: 'Authentication failed',
      code: 'AUTH_ERROR'
    });
  }
=======
    return res.status(401).json({ message: 'Authentication required' });
>>>>>>> backend
  }

  try {
    // Verify JWT token
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    
    // Check token type is access token
    if (decoded.type !== 'access') {
      return res.status(403).json({ 
        success: false,
        error: 'Invalid token type',
        code: 'INVALID_TOKEN_TYPE'
      });
    }
    
    // Check if session exists and is valid
    const session = await Session.findOne({
      where: { 
        token,
        userId: decoded.userId
      }
    });
    
    if (!session) {
      return res.status(403).json({ 
        success: false,
        error: 'Session not found or expired',
        code: 'INVALID_SESSION'
      });
    }
    
    // Check if session is expired
    if (new Date() > new Date(session.expiresAt)) {
      await Session.destroy({ where: { id: session.id } });
      return res.status(401).json({ 
        success: false,
        error: 'Session expired. Please login again.',
        code: 'SESSION_EXPIRED'
      });
    }
    
    // Check if user is active
    const user = await User.findByPk(decoded.userId);
    if (!user || !user.isActive) {
      return res.status(403).json({ 
        success: false,
        error: 'Account is inactive or not found',
        code: 'ACCOUNT_INACTIVE'
      });
    }
    
    // Update last activity
    await session.update({ lastActivity: new Date() });
    
    // Attach user info to request
    req.user = decoded;
    req.session = session;
    next();
<<<<<<< HEAD
  } catch (err) {
    console.error('Token verification failed:', err.message);
    
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        success: false,
        error: 'Token expired',
        code: 'TOKEN_EXPIRED'
      });
    }
    
    if (err.name === 'JsonWebTokenError') {
      return res.status(403).json({ 
        success: false,
        error: 'Invalid token',
        code: 'INVALID_TOKEN'
      });
    }
    
    return res.status(500).json({ 
      success: false,
      error: 'Authentication failed',
      code: 'AUTH_ERROR'
    });
  }
=======
  });
>>>>>>> 9d41cd19 (TC-2801: Fix the FE branch and modify gitignore)
>>>>>>> backend
};

module.exports = authenticateToken;
