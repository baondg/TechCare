const staffRepository = require('../../repositories/staffRepository');
const { encryptField, decryptField } = require('../../common/fieldEncryption');
const logger = require('../../common/logger');
const { AppError, BadRequestError } = require('../../errors/AppError');

async function requireDoctorId(userId) {
  const doctorId = await staffRepository.findDoctorIdByUserId(userId);
  if (!doctorId) throw new BadRequestError('Doctor profile not found');
  return doctorId;
}

/** The doctor's signature image (data URL), decrypted; null when none is saved. */
async function getSignature(userId) {
  const doctorId = await requireDoctorId(userId);
  const stored = await staffRepository.findDoctorSignature(doctorId);
  if (!stored) return null;
  try {
    return decryptField(stored);
  } catch (decryptErr) {
    logger.error({ err: decryptErr }, 'Decrypt signature error');
    throw new AppError('Could not read signature', 500, { expose: true });
  }
}

/** Stores the signature encrypted (IMAGE_ENCRYPTION_KEY); empty clears it. */
async function saveSignature(userId, signature) {
  const doctorId = await requireDoctorId(userId);
  let stored = signature || null;
  if (stored) {
    try {
      stored = encryptField(stored);
    } catch (encryptErr) {
      logger.error({ err: encryptErr }, 'Encrypt signature error');
      const notConfigured = encryptErr instanceof Error && encryptErr.message.includes('IMAGE_ENCRYPTION_KEY');
      throw new AppError(
        notConfigured ? 'Signature encryption is not configured on the server' : 'Could not save signature',
        500,
        { expose: true }
      );
    }
  }
  await staffRepository.updateDoctorSignature(doctorId, stored);
}

module.exports = { getSignature, saveSignature };
