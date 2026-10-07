const medicationReminderRepository = require('../repositories/medicationReminderRepository');
const logger = require('../common/logger');
const { config } = require('../config/env');

const MAX_REMINDER_DAYS = medicationReminderRepository.MAX_REMINDER_DAYS;
const TYPE_MEDICATION_REMINDER = 'medication_reminder';
/** Giờ nhắc (theo timezone của process Node / MySQL trên cùng máy chủ). Đặt biến môi trường TZ nếu cần (vd. Asia/Ho_Chi_Minh). */
const REMINDER_HOURS = [7, 12, 18];

/**
 * Các dòng đơn còn trong duration: từ ngày kê đơn (DATE(rx.time)), số ngày = duration dòng hoặc header, tối đa MAX_REMINDER_DAYS.
 */
async function selectPatientsWithActivePrescriptionLines() {
  return medicationReminderRepository.selectPatientsWithActivePrescriptionLines();
}

/**
 * Một lần chạy tại khung 7:00 / 12:00 / 18:00: tạo thông báo cho bệnh nhân còn thuốc trong duration.
 */
async function runMedicationReminderSlot(hour) {
  if (!REMINDER_HOURS.includes(hour)) {
    return { skipped: true, reason: 'invalid_hour' };
  }

  const rows = await selectPatientsWithActivePrescriptionLines();
  const byUser = new Map();
  for (const row of rows) {
    const uid = row.userId;
    if (uid == null) continue;
    const name = String(row.medicineName || '').trim();
    if (!name) continue;
    if (!byUser.has(uid)) byUser.set(uid, new Set());
    byUser.get(uid).add(name);
  }

  let inserted = 0;
  let skippedDup = 0;

  for (const [userId, nameSet] of byUser) {
    const names = [...nameSet].sort();
    if (names.length === 0) continue;

    const dup = await medicationReminderRepository.selectMedicationReminderDuplicateAtHour(
      userId,
      TYPE_MEDICATION_REMINDER,
      hour
    );
    if (dup) {
      skippedDup += 1;
      continue;
    }

    const content = `Nhắc uống thuốc (${String(hour).padStart(2, '0')}:00): ${names.join(
      ', '
    )}. Uống đúng liều và đúng giờ theo chỉ định.`;

    await medicationReminderRepository.insertMedicationReminderAtHour({
      type: TYPE_MEDICATION_REMINDER,
      content,
      hour,
      userId,
    });
    inserted += 1;
  }

  return { hour, candidates: byUser.size, inserted, skippedDup };
}

let lastFiredSlotKey = null;

/**
 * Mỗi ~20s kiểm tra: đúng phút :00 và giờ 7/12/18 (theo đồng hồ máy chủ) thì chạy một lần.
 * Tắt: DISABLE_MEDICATION_REMINDERS=1
 */
function startMedicationReminderScheduler() {
  if (config.reminders.medicationDisabled) {
    logger.info('[medication-reminder] scheduler disabled (DISABLE_MEDICATION_REMINDERS=1)');
    return;
  }

  setInterval(async () => {
    const now = new Date();
    const h = now.getHours();
    const m = now.getMinutes();
    if (!REMINDER_HOURS.includes(h) || m !== 0) return;

    const key = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}-${h}`;
    if (key === lastFiredSlotKey) return;
    lastFiredSlotKey = key;

    try {
      const result = await runMedicationReminderSlot(h);
      logger.info({ result }, '[medication-reminder] slot');
    } catch (err) {
      logger.error({ err }, '[medication-reminder] slot failed');
    }
  }, 20_000);

  logger.info(
    `[medication-reminder] scheduler on: ${REMINDER_HOURS.join(', ')}:00 daily (server local time; set TZ if needed)`
  );
}

module.exports = {
  startMedicationReminderScheduler,
  runMedicationReminderSlot,
  REMINDER_HOURS,
  TYPE_MEDICATION_REMINDER,
  MAX_REMINDER_DAYS,
};
