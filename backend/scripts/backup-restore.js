#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

function envOrThrow(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

function q(value) {
  return `"${String(value).replace(/"/g, '\\"')}"`;
}

function run(cmd, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: 'inherit', shell: true, ...options });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} exited with code ${code}`));
    });
  });
}

async function createBackup(outDir) {
  const host = process.env.DB_HOST || '127.0.0.1';
  const port = String(process.env.DB_PORT || '3306');
  const user = envOrThrow('DB_USER');
  const password = envOrThrow('DB_PASSWORD');
  const dbName = envOrThrow('DB_NAME');
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const file = path.join(outDir, `techcare-${ts}.sql.gz`);
  fs.mkdirSync(outDir, { recursive: true });
  const cmd =
    `mysqldump --set-gtid-purged=OFF --single-transaction ` +
    `-h ${q(host)} -P ${q(port)} -u ${q(user)} -p${password} ${q(dbName)} | gzip > ${q(file)}`;
  await run(cmd, []);
  console.log(`Backup created: ${file}`);
}

async function restoreBackup(filePath) {
  const host = process.env.DB_HOST || '127.0.0.1';
  const port = String(process.env.DB_PORT || '3306');
  const user = envOrThrow('DB_USER');
  const password = envOrThrow('DB_PASSWORD');
  const dbName = envOrThrow('DB_NAME');
  if (!fs.existsSync(filePath)) throw new Error(`Backup file not found: ${filePath}`);
  const cmd = `gzip -dc ${q(filePath)} | mysql -h ${q(host)} -P ${q(port)} -u ${q(user)} -p${password} ${q(dbName)}`;
  await run(cmd, []);
  console.log(`Restore completed from: ${filePath}`);
}

async function main() {
  const action = process.argv[2];
  if (action === 'backup') {
    const outDir = process.argv[3] || path.join(process.cwd(), 'backups');
    await createBackup(outDir);
    return;
  }
  if (action === 'restore') {
    const filePath = process.argv[3];
    if (!filePath) throw new Error('Usage: node scripts/backup-restore.js restore <backup.sql.gz>');
    await restoreBackup(path.resolve(filePath));
    return;
  }
  throw new Error('Usage: node scripts/backup-restore.js <backup|restore> [path]');
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
