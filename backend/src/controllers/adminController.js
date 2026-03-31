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

function mapAccountRow(r) {
  return {
    id: Number(r.id),
    userId: Number(r.userId),
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
  };
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

  return {
    data: { username, roleCode, name, dob, phone, email, enabled, sexCode },
  };
}

exports.getAccounts = async (req, res) => {
  try {
    // Demo mode: allow any authenticated role to view account list in admin UI.

    const rows = await sequelize.query(
      `SELECT
         a.id,
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
         u.email AS email
       FROM ACCOUNT a
       LEFT JOIN USER u ON u.id = a.user_id
       ORDER BY a.created_time DESC, a.id DESC`,
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
         a.id,
         a.username,
         a.type,
         a.status,
         a.created_time AS createdTime
       FROM ACCOUNT a
       ORDER BY a.created_time DESC, a.id DESC
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

    const { username, roleCode, name, dob, phone, email, enabled, sexCode } = normalized.data;
    const { firstName, lastName } = splitName(name);
    const idcard = String(Date.now()).slice(-12).padStart(12, '0');
    const hashedPassword = await bcrypt.hash('123456', 12);

    const [existingUsername] = await sequelize.query(
      'SELECT id FROM ACCOUNT WHERE username = :username LIMIT 1',
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

    const [created] = await sequelize.query(
      `SELECT
         a.id,
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
         u.email AS email
       FROM ACCOUNT a
       LEFT JOIN USER u ON u.id = a.user_id
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
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      await tx.rollback();
      return res.status(400).json({ success: false, message: 'Invalid account id' });
    }

    const normalized = normalizeAccountPayload(req.body);
    if (normalized.error) {
      await tx.rollback();
      return res.status(400).json({ success: false, message: normalized.error });
    }
    const { username, roleCode, name, dob, phone, email, enabled, sexCode } = normalized.data;
    const { firstName, lastName } = splitName(name);

    const [existing] = await sequelize.query(
      'SELECT id, user_id AS userId FROM ACCOUNT WHERE id = :id LIMIT 1',
      { replacements: { id }, type: QueryTypes.SELECT, transaction: tx }
    );
    if (!existing) {
      await tx.rollback();
      return res.status(404).json({ success: false, message: 'Account not found' });
    }

    const [usernameConflict] = await sequelize.query(
      'SELECT id FROM ACCOUNT WHERE username = :username AND id <> :id LIMIT 1',
      { replacements: { username, id }, type: QueryTypes.SELECT, transaction: tx }
    );
    if (usernameConflict) {
      await tx.rollback();
      return res.status(400).json({ success: false, message: 'Username already exists' });
    }

    await sequelize.query(
      `UPDATE ACCOUNT
       SET username = :username, type = :type, status = :status
       WHERE id = :id`,
      {
        replacements: { id, username, type: roleCode, status: enabled ? 1 : 0 },
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

    const [updated] = await sequelize.query(
      `SELECT
         a.id,
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
         u.email AS email
       FROM ACCOUNT a
       LEFT JOIN USER u ON u.id = a.user_id
       WHERE a.id = :id
       LIMIT 1`,
      { replacements: { id }, type: QueryTypes.SELECT, transaction: tx }
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

    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ success: false, message: 'Invalid account id' });
    }

    const next = req.body?.status ? 1 : 0;
    const exists = await sequelize.query(
      'SELECT id FROM ACCOUNT WHERE id = :id LIMIT 1',
      { replacements: { id }, type: QueryTypes.SELECT }
    );
    if (!exists[0]) {
      return res.status(404).json({ success: false, message: 'Account not found' });
    }

    await sequelize.query(
      'UPDATE ACCOUNT SET status = :status WHERE id = :id',
      { replacements: { id, status: next }, type: QueryTypes.UPDATE }
    );

    res.json({ success: true, id, status: !!next });
  } catch (error) {
    console.error('Update account status error:', error);
    res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
  }
};

