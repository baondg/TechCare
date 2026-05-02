const { QueryTypes } = require('sequelize');
const sequelize = require('../common/database');
const bcrypt = require('bcrypt');

const ACCOUNT_ROLE_LABEL = {
  ADM: 'Admin',
  PAT: 'Patient',
  DOC: 'Doctor',
  NUR: 'Nurse',
  TEC: 'Technician'
};

const ROLE_CODES = new Set(['ADM', 'PAT', 'DOC', 'NUR', 'TEC']);

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

const ACCOUNT_SELECT_SQL = `
       SELECT
         a.user_id AS userId,
         a.username,
         a.type,
         a.status,
         a.created_time AS createdTime,
         a.created_by AS createdBy,
         u.idcard AS nationalId,
         COALESCE(NULLIF(TRIM(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, ''))), ''), a.username) AS name,
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
       LEFT JOIN DOCTOR d ON d.user_id = a.user_id`;

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

async function resolveValidDepartmentIds(sequelize, ids, transaction) {
  const unique = [...new Set(ids.map(Number).filter((n) => Number.isInteger(n) && n > 0))];
  if (!unique.length) return [];
  const inList = unique.join(',');
  const rows = await sequelize.query(`SELECT id FROM DEPARTMENT WHERE id IN (${inList})`, {
    type: QueryTypes.SELECT,
    transaction,
  });
  return rows.map((row) => Number(row.id));
}

async function syncDoctorProfile(sequelize, tx, userId, { specifications, qualifications, departmentIds }) {
  const cleanDeptIds = await resolveValidDepartmentIds(sequelize, departmentIds, tx);
  const [existing] = await sequelize.query(
    'SELECT doctor_id AS doctorId FROM DOCTOR WHERE user_id = :userId LIMIT 1',
    { replacements: { userId }, type: QueryTypes.SELECT, transaction: tx }
  );
  let doctorId;
  const q = qualifications || null;
  const s = specifications || null;
  if (existing?.doctorId != null) {
    doctorId = Number(existing.doctorId);
    await sequelize.query(
      'UPDATE DOCTOR SET qualifications = :q, specifications = :s WHERE doctor_id = :doctorId',
      { replacements: { q, s, doctorId }, type: QueryTypes.UPDATE, transaction: tx }
    );
  } else {
    const ins = await sequelize.query(
      'INSERT INTO DOCTOR (user_id, qualifications, specifications, room_id) VALUES (:userId, :q, :s, NULL)',
      { replacements: { userId, q, s }, type: QueryTypes.INSERT, transaction: tx }
    );
    doctorId = Number(ins[0]);
  }
  await sequelize.query('DELETE FROM DOCTOR_DEPARTMENT WHERE doctor_id = :doctorId', {
    replacements: { doctorId },
    type: QueryTypes.DELETE,
    transaction: tx,
  });
  for (const depId of cleanDeptIds) {
    await sequelize.query(
      'INSERT INTO DOCTOR_DEPARTMENT (doctor_id, department_id) VALUES (:doctorId, :depId)',
      { replacements: { doctorId, depId }, type: QueryTypes.INSERT, transaction: tx }
    );
  }
}

function normalizeAccountPayload(body) {
  const username = String(body?.username || '').trim();
  const roleCode = String(body?.roleCode || '').trim().toUpperCase();
  const name = String(body?.name || '').trim();
  const dob = String(body?.dob || '').trim();
  const phone = String(body?.phone || '').trim();
  const email = String(body?.email || '').trim();
  const enabled = body?.enabled === undefined ? true : !!body.enabled;
  const sexCode = toSexCode(body?.sex);

  if (!username) return { error: 'Username is required' };
  if (!ROLE_CODES.has(roleCode)) return { error: 'Invalid role code' };
  if (!name) return { error: 'Name is required' };
  if (!dob) return { error: 'Date of birth is required' };
  if (!phone) return { error: 'Phone number is required' };

  const doctor = parseDoctorPayload(body, roleCode);

  return {
    data: { username, roleCode, name, dob, phone, email, enabled, sexCode, doctor },
  };
}

exports.listDepartments = async (req, res) => {
  try {
    const rows = await sequelize.query(
      'SELECT id, name FROM DEPARTMENT ORDER BY name ASC',
      { type: QueryTypes.SELECT }
    );
    const departments = rows.map((r) => ({
      id: Number(r.id),
      name: String(r.name || ''),
    }));
    res.json({ success: true, departments });
  } catch (error) {
    console.error('List departments error:', error);
    res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
  }
};

exports.getAccounts = async (req, res) => {
  try {
    // Demo mode: allow any authenticated role to view account list in admin UI.

    const rows = await sequelize.query(
      `${ACCOUNT_SELECT_SQL}
       ORDER BY a.created_time DESC, a.user_id DESC`,
      { type: QueryTypes.SELECT }
    );

    const accounts = rows.map(mapAccountRow);

    res.json({ success: true, accounts });
  } catch (error) {
    console.error('Get accounts error:', error);
    res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
  }
};

exports.getDashboardSummary = async (req, res) => {
  try {
    const [countRow] = await sequelize.query(
      `SELECT
         COUNT(*) AS totalUsers,
         SUM(CASE WHEN status = 1 THEN 1 ELSE 0 END) AS activeUsers
       FROM ACCOUNT`,
      { type: QueryTypes.SELECT }
    );

    const roleRows = await sequelize.query(
      `SELECT type, COUNT(*) AS total
       FROM ACCOUNT
       GROUP BY type
       ORDER BY total DESC`,
      { type: QueryTypes.SELECT }
    );

    const recentRows = await sequelize.query(
      `SELECT
         a.user_id AS id,
         a.username,
         a.type,
         a.status,
         a.created_time AS createdTime
       FROM ACCOUNT a
       ORDER BY a.created_time DESC, a.user_id DESC
       LIMIT 6`,
      { type: QueryTypes.SELECT }
    );

    const dbHealthRows = await sequelize.query('SELECT 1 AS ok', { type: QueryTypes.SELECT });
    const dbConnected = !!dbHealthRows?.[0];
    const totalUsers = Number(countRow?.totalUsers || 0);
    const activeUsers = Number(countRow?.activeUsers || 0);
    const inactiveUsers = Math.max(0, totalUsers - activeUsers);

    const roleBreakdown = roleRows.map((r) => ({
      roleCode: String(r.type || ''),
      roleLabel: ACCOUNT_ROLE_LABEL[r.type] || String(r.type || ''),
      total: Number(r.total || 0),
    }));

    const recentActivity = recentRows.map((r) => ({
      id: Number(r.id),
      message: `Account '${r.username || `#${r.id}`}' (${ACCOUNT_ROLE_LABEL[r.type] || r.type}) created`,
      createdTime: r.createdTime || null,
      status: r.status === 1 || r.status === true || r.status === '1' ? 'Enabled' : 'Disabled',
    }));

    return res.json({
      success: true,
      summary: {
        totalUsers,
        activeUsers,
        inactiveUsers,
        systemStatus: dbConnected ? 'Healthy' : 'Degraded',
        roleBreakdown,
        recentActivity,
      },
    });
  } catch (error) {
    console.error('Get admin dashboard summary error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
  }
};

exports.createAccount = async (req, res) => {
  const tx = await sequelize.transaction();
  try {
    const normalized = normalizeAccountPayload(req.body);
    if (normalized.error) {
      await tx.rollback();
      return res.status(400).json({ success: false, message: normalized.error });
    }

    const { username, roleCode, name, dob, phone, email, enabled, sexCode, doctor } = normalized.data;
    const { firstName, lastName } = splitName(name);
    const idcard = String(Date.now()).slice(-12).padStart(12, '0');
    const initialPassword = process.env.DEFAULT_ACCOUNT_PASSWORD;
    if (!initialPassword) {
      await tx.rollback();
      return res.status(500).json({
        success: false,
        message: 'DEFAULT_ACCOUNT_PASSWORD is not configured',
      });
    }
    const hashedPassword = await bcrypt.hash(initialPassword, 12);

    const [existingUsername] = await sequelize.query(
      'SELECT user_id AS userId FROM ACCOUNT WHERE username = :username LIMIT 1',
      { replacements: { username }, type: QueryTypes.SELECT, transaction: tx }
    );
    if (existingUsername) {
      await tx.rollback();
      return res.status(400).json({ success: false, message: 'Username already exists' });
    }

    const userInsert = await sequelize.query(
      `INSERT INTO USER (idcard, sex, dob, tel, email, first_name, last_name)
       VALUES (:idcard, :sex, :dob, :tel, :email, :firstName, :lastName)`,
      {
        replacements: {
          idcard,
          sex: sexCode,
          dob,
          tel: phone,
          email: email || null,
          firstName: firstName || null,
          lastName: lastName || null,
        },
        type: QueryTypes.INSERT,
        transaction: tx,
      }
    );
    const userId = Number(userInsert[0]);

    await sequelize.query(
      `INSERT INTO ACCOUNT (user_id, username, password, type, created_by, status)
       VALUES (:userId, :username, :password, :type, :createdBy, :status)`,
      {
        replacements: {
          userId,
          username,
          password: hashedPassword,
          type: roleCode,
          createdBy: req.user?.userId || null,
          status: enabled ? 1 : 0,
        },
        type: QueryTypes.INSERT,
        transaction: tx,
      }
    );

    if (roleCode === 'DOC') {
      await syncDoctorProfile(sequelize, tx, userId, doctor);
    }

    const [created] = await sequelize.query(
      `${ACCOUNT_SELECT_SQL}
       WHERE a.user_id = :userId
       LIMIT 1`,
      { replacements: { userId }, type: QueryTypes.SELECT, transaction: tx }
    );

    await tx.commit();
    return res.status(201).json({ success: true, account: mapAccountRow(created) });
  } catch (error) {
    await tx.rollback();
    console.error('Create account error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
  }
};

exports.updateAccount = async (req, res) => {
  const tx = await sequelize.transaction();
  try {
    const userId = Number(req.params.id);
    if (!Number.isFinite(userId)) {
      await tx.rollback();
      return res.status(400).json({ success: false, message: 'Invalid account id' });
    }

    const normalized = normalizeAccountPayload(req.body);
    if (normalized.error) {
      await tx.rollback();
      return res.status(400).json({ success: false, message: normalized.error });
    }
    const { username, roleCode, name, dob, phone, email, enabled, sexCode, doctor } = normalized.data;
    const { firstName, lastName } = splitName(name);

    const [existing] = await sequelize.query(
      'SELECT user_id AS userId FROM ACCOUNT WHERE user_id = :userId LIMIT 1',
      { replacements: { userId }, type: QueryTypes.SELECT, transaction: tx }
    );
    if (!existing) {
      await tx.rollback();
      return res.status(404).json({ success: false, message: 'Account not found' });
    }

    const [usernameConflict] = await sequelize.query(
      'SELECT user_id AS userId FROM ACCOUNT WHERE username = :username AND user_id <> :userId LIMIT 1',
      { replacements: { username, userId }, type: QueryTypes.SELECT, transaction: tx }
    );
    if (usernameConflict) {
      await tx.rollback();
      return res.status(400).json({ success: false, message: 'Username already exists' });
    }

    await sequelize.query(
      `UPDATE ACCOUNT
       SET username = :username, type = :type, status = :status
       WHERE user_id = :userId`,
      {
        replacements: { userId, username, type: roleCode, status: enabled ? 1 : 0 },
        type: QueryTypes.UPDATE,
        transaction: tx,
      }
    );

    await sequelize.query(
      `UPDATE USER
       SET sex = :sex, dob = :dob, tel = :tel, email = :email, first_name = :firstName, last_name = :lastName
       WHERE id = :userId`,
      {
        replacements: {
          userId: Number(existing.userId),
          sex: sexCode,
          dob,
          tel: phone,
          email: email || null,
          firstName: firstName || null,
          lastName: lastName || null,
        },
        type: QueryTypes.UPDATE,
        transaction: tx,
      }
    );

    if (roleCode === 'DOC') {
      await syncDoctorProfile(sequelize, tx, Number(existing.userId), doctor);
    }

    const [updated] = await sequelize.query(
      `${ACCOUNT_SELECT_SQL}
       WHERE a.user_id = :userId
       LIMIT 1`,
      { replacements: { userId }, type: QueryTypes.SELECT, transaction: tx }
    );

    await tx.commit();
    return res.json({ success: true, account: mapAccountRow(updated) });
  } catch (error) {
    await tx.rollback();
    console.error('Update account error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
  }
};

exports.updateAccountStatus = async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    const userId = Number(req.params.id);
    if (!Number.isFinite(userId)) {
      return res.status(400).json({ success: false, message: 'Invalid account id' });
    }

    const next = req.body?.status ? 1 : 0;
    const exists = await sequelize.query(
      'SELECT user_id AS userId FROM ACCOUNT WHERE user_id = :userId LIMIT 1',
      { replacements: { userId }, type: QueryTypes.SELECT }
    );
    if (!exists[0]) {
      return res.status(404).json({ success: false, message: 'Account not found' });
    }

    await sequelize.query(
      'UPDATE ACCOUNT SET status = :status WHERE user_id = :userId',
      { replacements: { userId, status: next }, type: QueryTypes.UPDATE }
    );

    res.json({ success: true, id: userId, status: !!next });
  } catch (error) {
    console.error('Update account status error:', error);
    res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
  }
};

function mapFeedbackRow(r) {
  const fullName = String(r.userName || '').trim();
  return {
    id: Number(r.id),
    userId: Number(r.userId),
    username: r.username || '',
    userName: fullName || r.username || `User #${r.userId}`,
    roleCode: r.roleCode || '',
    role: ACCOUNT_ROLE_LABEL[r.roleCode] || r.roleCode || 'Unknown',
    type: r.type || 'general',
    content: r.content || '',
    rating: Number(r.rating || 0),
    time: r.time || null,
    status: r.status === 1 || r.status === true || r.status === '1',
    response: r.response || '',
  };
}

exports.getFeedbacks = async (req, res) => {
  try {
    const rows = await sequelize.query(
      `SELECT
         f.id,
         f.user_id AS userId,
         f.type,
         f.content,
         f.rating,
         f.time,
         f.status,
         f.response,
         a.username,
         a.type AS roleCode,
         COALESCE(NULLIF(TRIM(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, ''))), ''), a.username) AS userName
       FROM FEEDBACK f
       LEFT JOIN ACCOUNT a ON a.user_id = f.user_id
       LEFT JOIN USER u ON u.id = f.user_id
       ORDER BY f.time DESC, f.id DESC`,
      { type: QueryTypes.SELECT }
    );

    return res.json({
      success: true,
      feedbacks: (rows || []).map(mapFeedbackRow),
    });
  } catch (error) {
    console.error('Get admin feedbacks error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
  }
};

exports.updateFeedback = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ success: false, message: 'Invalid feedback id' });
    }

    const hasResponse = Object.prototype.hasOwnProperty.call(req.body || {}, 'response');
    const hasStatus = Object.prototype.hasOwnProperty.call(req.body || {}, 'status');
    if (!hasResponse && !hasStatus) {
      return res.status(400).json({ success: false, message: 'Nothing to update' });
    }

    const updates = [];
    const replacements = { id };
    if (hasResponse) {
      updates.push('response = :response');
      replacements.response = String(req.body?.response || '').trim() || null;
    }
    if (hasStatus) {
      updates.push('status = :status');
      replacements.status = req.body?.status ? 1 : 0;
    }

    const [existing] = await sequelize.query(
      'SELECT id FROM FEEDBACK WHERE id = :id LIMIT 1',
      { replacements: { id }, type: QueryTypes.SELECT }
    );
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Feedback not found' });
    }

    await sequelize.query(
      `UPDATE FEEDBACK
       SET ${updates.join(', ')}
       WHERE id = :id`,
      { replacements, type: QueryTypes.UPDATE }
    );

    const [updated] = await sequelize.query(
      `SELECT
         f.id,
         f.user_id AS userId,
         f.type,
         f.content,
         f.rating,
         f.time,
         f.status,
         f.response,
         a.username,
         a.type AS roleCode,
         COALESCE(NULLIF(TRIM(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, ''))), ''), a.username) AS userName
       FROM FEEDBACK f
       LEFT JOIN ACCOUNT a ON a.user_id = f.user_id
       LEFT JOIN USER u ON u.id = f.user_id
       WHERE f.id = :id
       LIMIT 1`,
      { replacements: { id }, type: QueryTypes.SELECT }
    );

    return res.json({ success: true, feedback: mapFeedbackRow(updated) });
  } catch (error) {
    console.error('Update admin feedback error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
  }
};

