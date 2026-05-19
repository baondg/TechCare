const { QueryTypes } = require('sequelize');
const sequelize = require('../common/database');
const { isUnknownColumnError } = require('../common/prescriptionQueryCompat');

const MAX_REMINDER_DAYS = 90;

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
 * Active prescription lines within duration window (compat fallbacks for missing columns).
 */
async function selectPatientsWithActivePrescriptionLines() {
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

async function selectMedicationReminderDuplicateAtHour(userId, type, hour) {
  const [dup] = await sequelize.query(
    `SELECT id FROM NOTIFICATION
     WHERE user_id = :userId AND type = :type
     AND \`time\` = TIMESTAMP(DATE(NOW()), MAKETIME(:hour, 0, 0))
     LIMIT 1`,
    {
      replacements: { userId, type, hour },
      type: QueryTypes.SELECT,
    }
  );
  return dup;
}

async function insertMedicationReminderAtHour({ type, content, hour, userId }) {
  await sequelize.query(
    `INSERT INTO NOTIFICATION (\`type\`, content, \`time\`, status, user_id)
     VALUES (:type, :content, TIMESTAMP(DATE(NOW()), MAKETIME(:hour, 0, 0)), 'unread', :userId)`,
    {
      replacements: {
        type,
        content,
        hour,
        userId,
      },
      type: QueryTypes.INSERT,
    }
  );
}

module.exports = {
  MAX_REMINDER_DAYS,
  selectPatientsWithActivePrescriptionLines,
  selectMedicationReminderDuplicateAtHour,
  insertMedicationReminderAtHour,
};
