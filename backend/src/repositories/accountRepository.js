const { QueryTypes } = require('sequelize');
const sequelize = require('../common/database');

/** Display name: "first last", falling back to the username. */
const ACCOUNT_DISPLAY_NAME_SQL =
  "COALESCE(NULLIF(TRIM(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, ''))), ''), a.username)";

/** One row per account as the admin UI shows it (USER profile, DOCTOR profile, creator name). */
const ACCOUNT_VIEW_SQL = `
       SELECT
         a.user_id AS userId,
         a.username,
         a.type,
         a.status,
         a.created_time AS createdTime,
         a.created_by AS createdBy,
         COALESCE(
           NULLIF(TRIM(CONCAT(COALESCE(cu.first_name, ''), ' ', COALESCE(cu.last_name, ''))), ''),
           ca.username
         ) AS createdByName,
         u.idcard AS nationalId,
         ${ACCOUNT_DISPLAY_NAME_SQL} AS name,
         u.sex AS sex,
         u.dob AS dob,
         u.tel AS phone,
         u.email AS email,
         d.doctor_id AS doctorId,
         d.specifications AS doctorSpecifications,
         d.qualifications AS doctorQualifications,
         (SELECT GROUP_CONCAT(dd.department_id ORDER BY dd.department_id)
          FROM DOCTOR_DEPARTMENT dd
          WHERE dd.doctor_id = d.doctor_id) AS doctorDepartmentIdsCsv
       FROM ACCOUNT a
       LEFT JOIN USER u ON u.id = a.user_id
       LEFT JOIN DOCTOR d ON d.user_id = a.user_id
       LEFT JOIN ACCOUNT ca ON ca.user_id = a.created_by
       LEFT JOIN USER cu ON cu.id = a.created_by`;

/** Whitelisted ORDER BY expressions for the account list (keys are the API's sortBy values). */
const ACCOUNT_SORT_SQL = {
  role: 'a.type',
  userId: 'a.user_id',
  name: ACCOUNT_DISPLAY_NAME_SQL,
  username: 'a.username',
  sex: 'u.sex',
  dob: 'u.dob',
  phone: 'u.tel',
  email: 'u.email',
  createdBy: 'a.created_by',
  enabled: 'a.status',
  createdTime: 'a.created_time',
};

/**
 * Builds the WHERE clause for the account list. Every filter is optional; text filters are
 * substring matches. `sex` is the stored code ('M' / 'F'), `enabled` is 'active' | 'inactive'.
 */
function buildAccountFilterSql(filters) {
  const where = [];
  const replacements = {};
  if (filters.userId) {
    where.push('CAST(a.user_id AS CHAR) LIKE :userId');
    replacements.userId = `%${filters.userId}%`;
  }
  if (filters.name) {
    where.push(`${ACCOUNT_DISPLAY_NAME_SQL} LIKE :name`);
    replacements.name = `%${filters.name}%`;
  }
  if (filters.username) {
    where.push('a.username LIKE :username');
    replacements.username = `%${filters.username}%`;
  }
  if (filters.roleCode) {
    where.push('a.type = :roleCode');
    replacements.roleCode = filters.roleCode;
  }
  if (filters.sex) {
    where.push('u.sex = :sex');
    replacements.sex = filters.sex;
  }
  if (filters.dob) {
    where.push('CAST(u.dob AS CHAR) LIKE :dob');
    replacements.dob = `%${filters.dob}%`;
  }
  if (filters.phone) {
    where.push('u.tel LIKE :phone');
    replacements.phone = `%${filters.phone}%`;
  }
  if (filters.email) {
    where.push('u.email LIKE :email');
    replacements.email = `%${filters.email}%`;
  }
  if (filters.enabled === 'active') {
    where.push('a.status = 1');
  } else if (filters.enabled === 'inactive') {
    where.push('a.status = 0');
  }
  return { whereSql: where.length > 0 ? `WHERE ${where.join(' AND ')}` : '', replacements };
}

/**
 * Paged account list. `sortBy` must be a key of ACCOUNT_SORT_SQL, `sortDirection` 'ASC' | 'DESC'.
 * @returns {Promise<{ total: number, rows: object[] }>}
 */
async function searchAccounts(filters, { sortBy, sortDirection, limit, offset }) {
  const { whereSql, replacements: filterReplacements } = buildAccountFilterSql(filters);
  const replacements = { limit, offset, ...filterReplacements };
  const orderSql = `ORDER BY ${ACCOUNT_SORT_SQL[sortBy]} ${sortDirection === 'ASC' ? 'ASC' : 'DESC'}, a.user_id DESC`;

  const [countRow] = await sequelize.query(
    `SELECT COUNT(*) AS total
       FROM ACCOUNT a
       LEFT JOIN USER u ON u.id = a.user_id
       ${whereSql}`,
    { replacements, type: QueryTypes.SELECT }
  );
  const rows = await sequelize.query(
    `${ACCOUNT_VIEW_SQL}
       ${whereSql}
       ${orderSql}
       LIMIT :limit OFFSET :offset`,
    { replacements, type: QueryTypes.SELECT }
  );
  return { total: Number(countRow?.total || 0), rows };
}

async function findAccountView(userId, transaction) {
  const [row] = await sequelize.query(
    `${ACCOUNT_VIEW_SQL}
       WHERE a.user_id = :userId
       LIMIT 1`,
    { replacements: { userId }, type: QueryTypes.SELECT, transaction }
  );
  return row || null;
}

async function findAccountByUsername(username, transaction) {
  const [row] = await sequelize.query(
    'SELECT user_id AS userId FROM ACCOUNT WHERE username = :username LIMIT 1',
    { replacements: { username }, type: QueryTypes.SELECT, transaction }
  );
  return row || null;
}

/** @returns {Promise<{ userId, type, status } | null>} */
async function findAccountWithStatus(userId, transaction) {
  const [row] = await sequelize.query(
    'SELECT user_id AS userId, type, status FROM ACCOUNT WHERE user_id = :userId LIMIT 1',
    { replacements: { userId }, type: QueryTypes.SELECT, transaction }
  );
  return row || null;
}

/** @returns {Promise<{ userId, type } | null>} */
async function findAccountType(userId) {
  const [row] = await sequelize.query(
    'SELECT user_id AS userId, type FROM ACCOUNT WHERE user_id = :userId LIMIT 1',
    { replacements: { userId }, type: QueryTypes.SELECT }
  );
  return row || null;
}

/** Role code ('ADM', 'DOC'…) of a user, '' when the account does not exist. */
async function getAccountRoleCode(userId) {
  const [row] = await sequelize.query(
    'SELECT type FROM ACCOUNT WHERE user_id = :userId LIMIT 1',
    { replacements: { userId }, type: QueryTypes.SELECT }
  );
  return row?.type ? String(row.type).trim().toUpperCase() : '';
}

async function listAdminUserIds() {
  const rows = await sequelize.query("SELECT user_id AS userId FROM ACCOUNT WHERE type = 'ADM'", {
    type: QueryTypes.SELECT,
  });
  return rows.map((row) => Number(row.userId)).filter((n) => Number.isFinite(n) && n > 0);
}

/** @returns {Promise<number>} the new USER.id */
async function insertUser({ idcard, sex, dob, tel, email, firstName, lastName }, transaction) {
  const [insertId] = await sequelize.query(
    `INSERT INTO USER (idcard, sex, dob, tel, email, first_name, last_name)
       VALUES (:idcard, :sex, :dob, :tel, :email, :firstName, :lastName)`,
    {
      replacements: { idcard, sex, dob, tel, email, firstName, lastName },
      type: QueryTypes.INSERT,
      transaction,
    }
  );
  return Number(insertId);
}

async function insertAccount({ userId, username, password, type, createdBy, status, mustChangePassword }, transaction) {
  await sequelize.query(
    `INSERT INTO ACCOUNT (user_id, username, password, type, created_by, status, must_change_password)
       VALUES (:userId, :username, :password, :type, :createdBy, :status, :mustChangePassword)`,
    {
      replacements: { userId, username, password, type, createdBy, status, mustChangePassword: mustChangePassword ? 1 : 0 },
      type: QueryTypes.INSERT,
      transaction,
    }
  );
}

/** Admin-issued password: new hash, user must change it at next sign-in. */
async function setTemporaryPassword(userId, password) {
  await sequelize.query('UPDATE ACCOUNT SET password = :password, must_change_password = 1 WHERE user_id = :userId', {
    replacements: { userId, password },
    type: QueryTypes.UPDATE,
  });
}

/** Accounts not already flagged, with their password hash (shared-password audit). */
async function listAccountsWithoutPendingPasswordChange() {
  return sequelize.query(
    `SELECT user_id AS userId, username, type, password
       FROM ACCOUNT
      WHERE must_change_password = 0
      ORDER BY user_id`,
    { type: QueryTypes.SELECT }
  );
}

/** @returns {Promise<void>} flags `userIds` for a forced change at next sign-in */
async function flagPasswordChange(userIds) {
  if (userIds.length === 0) return;
  await sequelize.query('UPDATE ACCOUNT SET must_change_password = 1 WHERE user_id IN (:userIds)', {
    replacements: { userIds },
    type: QueryTypes.UPDATE,
  });
}

async function updateUserProfile(userId, { sex, dob, tel, email, firstName, lastName }, transaction) {
  await sequelize.query(
    `UPDATE USER
       SET sex = :sex, dob = :dob, tel = :tel, email = :email,
           first_name = :firstName, last_name = :lastName
       WHERE id = :userId`,
    {
      replacements: { userId, sex, dob, tel, email, firstName, lastName },
      type: QueryTypes.UPDATE,
      transaction,
    }
  );
}

async function updateAccountStatus(userId, status, transaction) {
  await sequelize.query('UPDATE ACCOUNT SET status = :status WHERE user_id = :userId', {
    replacements: { userId, status },
    type: QueryTypes.UPDATE,
    transaction,
  });
}

/** Keeps only the ids that exist in DEPARTMENT. `ids` must already be positive integers. */
async function filterExistingDepartmentIds(ids, transaction) {
  if (!ids.length) return [];
  const rows = await sequelize.query(`SELECT id FROM DEPARTMENT WHERE id IN (${ids.join(',')})`, {
    type: QueryTypes.SELECT,
    transaction,
  });
  return rows.map((row) => Number(row.id));
}

async function findDoctorIdByUserId(userId, transaction) {
  const [row] = await sequelize.query('SELECT doctor_id AS doctorId FROM DOCTOR WHERE user_id = :userId LIMIT 1', {
    replacements: { userId },
    type: QueryTypes.SELECT,
    transaction,
  });
  return row?.doctorId != null ? Number(row.doctorId) : null;
}

async function updateDoctorProfile(doctorId, { qualifications, specifications }, transaction) {
  await sequelize.query('UPDATE DOCTOR SET qualifications = :q, specifications = :s WHERE doctor_id = :doctorId', {
    replacements: { q: qualifications, s: specifications, doctorId },
    type: QueryTypes.UPDATE,
    transaction,
  });
}

/** @returns {Promise<number>} the new DOCTOR.doctor_id */
async function insertDoctorProfile(userId, { qualifications, specifications }, transaction) {
  const [insertId] = await sequelize.query(
    'INSERT INTO DOCTOR (user_id, qualifications, specifications, room_id) VALUES (:userId, :q, :s, NULL)',
    { replacements: { userId, q: qualifications, s: specifications }, type: QueryTypes.INSERT, transaction }
  );
  return Number(insertId);
}

async function replaceDoctorDepartments(doctorId, departmentIds, transaction) {
  await sequelize.query('DELETE FROM DOCTOR_DEPARTMENT WHERE doctor_id = :doctorId', {
    replacements: { doctorId },
    type: QueryTypes.DELETE,
    transaction,
  });
  for (const depId of departmentIds) {
    await sequelize.query('INSERT INTO DOCTOR_DEPARTMENT (doctor_id, department_id) VALUES (:doctorId, :depId)', {
      replacements: { doctorId, depId },
      type: QueryTypes.INSERT,
      transaction,
    });
  }
}

module.exports = {
  ACCOUNT_SORT_SQL,
  searchAccounts,
  findAccountView,
  findAccountByUsername,
  findAccountWithStatus,
  findAccountType,
  getAccountRoleCode,
  listAdminUserIds,
  insertUser,
  insertAccount,
  setTemporaryPassword,
  listAccountsWithoutPendingPasswordChange,
  flagPasswordChange,
  updateUserProfile,
  updateAccountStatus,
  filterExistingDepartmentIds,
  findDoctorIdByUserId,
  updateDoctorProfile,
  insertDoctorProfile,
  replaceDoctorDepartments,
};
