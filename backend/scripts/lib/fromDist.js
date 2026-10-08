/**
 * Scripts load the compiled backend (dist/), like the server: config/env and the logger are
 * TypeScript, so `require('../src/...')` cannot load them under plain node.
 */
const fs = require('fs');
const path = require('path');

const DIST = path.join(__dirname, '..', '..', 'dist');

/** @param {string} modulePath path under src/ without extension, e.g. 'common/database' */
function fromDist(modulePath) {
  const file = path.join(DIST, `${modulePath}.js`);
  if (!fs.existsSync(file)) {
    throw new Error(`Missing ${path.relative(process.cwd(), file)}: run \`npm run build\` in backend/ first.`);
  }
  return require(file);
}

module.exports = { fromDist };
