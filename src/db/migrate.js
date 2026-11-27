'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
async function applyFoundation(connection) {
  const directory = path.join(__dirname, 'migrations');
  const migrations = fs.readdirSync(directory).filter(name => /^\d+-.*\.sql$/.test(name)).sort().map(name => {
    const sql = fs.readFileSync(path.join(directory, name), 'utf8').replace(/\r\n/g, '\n');
    return { version: Number(name.match(/^\d+/)[0]), sql,
      checksum: crypto.createHash('sha256').update(sql).digest('hex'),
      statements: sql.split(';').map(s => s.trim()).filter(Boolean) };
  });
  const expected = new Set(migrations.flatMap(m => [...m.sql.matchAll(/CREATE TABLE IF NOT EXISTS (\w+)/g)].map(match => match[1])));
  const [existing] = await connection.query('SHOW TABLES');
  if (existing.some(row => !expected.has(Object.values(row)[0]))) {
    throw Object.assign(new Error('Target database contains unrelated tables'), { code: 'MIGRATION_TARGET_NOT_EMPTY' });
  }
  let versions = [];
  if (existing.some(row => Object.values(row)[0] === 'schema_migrations')) {
    [versions] = await connection.query('SELECT version,checksum FROM schema_migrations');
  }
  for (const version of versions) {
    if (!migrations.some(m => m.version === Number(version.version) && m.checksum === version.checksum)) {
      throw Object.assign(new Error('Applied schema migration checksum differs'), { code: 'MIGRATION_SCHEMA_CHANGED' });
    }
  }
  for (const migration of migrations) {
    if (versions.some(v => Number(v.version) === migration.version)) continue;
    for (const statement of migration.statements) await connection.query(statement);
    await connection.query('INSERT INTO schema_migrations(version,checksum) VALUES (?,?)', [migration.version, migration.checksum]);
  }
  await connection.query('INSERT IGNORE INTO runtime_control(id, runtime_active) VALUES (1, 0)');
  const [[control]] = await connection.query('SELECT runtime_active FROM runtime_control WHERE id = 1');
  if (control.runtime_active) {
    throw Object.assign(new Error('Import into an active runtime is forbidden'), { code: 'MIGRATION_RUNTIME_ACTIVE' });
  }
}

module.exports = { applyFoundation };
