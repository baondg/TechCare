/**
 * Idempotent seed: WORK_SHIFT rows for doctor 2, nurse 1, technician 2.
 *
 * Default range: 2026-06-06 -> 2026-06-08, two shifts per day:
 *   Morning   07:00-12:00
 *   Afternoon 13:00-17:00
 *
 * Usage (from backend/):
 *   node scripts/seed-work-shifts-jun-2026.js
 *   node scripts/seed-work-shifts-jun-2026.js --room-id=1
 *   node scripts/seed-work-shifts-jun-2026.js --start-date=2026-06-06 --end-date=2026-06-08
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { fromDist } = require('./lib/fromDist');

const { QueryTypes } = require('sequelize');
const sequelize = fromDist('common/database');

const DEFAULTS = {
  doctorId: 2,
  nurseId: 1,
  technicianId: 2,
  roomId: 1,
  startDate: '2026-06-06',
  endDate: '2026-06-08',
};

const SHIFT_WINDOWS = [
  { label: 'morning', start: '07:00:00', end: '12:00:00' },
  { label: 'afternoon', start: '13:00:00', end: '17:00:00' },
];

function parseArgs(argv) {
  const getValue = (prefix, fallback) => {
    const hit = argv.find((a) => a.startsWith(`${prefix}=`));
    return hit ? hit.slice(prefix.length + 1) : fallback;
  };
  const num = (prefix, fallback) => {
    const raw = getValue(prefix, String(fallback));
    const n = Number(raw);
    return Number.isFinite(n) ? n : fallback;
  };
  return {
    doctorId: num('--doctor-id', DEFAULTS.doctorId),
    nurseId: num('--nurse-id', DEFAULTS.nurseId),
    technicianId: num('--technician-id', DEFAULTS.technicianId),
    roomId: num('--room-id', DEFAULTS.roomId),
    startDate: getValue('--start-date', DEFAULTS.startDate).trim(),
    endDate: getValue('--end-date', DEFAULTS.endDate).trim(),
  };
}

function* eachDateInclusive(startDate, endDate) {
  const start = new Date(`${startDate}T12:00:00`);
  const end = new Date(`${endDate}T12:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) return;
  const cursor = new Date(start.getTime());
  while (cursor <= end) {
    const y = cursor.getFullYear();
    const m = String(cursor.getMonth() + 1).padStart(2, '0');
    const d = String(cursor.getDate()).padStart(2, '0');
    yield `${y}-${m}-${d}`;
    cursor.setDate(cursor.getDate() + 1);
  }
}

async function ensureWorkShift({ roomId, doctorId, nurseId, technicianId, startTime, endTime }) {
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
  if (existing?.id) {
    return { id: Number(existing.id), created: false };
  }
  const [id] = await sequelize.query(
    `INSERT INTO WORK_SHIFT (start_time, end_time, room_id, doctor_id, nurse_id, technician_id)
     VALUES (:startTime, :endTime, :roomId, :doctorId, :nurseId, :technicianId)`,
    {
      replacements: { startTime, endTime, roomId, doctorId, nurseId, technicianId },
      type: QueryTypes.INSERT,
    }
  );
  return { id: Number(id), created: true };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  let created = 0;
  let skipped = 0;

  for (const ymd of eachDateInclusive(args.startDate, args.endDate)) {
    for (const window of SHIFT_WINDOWS) {
      const startTime = `${ymd} ${window.start}`;
      const endTime = `${ymd} ${window.end}`;
      const result = await ensureWorkShift({
        roomId: args.roomId,
        doctorId: args.doctorId,
        nurseId: args.nurseId,
        technicianId: args.technicianId,
        startTime,
        endTime,
      });
      if (result.created) {
        created += 1;
        console.log(`+ shift ${result.id}: ${startTime} -> ${endTime} (room ${args.roomId})`);
      } else {
        skipped += 1;
        console.log(`= exists shift ${result.id}: ${startTime} -> ${endTime}`);
      }
    }
  }

  console.log(`Done. created=${created}, skipped=${skipped}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => sequelize.close());
