const { QueryTypes } = require('sequelize');

/** Shown under Appointments tab (`getNotificationTabId` matches `appointment_*`). */
const TYPE_APPOINTMENT_REMINDER_1DAY = 'appointment_reminder_1day_before';

/** Hidden dedupe marker suffix (parseable, unlikely in free text). */
function apptMarker(appointmentId) {
  return `【appt:${Number(appointmentId)}】`;
}

/**
 * Appointments whose **slot date** is **tomorrow** (server local calendar), patient assigned, still scheduled, doctor/staff confirmed.
 */
async function selectTomorrowsConfirmedPatientAppointments(sequelize) {
  return sequelize.query(
    `SELECT
       a.id AS appointmentId,
       a.patient_id AS patientId,
       pu.id AS userId,
       DATE_FORMAT(a.time, '%d/%m/%Y') AS dateVi,
       DATE_FORMAT(a.time, '%H:%i') AS timeVi,
       COALESCE(NULLIF(TRIM(CONCAT(COALESCE(du.first_name,''),' ',COALESCE(du.last_name,''))), ''), dacc.username) AS doctorLabel,
       COALESCE(NULLIF(TRIM(dep.name), ''), NULLIF(TRIM(d.specifications), ''), '') AS department
     FROM APPOINTMENT a
     INNER JOIN PATIENT p ON p.patient_id = a.patient_id
     INNER JOIN USER pu ON pu.id = p.user_id
     INNER JOIN DOCTOR d ON d.doctor_id = a.doctor_id
     INNER JOIN ACCOUNT dacc ON dacc.user_id = d.user_id
     INNER JOIN USER du ON du.id = d.user_id
     LEFT JOIN CLINIC_ROOM cr ON cr.id = a.room_id
     LEFT JOIN DEPARTMENT dep ON dep.id = cr.department_id
     WHERE a.patient_id IS NOT NULL
       AND a.status = 'scheduled'
       AND COALESCE(a.doctor_confirmed, 1) = 1
       AND DATE(a.time) = DATE_ADD(CURDATE(), INTERVAL 1 DAY)`,
    { type: QueryTypes.SELECT }
  );
}

async function hasReminderToday(sequelize, userId, appointmentId) {
  const marker = apptMarker(appointmentId);
  const [row] = await sequelize.query(
    `SELECT id FROM NOTIFICATION
     WHERE user_id = :userId
       AND type = :type
       AND DATE(\`time\`) = CURDATE()
       AND content LIKE :likeMarker
     LIMIT 1`,
    {
      replacements: {
        userId,
        type: TYPE_APPOINTMENT_REMINDER_1DAY,
        likeMarker: `%${marker}`,
      },
      type: QueryTypes.SELECT,
    }
  );
  return Boolean(row);
}

/**
 * One run at REMINDER_HOUR:00 — insert one notification per qualifying appointment (patient portal).
 * Use server TZ (set process TZ / MySQL session) for “tomorrow” semantics; see medication reminders.
 */
async function runAppointmentReminderDayBeforeSlot(sequelize, hour) {
  const rows = await selectTomorrowsConfirmedPatientAppointments(sequelize);

  let inserted = 0;
  let skippedDup = 0;

  for (const row of rows || []) {
    const userId = row.userId;
    const aid = row.appointmentId;
    if (userId == null || aid == null) continue;

    if (await hasReminderToday(sequelize, userId, aid)) {
      skippedDup += 1;
      continue;
    }

    const doctor = String(row.doctorLabel || '').trim() || 'bác sĩ';
    const dept = String(row.department || '').trim();
    const deptVi = dept ? ` — ${dept}` : '';
    const content = `Nhắc lịch khám: Ngày mai (${row.dateVi}) bạn có lịch lúc ${row.timeVi} với ${doctor}${deptVi}. Vui lòng đến đúng giờ. ${apptMarker(aid)}`;

    await sequelize.query(
      `INSERT INTO NOTIFICATION (\`type\`, content, \`time\`, status, user_id)
       VALUES (:type, :content, TIMESTAMP(DATE(NOW()), MAKETIME(:hour, 0, 0)), 'unread', :userId)`,
      {
        replacements: {
          type: TYPE_APPOINTMENT_REMINDER_1DAY,
          content,
          hour,
          userId,
        },
        type: QueryTypes.INSERT,
      }
    );
    inserted += 1;
  }

  return {
    hour,
    candidates: (rows || []).length,
    inserted,
    skippedDup,
  };
}

/** Default morning slot (local server time); override with APPOINTMENT_REMINDER_HOUR=… */
function reminderHour() {
  const h = Number(process.env.APPOINTMENT_REMINDER_HOUR);
  return Number.isFinite(h) && h >= 0 && h <= 23 ? h : 8;
}

let lastFiredSlotKey = null;

/** Every ~20s: at REMINDER_HOUR:00 fire once per calendar day (like medication-reminder scheduler). */
function startAppointmentReminderScheduler(sequelize) {
  if (process.env.DISABLE_APPOINTMENT_REMINDERS === '1') {
    console.log('[appointment-reminder] scheduler disabled (DISABLE_APPOINTMENT_REMINDERS=1)');
    return;
  }

  const hReminder = reminderHour();

  setInterval(async () => {
    const now = new Date();
    const h = now.getHours();
    const m = now.getMinutes();
    if (h !== hReminder || m !== 0) return;

    const key = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}-${h}`;
    if (key === lastFiredSlotKey) return;
    lastFiredSlotKey = key;

    try {
      const result = await runAppointmentReminderDayBeforeSlot(sequelize, h);
      console.log('[appointment-reminder] slot', result);
    } catch (err) {
      console.error('[appointment-reminder] slot failed:', err?.message || err);
    }
  }, 20_000);

  console.log(
    `[appointment-reminder] scheduler on: daily at ${String(hReminder).padStart(2, '0')}:00 (server local time; APPOINTMENT_REMINDER_HOUR; set TZ if needed)`
  );
}

module.exports = {
  startAppointmentReminderScheduler,
  runAppointmentReminderDayBeforeSlot,
  TYPE_APPOINTMENT_REMINDER_1DAY,
  reminderHour,
};
