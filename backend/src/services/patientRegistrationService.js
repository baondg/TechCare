const bcrypt = require('bcrypt');
const Account = require('../models/Account');
const User = require('../models/Users');
const Patient = require('../models/Patient');

const SALT_ROUNDS = 12;

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
 * Creates USER + ACCOUNT (PAT) + PATIENT in one transaction.
 * @param {object} body - Same shape as public /signup body
 * @param {object} options
 * @param {import('sequelize').Transaction} options.transaction - Required
 * @param {number|null} [options.createdByUserId] - Nurse/staff USER.id for ACCOUNT.created_by
 * @returns {Promise<{ ok: true, account: import('sequelize').Model, user: import('sequelize').Model } | { ok: false, status: number, error: string }>}
 */
async function createPatientAccountRecords(body, { transaction, createdByUserId = null }) {
  const { sex, email, password, dob, tel, idcard, firstName, lastName } = body;

  const idNormalized = String(idcard || '').trim();
  if (!idNormalized) {
    return { ok: false, status: 400, error: 'National ID / passport is required' };
  }

  const loginUsername = idNormalized;

  if (!password || !firstName || !lastName) {
    return { ok: false, status: 400, error: 'Password and name fields are required' };
  }

  const telNormalized = String(tel || '').trim();
  if (!telNormalized) {
    return { ok: false, status: 400, error: 'Phone number is required' };
  }

  const dobNormalized = String(dob || '').trim();
  if (!dobNormalized) {
    return { ok: false, status: 400, error: 'Date of birth is required' };
  }

  const emailTrimmed = String(email || '').trim();
  const emailForDb = emailTrimmed || null;
  if (emailTrimmed) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(emailTrimmed)) {
      return { ok: false, status: 400, error: 'Invalid email format' };
    }
  }

  const passwordValidation = validatePasswordStrength(password);
  if (!passwordValidation.valid) {
    return { ok: false, status: 400, error: passwordValidation.error };
  }

  const existingUser = await Account.findOne({
    where: { username: loginUsername },
    transaction,
  });

  if (existingUser) {
    return { ok: false, status: 409, error: 'Username already taken' };
  }

  const hashedPassword = await hashPassword(password);

  const newUser = await User.create(
    {
      first_name: firstName,
      last_name: lastName,
      email: emailForDb,
      sex,
      dob: dobNormalized,
      tel: telNormalized,
      idcard: idNormalized,
    },
    { transaction }
  );

  const account = await Account.create(
    {
      username: loginUsername,
      password: hashedPassword,
      type: 'PAT',
      user_id: newUser.id,
      created_time: new Date(),
      status: 1,
      ...(createdByUserId != null ? { created_by: createdByUserId } : {}),
    },
    { transaction }
  );

  const defaultAllergic = {
    drugAllergies: [],
    foodAllergies: [],
    otherAllergies: [],
  };
  const defaultHistory = {
    vaccinations: [],
    familyHistory: [],
    pastIllnesses: [],
    pastSurgeries: [],
    substanceAbuse: [],
    chronicConditions: [],
  };

  await Patient.findOrCreate({
    where: { user_id: newUser.id },
    defaults: {
      allergic_info: defaultAllergic,
      medical_history: defaultHistory,
    },
    transaction,
  });

  return { ok: true, account, user: newUser };
}

module.exports = {
  createPatientAccountRecords,
  validatePasswordStrength,
  hashPassword,
};
