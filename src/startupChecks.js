'use strict';

const { readBoolean, checkMysqlConnection, safeMysqlError } = require('./db/mysql');
const { snapshotLegacySqlite } = require('./db/legacySnapshot');
const { getRuntimeInfo } = require('./runtimeInfo');

async function runStartupChecks({ rootDir, env = process.env, log = console.log,
  probe = checkMysqlConnection, snapshot = snapshotLegacySqlite } = {}) {
  const runtime = getRuntimeInfo(rootDir);
  log('[RELEASE] ' + JSON.stringify(runtime));
  // Create a consistent host-side snapshot before legacy imports can run migrations.
  try {
    const result = await snapshot(rootDir);
    log('[SQLITE SNAPSHOT] ' + JSON.stringify(result));
  } catch (_) {
    log('[SQLITE SNAPSHOT] FAILED: preserve database.sqlite and inspect backups/migration before retrying.');
    throw new Error('SQLITE_SNAPSHOT_FAILED');
  }
  let enabled;
  try {
    enabled = readBoolean(env.MYSQL_PREFLIGHT, 'MYSQL_PREFLIGHT');
    if (enabled) {
      const result = await probe(env);
      log('[MYSQL PREFLIGHT] OK ' + JSON.stringify(result));
    } else {
      log('[MYSQL PREFLIGHT] DISABLED: set MYSQL_PREFLIGHT=true and MYSQL_* in the host .env.');
    }
  } catch (error) {
    log('[MYSQL PREFLIGHT] FAILED ' + JSON.stringify(safeMysqlError(error)));
    throw new Error('MYSQL_PREFLIGHT_FAILED');
  }
  log('[DATABASE] Active storage: SQLite. Stage 01 checks the target database connection only.');
  return runtime;
}

module.exports = { runStartupChecks };
