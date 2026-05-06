require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');
const { QueryTypes } = require('sequelize');

const sequelize = require('../src/common/database');
const { createPatientAccountRecords } = require('../src/services/patientRegistrationService');

const DEFAULT_PASSWORD = process.env.DEMO_ACCOUNT_PASSWORD || 'Demo12345A';
const SALT_ROUNDS = 12;

const PERSONAS = {
  admin: { username: 'demo_admin', firstName: 'Demo', lastName: 'Admin', roleCode: 'ADM', sex: 'O' },
  nurse: { username: 'demo_nurse', firstName: 'Demo', lastName: 'Nurse', roleCode: 'NUR', sex: 'F' },
  technician: { username: 'demo_technician', firstName: 'Demo', lastName: 'Technician', roleCode: 'PHY', sex: 'M' },
  doctors: [
    { username: 'demo_doc_1', firstName: 'Demo', lastName: 'DoctorOne', roleCode: 'DOC', sex: 'M' },
    { username: 'demo_doc_2', firstName: 'Demo', lastName: 'DoctorTwo', roleCode: 'DOC', sex: 'F' },
  ],
  patients: [
    { idcard: '900000000001', firstName: 'Demo', lastName: 'PatientOne', sex: 'F', dob: '1995-01-11', tel: '0900000001', email: 'demo.patient1@techcare.local' },
    { idcard: '900000000002', firstName: 'Demo', lastName: 'PatientTwo', sex: 'M', dob: '1993-06-25', tel: '0900000002', email: 'demo.patient2@techcare.local' },
    { idcard: '900000000003', firstName: 'Demo', lastName: 'PatientThree', sex: 'O', dob: '1990-09-30', tel: '0900000003', email: 'demo.patient3@techcare.local' },
  ],
};

function parseArgs(argv) {
  const args = new Set(argv);
  const getValue = (prefix, fallback) => {
    const hit = argv.find((a) => a.startsWith(`${prefix}=`));
    return hit ? hit.slice(prefix.length + 1) : fallback;
  };
  return {
    resetDemoOnly: args.has('--reset-demo-only'),
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

async function ensureRoom({ name, departmentId }) {
  const columns = await getTableColumns('CLINIC_ROOM');
  const columnMeta = await getTableColumnMeta('CLINIC_ROOM');
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

async function ensureStaffAccount({ username, firstName, lastName, roleCode, sex, createdBy = null }) {
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
        idcard: `D${Date.now()}${Math.floor(Math.random() * 10)}`.slice(0, 12),
        sex,
        dob: '1990-01-01',
        tel: `09${Math.floor(10000000 + Math.random() * 89999999)}`,
        email: `${username}@techcare.local`,
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

async function ensurePatient(patientInput) {
  const [existingAccount] = await sequelize.query(
    'SELECT user_id AS userId FROM ACCOUNT WHERE username = :username LIMIT 1',
    { replacements: { username: patientInput.idcard }, type: QueryTypes.SELECT }
  );
  let userId;
  if (!existingAccount?.userId) {
    const tx = await sequelize.transaction();
    try {
      const result = await createPatientAccountRecords(
        {
          ...patientInput,
          password: DEFAULT_PASSWORD,
        },
        { transaction: tx, createdByUserId: null }
      );
      if (!result.ok) {
        throw new Error(result.error);
      }
      await tx.commit();
      userId = Number(result.user.id);
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

async function clearDemoNamespace() {
  await sequelize.query(
    `DELETE a FROM ACCOUNT a
     WHERE a.username LIKE 'demo_%' OR a.username IN (:patientUsernames)`,
    { replacements: { patientUsernames: PERSONAS.patients.map((p) => p.idcard) }, type: QueryTypes.DELETE }
  );
  await sequelize.query("DELETE FROM USER WHERE email LIKE 'demo.%@techcare.local' OR email LIKE 'demo_%@techcare.local'", {
    type: QueryTypes.DELETE,
  });
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

  const departmentId = await ensureDepartment('Demo General Medicine');
  const roomId = await ensureRoom({ name: 'Demo Room A', departmentId });
  const technicianRoleCode = await resolveTechnicianRoleCode();

  const adminUserId = await ensureStaffAccount(PERSONAS.admin);
  const nurseUserId = await ensureStaffAccount({ ...PERSONAS.nurse, createdBy: adminUserId });
  const technicianUserId = await ensureStaffAccount({
    ...PERSONAS.technician,
    roleCode: technicianRoleCode,
    createdBy: adminUserId,
  });
  const doctorUserIds = [];
  for (const doctor of PERSONAS.doctors) {
    doctorUserIds.push(await ensureStaffAccount({ ...doctor, createdBy: adminUserId }));
  }

  const doctorIds = [];
  for (const uid of doctorUserIds) {
    doctorIds.push(await ensureDoctorProfile(uid, roomId, departmentId));
  }

  const patients = [];
  for (const patientInput of PERSONAS.patients) {
    patients.push(await ensurePatient(patientInput));
  }

  const diseaseId = await ensureDisease();
  const regimenId = await ensureOpenRegimen(patients[0].patientId, diseaseId);

  const now = new Date();
  const toMySqlDateTime = (date) => date.toISOString().slice(0, 19).replace('T', ' ');
  const slotTime = new Date(now.getTime() + 2 * 60 * 60 * 1000);
  const bookedTime = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const cancelledTime = new Date(now.getTime() + 48 * 60 * 60 * 1000);

  const openSlotId = await ensureAppointment({
    doctorId: doctorIds[0],
    roomId,
    time: toMySqlDateTime(slotTime),
    status: 'scheduled',
    condition: 'Open slot',
  });
  const bookedAppointmentId = await ensureAppointment({
    doctorId: doctorIds[0],
    roomId,
    patientId: patients[0].patientId,
    regimenId,
    time: toMySqlDateTime(bookedTime),
    status: 'scheduled',
    condition: 'Demo follow-up',
  });
  const cancelledAppointmentId = await ensureAppointment({
    doctorId: doctorIds[1],
    roomId,
    patientId: patients[1].patientId,
    time: toMySqlDateTime(cancelledTime),
    status: 'cancelled',
    condition: 'Demo cancelled slot',
  });

  manifest.personas = {
    admin: { username: PERSONAS.admin.username, userId: adminUserId },
    nurse: { username: PERSONAS.nurse.username, userId: nurseUserId },
    technician: { username: PERSONAS.technician.username, userId: technicianUserId, roleCode: technicianRoleCode },
    doctors: PERSONAS.doctors.map((d, idx) => ({ username: d.username, userId: doctorUserIds[idx], doctorId: doctorIds[idx] })),
    patients: PERSONAS.patients.map((p, idx) => ({ username: p.idcard, userId: patients[idx].userId, patientId: patients[idx].patientId })),
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
  };
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
