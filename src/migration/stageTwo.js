'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Database = require('better-sqlite3');
const { readMysqlConfig } = require('../db/mysql');
const { applyFoundation } = require('../db/migrate');
const { importSnapshot } = require('./importSnapshot');
const { sha } = require('./sqliteSource');

function validateRunId(value) {
  if (typeof value !== 'string' || !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(value)) {
    throw Object.assign(new Error('MYSQL_IMPORT_RUN_ID must be a safe explicit identifier'), { code: 'MIGRATION_RUN_ID_INVALID' });
  }
  return value;
}

async function createImportSnapshot(rootDir, runId) {
  validateRunId(runId);
  const parent = path.join(rootDir, 'backups', 'migration');
  const target = path.join(parent, 'stage-02-' + runId);
  if (!fs.existsSync(target)) {
    const original = new Database(path.join(rootDir, 'database.sqlite'), { readonly: true, fileMustExist: true });
    fs.mkdirSync(parent, { recursive: true });
    const temporary = fs.mkdtempSync(path.join(parent, 'stage-02-pending-'));
    try { await original.backup(path.join(temporary, 'database.sqlite')); }
    finally { original.close(); }
    const file = path.join(temporary, 'database.sqlite');
    const metadata = { runId, sha256: sha(fs.readFileSync(file)), createdAt: new Date().toISOString() };
    fs.writeFileSync(path.join(temporary, 'manifest.json'), JSON.stringify(metadata, null, 2));
    fs.renameSync(temporary, target);
  }
  const file = path.join(target, 'database.sqlite');
  const manifest = JSON.parse(fs.readFileSync(path.join(target, 'manifest.json'), 'utf8'));
  if (manifest.runId !== runId || manifest.sha256 !== sha(fs.readFileSync(file))) throw new Error('Import snapshot checksum mismatch');
  return { file, folder: target, sha256: manifest.sha256 };
}

async function runStageTwo({ rootDir, env = process.env, log = console.log }) {
  const runId = validateRunId(env.MYSQL_IMPORT_RUN_ID);
  const snapshot = await createImportSnapshot(rootDir, runId);
  const config = readMysqlConfig(env);
  const pool = require('mysql2/promise').createPool({ ...config, connectionLimit: 1 });
  let connection, locked = false;
  const lockName = 'mybot-import-' + crypto.createHash('sha256').update(config.database).digest('hex').slice(0, 32);
  try {
    connection = await pool.getConnection();
    const [[lock]] = await connection.query('SELECT GET_LOCK(?, 0) AS acquired', [lockName]);
    if (!Number(lock.acquired)) throw new Error('Another importer holds the database lock');
    locked = true;
    await applyFoundation(connection);
    log('[MYSQL IMPORT] START ' + JSON.stringify({ runId, activeStorage: 'sqlite' }));
    const report = await importSnapshot({ connection, file: snapshot.file, snapshotSha: snapshot.sha256, runId,
      log: event => log('[MYSQL IMPORT] ' + JSON.stringify(event)) });
    fs.writeFileSync(path.join(snapshot.folder, 'report.json'), JSON.stringify(report, null, 2));
    log('[MYSQL IMPORT] VERIFIED ' + JSON.stringify({ runId, archiveTables: report.archiveTables,
      archiveRows: report.archiveRows, projection: report.projection, activeStorage: 'sqlite' }));
    return report;
  } catch (error) {
    // Private backup folder only: never send raw driver messages or row values to console/Git.
    fs.writeFileSync(path.join(snapshot.folder, 'failure.json'), JSON.stringify({
      code: error.code || 'MIGRATION_FAILED', message: error.message, details: error.details,
    }, null, 2));
    throw error;
  } finally {
    try {
      if (connection) {
        try { if (locked) await connection.query('SELECT RELEASE_LOCK(?)', [lockName]); }
        finally { connection.release(); }
      }
    } finally { await pool.end(); }
  }
}

module.exports = { validateRunId, createImportSnapshot, runStageTwo };
