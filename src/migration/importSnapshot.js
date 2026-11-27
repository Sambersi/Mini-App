'use strict';

const crypto = require('crypto');
const { openSource, fingerprint, encodeRow, sha } = require('./sqliteSource');
const { projectPlayers, verifyProjection } = require('./projectPlayers');

async function verifyTable(connection, runId, name, expected) {
  let last = 0, count = 0;
  const digest = crypto.createHash('sha256');
  while (true) {
    const [rows] = await connection.query(
      'SELECT row_number,payload,row_hash FROM migration_rows WHERE run_id=? AND table_name=? AND row_number>? ORDER BY row_number LIMIT 2000',
      [runId, name, last]
    );
    if (!rows.length) break;
    for (const row of rows) {
      if (typeof row.payload !== 'string') {
        throw Object.assign(new Error('Archive verification requires raw JSON text from the driver'), { code: 'MIGRATION_JSON_NOT_TEXT' });
      }
      if (Number(row.row_number) !== count + 1 || sha(row.payload) !== row.row_hash) {
        throw new Error('Archived row verification failed');
      }
      digest.update(row.payload + '\n');
      count++;
      last = Number(row.row_number);
    }
  }
  const hash = digest.digest('hex');
  if (count !== expected.count || hash !== expected.hash) throw new Error('Archived table differs from SQLite');
  return { count, hash };
}

async function archiveTable(connection, table, runId, expected, log) {
  const [previous] = await connection.query('SELECT status FROM migration_tables WHERE run_id=? AND table_name=?', [runId, table.name]);
  if (previous[0]?.status === 'verified') return;
  await connection.query(
    'INSERT INTO migration_tables(run_id,table_name,metadata_json,source_count,source_hash,status) VALUES (?,?,?,?,?,?) ON DUPLICATE KEY UPDATE metadata_json=VALUES(metadata_json),source_count=VALUES(source_count),source_hash=VALUES(source_hash),status=VALUES(status)',
    [runId, table.name, JSON.stringify(table.metadata), expected.count, expected.hash, 'importing']
  );
  await connection.beginTransaction();
  try {
    await connection.query('DELETE FROM migration_rows WHERE run_id=? AND table_name=?', [runId, table.name]);
    let batch = [], bytes = 0, number = 0;
    async function flush() {
      if (!batch.length) return;
      await connection.query('INSERT INTO migration_rows(run_id,table_name,row_number,payload,row_hash) VALUES ?', [batch]);
      batch = []; bytes = 0;
    }
    for (const row of table.rows()) {
      const payload = encodeRow(row);
      const size = Buffer.byteLength(payload);
      if (size > 4 * 1024 * 1024) throw new Error('A source row needs a dedicated large-row import');
      if (bytes + size > 256 * 1024) await flush();
      batch.push([runId, table.name, ++number, payload, sha(payload)]);
      bytes += size;
      if (batch.length >= 250) await flush();
      if (number % 25000 === 0) log({ table: table.name, rowsWritten: number });
    }
    await flush();
    const verified = await verifyTable(connection, runId, table.name, expected);
    await connection.query('UPDATE migration_tables SET status=?,target_hash=? WHERE run_id=? AND table_name=?', ['verified', verified.hash, runId, table.name]);
    await connection.commit();
  } catch (error) { await connection.rollback(); throw error; }
}

async function importSnapshot({ connection, file, runId, snapshotSha, log = () => {} }) {
  const source = openSource(file);
  try {
    const [runs] = await connection.query('SELECT snapshot_sha256,status,report_json FROM migration_runs WHERE run_id=?', [runId]);
    if (runs.length && runs[0].snapshot_sha256 !== snapshotSha) throw new Error('Run ID belongs to another snapshot');
    const hasSequence = source.schema.some(row => row.name === 'sqlite_sequence');
    const metadata = { format: 'sqlite-tagged-cells-v1', schema: source.schema,
      sequences: hasSequence ? source.db.prepare('SELECT name,seq FROM sqlite_sequence ORDER BY name').raw().safeIntegers().all().map(encodeRow) : [] };
    if (!runs.length) {
      await connection.query('INSERT INTO migration_runs(run_id,snapshot_sha256,metadata_json,status) VALUES (?,?,?,?)',
        [runId, snapshotSha, JSON.stringify(metadata), 'importing']);
    }
    const checks = [];
    const alreadyVerified = runs[0]?.status === 'verified';
    for (const table of source.tables) {
      const expected = fingerprint(table);
      if (!alreadyVerified) await archiveTable(connection, table, runId, expected, log);
      const result = await verifyTable(connection, runId, table.name, expected);
      checks.push({ table: table.name, rows: result.count, sourceHash: expected.hash, targetHash: result.hash });
      log({ table: table.name, rows: result.count, verified: true });
    }
    const [[targetCount]] = await connection.query('SELECT COUNT(*) AS n FROM migration_rows WHERE run_id=?', [runId]);
    if (Number(targetCount.n) !== checks.reduce((n, row) => n + row.rows, 0)) throw new Error('Unexpected extra archived rows');
    const projection = alreadyVerified ? await verifyProjection(connection, source.db, runId) : await projectPlayers(connection, source.db, runId);
    const report = { runId, snapshotSha, status: 'verified', activeStorage: 'sqlite',
      archiveTables: checks.length, archiveRows: checks.reduce((n, row) => n + row.rows, 0), tables: checks, projection };
    await connection.query('UPDATE migration_runs SET status=?,report_json=?,verified_at=CURRENT_TIMESTAMP WHERE run_id=?', ['verified', JSON.stringify(report), runId]);
    return report;
  } catch (error) {
    try { await connection.query('UPDATE migration_runs SET status=? WHERE run_id=? AND status<>?', ['failed', runId, 'verified']); } catch (_) { /* Preserve original error. */ }
    throw error;
  } finally { source.close(); }
}

module.exports = { verifyTable, archiveTable, importSnapshot };
