const bcrypt = require('bcrypt');
const sequelize = require('../common/database');
const authAccountRepository = require('../repositories/authAccountRepository');
const { BadRequestError, ConflictError } = require('../errors/AppError');

const SALT_ROUNDS = 12;

const EMPTY_ALLERGIES = { drugAllergies: [], foodAllergies: [], otherAllergies: [] };
const EMPTY_HISTORY = {
  vaccinations: [],
  familyHistory: [],
  pastIllnesses: [],
  pastSurgeries: [],
  substanceAbuse: [],
  chronicConditions: [],
};

function validatePasswordStrength(password) {
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
}

async function hashPassword(password) {
  return bcrypt.hash(password, SALT_ROUNDS);
}

/**
 * Validates a sign-up body (same shape for public /signup and nurse registration).
 * Throws BadRequestError with the first problem. The national id is the login username.
 */
function parsePatientRegistration(body) {
  const { sex, email, password, dob, tel, idcard, firstName, lastName } = body || {};

  const idNormalized = String(idcard || '').trim();
  if (!idNormalized) throw new BadRequestError('National ID / passport is required');
  if (!password || !firstName || !lastName) throw new BadRequestError('Password and name fields are required');

  const telNormalized = String(tel || '').trim();
  if (!telNormalized) throw new BadRequestError('Phone number is required');

  const dobNormalized = String(dob || '').trim();
  if (!dobNormalized) throw new BadRequestError('Date of birth is required');

  const emailTrimmed = String(email || '').trim();
  if (emailTrimmed && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrimmed)) {
    throw new BadRequestError('Invalid email format');
  }

  const passwordValidation = validatePasswordStrength(password);
  if (!passwordValidation.valid) throw new BadRequestError(passwordValidation.error);

  return {
    username: idNormalized,
    password,
    user: {
      first_name: firstName,
      last_name: lastName,
      email: emailTrimmed || null,
      sex,
      dob: dobNormalized,
      tel: telNormalized,
      idcard: idNormalized,
    },
  };
}

/**
 * Creates USER + ACCOUNT (PAT) + PATIENT inside the caller's transaction.
 * Throws BadRequestError (invalid body) or ConflictError (national id already registered).
 * @param {object} body - Same shape as public /signup body
 * @param {object} options
 * @param {import('sequelize').Transaction} options.transaction - Required
 * @param {number|null} [options.createdByUserId] - Nurse/staff USER.id for ACCOUNT.created_by
 * @returns {Promise<{ account: import('sequelize').Model, user: import('sequelize').Model }>}
 */
async function createPatientAccountRecords(body, { transaction, createdByUserId = null }) {
  const registration = parsePatientRegistration(body);
  return insertPatientAccount(registration, { transaction, createdByUserId });
}

async function insertPatientAccount({ username, password, user }, { transaction, createdByUserId }) {
  if (await authAccountRepository.findAccountByUsername(username, transaction)) {
    throw new ConflictError('Username already taken');
  }
  return authAccountRepository.createPatientAccount(
    {
      user,
      account: {
        username,
        password: await hashPassword(password),
        type: 'PAT',
        created_time: new Date(),
        status: 1,
        ...(createdByUserId != null ? { created_by: createdByUserId } : {}),
      },
      patientDefaults: {
        allergic_info: structuredClone(EMPTY_ALLERGIES),
        medical_history: structuredClone(EMPTY_HISTORY),
      },
    },
    transaction
  );
}

/**
 * Validates, then creates the patient account in its own transaction.
 * @param {number|null} createdByUserId staff user id (nurse registration) or null (self sign-up)
 * @returns {Promise<{ account, user }>}
 */
async function registerPatient(body, createdByUserId = null) {
  const registration = parsePatientRegistration(body);
  const transaction = await sequelize.transaction();
  try {
    const created = await insertPatientAccount(registration, { transaction, createdByUserId });
    await transaction.commit();
    return created;
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

module.exports = {
  createPatientAccountRecords,
  registerPatient,
  validatePasswordStrength,
  hashPassword,
};
