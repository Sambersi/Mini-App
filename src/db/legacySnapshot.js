'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function checksum(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

async function snapshotLegacySqlite(rootDir) {
  const source = path.join(rootDir, 'database.sqlite');
  if (!fs.existsSync(source)) return { status: 'source-missing' };
  const Database = require('better-sqlite3');
  const parent = path.join(rootDir, 'backups', 'migration');
  const target = path.join(parent, 'stage-01-before-start');
  if (fs.existsSync(target)) {
    const manifest = JSON.parse(fs.readFileSync(path.join(target, 'manifest.json'), 'utf8'));
    if (manifest.sha256 !== checksum(path.join(target, 'database.sqlite'))) {
      throw new Error('Existing stage-01 SQLite snapshot checksum does not match');
    }
    return { status: 'already-verified' };
  }
  fs.mkdirSync(parent, { recursive: true });
  const temporary = fs.mkdtempSync(path.join(parent, 'stage-01-pending-'));
  const backupFile = path.join(temporary, 'database.sqlite');
  const db = new Database(source, { readonly: true, fileMustExist: true });
  try {
    await db.backup(backupFile);
  } finally {
    db.close();
  }
  const backup = new Database(backupFile, { readonly: true, fileMustExist: true });
  try {
    if (backup.pragma('quick_check', { simple: true }) !== 'ok') {
      throw new Error('SQLite snapshot quick_check failed');
    }
  } finally {
    backup.close();
  }
  const metadata = { createdAt: new Date().toISOString(), sha256: checksum(backupFile) };
  fs.writeFileSync(path.join(temporary, 'manifest.json'), JSON.stringify(metadata, null, 2) + '\n');
  fs.renameSync(temporary, target);
  return { status: 'created-and-verified' };
}

module.exports = { snapshotLegacySqlite };
