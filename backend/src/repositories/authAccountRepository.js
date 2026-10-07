const Account = require('../models/Account');
const User = require('../models/Users');
const Patient = require('../models/Patient');

/** ACCOUNT by username with what login needs (password hash, status, USER name). */
async function findAccountForLogin(username) {
  return Account.findOne({
    attributes: ['user_id', 'username', 'password', 'type', 'created_by', 'created_time', 'status'],
    where: { username },
    include: [
      {
        model: User,
        attributes: ['first_name', 'last_name'],
      },
    ],
  });
}

/** ACCOUNT by USER.id (Session.userId), or null. */
async function findAccountByUserId(userId) {
  return Account.findOne({ where: { user_id: userId } });
}

async function findAccountByUsername(username, transaction) {
  return Account.findOne({ where: { username }, transaction });
}

/** Stamps last login; throws on schemas without the column (callers decide). */
async function recordLastLogin(account) {
  await account.update({ lastLogin: new Date() });
}

/**
 * USER + ACCOUNT (PAT) + PATIENT for a self-registered or nurse-registered patient.
 * @returns {Promise<{ user, account }>} the created model instances
 */
async function createPatientAccount({ user, account, patientDefaults }, transaction) {
  const newUser = await User.create(user, { transaction });
  const newAccount = await Account.create({ ...account, user_id: newUser.id }, { transaction });
  await Patient.findOrCreate({
    where: { user_id: newUser.id },
    defaults: patientDefaults,
    transaction,
  });
  return { user: newUser, account: newAccount };
}

module.exports = {
  findAccountForLogin,
  findAccountByUserId,
  findAccountByUsername,
  recordLastLogin,
  createPatientAccount,
};
