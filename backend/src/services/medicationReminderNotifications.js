const { QueryTypes } = require('sequelize');
const { isUnknownColumnError } = require('../common/prescriptionQueryCompat');

const MAX_REMINDER_DAYS = 90;
const TYPE_MEDICATION_REMINDER = 'medication_reminder';
/** Giờ nhắc (theo timezone của process Node / MySQL trên cùng máy chủ). Đặt biến môi trường TZ nếu cần (vd. Asia/Ho_Chi_Minh). */
const REMINDER_HOURS = [7, 12, 18];

const baseActiveRxFrom = `
  FROM PATIENT p
  INNER JOIN USER u ON u.id = p.user_id
  INNER JOIN REGIMEN r ON r.patient_id = p.patient_id AND r.\`end\` IS NOT NULL
  INNER JOIN TREATMENT t ON t.regimen_id = r.id
  INNER JOIN \`ORDER\` o ON o.treatment_id = t.id
  INNER JOIN MEDICAL_PRESCRIPTION rx ON rx.order_id = o.id
  INNER JOIN PRESCRIPTION_DETAIL pd ON pd.prescription_id = rx.order_id
  INNER JOIN MEDICINE m ON m.id = pd.medicine_id
  WHERE CHAR_LENGTH(TRIM(COALESCE(m.name, ''))) > 0
    AND CURDATE() >= DATE(rx.time)
`;

/**
 * Các dòng đơn còn trong duration: từ ngày kê đơn (DATE(rx.time)), số ngày = duration dòng hoặc header, tối đa MAX_REMINDER_DAYS.
 */
async function selectPatientsWithActivePrescriptionLines(sequelize) {
  const maxDur = MAX_REMINDER_DAYS;
  const sqlWithRxDur = `
    SELECT DISTINCT p.patient_id AS patientId, u.id AS userId, m.name AS medicineName
    ${baseActiveRxFrom}
    AND DATEDIFF(CURDATE(), DATE(rx.time)) < LEAST(:maxDur, GREATEST(1,
      COALESCE(NULLIF(pd.duration, 0), NULLIF(rx.duration, 0), 7)))
  `;
  const sqlLegacyPd = `
    SELECT DISTINCT p.patient_id AS patientId, u.id AS userId, m.name AS medicineName
    ${baseActiveRxFrom}
    AND DATEDIFF(CURDATE(), DATE(rx.time)) < LEAST(:maxDur, GREATEST(1, COALESCE(NULLIF(pd.duration, 0), 7)))
  `;
  const sqlNoDurationCols = `
    SELECT DISTINCT p.patient_id AS patientId, u.id AS userId, m.name AS medicineName
    ${baseActiveRxFrom}
    AND DATEDIFF(CURDATE(), DATE(rx.time)) < LEAST(:maxDur, 7)
  `;

  try {
    return await sequelize.query(sqlWithRxDur, { replacements: { maxDur }, type: QueryTypes.SELECT });
  } catch (e) {
    if (!isUnknownColumnError(e)) throw e;
    try {
      return await sequelize.query(sqlLegacyPd, { replacements: { maxDur }, type: QueryTypes.SELECT });
    } catch (e2) {
      if (!isUnknownColumnError(e2)) throw e2;
      return await sequelize.query(sqlNoDurationCols, { replacements: { maxDur }, type: QueryTypes.SELECT });
    }
  }
}

/**
 * Một lần chạy tại khung 7:00 / 12:00 / 18:00: tạo thông báo cho bệnh nhân còn thuốc trong duration.
 */
async function runMedicationReminderSlot(sequelize, hour) {
  if (!REMINDER_HOURS.includes(hour)) {
    return { skipped: true, reason: 'invalid_hour' };
  }

  const rows = await selectPatientsWithActivePrescriptionLines(sequelize);
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

    const [dup] = await sequelize.query(
      `SELECT id FROM NOTIFICATION
       WHERE user_id = :userId AND type = :type
       AND \`time\` = TIMESTAMP(DATE(NOW()), MAKETIME(:hour, 0, 0))
       LIMIT 1`,
      {
        replacements: { userId, type: TYPE_MEDICATION_REMINDER, hour },
        type: QueryTypes.SELECT,
      }
    );
    if (dup) {
      skippedDup += 1;
      continue;
    }

    const content = `Nhắc uống thuốc (${String(hour).padStart(2, '0')}:00): ${names.join(
      ', '
    )}. Uống đúng liều và đúng giờ theo chỉ định.`;

    await sequelize.query(
      `INSERT INTO NOTIFICATION (\`type\`, content, \`time\`, status, user_id)
       VALUES (:type, :content, TIMESTAMP(DATE(NOW()), MAKETIME(:hour, 0, 0)), 'unread', :userId)`,
      {
        replacements: {
          type: TYPE_MEDICATION_REMINDER,
          content,
          hour,
          userId,
        },
        type: QueryTypes.INSERT,
      }
    );
    inserted += 1;
  }

  return { hour, candidates: byUser.size, inserted, skippedDup };
}

let lastFiredSlotKey = null;

/**
 * Mỗi ~20s kiểm tra: đúng phút :00 và giờ 7/12/18 (theo đồng hồ máy chủ) thì chạy một lần.
 * Tắt: DISABLE_MEDICATION_REMINDERS=1
 */
function startMedicationReminderScheduler(sequelize) {
  if (process.env.DISABLE_MEDICATION_REMINDERS === '1') {
    console.log('[medication-reminder] scheduler disabled (DISABLE_MEDICATION_REMINDERS=1)');
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
      const result = await runMedicationReminderSlot(sequelize, h);
      console.log('[medication-reminder] slot', result);
    } catch (err) {
      console.error('[medication-reminder] slot failed:', err?.message || err);
    }
  }, 20_000);

  console.log(
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
