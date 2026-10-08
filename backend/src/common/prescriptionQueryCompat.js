const { QueryTypes } = require('sequelize');
const logger = require('./logger');

function isUnknownColumnError(err) {
  const orig = err?.original || err?.parent;
  const code = orig?.code;
  const errno = orig?.errno;
  const msg = String(err?.message || orig?.sqlMessage || '');
  return (
    code === 'ER_BAD_FIELD_ERROR' ||
    errno === 1054 ||
    /Unknown column/i.test(msg)
  );
}

/**
 * Run prescription JOIN query; if MEDICAL_PRESCRIPTION.duration / PRESCRIPTION_DETAIL.duration
 * are missing (migration not applied), retry legacy SELECT and return rows without duration fields.
 */
async function selectPrescriptionRowsWithDurationFallback(sequelize, sqlWithDuration, sqlLegacy, replacements) {
  try {
    return await sequelize.query(sqlWithDuration, { replacements, type: QueryTypes.SELECT });
  } catch (e) {
    if (!isUnknownColumnError(e)) throw e;
    logger.warn(
      { err: e },
      '[prescription] Duration column(s) missing — using legacy SQL. Add duration columns to match database_description.sql.'
    );
    return await sequelize.query(sqlLegacy, { replacements, type: QueryTypes.SELECT });
  }
}

async function insertMedicalPrescriptionCompat(sequelize, { orderId, duration, note, transaction }) {
  const noteVal = note || '';
  const opts = {
    replacements: { orderId, duration, note: noteVal },
    type: QueryTypes.INSERT,
  };
  if (transaction) opts.transaction = transaction;
  try {
    await sequelize.query(
      `INSERT INTO MEDICAL_PRESCRIPTION (order_id, duration, time, note)
       VALUES (:orderId, :duration, NOW(), :note)`,
      opts
    );
  } catch (e) {
    if (!isUnknownColumnError(e)) throw e;
    logger.warn(
      { err: e },
      '[prescription] MEDICAL_PRESCRIPTION.duration missing — legacy INSERT. Migrate DB to match database_description.sql.'
    );
    await sequelize.query(
      `INSERT INTO MEDICAL_PRESCRIPTION (order_id, time, note)
       VALUES (:orderId, NOW(), :note)`,
      {
        replacements: { orderId, note: noteVal },
        type: QueryTypes.INSERT,
        ...(transaction ? { transaction } : {}),
      }
    );
  }
}

async function insertPrescriptionDetailCompat(
  sequelize,
  { prescriptionId, no, medicineId, quantity, duration, usage, unit, note, transaction }
) {
  const replFull = {
    prescriptionId,
    no,
    medicineId,
    quantity,
    duration,
    usage,
    unit,
    note,
  };
  const opts = { replacements: replFull, type: QueryTypes.INSERT };
  if (transaction) opts.transaction = transaction;
  try {
    await sequelize.query(
      `INSERT INTO PRESCRIPTION_DETAIL (prescription_id, no, medicine_id, quantity, duration, \`usage\`, unit, note)
       VALUES (:prescriptionId, :no, :medicineId, :quantity, :duration, :usage, :unit, :note)`,
      opts
    );
  } catch (e) {
    if (!isUnknownColumnError(e)) throw e;
    logger.warn(
      { err: e },
      '[prescription] PRESCRIPTION_DETAIL.duration missing — legacy INSERT. Migrate DB to match database_description.sql.'
    );
    await sequelize.query(
      `INSERT INTO PRESCRIPTION_DETAIL (prescription_id, no, medicine_id, quantity, \`usage\`, unit, note)
       VALUES (:prescriptionId, :no, :medicineId, :quantity, :usage, :unit, :note)`,
      {
        replacements: {
          prescriptionId,
          no,
          medicineId,
          quantity,
          usage,
          unit,
          note,
        },
        type: QueryTypes.INSERT,
        ...(transaction ? { transaction } : {}),
      }
    );
  }
}

/**
 * Always sets time = NOW(). setNote / setDuration omitted when undefined.
 * Retries without duration in SET if column is missing.
 */
async function updateMedicalPrescriptionCompat(sequelize, { orderId, setNote, setDuration, transaction }) {
  const hasDuration = setDuration !== undefined && setDuration !== null;

  const makePartsAndRepl = (withDurationInSet) => {
    // `time` is the prescribing date (medication reminders, dashboards count from it): keep it.
    const parts = ['updated_at = NOW()'];
    const repl = { orderId };
    if (setNote !== undefined) {
      parts.push('note = :note');
      repl.note = setNote;
    }
    if (withDurationInSet && hasDuration) {
      parts.push('duration = :duration');
      repl.duration = setDuration;
    }
    return { parts, repl };
  };

  const run = async (withDurationInSet) => {
    const { parts, repl } = makePartsAndRepl(withDurationInSet);
    await sequelize.query(
      `UPDATE MEDICAL_PRESCRIPTION SET ${parts.join(', ')} WHERE order_id = :orderId`,
      { replacements: repl, type: QueryTypes.UPDATE, ...(transaction ? { transaction } : {}) }
    );
  };

  try {
    await run(true);
  } catch (e) {
    if (!isUnknownColumnError(e) || !hasDuration) throw e;
    logger.warn({ err: e }, '[prescription] duration column missing on UPDATE — omitting duration');
    await run(false);
  }
}

async function selectMedicalPrescriptionMetaCompat(sequelize, { orderId, transaction }) {
  try {
    return await sequelize.query(
      'SELECT time, updated_at AS updatedAt, duration FROM MEDICAL_PRESCRIPTION WHERE order_id = :orderId LIMIT 1',
      { replacements: { orderId }, type: QueryTypes.SELECT, ...(transaction ? { transaction } : {}) }
    );
  } catch (e) {
    if (!isUnknownColumnError(e)) throw e;
    return await sequelize.query(
      'SELECT time, updated_at AS updatedAt FROM MEDICAL_PRESCRIPTION WHERE order_id = :orderId LIMIT 1',
      { replacements: { orderId }, type: QueryTypes.SELECT, ...(transaction ? { transaction } : {}) }
    );
  }
}

module.exports = {
  isUnknownColumnError,
  selectPrescriptionRowsWithDurationFallback,
  insertMedicalPrescriptionCompat,
  insertPrescriptionDetailCompat,
  updateMedicalPrescriptionCompat,
  selectMedicalPrescriptionMetaCompat,
};
