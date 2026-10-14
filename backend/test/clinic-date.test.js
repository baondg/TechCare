const test = require('node:test');
const assert = require('node:assert/strict');

const { syncMysqlClinicTimezone } = require('../dist/common/clinicDate');

test('syncMysqlClinicTimezone sets the session time zone through the promise API', async () => {
  const sql = [];
  const connection = {
    // Callback-style mysql2 connection: awaiting .query() throws, so only promise() may be used.
    query() {
      throw new Error('callback query used');
    },
    promise: () => ({ query: async (s) => sql.push(s) }),
  };
  await syncMysqlClinicTimezone(connection);
  assert.deepEqual(sql, ["SET time_zone = '+07:00'"]);
});
