const sequelize = require('../common/database');
const Session = require('../models/Session');
const { createPatientAccountRecords } = require('../services/patientRegistrationService');
const logger = require('../common/logger');
const { generateAccessToken, generateRefreshToken, setRefreshCookie } = require('./sessionTokens');

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
