const { QueryTypes } = require('sequelize');
const sequelize = require('./database');

function parseOpRouteNumeric(patientIdParam) {
  const n = Number(String(patientIdParam ?? '').replace(/^OP0*/i, ''));
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function qTx(transaction, base) {
  return transaction ? { ...base, transaction } : base;
}

async function resolvePatientPkFromRoute(patientIdParam, transaction) {
  const n = parseOpRouteNumeric(patientIdParam);
  if (n == null) return null;

  const [byUser] = await sequelize.query(
    'SELECT patient_id AS id FROM PATIENT WHERE user_id = :n LIMIT 1',
    qTx(transaction, { replacements: { n }, type: QueryTypes.SELECT })
  );
  if (byUser?.id != null) return Number(byUser.id);

  const [byPk] = await sequelize.query(
    'SELECT patient_id AS id FROM PATIENT WHERE patient_id = :n LIMIT 1',
    qTx(transaction, { replacements: { n }, type: QueryTypes.SELECT })
  );
  if (byPk?.id != null) return Number(byPk.id);

  return null;
}

async function resolveUserIdFromRoute(patientIdParam, transaction) {
  const n = parseOpRouteNumeric(patientIdParam);
  if (n == null) return null;

  const [row] = await sequelize.query(
    'SELECT user_id AS id FROM PATIENT WHERE user_id = :n LIMIT 1',
    qTx(transaction, { replacements: { n }, type: QueryTypes.SELECT })
  );
  if (row?.id != null) return Number(row.id);

  const [byPk] = await sequelize.query(
    'SELECT user_id AS id FROM PATIENT WHERE patient_id = :n LIMIT 1',
    qTx(transaction, { replacements: { n }, type: QueryTypes.SELECT })
  );
  if (byPk?.id != null) return Number(byPk.id);

  return null;
}

module.exports = {
  parseOpRouteNumeric,
  resolvePatientPkFromRoute,
  resolveUserIdFromRoute,
};
