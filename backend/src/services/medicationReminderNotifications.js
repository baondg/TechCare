const { QueryTypes } = require('sequelize');
const { isUnknownColumnError } = require('../common/prescriptionQueryCompat');

const MAX_REMINDER_DAYS = 90;
const TYPE_MEDICATION_REMINDER = 'medication_reminder';

async function loadRegimenPrescriptionContext(sequelize, regimenId) {
  const replacements = { regimenId };
  const baseFrom = `
    FROM MEDICAL_PRESCRIPTION rx
    INNER JOIN \`ORDER\` o ON o.id = rx.order_id
    INNER JOIN TREATMENT t ON t.id = o.treatment_id
    LEFT JOIN PRESCRIPTION_DETAIL pd ON pd.prescription_id = rx.order_id
    LEFT JOIN MEDICINE m ON m.id = pd.medicine_id
    WHERE t.regimen_id = :regimenId
  `;
  const sqlWithRxDur = `
    SELECT m.name AS medicineName,
           COALESCE(NULLIF(pd.duration, 0), NULLIF(rx.duration, 0), 7) AS lineDuration
    ${baseFrom}
  `;
  const sqlLegacyPd = `
    SELECT m.name AS medicineName,
           COALESCE(NULLIF(pd.duration, 0), 7) AS lineDuration
    ${baseFrom}
  `;
  const sqlNoDurationCols = `
    SELECT m.name AS medicineName, 7 AS lineDuration
    ${baseFrom}
  `;

  let rows;
  try {
    rows = await sequelize.query(sqlWithRxDur, { replacements, type: QueryTypes.SELECT });
  } catch (e) {
    if (!isUnknownColumnError(e)) throw e;
    try {
      rows = await sequelize.query(sqlLegacyPd, { replacements, type: QueryTypes.SELECT });
    } catch (e2) {
      if (!isUnknownColumnError(e2)) throw e2;
      rows = await sequelize.query(sqlNoDurationCols, { replacements, type: QueryTypes.SELECT });
    }
  }

  const names = [...new Set(rows.map((r) => r.medicineName).filter(Boolean))];
  if (names.length === 0) return null;

  const nums = rows
    .map((r) => Number(r.lineDuration))
    .filter((n) => Number.isFinite(n) && n > 0);
  const scheduleDays = Math.min(MAX_REMINDER_DAYS, Math.max(1, nums.length ? Math.max(...nums) : 7));

  return { medicineNames: names, scheduleDays };
}

/**
 * After REGIMEN.end is set: insert one NOTIFICATION per day for the treatment course
 * (day 1 … day N at the same clock time as visit end, spaced by calendar days).
 */
async function scheduleMedicationRemindersForClosedRegimen(sequelize, { regimenId, patientId }) {
  const ctx = await loadRegimenPrescriptionContext(sequelize, regimenId);
  if (!ctx) return { skipped: true, reason: 'no_prescriptions' };

  const [pu] = await sequelize.query(
    'SELECT user_id AS userId FROM PATIENT WHERE patient_id = :patientId LIMIT 1',
    { replacements: { patientId }, type: QueryTypes.SELECT }
  );
  const userId = pu?.userId;
  if (!userId) return { skipped: true, reason: 'no_user' };

  const [reg] = await sequelize.query(
    'SELECT `end` AS visitEnd FROM REGIMEN WHERE id = :regimenId LIMIT 1',
    { replacements: { regimenId }, type: QueryTypes.SELECT }
  );
  const visitEnd = reg?.visitEnd;
  if (!visitEnd) return { skipped: true, reason: 'no_regimen_end' };

  const { medicineNames, scheduleDays } = ctx;

  for (let dayIndex = 0; dayIndex < scheduleDays; dayIndex += 1) {
    const dayNum = dayIndex + 1;
    const content = `Nhắc uống thuốc (ngày ${dayNum}/${scheduleDays}): ${medicineNames.join(', ')}. Uống đúng liều và giờ theo chỉ định.`;
    const addDay = Number(dayIndex);
    await sequelize.query(
      `INSERT INTO NOTIFICATION (\`type\`, content, \`time\`, status, user_id)
       VALUES (:type, :content, DATE_ADD(:visitEnd, INTERVAL ${addDay} DAY), 'unread', :userId)`,
      {
        replacements: {
          type: TYPE_MEDICATION_REMINDER,
          content,
          visitEnd,
          userId,
        },
        type: QueryTypes.INSERT,
      }
    );
  }

  return { skipped: false, scheduleDays, count: scheduleDays };
}

module.exports = {
  scheduleMedicationRemindersForClosedRegimen,
  TYPE_MEDICATION_REMINDER,
};
