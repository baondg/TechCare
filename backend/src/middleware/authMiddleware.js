const jwt = require('jsonwebtoken');
const sessionRepository = require('../repositories/sessionRepository');
const authAccountRepository = require('../repositories/authAccountRepository');
const { normalizeRoleFromCode } = require('../security/roleMapping');
const { getJwtSecret } = require('../security/jwtConfig');
const { isAccountStatusActive } = require('../common/accountStatus');
const logger = require('../common/logger');

const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ 
      success: false,
      error: 'Authentication required',
      code: 'NO_TOKEN'
    });
  }

  try {
    // Verify JWT token
    const decoded = jwt.verify(token, getJwtSecret());
    
    // Check token type is access token
    if (decoded.type !== 'access') {
      return res.status(403).json({ 
        success: false,
        error: 'Invalid token type',
        code: 'INVALID_TOKEN_TYPE'
      });
    }
    
    // Check if session exists and is valid
    const session = await sessionRepository.findSessionByAccessToken(token, decoded.userId);
    
    if (!session) {
      return res.status(403).json({ 
        success: false,
        error: 'Session not found or expired',
        code: 'INVALID_SESSION'
      });
    }
    
    // Check if session is expired
    if (new Date() > new Date(session.expiresAt)) {
      await sessionRepository.deleteSession(session.id);
      return res.status(401).json({ 
        success: false,
        error: 'Session expired. Please login again.',
        code: 'SESSION_EXPIRED'
      });
    }
    
    // Check if user is active (same rules as login / ACCOUNT.status)
    const user = await authAccountRepository.findAccountByUserId(decoded.userId);
    const rawStatus = user ? (user.getDataValue ? user.getDataValue('status') : user.status) : undefined;
    if (!user || !isAccountStatusActive(rawStatus)) {
      return res.status(403).json({ 
        success: false,
        error: 'Account is inactive or not found',
        code: 'ACCOUNT_INACTIVE'
      });
    }
    
    // Update last activity
    await sessionRepository.updateSession(session, { lastActivity: new Date() });
    
    // Attach user info to request
  req.user = {
    ...decoded,
    role: normalizeRoleFromCode(decoded.role),
  };
    req.session = session;
    next();
  } catch (err) {
    logger.error({ err }, 'Token verification failed');
    
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
};

module.exports = authenticateToken;
