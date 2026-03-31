const jwt = require('jsonwebtoken');
const Session = require('../models/Session');
const Account = require('../models/Account');

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
    
    // Check if user is active (support both legacy text and tinyint values)
    const user = await Account.findOne({ where: { user_id: decoded.userId } }); // Use user_id (Users table ID) instead of PK (Account table ID)
    const rawStatus = user?.status;
    const isActive =
      rawStatus === 'Active' ||
      rawStatus === 'active' ||
      rawStatus === 1 ||
      rawStatus === true ||
      rawStatus === '1';
    if (!user || !isActive) {
      return res.status(403).json({ 
        success: false,
        error: 'Account is inactive or not found',
        code: 'ACCOUNT_INACTIVE'
      });
    }
    
    // Update last activity
    await session.update({ lastActivity: new Date() });
    
    // Attach user info to request
    const roleMap = {
    DOC: "doctor",
    PAT: "patient",
    ADM: "admin",
    NUR: "nurse",
    TEC: "technician"
  };

  req.user = {
    ...decoded,
    role: roleMap[decoded.role] || decoded.role
  };
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
};

module.exports = authenticateToken;
