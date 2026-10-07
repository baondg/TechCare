/**
 * A CommonJS module that assigns `exports.foo = ...` twice silently keeps only
 * the last one, leaving the earlier body as dead code that still looks live
 * (doctorController once carried ~1.4k lines of such shadowed handlers).
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SRC = path.join(__dirname, '..', 'src');

function listJsFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return listJsFiles(full);
    return entry.name.endsWith('.js') ? [full] : [];
  });
}

test('no module assigns the same top-level exports.<name> twice', () => {
  const duplicates = [];
  for (const file of listJsFiles(SRC)) {
    const seen = new Map();
    const lines = fs.readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, i) => {
      const match = /^(?:module\.)?exports\.(\w+)\s*=/.exec(line);
      if (!match) return;
      const name = match[1];
      if (seen.has(name)) {
        duplicates.push(`${path.relative(SRC, file)}: ${name} (lines ${seen.get(name)} and ${i + 1})`);
      } else {
        seen.set(name, i + 1);
      }
    });
  }
  assert.deepEqual(duplicates, []);
});
