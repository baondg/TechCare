const profileRepository = require('../repositories/profileRepository');
const patientRepository = require('../repositories/patientRepository');
const { inTransaction } = require('../common/transaction');
const { AppError, BadRequestError, ForbiddenError, NotFoundError } = require('../errors/AppError');

const MEDICAL_STAFF = new Set(['doctor', 'nurse', 'technician']);

/** USER.id from the route (parseInt: "70abc" → 70); 400 when not a number. */
function parseUserId(param) {
  const userId = parseInt(param, 10);
  if (Number.isNaN(userId)) throw new BadRequestError('Invalid user ID');
  return userId;
}

const isSelfOrAdmin = (user, userId) => String(user.userId) === String(userId) || user.role === 'admin';
const isMedicalStaff = (user) => MEDICAL_STAFF.has(String(user?.role || '').toLowerCase());

/** Self, admin or medical staff (e.g. a nurse completing a patient's details) may read and edit. */
function requireProfileAccess(user, userId) {
  if (!isSelfOrAdmin(user, userId) && !isMedicalStaff(user)) throw new ForbiddenError('Forbidden');
}

function splitFullName(fullName) {
  const s = String(fullName || '').trim();
  if (!s) return { first: '', last: '' };
  const parts = s.split(/\s+/);
  return { first: parts[0] || '', last: parts.slice(1).join(' ') || '' };
}

/** Empty string fails RELATIVE.tel / RELATIVE.email Sequelize validators; use null instead. */
function nullIfEmpty(value) {
  if (value === undefined || value === null) return null;
  const s = String(value).trim();
  return s === '' ? null : s;
}

/** Letters (any script), spaces, apostrophes and hyphens; at least one letter, no digits. */
function isValidHumanName(value) {
  const s = String(value || '').normalize('NFC').trim();
  if (!s) return false;
  if (/\d/u.test(s)) return false;
  if (!/^[\p{L}\p{M}\s'-]+$/u.test(s)) return false;
  return /[\p{L}]/u.test(s);
}

/** Runs a write; a model validator rejection (bad email, phone…) becomes 400 "Invalid <prefix><field>". */
async function rejectInvalid(prefix, write) {
  try {
    return await write();
  } catch (error) {
    if (error?.name !== 'SequelizeValidationError') throw error;
    throw new BadRequestError(`Invalid ${prefix}${error.errors?.[0]?.path || 'value'}`);
  }
}

const toSexCode = (sex) => (sex === 'Male' ? 'M' : sex === 'Female' ? 'F' : 'O');

/** `{ profile, relative, insurance }` of a user (relative / insurance only for patients). */
async function getProfile(user, userIdParam) {
  const userId = parseUserId(userIdParam);
  requireProfileAccess(user, userId);

  const account = await profileRepository.findAccountWithUser(userId);
  if (!account) throw new NotFoundError('Account not found');
  const u = account.User || account.user;
  const raw = u?.dataValues ?? u ?? {};
  const firstName = String(raw.first_name || '').trim();
  const lastName = String(raw.last_name || '').trim();
  const fullName = `${firstName} ${lastName}`.trim();

  const profile = {
    user_id: account.user_id,
    username: account.username,
    role: account.type,
    firstName,
    lastName,
    fullName: fullName || account.username,
    dateOfBirth: raw.dob,
    sex: raw.sex,
    phone: raw.tel,
    email: raw.email,
    nationalId: raw.idcard != null ? String(raw.idcard) : '',
  };
  const { relative, insurance } = await profileRepository.findPatientRelativeAndInsurance(userId);
  return { profile, relative, insurance };
}

/**
 * Updates USER fields and, for patients, replaces their RELATIVE, in one transaction. First, last and
 * relative names are required and must look like human names; values the models reject give 400.
 */
async function updateProfile(user, userIdParam, body) {
  const userId = parseUserId(userIdParam);
  requireProfileAccess(user, userId);

  const fnRaw = (body.firstName ?? body.first_name ?? '').toString().trim();
  const lnRaw = (body.lastName ?? body.last_name ?? '').toString().trim();
  const relNameRaw = (body.relativeName ?? '').toString().trim();
  if (!isValidHumanName(fnRaw)) throw new BadRequestError('Invalid first name');
  if (!isValidHumanName(lnRaw)) throw new BadRequestError('Invalid last name');
  if (!isValidHumanName(relNameRaw)) throw new BadRequestError('Invalid relative name');

  let first = fnRaw;
  let last = lnRaw;
  if (!first && !last && body.fullName != null && String(body.fullName).trim()) {
    ({ first, last } = splitFullName(body.fullName));
  }

  const relativeName = nullIfEmpty(relNameRaw);
  // One transaction: a relative that fails validation must not leave the patient without one.
  await inTransaction(async (transaction) => {
    const userRow = await profileRepository.findUserById(userId, transaction);
    if (userRow) {
      await rejectInvalid('', () =>
        profileRepository.updateUser(
          userRow,
          {
            first_name: first || null,
            last_name: last || null,
            dob: body.dateOfBirth,
            sex: toSexCode(body.sex),
            tel: body.phone,
            email: body.email,
            idcard: body.nationalId,
          },
          transaction
        )
      );
    }

    const patient = await patientRepository.findPatientByUserId(userId, transaction);
    if (patient && relativeName) {
      await rejectInvalid('relative ', () =>
        profileRepository.replaceRelative(
          patient.patient_id,
          {
            name: relativeName,
            relationship: nullIfEmpty(body.relativeRelationship) || 'Mother',
            dob: body.relativeDateOfBirth || null,
            sex: toSexCode(body.relativeSex),
            tel: nullIfEmpty(body.relativePhone),
            email: nullIfEmpty(body.relativeEmail),
            idcard: nullIfEmpty(body.relativeNationalId),
          },
          transaction
        )
      );
    }
  });
}

/** Not supported: user data lives on the USER record. Self / admin get 501, others 403. */
function deleteProfile(user, userIdParam) {
  const userId = parseUserId(userIdParam);
  if (!isSelfOrAdmin(user, userId)) throw new ForbiddenError('Forbidden');
  throw new AppError(
    'Deleting the full patient profile is not supported; user data lives on the USER record.',
    501,
    { expose: true }
  );
}

module.exports = { getProfile, updateProfile, deleteProfile };
