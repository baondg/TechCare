require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');
const { QueryTypes } = require('sequelize');

const sequelize = require('../src/common/database');
const { createPatientAccountRecords } = require('../src/services/patientRegistrationService');

const DEFAULT_PASSWORD = process.env.DEMO_ACCOUNT_PASSWORD || 'Test@1234';
const SALT_ROUNDS = 12;

const PERSONAS = {
  admin: {
    username: 'admin',
    firstName: 'Minh',
    lastName: 'Tran',
    roleCode: 'ADM',
    sex: 'M',
    idcard: '079090000101',
    dob: '1990-06-14',
    tel: '0911000001',
    email: 'admin.demo@techcare.local',
  },
  nurse: {
    username: 'nurse1',
    firstName: 'Lan',
    lastName: 'Nguyen',
    roleCode: 'NUR',
    sex: 'F',
    idcard: '079192000102',
    dob: '1992-03-11',
    tel: '0911000002',
    email: 'nurse1.demo@techcare.local',
  },
  technician: {
    username: 'tech1',
    firstName: 'Huy',
    lastName: 'Pham',
    roleCode: 'PHY',
    sex: 'M',
    idcard: '079191000103',
    dob: '1991-09-21',
    tel: '0911000003',
    email: 'tech1.demo@techcare.local',
  },
  doctor: {
    username: 'doctor1',
    firstName: 'Khanh',
    lastName: 'Le',
    roleCode: 'DOC',
    sex: 'M',
    idcard: '048088000104',
    dob: '1988-11-30',
    tel: '0911000004',
    email: 'doctor1.demo@techcare.local',
  },
  patient: {
    idcard: '038204030823',
    firstName: 'An',
    lastName: 'Bui',
    sex: 'F',
    dob: '2004-03-20',
    tel: '0911000005',
    email: 'patient.demo@techcare.local',
  },
};

function parseArgs(argv) {
  const args = new Set(argv);
  const getValue = (prefix, fallback) => {
    const hit = argv.find((a) => a.startsWith(`${prefix}=`));
    return hit ? hit.slice(prefix.length + 1) : fallback;
  };
  return {
    resetDemoOnly: args.has('--reset-demo-only'),
    purgeAll: args.has('--purge-all'),
    seedBookingWindow: args.has('--seed-booking-window'),
    bookingStartDate: getValue('--booking-start', '2026-05-07'),
    bookingEndDate: getValue('--booking-end', '2026-05-10'),
    manifestPath: path.resolve(process.cwd(), getValue('--manifest', 'scripts/demo-seed-manifest.json')),
  };
}

async function getTableColumns(tableName) {
  const rows = await sequelize.query(
    `SELECT COLUMN_NAME AS columnName
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :tableName`,
    { replacements: { tableName }, type: QueryTypes.SELECT }
  );
  return new Set(rows.map((r) => String(r.columnName).toLowerCase()));
}

async function getTableColumnMeta(tableName) {
  return sequelize.query(
    `SELECT
       COLUMN_NAME AS columnName,
       DATA_TYPE AS dataType,
       CHARACTER_MAXIMUM_LENGTH AS maxLength,
       IS_NULLABLE AS isNullable,
       COLUMN_DEFAULT AS columnDefault,
       COLUMN_KEY AS columnKey,
       EXTRA AS extra
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :tableName`,
    { replacements: { tableName }, type: QueryTypes.SELECT }
  );
}

async function getAccountTypeEnumValues() {
  const [row] = await sequelize.query(
    `SELECT COLUMN_TYPE AS columnType
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'ACCOUNT'
       AND COLUMN_NAME = 'type'
     LIMIT 1`,
    { type: QueryTypes.SELECT }
  );
  const raw = String(row?.columnType || '');
  const matches = raw.match(/'([^']+)'/g) || [];
  return matches.map((m) => m.replace(/'/g, ''));
}

async function resolveTechnicianRoleCode() {
  const values = await getAccountTypeEnumValues();
  if (values.includes('PHY')) return 'PHY';
  if (values.includes('TEC')) return 'TEC';
  throw new Error("ACCOUNT.type enum does not include 'PHY' or 'TEC' for technician seed.");
}

async function hasTable(tableName) {
  const [row] = await sequelize.query(
    `SELECT 1 AS ok
     FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :tableName
     LIMIT 1`,
    { replacements: { tableName }, type: QueryTypes.SELECT }
  );
  return Boolean(row?.ok);
}

async function getBaseTables() {
  return sequelize.query(
    `SELECT TABLE_NAME AS tableName
     FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_TYPE = 'BASE TABLE'`,
    { type: QueryTypes.SELECT }
  );
}

async function purgeAllBusinessData() {
  const excludedTables = new Set(['SequelizeMeta', 'SEQUELIZEMETA', 'SEQUELIZE_META']);
  const tables = await getBaseTables();
  const tableNames = tables
    .map((row) => String(row.tableName || ''))
    .filter((name) => name && !excludedTables.has(name));

  await sequelize.query('SET FOREIGN_KEY_CHECKS = 0', { type: QueryTypes.RAW });
  try {
    for (const tableName of tableNames) {
      await sequelize.query(`TRUNCATE TABLE \`${tableName}\``, { type: QueryTypes.RAW });
    }
  } finally {
    await sequelize.query('SET FOREIGN_KEY_CHECKS = 1', { type: QueryTypes.RAW });
  }
}

async function ensureDepartment(name) {
  const [found] = await sequelize.query('SELECT id FROM DEPARTMENT WHERE name = :name LIMIT 1', {
    replacements: { name },
    type: QueryTypes.SELECT,
  });
  if (found?.id) return Number(found.id);
  const [id] = await sequelize.query('INSERT INTO DEPARTMENT (name) VALUES (:name)', {
    replacements: { name },
    type: QueryTypes.INSERT,
  });
  return Number(id);
}

async function ensureBlock() {
  if (!(await hasTable('BLOCK'))) return null;
  const columns = await getTableColumns('BLOCK');
  const columnMeta = await getTableColumnMeta('BLOCK');
  const [found] = await sequelize.query('SELECT id FROM BLOCK LIMIT 1', {
    type: QueryTypes.SELECT,
  });
  if (found?.id) return String(found.id);

  const fields = [];
  const values = [];
  const replacements = {};
  const push = (col, val) => {
    fields.push(`\`${col}\``);
    values.push(`:${col}`);
    replacements[col] = val;
  };
  if (columns.has('id')) push('id', 'A');
  if (columns.has('name')) push('name', 'A1');
  if (columns.has('location')) push('location', 'Demo Campus');

  const inferDefaultValue = (colName, dataType, maxLength) => {
    const n = String(colName || '').toLowerCase();
    if (n === 'id') return 'A';
    if (n.includes('name')) return 'A1';
    if (n.includes('code')) return 'BLK-A';
    if (n.includes('status')) return 'active';
    if (n.includes('floor')) return 1;
    if (n.includes('capacity')) return 50;
    if (n.endsWith('_id')) return null;

    const numericTypes = new Set(['tinyint', 'smallint', 'mediumint', 'int', 'bigint', 'decimal', 'float', 'double']);
    const textTypes = new Set(['char', 'varchar', 'text', 'tinytext', 'mediumtext', 'longtext']);
    const dateTypes = new Set(['date', 'datetime', 'timestamp']);
    const dt = String(dataType || '').toLowerCase();
    if (numericTypes.has(dt)) return 1;
    if (textTypes.has(dt)) {
      const raw = '1';
      if (Number.isFinite(maxLength) && maxLength > 0) return raw.slice(0, maxLength);
      return raw;
    }
    if (dateTypes.has(dt)) return new Date().toISOString().slice(0, 19).replace('T', ' ');
    return null;
  };

  for (const meta of columnMeta) {
    const col = meta.columnName;
    const required = String(meta.isNullable).toUpperCase() === 'NO' && meta.columnDefault == null;
    const autoIncrement = String(meta.extra || '').toLowerCase().includes('auto_increment');
    if (!required || autoIncrement || col === 'id') continue;
    if (Object.prototype.hasOwnProperty.call(replacements, col)) continue;
    const inferred = inferDefaultValue(col, meta.dataType, meta.maxLength);
    if (inferred !== null) push(col, inferred);
  }

  if (fields.length === 0) {
    await sequelize.query("INSERT INTO BLOCK (`id`, `name`) VALUES ('A', 'A1')", { type: QueryTypes.INSERT });
    return 'A';
  }

  await sequelize.query(
    `INSERT INTO BLOCK (${fields.join(', ')}) VALUES (${values.join(', ')})`,
    { replacements, type: QueryTypes.INSERT }
  );
  return 'A';
}

async function ensureRoom({ name, departmentId }) {
  const columns = await getTableColumns('CLINIC_ROOM');
  const columnMeta = await getTableColumnMeta('CLINIC_ROOM');
  const blockId = columns.has('block_id') ? await ensureBlock() : null;
  const [found] = await sequelize.query('SELECT id FROM CLINIC_ROOM WHERE name = :name LIMIT 1', {
    replacements: { name },
    type: QueryTypes.SELECT,
  });
  if (found?.id) return Number(found.id);

  const fields = [];
  const values = [];
  const replacements = {};
  const push = (col, val) => {
    fields.push(`\`${col}\``);
    values.push(`:${col}`);
    replacements[col] = val;
  };
  if (columns.has('name')) push('name', name);
  if (columns.has('department_id')) push('department_id', departmentId);
  if (columns.has('block_id') && blockId != null) push('block_id', blockId);
  if (columns.has('status')) push('status', 'active');
  if (columns.has('description')) push('description', 'Demo room');
  if (columns.has('capacity')) push('capacity', 20);

  const hasOwn = (key) => Object.prototype.hasOwnProperty.call(replacements, key);
  const inferDefaultValue = (colName, dataType, maxLength) => {
    const n = String(colName || '').toLowerCase();
    if (n.includes('capacity')) return 20;
    if (n.includes('status')) return 'active';
    if (n.includes('name')) return name;
    if (n.includes('department')) return departmentId;
    if (n.endsWith('_id')) return null;

    const numericTypes = new Set(['tinyint', 'smallint', 'mediumint', 'int', 'bigint', 'decimal', 'float', 'double']);
    const textTypes = new Set(['char', 'varchar', 'text', 'tinytext', 'mediumtext', 'longtext']);
    const dateTypes = new Set(['date', 'datetime', 'timestamp']);
    const dt = String(dataType || '').toLowerCase();
    if (numericTypes.has(dt)) return 1;
    if (textTypes.has(dt)) {
      const raw = '1';
      if (Number.isFinite(maxLength) && maxLength > 0) return raw.slice(0, maxLength);
      return raw;
    }
    if (dateTypes.has(dt)) return new Date().toISOString().slice(0, 19).replace('T', ' ');
    return null;
  };

  const resolveForeignKeyId = async (colName) => {
    const lower = String(colName || '').toLowerCase();
    if (!lower.endsWith('_id') || lower === 'department_id') return null;
    const base = lower.slice(0, -3).toUpperCase();
    if (!base) return null;
    if (!(await hasTable(base))) return null;
    const [row] = await sequelize.query(`SELECT id FROM \`${base}\` LIMIT 1`, { type: QueryTypes.SELECT });
    return row?.id != null ? row.id : null;
  };

  for (const meta of columnMeta) {
    const col = meta.columnName;
    const required = String(meta.isNullable).toUpperCase() === 'NO' && meta.columnDefault == null;
    const autoIncrement = String(meta.extra || '').toLowerCase().includes('auto_increment');
    if (!required || autoIncrement || col === 'id' || hasOwn(col)) continue;
    let inferred = await resolveForeignKeyId(col);
    if (inferred === null) inferred = inferDefaultValue(col, meta.dataType, meta.maxLength);
    if (inferred !== null) push(col, inferred);
  }

  if (fields.length === 0) throw new Error('CLINIC_ROOM has no writable columns for demo seed.');

  const [id] = await sequelize.query(
    `INSERT INTO CLINIC_ROOM (${fields.join(', ')}) VALUES (${values.join(', ')})`,
    { replacements, type: QueryTypes.INSERT }
  );
  return Number(id);
}

async function ensureStaffAccount({ username, firstName, lastName, roleCode, sex, idcard = null, dob = null, tel = null, email = null, createdBy = null }) {
  const [existing] = await sequelize.query(
    'SELECT user_id AS userId FROM ACCOUNT WHERE username = :username LIMIT 1',
    { replacements: { username }, type: QueryTypes.SELECT }
  );
  if (existing?.userId) return Number(existing.userId);

  const hash = await bcrypt.hash(DEFAULT_PASSWORD, SALT_ROUNDS);
  const userInsert = await sequelize.query(
    `INSERT INTO USER (idcard, sex, dob, tel, email, first_name, last_name)
     VALUES (:idcard, :sex, :dob, :tel, :email, :firstName, :lastName)`,
    {
      replacements: {
        idcard: idcard || `D${Date.now()}${Math.floor(Math.random() * 10)}`.slice(0, 12),
        sex,
        dob: dob || '1990-01-01',
        tel: tel || `09${Math.floor(10000000 + Math.random() * 89999999)}`,
        email: email || `${username}@techcare.local`,
        firstName,
        lastName,
      },
      type: QueryTypes.INSERT,
    }
  );
  const userId = Number(userInsert[0]);

  await sequelize.query(
    `INSERT INTO ACCOUNT (user_id, username, password, type, created_by, created_time, status)
     VALUES (:userId, :username, :password, :type, :createdBy, NOW(), 1)`,
    {
      replacements: { userId, username, password: hash, type: roleCode, createdBy },
      type: QueryTypes.INSERT,
    }
  );
  return userId;
}

async function ensureDoctorProfile(userId, roomId, departmentId) {
  const [doctor] = await sequelize.query(
    'SELECT doctor_id AS doctorId FROM DOCTOR WHERE user_id = :userId LIMIT 1',
    { replacements: { userId }, type: QueryTypes.SELECT }
  );
  let doctorId = Number(doctor?.doctorId || 0);
  if (!doctorId) {
    const [id] = await sequelize.query(
      `INSERT INTO DOCTOR (user_id, qualifications, specifications, room_id)
       VALUES (:userId, :qualifications, :specifications, :roomId)`,
      {
        replacements: {
          userId,
          qualifications: 'MD',
          specifications: 'General Medicine',
          roomId,
        },
        type: QueryTypes.INSERT,
      }
    );
    doctorId = Number(id);
  } else {
    await sequelize.query(
      'UPDATE DOCTOR SET room_id = :roomId WHERE doctor_id = :doctorId',
      { replacements: { roomId, doctorId }, type: QueryTypes.UPDATE }
    );
  }

  const [deptLink] = await sequelize.query(
    `SELECT 1 AS ok FROM DOCTOR_DEPARTMENT
     WHERE doctor_id = :doctorId AND department_id = :departmentId LIMIT 1`,
    { replacements: { doctorId, departmentId }, type: QueryTypes.SELECT }
  );
  if (!deptLink?.ok) {
    await sequelize.query(
      'INSERT INTO DOCTOR_DEPARTMENT (doctor_id, department_id) VALUES (:doctorId, :departmentId)',
      { replacements: { doctorId, departmentId }, type: QueryTypes.INSERT }
    );
  }
  return doctorId;
}

async function ensureAdminProfile(userId) {
  if (!(await hasTable('ADMIN'))) return null;
  const [existing] = await sequelize.query(
    'SELECT admin_id AS adminId FROM ADMIN WHERE user_id = :userId LIMIT 1',
    { replacements: { userId }, type: QueryTypes.SELECT }
  );
  if (existing?.adminId) return Number(existing.adminId);
  const [id] = await sequelize.query('INSERT INTO ADMIN (user_id) VALUES (:userId)', {
    replacements: { userId },
    type: QueryTypes.INSERT,
  });
  return Number(id);
}

async function ensureNurseProfile(userId) {
  if (!(await hasTable('NURSE'))) return null;
  const [existing] = await sequelize.query(
    'SELECT nurse_id AS nurseId FROM NURSE WHERE user_id = :userId LIMIT 1',
    { replacements: { userId }, type: QueryTypes.SELECT }
  );
  if (existing?.nurseId) return Number(existing.nurseId);
  const [id] = await sequelize.query(
    'INSERT INTO NURSE (user_id, qualifications) VALUES (:userId, :qualifications)',
    { replacements: { userId, qualifications: 'Registered Nurse' }, type: QueryTypes.INSERT }
  );
  return Number(id);
}

async function ensureTechnicianProfile(userId, roomId) {
  if (!(await hasTable('TECHNICIAN'))) return null;
  const [existing] = await sequelize.query(
    'SELECT technician_id AS technicianId FROM TECHNICIAN WHERE user_id = :userId LIMIT 1',
    { replacements: { userId }, type: QueryTypes.SELECT }
  );
  if (existing?.technicianId) return Number(existing.technicianId);

  const columns = await getTableColumns('TECHNICIAN');
  const fields = [];
  const values = [];
  const replacements = {};
  const push = (col, val) => {
    fields.push(`\`${col}\``);
    values.push(`:${col}`);
    replacements[col] = val;
  };
  push('user_id', userId);
  if (columns.has('room_id')) push('room_id', roomId);
  if (columns.has('qualifications')) push('qualifications', 'Lab Technician');
  if (columns.has('specification')) push('specification', 'General diagnostics');
  if (columns.has('role')) push('role', 'lab');
  const [id] = await sequelize.query(
    `INSERT INTO TECHNICIAN (${fields.join(', ')}) VALUES (${values.join(', ')})`,
    { replacements, type: QueryTypes.INSERT }
  );
  return Number(id);
}

async function ensureWorkShift({ roomId, doctorId, nurseId, technicianId }) {
  if (!(await hasTable('WORK_SHIFT'))) return null;
  const start = new Date();
  start.setDate(start.getDate() + 1);
  start.setHours(7, 30, 0, 0);
  const end = new Date(start.getTime());
  end.setHours(11, 30, 0, 0);
  const toMySqlDateTime = (date) => date.toISOString().slice(0, 19).replace('T', ' ');
  const startTime = toMySqlDateTime(start);
  const endTime = toMySqlDateTime(end);
  const [existing] = await sequelize.query(
    `SELECT id FROM WORK_SHIFT
     WHERE room_id = :roomId
       AND doctor_id = :doctorId
       AND nurse_id = :nurseId
       AND technician_id = :technicianId
       AND start_time = :startTime
     LIMIT 1`,
    { replacements: { roomId, doctorId, nurseId, technicianId, startTime }, type: QueryTypes.SELECT }
  );
  if (existing?.id) return Number(existing.id);
  const [id] = await sequelize.query(
    `INSERT INTO WORK_SHIFT (start_time, end_time, room_id, doctor_id, nurse_id, technician_id)
     VALUES (:startTime, :endTime, :roomId, :doctorId, :nurseId, :technicianId)`,
    {
      replacements: { startTime, endTime, roomId, doctorId, nurseId, technicianId },
      type: QueryTypes.INSERT,
    }
  );
  return Number(id);
}

async function ensurePatient(patientInput) {
  const [existingAccount] = await sequelize.query(
    'SELECT user_id AS userId FROM ACCOUNT WHERE username = :username LIMIT 1',
    { replacements: { username: patientInput.idcard }, type: QueryTypes.SELECT }
  );
  let userId;
  if (!existingAccount?.userId) {
    const tx = await sequelize.transaction();
    try {
      const { user } = await createPatientAccountRecords(
        {
          ...patientInput,
          password: DEFAULT_PASSWORD,
        },
        { transaction: tx, createdByUserId: null }
      );
      await tx.commit();
      userId = Number(user.id);
    } catch (error) {
      await tx.rollback();
      throw error;
    }
  } else {
    userId = Number(existingAccount.userId);
  }

  const [patient] = await sequelize.query(
    'SELECT patient_id AS patientId FROM PATIENT WHERE user_id = :userId LIMIT 1',
    { replacements: { userId }, type: QueryTypes.SELECT }
  );
  return { userId, patientId: Number(patient?.patientId) };
}

async function ensureDisease() {
  const code = 'DEMO-RBAC-001';
  const [found] = await sequelize.query(
    'SELECT id FROM DISEASE WHERE icd_code = :code LIMIT 1',
    { replacements: { code }, type: QueryTypes.SELECT }
  );
  if (found?.id) return Number(found.id);
  const [id] = await sequelize.query(
    `INSERT INTO DISEASE (icd_code, description, category, symptoms)
     VALUES (:code, :description, :category, :symptoms)`,
    {
      replacements: {
        code,
        description: 'Demo condition for walkthrough',
        category: 'General',
        symptoms: 'Fatigue, mild cough',
      },
      type: QueryTypes.INSERT,
    }
  );
  return Number(id);
}

async function ensureOpenRegimen(patientId, diseaseId) {
  const [existing] = await sequelize.query(
    'SELECT id FROM REGIMEN WHERE patient_id = :patientId AND disease_id = :diseaseId AND `end` IS NULL LIMIT 1',
    { replacements: { patientId, diseaseId }, type: QueryTypes.SELECT }
  );
  if (existing?.id) return Number(existing.id);
  const [id] = await sequelize.query(
    'INSERT INTO REGIMEN (`start`, `end`, patient_id, disease_id) VALUES (NOW(), NULL, :patientId, :diseaseId)',
    { replacements: { patientId, diseaseId }, type: QueryTypes.INSERT }
  );
  return Number(id);
}

async function ensureAppointment({ doctorId, roomId, patientId = null, regimenId = null, time, status, condition }) {
  const [existing] = await sequelize.query(
    `SELECT id FROM APPOINTMENT
     WHERE doctor_id = :doctorId
       AND room_id = :roomId
       AND time = :time
       AND ((patient_id IS NULL AND :patientId IS NULL) OR patient_id = :patientId)
     LIMIT 1`,
    { replacements: { doctorId, roomId, time, patientId }, type: QueryTypes.SELECT }
  );
  if (existing?.id) return Number(existing.id);

  const columns = await getTableColumns('APPOINTMENT');
  const sql = [];
  const params = {};
  const set = (column, value) => {
    if (!columns.has(column.toLowerCase())) return;
    sql.push(`\`${column}\``);
    params[column] = value;
  };
  set('time', time);
  set('status', status);
  set('condition', condition);
  set('patient_id', patientId);
  set('doctor_id', doctorId);
  set('room_id', roomId);
  set('regimen_id', regimenId);
  if (columns.has('doctor_confirmed')) set('doctor_confirmed', status === 'scheduled' ? 1 : 0);
  if (!sql.length) throw new Error('APPOINTMENT table has no known columns for seed.');

  const placeholders = sql.map((c) => `:${c.replace(/`/g, '')}`);
  const [id] = await sequelize.query(
    `INSERT INTO APPOINTMENT (${sql.join(', ')}) VALUES (${placeholders.join(', ')})`,
    { replacements: params, type: QueryTypes.INSERT }
  );
  return Number(id);
}

function* eachDateInclusive(startDate, endDate) {
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) return;
  const cursor = new Date(start.getTime());
  while (cursor <= end) {
    yield cursor.toISOString().slice(0, 10);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
}

async function ensureBookingWindowOpenSlots({ doctorId, roomId, startDate, endDate }) {
  const slotTimes = ['08:00', '09:30', '13:30', '15:00'];
  const ids = [];
  for (const date of eachDateInclusive(startDate, endDate)) {
    for (const hhmm of slotTimes) {
      const id = await ensureAppointment({
        doctorId,
        roomId,
        patientId: null,
        regimenId: null,
        time: `${date} ${hhmm}:00`,
        status: 'scheduled',
        condition: 'Booking window slot',
      });
      ids.push(id);
    }
  }
  return ids;
}

async function clearDemoNamespace() {
  await sequelize.query(
    `DELETE a FROM ACCOUNT a
     WHERE a.username LIKE 'demo_%'
        OR a.username IN (:seedUsernames)`,
    {
      replacements: {
        seedUsernames: [PERSONAS.admin.username, PERSONAS.nurse.username, PERSONAS.technician.username, PERSONAS.doctor.username, PERSONAS.patient.idcard],
      },
      type: QueryTypes.DELETE,
    }
  );
  await sequelize.query(
    `DELETE FROM USER
     WHERE email LIKE 'demo.%@techcare.local'
        OR email LIKE 'demo_%@techcare.local'
        OR email IN (:emails)`,
    {
      replacements: {
        emails: [PERSONAS.admin.email, PERSONAS.nurse.email, PERSONAS.technician.email, PERSONAS.doctor.email, PERSONAS.patient.email],
      },
      type: QueryTypes.DELETE,
    }
  );
}

async function writeManifest(manifestPath, payload) {
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  fs.writeFileSync(manifestPath, JSON.stringify(payload, null, 2), 'utf8');
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const startedAt = new Date().toISOString();
  const manifest = { startedAt, dbName: process.env.DB_NAME || null, personas: {}, workflow: {} };

  await sequelize.authenticate();
  console.log('Connected to database.');

  if (!(await hasTable('ACCOUNT')) || !(await hasTable('USER'))) {
    throw new Error('Required tables ACCOUNT/USER are missing.');
  }

  if (options.resetDemoOnly) {
    console.log('Resetting existing demo namespace rows...');
    await clearDemoNamespace();
  }
  if (options.purgeAll) {
    console.log('Purging all business data while keeping schema...');
    await purgeAllBusinessData();
  }

  const departmentId = await ensureDepartment('Demo General Medicine');
  const roomId = await ensureRoom({ name: 'Demo Room A', departmentId });
  const technicianRoleCode = await resolveTechnicianRoleCode();

  const adminUserId = await ensureStaffAccount(PERSONAS.admin);
  const nurseUserId = await ensureStaffAccount({
    ...PERSONAS.nurse,
    createdBy: adminUserId,
  });
  const technicianUserId = await ensureStaffAccount({
    ...PERSONAS.technician,
    roleCode: technicianRoleCode,
    createdBy: adminUserId,
  });
  const doctorUserId = await ensureStaffAccount({ ...PERSONAS.doctor, createdBy: adminUserId });
  const doctorId = await ensureDoctorProfile(doctorUserId, roomId, departmentId);
  const adminId = await ensureAdminProfile(adminUserId);
  const nurseId = await ensureNurseProfile(nurseUserId);
  const technicianId = await ensureTechnicianProfile(technicianUserId, roomId);
  const shiftId = nurseId && technicianId ? await ensureWorkShift({ roomId, doctorId, nurseId, technicianId }) : null;
  const patient = await ensurePatient(PERSONAS.patient);

  const diseaseId = await ensureDisease();
  const regimenId = await ensureOpenRegimen(patient.patientId, diseaseId);

  const now = new Date();
  const toMySqlDateTime = (date) => date.toISOString().slice(0, 19).replace('T', ' ');
  const slotTime = new Date(now.getTime() + 2 * 60 * 60 * 1000);
  const bookedTime = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const cancelledTime = new Date(now.getTime() + 48 * 60 * 60 * 1000);

  const openSlotId = await ensureAppointment({
    doctorId,
    roomId,
    time: toMySqlDateTime(slotTime),
    status: 'scheduled',
    condition: 'Open slot',
  });
  const bookedAppointmentId = await ensureAppointment({
    doctorId,
    roomId,
    patientId: patient.patientId,
    regimenId,
    time: toMySqlDateTime(bookedTime),
    status: 'scheduled',
    condition: 'Demo follow-up',
  });
  const cancelledAppointmentId = await ensureAppointment({
    doctorId,
    roomId,
    patientId: patient.patientId,
    time: toMySqlDateTime(cancelledTime),
    status: 'cancelled',
    condition: 'Demo cancelled slot',
  });
  let bookingWindowSlotIds = [];
  if (options.seedBookingWindow) {
    bookingWindowSlotIds = await ensureBookingWindowOpenSlots({
      doctorId,
      roomId,
      startDate: options.bookingStartDate,
      endDate: options.bookingEndDate,
    });
  }

  manifest.personas = {
    admin: { username: PERSONAS.admin.username, userId: adminUserId, adminId },
    nurse: { username: PERSONAS.nurse.username, userId: nurseUserId, nurseId },
    technician: { username: PERSONAS.technician.username, userId: technicianUserId, roleCode: technicianRoleCode },
    doctor: { username: PERSONAS.doctor.username, userId: doctorUserId, doctorId },
    patient: { username: PERSONAS.patient.idcard, userId: patient.userId, patientId: patient.patientId },
  };
  manifest.workflow = {
    departmentId,
    roomId,
    diseaseId,
    activeRegimenId: regimenId,
    appointments: {
      openSlotId,
      bookedAppointmentId,
      cancelledAppointmentId,
    },
    shiftId,
  };
  if (options.seedBookingWindow) {
    manifest.workflow.bookingWindow = {
      startDate: options.bookingStartDate,
      endDate: options.bookingEndDate,
      slotsPerDay: 4,
      slotIds: bookingWindowSlotIds,
    };
  }
  manifest.credentials = {
    password: DEFAULT_PASSWORD,
  };
  manifest.completedAt = new Date().toISOString();

  await writeManifest(options.manifestPath, manifest);
  console.log(`Demo seed completed. Manifest: ${options.manifestPath}`);
}

main()
  .catch((error) => {
    console.error('Demo seed failed:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await sequelize.close();
  });
