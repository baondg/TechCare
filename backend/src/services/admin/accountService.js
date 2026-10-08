const { inTransaction } = require('../../common/transaction');
const accountRepository = require('../../repositories/accountRepository');
const catalogRepository = require('../../repositories/catalogRepository');
const sessionRepository = require('../../repositories/sessionRepository');
const { generateTemporaryPassword, hashPassword } = require('../auth/passwordPolicy');
const { BadRequestError, ForbiddenError, NotFoundError } = require('../../errors/AppError');
const { ROLE_CODES } = require('../../validators/adminSchemas');
const { ACCOUNT_ROLE_LABEL } = require('./roleLabels');

const ROLE_CODE_SET = new Set(ROLE_CODES);

function toSexCode(sex) {
  if (sex === 'Male') return 'M';
  if (sex === 'Female') return 'F';
  return 'O';
}

function splitName(fullName) {
  const normalized = String(fullName || '').trim();
  if (!normalized) return { firstName: '', lastName: '' };
  const parts = normalized.split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0], lastName: '' };
  return {
    firstName: parts.slice(0, -1).join(' '),
    lastName: parts[parts.length - 1],
  };
}

function parseDepartmentIdsCsv(csv) {
  if (csv == null || csv === '') return [];
  return String(csv)
    .split(',')
    .map((s) => Number(String(s).trim()))
    .filter((n) => Number.isInteger(n) && n > 0);
}

function mapAccountRow(r) {
  const uid = Number(r.userId);
  return {
    id: uid,
    userId: uid,
    username: r.username || '',
    roleCode: r.type || '',
    role: ACCOUNT_ROLE_LABEL[r.type] || r.type || '',
    status: r.status === 1 || r.status === true || r.status === '1',
    createdTime: r.createdTime || null,
    createdBy: r.createdBy ?? null,
    createdByName: r.createdByName != null ? String(r.createdByName).trim() : '',
    nationalId: r.nationalId != null ? String(r.nationalId) : '',
    name: r.name || '',
    sex: r.sex === 'M' ? 'Male' : r.sex === 'F' ? 'Female' : null,
    dob: r.dob || null,
    phone: r.phone || '',
    email: r.email || '',
    doctorId: r.doctorId != null && r.doctorId !== '' ? Number(r.doctorId) : null,
    doctorSpecifications: r.doctorSpecifications != null ? String(r.doctorSpecifications) : '',
    doctorQualifications: r.doctorQualifications != null ? String(r.doctorQualifications) : '',
    doctorDepartmentIds: parseDepartmentIdsCsv(r.doctorDepartmentIdsCsv),
  };
}

function parseDoctorPayload(body, roleCode) {
  if (roleCode !== 'DOC') {
    return { specifications: '', qualifications: '', departmentIds: [] };
  }
  const specifications = String(body?.doctorSpecifications ?? body?.specifications ?? '').trim();
  const qualifications = String(body?.doctorQualifications ?? body?.qualifications ?? '').trim();
  const raw = body?.doctorDepartmentIds ?? body?.departmentIds;
  const departmentIds = Array.isArray(raw)
    ? raw.map((x) => Number(x)).filter((n) => Number.isInteger(n) && n > 0)
    : [];
  return { specifications, qualifications, departmentIds };
}

function parseDobYmdLocal(ymd) {
  const m = String(ymd || '')
    .trim()
    .match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  const dt = new Date(y, mo, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo || dt.getDate() !== d) return null;
  return dt;
}

function completedFullYearsBetween(birth, ref) {
  let age = ref.getFullYear() - birth.getFullYear();
  const monthDiff = ref.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && ref.getDate() < birth.getDate())) age -= 1;
  return age;
}

/**
 * Profile fields shared by create and update. Throws BadRequestError with the first problem,
 * in the order the admin form shows its fields.
 */
function parseProfileFields(body, roleCode) {
  const name = String(body?.name || '').trim();
  const dob = String(body?.dob || '').trim();
  const phone = String(body?.phone || '').trim();
  const email = String(body?.email || '').trim();
  const enabled = body?.enabled === undefined ? true : !!body.enabled;
  const sexCode = toSexCode(body?.sex);

  if (!name) throw new BadRequestError('Name is required');
  if (!dob) throw new BadRequestError('Date of birth is required');
  const dobDate = parseDobYmdLocal(dob);
  if (!dobDate) throw new BadRequestError('Invalid date of birth');
  const now = new Date();
  const todayYmd = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  if (dob >= todayYmd) throw new BadRequestError('Date of birth must be before today (not today or a future date)');
  const ageYears = completedFullYearsBetween(dobDate, new Date());
  if (ageYears <= 1) throw new BadRequestError('Age must be greater than 1 year');
  if (!phone) throw new BadRequestError('Phone number is required');

  return { name, dob, phone, email, enabled, sexCode, doctor: parseDoctorPayload(body, roleCode) };
}

function parseNewAccount(body) {
  const username = String(body?.username || '').trim();
  const roleCode = String(body?.roleCode || '').trim().toUpperCase();
  if (!username) throw new BadRequestError('Username is required');
  if (!ROLE_CODE_SET.has(roleCode)) throw new BadRequestError('Invalid role code');
  return { username, roleCode, ...parseProfileFields(body, roleCode) };
}

/** USER columns from the parsed profile. */
function toUserRow({ name, dob, phone, email, sexCode }) {
  const { firstName, lastName } = splitName(name);
  return {
    sex: sexCode,
    dob,
    tel: phone,
    email: email || null,
    firstName: firstName || null,
    lastName: lastName || null,
  };
}

/** Upserts the DOCTOR row and replaces its departments (unknown department ids are dropped). */
async function syncDoctorProfile(userId, { specifications, qualifications, departmentIds }, transaction) {
  const uniqueIds = [...new Set(departmentIds.map(Number).filter((n) => Number.isInteger(n) && n > 0))];
  const cleanDeptIds = await accountRepository.filterExistingDepartmentIds(uniqueIds, transaction);
  const profile = { qualifications: qualifications || null, specifications: specifications || null };

  let doctorId = await accountRepository.findDoctorIdByUserId(userId, transaction);
  if (doctorId != null) {
    await accountRepository.updateDoctorProfile(doctorId, profile, transaction);
  } else {
    doctorId = await accountRepository.insertDoctorProfile(userId, profile, transaction);
  }
  await accountRepository.replaceDoctorDepartments(doctorId, cleanDeptIds, transaction);
}

async function listDepartments() {
  const rows = await catalogRepository.listDepartments();
  return rows.map((r) => ({ id: Number(r.id), name: String(r.name || '') }));
}

/** @param query parsed `listAccountsQuery` */
async function listAccounts(query) {
  const { page, limit, sortBy, sortDirection, ...filters } = query;
  const { total, rows } = await accountRepository.searchAccounts(filters, {
    sortBy,
    sortDirection,
    limit,
    offset: (page - 1) * limit,
  });
  return {
    accounts: rows.map(mapAccountRow),
    pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
  };
}

/**
 * Creates USER + ACCOUNT (+ DOCTOR for doctors) with a random temporary password, returned once
 * (`temporaryPassword`) for the admin to hand over; the user must change it at first sign-in.
 * @param {number | null} createdBy admin user id
 */
async function createAccount(body, createdBy) {
  const account = parseNewAccount(body);
  const temporaryPassword = generateTemporaryPassword();
  const password = await hashPassword(temporaryPassword);

  const created = await inTransaction(async (tx) => {
    if (await accountRepository.findAccountByUsername(account.username, tx)) {
      throw new BadRequestError('Username already exists');
    }
    const userId = await accountRepository.insertUser(
      { idcard: String(Date.now()).slice(-12).padStart(12, '0'), ...toUserRow(account) },
      tx
    );
    await accountRepository.insertAccount(
      {
        userId,
        username: account.username,
        password,
        type: account.roleCode,
        createdBy: createdBy || null,
        status: account.enabled ? 1 : 0,
        mustChangePassword: true,
      },
      tx
    );
    if (account.roleCode === 'DOC') {
      await syncDoctorProfile(userId, account.doctor, tx);
    }
    return accountRepository.findAccountView(userId, tx);
  });
  return { account: mapAccountRow(created), temporaryPassword };
}

/**
 * New temporary password for a user who lost theirs (returned once); their sessions end and they
 * must change it at next sign-in. Not for the admin's own account: they use change password.
 */
async function resetPassword(userId, adminUserId) {
  if (Number(userId) === Number(adminUserId)) {
    throw new BadRequestError('Use "Change password" for your own account.');
  }
  if (!(await accountRepository.findAccountType(userId))) throw new NotFoundError('Account not found');
  const temporaryPassword = generateTemporaryPassword();
  await accountRepository.setTemporaryPassword(userId, await hashPassword(temporaryPassword));
  await sessionRepository.deleteSessionsOfUser(userId);
  return { id: userId, temporaryPassword };
}

/** Updates profile fields and the enabled flag; username and role are read-only. */
async function updateAccount(userId, body) {
  const updated = await inTransaction(async (tx) => {
    const existing = await accountRepository.findAccountWithStatus(userId, tx);
    if (!existing) throw new NotFoundError('Account not found');

    const roleCode = String(existing.type || '').trim().toUpperCase();
    const profile = parseProfileFields(body, roleCode);
    const nextStatus = profile.enabled ? 1 : 0;
    if (roleCode === 'ADM' && nextStatus === 0) {
      throw new ForbiddenError('Cannot disable admin accounts.');
    }

    await accountRepository.updateUserProfile(userId, toUserRow(profile), tx);
    await accountRepository.updateAccountStatus(userId, nextStatus, tx);
    if (roleCode === 'DOC') {
      await syncDoctorProfile(userId, profile.doctor, tx);
    }
    return accountRepository.findAccountView(userId, tx);
  });
  return mapAccountRow(updated);
}

/** Enables / disables an account. Admin accounts cannot be disabled. */
async function setAccountEnabled(userId, enabled) {
  const status = enabled ? 1 : 0;
  const account = await accountRepository.findAccountType(userId);
  if (!account) throw new NotFoundError('Account not found');
  if (String(account.type || '').toUpperCase() === 'ADM' && status === 0) {
    throw new ForbiddenError('Cannot disable admin accounts.');
  }
  await accountRepository.updateAccountStatus(userId, status);
  return { id: userId, status: !!status };
}

module.exports = {
  mapAccountRow,
  listDepartments,
  listAccounts,
  createAccount,
  resetPassword,
  updateAccount,
  setAccountEnabled,
};
