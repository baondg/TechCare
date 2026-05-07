/**
 * Idempotent seed: MEDICAL_RECORD (vitals) + open APPOINTMENT slots for one patient (CCCD = username).
 *
 * Usage (from backend/):
 *   node scripts/seed-patient-vitals-and-slots.js
 *   node scripts/seed-patient-vitals-and-slots.js --idcard=036096000004
 *   node scripts/seed-patient-vitals-and-slots.js --booking-start=2026-05-07 --booking-end=2026-05-10
 *   node scripts/seed-patient-vitals-and-slots.js --set-password=Demo12345A
 *
 * Requires: patient row already exists (register or import). Doctor + room must exist (e.g. npm run seed:demo).
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const bcrypt = require('bcrypt');
const { QueryTypes } = require('sequelize');
const sequelize = require('../src/common/database');

const SALT_ROUNDS = 12;
const DEFAULT_IDCARD = '036096000004';
const SLOT_TIMES = ['08:00', '09:30', '13:30', '15:00'];
const SLOT_CONDITION = 'Booking window slot';

function parseArgs(argv) {
  const getValue = (prefix, fallback) => {
    const hit = argv.find((a) => a.startsWith(`${prefix}=`));
    return hit ? hit.slice(prefix.length + 1) : fallback;
  };
  return {
    idcard: getValue('--idcard', process.env.SEED_PATIENT_IDCARD || DEFAULT_IDCARD).trim(),
    bookingStart: getValue('--booking-start', ''),
    bookingEnd: getValue('--booking-end', ''),
    setPassword: getValue('--set-password', ''),
    doctorUsername: getValue('--doctor', process.env.SEED_DOCTOR_USERNAME || 'doctor1').trim(),
  };
}

function fmtLocalYMD(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function defaultBookingRange() {
  const today = new Date();
  const start = fmtLocalYMD(today);
  const endD = new Date(today);
  endD.setDate(endD.getDate() + 6);
  return { startDate: start, endDate: fmtLocalYMD(endD) };
}

function* eachDateInclusive(startDate, endDate) {
  const start = new Date(`${startDate}T12:00:00`);
  const end = new Date(`${endDate}T12:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) return;
  const cursor = new Date(start.getTime());
  while (cursor <= end) {
    yield fmtLocalYMD(cursor);
    cursor.setDate(cursor.getDate() + 1);
  }
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

async function resolvePatient(idcard) {
  const [row] = await sequelize.query(
    `SELECT p.patient_id AS patientId, u.id AS userId, a.username
     FROM PATIENT p
     INNER JOIN USER u ON u.id = p.user_id
     INNER JOIN ACCOUNT a ON a.user_id = u.id
     WHERE u.idcard = :idcard OR a.username = :idcard
     LIMIT 1`,
    { replacements: { idcard }, type: QueryTypes.SELECT }
  );
  if (!row?.patientId) return null;
  return { patientId: Number(row.patientId), userId: Number(row.userId), username: String(row.username || '') };
}

async function resolveDoctorAndRoom(preferredUsername) {
  const [byName] = await sequelize.query(
    `SELECT d.doctor_id AS doctorId, d.room_id AS roomId
     FROM DOCTOR d
     INNER JOIN ACCOUNT a ON a.user_id = d.user_id
     WHERE a.username = :username
     LIMIT 1`,
    { replacements: { username: preferredUsername }, type: QueryTypes.SELECT }
  );
  if (byName?.doctorId != null) {
    let roomId = byName.roomId != null ? Number(byName.roomId) : null;
    if (!roomId) {
      const [anyRoom] = await sequelize.query('SELECT id FROM CLINIC_ROOM LIMIT 1', { type: QueryTypes.SELECT });
      roomId = anyRoom?.id != null ? Number(anyRoom.id) : null;
    }
    if (roomId) return { doctorId: Number(byName.doctorId), roomId };
  }

  const [first] = await sequelize.query(
    `SELECT d.doctor_id AS doctorId, d.room_id AS roomId
     FROM DOCTOR d
     ORDER BY d.doctor_id ASC
     LIMIT 1`,
    { type: QueryTypes.SELECT }
  );
  if (!first?.doctorId) return null;
  let roomId = first.roomId != null ? Number(first.roomId) : null;
  if (!roomId) {
    const [anyRoom] = await sequelize.query('SELECT id FROM CLINIC_ROOM LIMIT 1', { type: QueryTypes.SELECT });
    roomId = anyRoom?.id != null ? Number(anyRoom.id) : null;
  }
  if (!roomId) return null;
  return { doctorId: Number(first.doctorId), roomId };
}

async function ensureAppointment({ doctorId, roomId, patientId = null, regimenId = null, time, status, condition }) {
  const [existing] = await sequelize.query(
    `SELECT id FROM APPOINTMENT
     WHERE doctor_id = :doctorId
       AND room_id = :roomId
       AND time = :time
       AND ((patient_id IS NULL AND :patientId IS NULL) OR patient_id <=> :patientId)
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
  if (!sql.length) throw new Error('APPOINTMENT: no insertable columns');

  const placeholders = sql.map((c) => `:${c.replace(/`/g, '')}`);
  const [id] = await sequelize.query(
    `INSERT INTO APPOINTMENT (${sql.join(', ')}) VALUES (${placeholders.join(', ')})`,
    { replacements: params, type: QueryTypes.INSERT }
  );
  return Number(id);
}

async function ensureMedicalRecordRow(payload) {
  const { patientId, time, condition, height, weight, bloodPressure, heartRate, temperature, respiratoryRate, spo2, status } =
    payload;
  const [exists] = await sequelize.query(
    `SELECT id FROM MEDICAL_RECORD WHERE patient_id = :patientId AND time = :time LIMIT 1`,
    { replacements: { patientId, time }, type: QueryTypes.SELECT }
  );
  if (exists?.id) return Number(exists.id);

  const columns = await getTableColumns('MEDICAL_RECORD');
  const sql = [];
  const params = {};
  const set = (column, value) => {
    if (!columns.has(column.toLowerCase())) return;
    sql.push(`\`${column}\``);
    params[column] = value;
  };
  set('time', time);
  set('condition', condition);
  set('patient_id', patientId);
  set('height', height);
  set('weight', weight);
  if (bloodPressure != null) set('blood_pressure', bloodPressure);
  if (heartRate != null) set('heart_rate', heartRate);
  if (temperature != null) set('temperature', temperature);
  if (respiratoryRate != null) set('respiratory_rate', respiratoryRate);
  if (spo2 != null) set('spo2', spo2);
  if (status && columns.has('status')) set('status', status);

  if (!sql.length) throw new Error('MEDICAL_RECORD: no insertable columns');

  const placeholders = sql.map((c) => `:${c.replace(/`/g, '')}`);
  const [id] = await sequelize.query(
    `INSERT INTO MEDICAL_RECORD (${sql.join(', ')}) VALUES (${placeholders.join(', ')})`,
    { replacements: params, type: QueryTypes.INSERT }
  );
  return Number(id);
}

async function findOpenRegimenId(patientId) {
  const [row] = await sequelize.query(
    `SELECT id FROM REGIMEN WHERE patient_id = :patientId AND \`end\` IS NULL ORDER BY \`start\` DESC, id DESC LIMIT 1`,
    { replacements: { patientId }, type: QueryTypes.SELECT }
  );
  return row?.id != null ? Number(row.id) : null;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  await sequelize.authenticate();

  const patient = await resolvePatient(opts.idcard);
  if (!patient) {
    console.error(
      `No patient found for idcard/username "${opts.idcard}". Register the patient first or fix --idcard.`
    );
    process.exit(1);
  }
  console.log(`Patient: patient_id=${patient.patientId} user_id=${patient.userId} username=${patient.username}`);

  if (opts.setPassword) {
    const hash = await bcrypt.hash(opts.setPassword, SALT_ROUNDS);
    await sequelize.query('UPDATE ACCOUNT SET password = :hash WHERE user_id = :userId', {
      replacements: { hash, userId: patient.userId },
      type: QueryTypes.UPDATE,
    });
    console.log('Updated ACCOUNT password (bcrypt).');
  }

  const docRoom = await resolveDoctorAndRoom(opts.doctorUsername);
  if (!docRoom) {
    console.error(
      'No doctor/room found. Run `npm run seed:demo` or ensure DOCTOR + CLINIC_ROOM exist. Optional: --doctor=doctor1'
    );
    process.exit(1);
  }
  console.log(`Doctor/room: doctor_id=${docRoom.doctorId} room_id=${docRoom.roomId}`);

  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const twoDaysAgo = new Date(now);
  twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);

  const t1 = `${fmtLocalYMD(twoDaysAgo)} 10:00:00`;
  const t2 = `${fmtLocalYMD(yesterday)} 09:30:00`;

  const mr1 = await ensureMedicalRecordRow({
    patientId: patient.patientId,
    time: t1,
    condition: 'Demo vitals — routine tracking',
    height: 165,
    weight: 58,
    bloodPressure: '118/76',
    heartRate: 72,
    temperature: 36.6,
    respiratoryRate: 16,
    spo2: 98,
    status: 'confirmed',
  });
  const mr2 = await ensureMedicalRecordRow({
    patientId: patient.patientId,
    time: t2,
    condition: 'Demo vitals — follow-up',
    height: 165,
    weight: 57.5,
    bloodPressure: '116/74',
    heartRate: 68,
    temperature: 36.5,
    respiratoryRate: 15,
    spo2: 99,
    status: 'confirmed',
  });
  console.log(`MEDICAL_RECORD ids: ${mr1}, ${mr2}`);

  let { startDate, endDate } = defaultBookingRange();
  if (opts.bookingStart) startDate = opts.bookingStart;
  if (opts.bookingEnd) endDate = opts.bookingEnd;
  if (opts.bookingStart && !opts.bookingEnd) {
    const s = new Date(`${startDate}T12:00:00`);
    const e = new Date(s);
    e.setDate(e.getDate() + 6);
    endDate = fmtLocalYMD(e);
  }
  if (!opts.bookingStart && opts.bookingEnd) {
    const e = new Date(`${endDate}T12:00:00`);
    const s = new Date(e);
    s.setDate(s.getDate() - 6);
    startDate = fmtLocalYMD(s);
  }
  console.log(`Booking window: ${startDate} .. ${endDate}`);

  let slotCount = 0;
  for (const date of eachDateInclusive(startDate, endDate)) {
    for (const hhmm of SLOT_TIMES) {
      const time = `${date} ${hhmm}:00`;
      await ensureAppointment({
        doctorId: docRoom.doctorId,
        roomId: docRoom.roomId,
        patientId: null,
        regimenId: null,
        time,
        status: 'scheduled',
        condition: SLOT_CONDITION,
      });
      slotCount += 1;
    }
  }
  console.log(`Ensured ${slotCount} open appointment slots (idempotent).`);

  const regimenId = await findOpenRegimenId(patient.patientId);
  if (regimenId) {
    const bookDate = new Date();
    bookDate.setDate(bookDate.getDate() + 3);
    const bookTime = `${fmtLocalYMD(bookDate)} 11:00:00`;
    const bookedId = await ensureAppointment({
      doctorId: docRoom.doctorId,
      roomId: docRoom.roomId,
      patientId: patient.patientId,
      regimenId,
      time: bookTime,
      status: 'scheduled',
      condition: 'Demo booked visit (seed)',
    });
    console.log(`Booked appointment for patient (if not exists): id=${bookedId} at ${bookTime} regimen_id=${regimenId}`);
  } else {
    console.log('No open REGIMEN for patient; skipped optional booked appointment (open slots only).');
  }

  console.log('Done.');
}

main()
  .catch((e) => {
    console.error(e.message || e);
    process.exit(1);
  })
  .finally(async () => {
    await sequelize.close();
  });
