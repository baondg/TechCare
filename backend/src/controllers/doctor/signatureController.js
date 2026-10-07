const { QueryTypes } = require('sequelize');
const sequelize = require('../../common/database');
const { encryptField, decryptField } = require('../../common/fieldEncryption');
const logger = require('../../common/logger');
const { getDoctorIdByUserId } = require('../../services/emr/staffIdentity');

// ═══════════════════════════════════════════════
//  DOCTOR SIGNATURE
// ═══════════════════════════════════════════════

/**
 * GET /api/doctor/signature
 * Get the current doctor's signature
 */
exports.getSignature = async (req, res) => {
  try {
    const userId = req.user.userId;
    const doctorId = await getDoctorIdByUserId(userId);
    if (!doctorId) {
      return res.status(400).json({ success: false, message: 'Doctor profile not found' });
    }

    const [row] = await sequelize.query(
      'SELECT signature FROM DOCTOR WHERE doctor_id = :doctorId LIMIT 1',
      { replacements: { doctorId }, type: QueryTypes.SELECT }
    );

    let signature = row?.signature || null;
    if (signature) {
      try {
        signature = decryptField(signature);
      } catch (decryptErr) {
        logger.error({ err: decryptErr }, 'Decrypt signature error');
        return res.status(500).json({ success: false, message: 'Could not read signature' });
      }
    }

    return res.json({
      success: true,
      signature,
    });
  } catch (error) {
    logger.error({ err: error }, 'Get signature error');
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * PUT /api/doctor/signature
 * Save the doctor's signature (base64 data URL)
 */
exports.saveSignature = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { signature } = req.body;
    const doctorId = await getDoctorIdByUserId(userId);
    if (!doctorId) {
      return res.status(400).json({ success: false, message: 'Doctor profile not found' });
    }

    let storedSignature = signature || null;
    if (storedSignature) {
      try {
        storedSignature = encryptField(storedSignature);
      } catch (encryptErr) {
        logger.error({ err: encryptErr }, 'Encrypt signature error');
        const msg =
          encryptErr instanceof Error && encryptErr.message.includes('IMAGE_ENCRYPTION_KEY')
            ? 'Signature encryption is not configured on the server'
            : 'Could not save signature';
        return res.status(500).json({ success: false, message: msg });
      }
    }

    await sequelize.query(
      'UPDATE DOCTOR SET signature = :signature WHERE doctor_id = :doctorId',
      { replacements: { signature: storedSignature, doctorId }, type: QueryTypes.UPDATE }
    );

    return res.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, 'Save signature error');
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};
