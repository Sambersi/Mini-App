'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const schemaFile = path.join(__dirname, 'migrations', '001-import-foundation.sql');

async function applyFoundation(connection) {
  const sql = fs.readFileSync(schemaFile, 'utf8');
  const checksum = crypto.createHash('sha256').update(sql.replace(/\r\n/g, '\n')).digest('hex');
  const statements = sql.split(';').map(s => s.trim()).filter(Boolean);
  const expected = new Set([...sql.matchAll(/CREATE TABLE IF NOT EXISTS (\w+)/g)].map(m => m[1]));
  const [existing] = await connection.query('SHOW TABLES');
  if (existing.some(row => !expected.has(Object.values(row)[0]))) {
    throw Object.assign(new Error('Target database contains unrelated tables'), { code: 'MIGRATION_TARGET_NOT_EMPTY' });
  }
  if (existing.some(row => Object.values(row)[0] === 'schema_migrations')) {
    const [versions] = await connection.query('SELECT checksum FROM schema_migrations WHERE version = 1');
    if (versions.length && versions[0].checksum !== checksum) {
      throw Object.assign(new Error('Applied schema migration checksum differs'), { code: 'MIGRATION_SCHEMA_CHANGED' });
    }
  }
  for (const statement of statements) await connection.query(statement);
  const [versions] = await connection.query('SELECT checksum FROM schema_migrations WHERE version = 1');
  if (versions.length && versions[0].checksum !== checksum) {
    throw Object.assign(new Error('Applied schema migration checksum differs'), { code: 'MIGRATION_SCHEMA_CHANGED' });
  }
  if (!versions.length) await connection.query('INSERT INTO schema_migrations(version, checksum) VALUES (1, ?)', [checksum]);
  await connection.query('INSERT IGNORE INTO runtime_control(id, runtime_active) VALUES (1, 0)');
  const [[control]] = await connection.query('SELECT runtime_active FROM runtime_control WHERE id = 1');
  if (control.runtime_active) {
    throw Object.assign(new Error('Import into an active runtime is forbidden'), { code: 'MIGRATION_RUNTIME_ACTIVE' });
  }
}

module.exports = { applyFoundation };
