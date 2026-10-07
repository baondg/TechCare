const appointmentReminderRepository = require('../repositories/appointmentReminderRepository');
const logger = require('../common/logger');

/** Shown under Appointments tab (`getNotificationTabId` matches `appointment_*`). */
const TYPE_APPOINTMENT_REMINDER_1DAY = 'appointment_reminder_1day_before';

/** Hidden dedupe marker suffix (parseable, unlikely in free text). */
function apptMarker(appointmentId) {
  return `【appt:${Number(appointmentId)}】`;
}

/**
 * Appointments whose **slot date** is **tomorrow** (server local calendar), patient assigned, still scheduled, doctor/staff confirmed.
 */
async function selectTomorrowsConfirmedPatientAppointments() {
  return appointmentReminderRepository.selectTomorrowsConfirmedPatientAppointments();
}

async function hasReminderToday(userId, appointmentId) {
  const marker = apptMarker(appointmentId);
  return appointmentReminderRepository.hasAppointmentReminderToday(
    userId,
    TYPE_APPOINTMENT_REMINDER_1DAY,
    marker
  );
}

/**
 * One run at REMINDER_HOUR:00 — insert one notification per qualifying appointment (patient portal).
 * Use server TZ (set process TZ / MySQL session) for “tomorrow” semantics; see medication reminders.
 */
async function runAppointmentReminderDayBeforeSlot(hour) {
  const rows = await selectTomorrowsConfirmedPatientAppointments();

  let inserted = 0;
  let skippedDup = 0;

  for (const row of rows || []) {
    const userId = row.userId;
    const aid = row.appointmentId;
    if (userId == null || aid == null) continue;

    if (await hasReminderToday(userId, aid)) {
      skippedDup += 1;
      continue;
    }

    const doctor = String(row.doctorLabel || '').trim() || 'bác sĩ';
    const dept = String(row.department || '').trim();
    const deptVi = dept ? ` — ${dept}` : '';
    const content = `Nhắc lịch khám: Ngày mai (${row.dateVi}) bạn có lịch lúc ${row.timeVi} với ${doctor}${deptVi}. Vui lòng đến đúng giờ. ${apptMarker(aid)}`;

    await appointmentReminderRepository.insertAppointmentReminderAtHour({
      type: TYPE_APPOINTMENT_REMINDER_1DAY,
      content,
      hour,
      userId,
    });
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
function startAppointmentReminderScheduler() {
  if (process.env.DISABLE_APPOINTMENT_REMINDERS === '1') {
    logger.info('[appointment-reminder] scheduler disabled (DISABLE_APPOINTMENT_REMINDERS=1)');
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
      const result = await runAppointmentReminderDayBeforeSlot(h);
      logger.info({ result }, '[appointment-reminder] slot');
    } catch (err) {
      logger.error({ err }, '[appointment-reminder] slot failed');
    }
  }, 20_000);

  logger.info(
    `[appointment-reminder] scheduler on: daily at ${String(hReminder).padStart(2, '0')}:00 (server local time; APPOINTMENT_REMINDER_HOUR; set TZ if needed)`
  );
}

module.exports = {
  startAppointmentReminderScheduler,
  runAppointmentReminderDayBeforeSlot,
  TYPE_APPOINTMENT_REMINDER_1DAY,
  reminderHour,
};
