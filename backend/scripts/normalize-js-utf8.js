/**
 * Re-save .js files as UTF-8 when they were accidentally saved as UTF-16
 * (TypeScript then reports TS1127: Invalid character).
 */
const fs = require('fs');
const path = require('path');

function walkJsFiles(dir, out = []) {
  for (const name of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, name.name);
    if (name.isDirectory()) walkJsFiles(p, out);
    else if (name.isFile() && p.endsWith('.js')) out.push(p);
  }
  return out;
}

function decodeUtf16IfNeeded(raw) {
  if (raw.length >= 2 && raw[0] === 0xff && raw[1] === 0xfe) {
    return raw.subarray(2).toString('utf16le');
  }
  if (raw.length >= 2 && raw[0] === 0xfe && raw[1] === 0xff) {
    const b = raw.subarray(2);
    let s = '';
    for (let i = 0; i < b.length; i += 2) {
      s += String.fromCharCode((b[i] << 8) | b[i + 1]);
    }
    return s;
  }
  const prefix = raw.subarray(0, Math.min(8000, raw.length));
  const nul = prefix.reduce((n, b) => n + (b === 0 ? 1 : 0), 0);
  if (nul > 10) return raw.toString('utf16le');
  return null;
}

function main() {
  const root = path.join(__dirname, '..');
  const dirs = [path.join(root, 'src'), path.join(root, 'test'), path.join(root, 'scripts')];
  let fixed = 0;
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    for (const file of walkJsFiles(dir)) {
      const raw = fs.readFileSync(file);
      const text = decodeUtf16IfNeeded(raw);
      if (text == null) continue;
      fs.writeFileSync(file, text.replace(/\r\n/g, '\n'), 'utf8');
      console.log('utf-8:', path.relative(root, file));
      fixed += 1;
    }
  }
  if (!fixed) console.log('No UTF-16 .js files found under src/, test/, scripts/.');
}

main();
