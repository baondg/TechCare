/**
 * Route contract: the full list of "METHOD /path" the API exposes.
 *
 * Guards refactors (controller splits, router moves) against silently dropping
 * or renaming an endpoint. If a change is intentional, regenerate the snapshot:
 *   UPDATE_SNAPSHOTS=1 npm test
 * and review the diff of test/fixtures/routes.snapshot.json in the PR.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { loadApp, listRoutes } = require('./helpers/app');

const SNAPSHOT = path.join(__dirname, 'fixtures', 'routes.snapshot.json');

test('registered routes match the committed snapshot', () => {
  const routes = listRoutes(loadApp());

  if (process.env.UPDATE_SNAPSHOTS === '1' || !fs.existsSync(SNAPSHOT)) {
    fs.writeFileSync(SNAPSHOT, `${JSON.stringify(routes, null, 2)}\n`);
  }

  const expected = JSON.parse(fs.readFileSync(SNAPSHOT, 'utf8'));
  assert.deepEqual(routes, expected);
});

test('no route is registered twice (later one would be unreachable)', () => {
  const routes = listRoutes(loadApp());
  const seen = new Set();
  const duplicates = routes.filter((r) => (seen.has(r) ? true : (seen.add(r), false)));
  assert.deepEqual(duplicates, []);
});
