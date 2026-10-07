const Account = require('../models/Account');
const User = require('../models/Users');
const Patient = require('../models/Patient');
const Relative = require('../models/Relative');
const HealthInsurance = require('../models/HealthInsurance');

/** ACCOUNT + USER (identity) and, for patients, their RELATIVE and HEALTH_INSURANCE. */

/** ACCOUNT of a user with the USER fields shown on the profile, or null. */
async function findAccountWithUser(userId) {
  return Account.findOne({
    where: { user_id: userId },
    include: [{ model: User, attributes: ['idcard', 'first_name', 'last_name', 'dob', 'sex', 'tel', 'email'] }],
  });
}

/** `{ relative, insurance }` of the user's PATIENT row (each null when missing). */
async function findPatientRelativeAndInsurance(userId) {
  const user = await User.findOne({
    where: { id: userId },
    include: [
      {
        model: Patient,
        attributes: ['patient_id'],
        include: [{ model: Relative }, { model: HealthInsurance, as: 'insurance' }],
      },
    ],
  });
  const patient = user ? user.get({ plain: true }).Patient : null;
  return { relative: patient?.Relative ?? null, insurance: patient?.insurance ?? null };
}

async function findUserById(userId, transaction) {
  return User.findByPk(userId, { transaction });
}

/** @param user an instance from findUserById */
async function updateUser(user, changes, transaction) {
  await user.update(changes, { transaction });
}

/** RELATIVE has a composite PK (patient_id + name): keep exactly one row per patient. */
async function replaceRelative(patientId, values, transaction) {
  await Relative.destroy({ where: { patient_id: patientId }, transaction });
  await Relative.create({ patient_id: patientId, ...values }, { transaction });
}

module.exports = { findAccountWithUser, findPatientRelativeAndInsurance, findUserById, updateUser, replaceRelative };
