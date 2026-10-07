const { QueryTypes } = require('sequelize');
const sequelize = require('../common/database');

/** TRANSFERENCE (+ CLINIC_TRANSFERENCE | HOSPITAL_TRANSFERENCE). TRANSFERENCE.order_id is the ORDER id. */

/** Department of a clinic room, or null. */
async function findClinicRoomDepartmentId(roomId, transaction) {
  const [row] = await sequelize.query('SELECT department_id AS deptId FROM CLINIC_ROOM WHERE id = :rid LIMIT 1', {
    replacements: { rid: roomId },
    type: QueryTypes.SELECT,
    transaction,
  });
  const deptId = row?.deptId != null ? Number(row.deptId) : null;
  return Number.isFinite(deptId) && deptId > 0 ? deptId : null;
}

async function insertTransference({ orderId, reason, note }, transaction) {
  await sequelize.query(
    `INSERT INTO TRANSFERENCE (order_id, reason, time, note)
     VALUES (:orderId, :reason, NOW(), :note)`,
    { replacements: { orderId, reason, note }, type: QueryTypes.INSERT, transaction }
  );
}

async function insertClinicTransference({ orderId, fromRoomId, toRoomId }, transaction) {
  await sequelize.query(
    `INSERT INTO CLINIC_TRANSFERENCE (transference_id, from_room_id, to_room_id)
     VALUES (:orderId, :fromRoomId, :toRoomId)`,
    { replacements: { orderId, fromRoomId, toRoomId }, type: QueryTypes.INSERT, transaction }
  );
}

async function insertHospitalTransference({ orderId, toId, toName, transport, formPayload }, transaction) {
  await sequelize.query(
    `INSERT INTO HOSPITAL_TRANSFERENCE (transference_id, to_id, to_name, transport, form_payload)
     VALUES (:orderId, :toId, :toName, :transport, :formPayload)`,
    { replacements: { orderId, toId, toName, transport, formPayload }, type: QueryTypes.INSERT, transaction }
  );
}

module.exports = { findClinicRoomDepartmentId, insertTransference, insertClinicTransference, insertHospitalTransference };
