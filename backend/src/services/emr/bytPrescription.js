const { QueryTypes } = require('sequelize');
const crypto = require('crypto');
const { config } = require('../../config/env');

const {
  prescriptionType: BYT_PRESCRIPTION_TYPE,
  facilityCode: BYT_FACILITY_CODE,
  facilityPhone: BYT_FACILITY_PHONE,
  facilityName: BYT_FACILITY_NAME,
  facilityAddress: BYT_FACILITY_ADDRESS,
} = config.byt;

const BYT_DEFAULT_PATIENT_ADDRESS = BYT_FACILITY_ADDRESS;

async function resolveBytDefaultsForPatient(sequelize, patientPk, bodyByt, patientDemo, ageMonths, transaction) {
  const relRows = await sequelize.query(
    `SELECT name, tel FROM RELATIVE WHERE patient_id = :pk LIMIT 1`,
    { replacements: { pk: patientPk }, type: QueryTypes.SELECT, transaction }
  );
  const rel = relRows?.[0] || null;
  const relPhone = String(rel?.tel || '').trim();
  const relName = String(rel?.name || '').trim();
  const patientPhone = String(patientDemo?.tel || '').trim();

  let patientWeightKg = String(bodyByt?.patientWeightKg || '').trim();
  if (!patientWeightKg) {
    const mrRows = await sequelize.query(
      `SELECT weight FROM MEDICAL_RECORD WHERE patient_id = :pk ORDER BY time DESC LIMIT 1`,
      { replacements: { pk: patientPk }, type: QueryTypes.SELECT, transaction }
    );
    const w = mrRows?.[0]?.weight;
    if (w != null && Number(w) > 0) patientWeightKg = String(w);
  }

  const contactPhone = String(bodyByt?.contactPhone || '').trim() || relPhone || patientPhone;
  const guardianName =
    ageMonths != null && ageMonths < 72 && relName
      ? relName
      : String(bodyByt?.guardianName || '').trim();

  return {
    facilityPhone: String(bodyByt?.facilityPhone || BYT_FACILITY_PHONE).trim() || BYT_FACILITY_PHONE,
    contactPhone,
    guardianName,
    advice: String(bodyByt?.advice || '').trim(),
    insuranceId: String(bodyByt?.insuranceId || '').trim(),
    patientAddress:
      String(bodyByt?.patientAddress || BYT_DEFAULT_PATIENT_ADDRESS).trim() || BYT_DEFAULT_PATIENT_ADDRESS,
    patientWeightKg,
  };
}

function randomBase36Lower(length) {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = crypto.randomBytes(length * 2);
  let out = '';
  for (let i = 0; i < bytes.length && out.length < length; i += 1) {
    out += alphabet[bytes[i] % alphabet.length];
  }
  return out.slice(0, length);
}

function isBytCodeShape(code) {
  return /^[A-Z0-9]{5}[a-z0-9]{7}-[NHC]$/.test(String(code || ''));
}

function parsePrescriptionMetaNote(rawNote) {
  const raw = String(rawNote || '').trim();
  if (!raw) return { department: '', byt: null };
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return { department: raw, byt: null };
    const department = typeof parsed.department === 'string' ? parsed.department : '';
    const byt = parsed.byt && typeof parsed.byt === 'object' ? parsed.byt : null;
    return { department, byt };
  } catch {
    return { department: raw, byt: null };
  }
}

function buildPrescriptionMetaNote({ department, byt }) {
  return JSON.stringify({
    v: 2,
    department: String(department || ''),
    byt: byt && typeof byt === 'object' ? byt : {},
  });
}

async function generateUniqueBytPrescriptionCode(sequelizeRef, { facilityCode, type, transaction }) {
  const facility = String(facilityCode || BYT_FACILITY_CODE)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .padEnd(5, '0')
    .slice(0, 5);
  const t = String(type || BYT_PRESCRIPTION_TYPE).toUpperCase() === 'N'
    ? 'N'
    : String(type || BYT_PRESCRIPTION_TYPE).toUpperCase() === 'H'
      ? 'H'
      : 'C';
  for (let i = 0; i < 20; i += 1) {
    const candidate = `${facility}${randomBase36Lower(7)}-${t}`;
    const rows = await sequelizeRef.query(
      `SELECT order_id
       FROM MEDICAL_PRESCRIPTION
       WHERE note LIKE :needle
       LIMIT 1`,
      {
        replacements: { needle: `%${candidate}%` },
        type: QueryTypes.SELECT,
        ...(transaction ? { transaction } : {}),
      }
    );
    if (!rows[0]) return candidate;
  }
  throw new Error('Unable to generate unique BYT prescription code');
}

module.exports = {
  BYT_FACILITY_ADDRESS,
  BYT_FACILITY_CODE,
  BYT_FACILITY_NAME,
  BYT_FACILITY_PHONE,
  BYT_PRESCRIPTION_TYPE,
  buildPrescriptionMetaNote,
  generateUniqueBytPrescriptionCode,
  isBytCodeShape,
  parsePrescriptionMetaNote,
  resolveBytDefaultsForPatient,
};
