const { QueryTypes } = require('sequelize');
const sequelize = require('../common/database');
const { mysqlInsertId } = require('./treatmentRepository');

/**
 * ORDER + PROCEDURE_: the rows every clinical order (prescription, lab test, surgery…) hangs off.
 * ORDER.id doubles as the primary key of MEDICAL_PRESCRIPTION / TEST / SURGERY.
 */

/** New `active` ORDER for a TREATMENT; returns its id, or null when the driver gives none back. */
async function insertActiveOrder(treatmentId, transaction) {
  const [ins] = await sequelize.query('INSERT INTO `ORDER` (status, treatment_id) VALUES (:status, :treatmentId)', {
    replacements: { status: 'active', treatmentId },
    type: QueryTypes.INSERT,
    transaction,
  });
  return mysqlInsertId(ins);
}

/** PROCEDURE_ row of an order (no room). Lab tests use type 'TEST'; surgeries their surgery type. */
async function insertProcedure({ orderId, note, technicianId, doctorId, type }, transaction) {
  await sequelize.query(
    `INSERT INTO PROCEDURE_ (order_id, note, technician_id, doctor_id, room_id, type)
     VALUES (:orderId, :note, :technicianId, :doctorId, NULL, :type)`,
    { replacements: { orderId, note, technicianId, doctorId, type }, type: QueryTypes.INSERT, transaction }
  );
}

async function updateProcedureNote(orderId, note, transaction) {
  await sequelize.query('UPDATE PROCEDURE_ SET note = :note WHERE order_id = :id', {
    replacements: { id: orderId, note },
    type: QueryTypes.UPDATE,
    transaction,
  });
}

async function updateProcedureTechnician(orderId, technicianId, transaction) {
  await sequelize.query('UPDATE PROCEDURE_ SET technician_id = :technicianId WHERE order_id = :id', {
    replacements: { id: orderId, technicianId },
    type: QueryTypes.UPDATE,
    transaction,
  });
}

async function updateProcedureType(orderId, type, transaction) {
  await sequelize.query('UPDATE PROCEDURE_ SET type = :ptype WHERE order_id = :id', {
    replacements: { id: orderId, ptype: type },
    type: QueryTypes.UPDATE,
    transaction,
  });
}

/** PROCEDURE_.note of an order, or null. */
async function findProcedureNote(orderId, transaction) {
  const rows = await sequelize.query('SELECT note FROM PROCEDURE_ WHERE order_id = :id LIMIT 1', {
    replacements: { id: orderId },
    type: QueryTypes.SELECT,
    transaction,
  });
  return rows[0]?.note ?? null;
}

module.exports = {
  insertActiveOrder,
  insertProcedure,
  updateProcedureNote,
  updateProcedureTechnician,
  updateProcedureType,
  findProcedureNote,
};
