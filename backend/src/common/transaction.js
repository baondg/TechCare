const sequelize = require('./database');

/** Runs `work(tx)` in a transaction: commit on success, rollback and rethrow on any error. */
async function inTransaction(work) {
  const transaction = await sequelize.transaction();
  try {
    const result = await work(transaction);
    await transaction.commit();
    return result;
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

module.exports = { inTransaction };
