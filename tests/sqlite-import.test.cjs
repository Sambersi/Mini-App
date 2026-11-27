'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Database = require('better-sqlite3');
const { encodeRow, decodeRow, openSource, fingerprint, sha } = require('../src/migration/sqliteSource');
const { archiveTable, verifyTable } = require('../src/migration/importSnapshot');
const { buildProjection, verifyRows } = require('../src/migration/projectPlayers');
const { applyFoundation } = require('../src/db/migrate');
const { validateRunId, createImportSnapshot } = require('../src/migration/stageTwo');
const { runStartupChecks } = require('../src/startupChecks');

function workspace(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mybot-import-test-'));
  t.after(() => {
    const resolved = path.resolve(directory);
    if (path.dirname(resolved) !== path.resolve(os.tmpdir()) || !path.basename(resolved).startsWith('mybot-import-test-')) throw new Error('Unexpected test directory');
    fs.rmSync(resolved, { recursive: true, force: true });
  });
  return directory;
}

function sourceFixture(t) {
  const folder = workspace(t), file = path.join(folder, 'database.sqlite');
  const db = new Database(file);
  db.exec('CREATE TABLE example(id INTEGER PRIMARY KEY, mixed INTEGER, real_value REAL, binary_value BLOB, text_value TEXT)');
  db.prepare('INSERT INTO example VALUES (?,?,?,?,?)').run(1n, 9223372036854775807n, 1.125, Buffer.from([0, 255, 128]), 'Привет 😀\n\u0000');
  db.prepare('INSERT INTO example VALUES (?,?,?,?,?)').run(2n, 'text in INTEGER column', null, null, null);
  db.close();
  return { folder, file };
}

test('archive codec preserves every supported SQLite cell without numeric rounding', () => {
  const values = [null, '', '😀\u0000', 9223372036854775807n, -9223372036854775808n, 0.1, -0, Infinity, Buffer.from([0, 255])];
  const result = decodeRow(encodeRow(values));
  assert.deepEqual(result, values);
  assert.ok(Object.is(result[6], -0));
});

test('source fingerprint is deterministic and preserves mixed SQLite types and binary content', t => {
  const { file } = sourceFixture(t);
  const source = openSource(file);
  try {
    const table = source.tables.find(x => x.name === 'example');
    assert.deepEqual(fingerprint(table), fingerprint(table));
    assert.equal(fingerprint(table).count, 2);
    const rows = [...table.rows()];
    assert.equal(rows[0][2], 9223372036854775807n);
    assert.equal(rows[1][2], 'text in INTEGER column');
    assert.deepEqual(decodeRow(encodeRow(rows[0])), rows[0]);
  } finally { source.close(); }
});

class ArchiveConnection {
  constructor() { this.rows = []; this.tables = new Map(); this.inserts = 0; this.failInsert = false; }
  async beginTransaction() { this.saved = this.rows.map(row => ({ ...row })); }
  async commit() { this.saved = null; }
  async rollback() { this.rows = this.saved; this.saved = null; }
  async query(sql, params) {
    if (sql.startsWith('SELECT status FROM migration_tables')) {
      const data = this.tables.get(params[0] + ':' + params[1]);
      return [data ? [data] : []];
    }
    if (sql.startsWith('INSERT INTO migration_tables')) {
      this.tables.set(params[0] + ':' + params[1], { status: params[5] }); return [{}];
    }
    if (sql.startsWith('DELETE FROM migration_rows')) {
      this.rows = this.rows.filter(row => row.run_id !== params[0] || row.table_name !== params[1]); return [{}];
    }
    if (sql.startsWith('INSERT INTO migration_rows')) {
      if (this.failInsert) throw new Error('injected write failure');
      this.inserts++;
      for (const row of params[0]) this.rows.push(Object.fromEntries(['run_id', 'table_name', 'row_number', 'payload', 'row_hash'].map((key, i) => [key, row[i]])));
      return [{}];
    }
    if (sql.startsWith('SELECT row_number,payload,row_hash')) {
      return [this.rows.filter(row => row.run_id === params[0] && row.table_name === params[1] && row.row_number > params[2]).sort((a, b) => a.row_number - b.row_number).slice(0, 2000)];
    }
    if (sql.startsWith('UPDATE migration_tables')) {
      this.tables.set(params[2] + ':' + params[3], { status: params[0] }); return [{}];
    }
    throw new Error('Unexpected SQL in archive test');
  }
}

test('table import verifies all values and does not duplicate verified data on retry', async t => {
  const source = openSource(sourceFixture(t).file), connection = new ArchiveConnection();
  try {
    const table = source.tables[0], expected = fingerprint(table);
    await archiveTable(connection, table, 'test-run', expected, () => {});
    assert.deepEqual(await verifyTable(connection, 'test-run', table.name, expected), expected);
    const writes = connection.inserts;
    await archiveTable(connection, table, 'test-run', expected, () => {});
    assert.equal(connection.inserts, writes);
    assert.deepEqual(decodeRow(connection.rows[0].payload), [...table.rows()][0]);
  } finally { source.close(); }
});

test('verification detects corrupted payload, missing rows and inserted extra rows', async t => {
  const source = openSource(sourceFixture(t).file);
  try {
    const table = source.tables[0], expected = fingerprint(table), c = new ArchiveConnection();
    await archiveTable(c, table, 'test-run', expected, () => {});
    const original = c.rows.map(row => ({ ...row }));
    c.rows[0].payload = '[]';
    await assert.rejects(verifyTable(c, 'test-run', table.name, expected));
    c.rows = original.slice(1);
    await assert.rejects(verifyTable(c, 'test-run', table.name, expected));
    c.rows = [...original, { ...original[0], row_number: 3 }];
    await assert.rejects(verifyTable(c, 'test-run', table.name, expected));
  } finally { source.close(); }
});

test('write failure rolls back an archive table instead of leaving partial rows', async t => {
  const source = openSource(sourceFixture(t).file), c = new ArchiveConnection();
  try {
    c.failInsert = true;
    await assert.rejects(archiveTable(c, source.tables[0], 'test-run', fingerprint(source.tables[0]), () => {}), /injected/);
    assert.equal(c.rows.length, 0);
  } finally { source.close(); }
});

test('archive verification refuses an implicitly parsed JSON value instead of reserializing it', async () => {
  await assert.rejects(verifyTable({ query: async () => [[{ row_number: 1, payload: [], row_hash: sha('[]') }]] },
    'run', 'example', { count: 1, hash: sha('[]\n') }), { code: 'MIGRATION_JSON_NOT_TEXT' });
});

test('projection preserves counters separately and quarantines invalid values without invented money', () => {
  const db = new Database(':memory:');
  try {
    db.exec(`CREATE TABLE users(id TEXT,numeric_id INTEGER,username TEXT,is_registered INTEGER,registration_date INTEGER,
      balance INTEGER,card_balance INTEGER,df_balance INTEGER,npf_shares INTEGER,tickets INTEGER,fortune_tickets INTEGER,
      candy INTEGER,secret_gifts INTEGER,container_type_1 INTEGER,container_type_2 INTEGER,container_type_3 INTEGER,referrer_id TEXT)`);
    db.prepare('INSERT INTO users VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run('1234', 1, 'Игрок', 1, 1700000000, null, 100, 5, 0, 7, 2, 0, 0, 0, 0, 0, 'missing');
    const p = buildProjection(db);
    assert.equal(p.players.length, 1);
    assert.equal(p.wallets.length, 2);
    assert.ok(!p.wallets.some(row => row[1] === 'PF' && row[2] === 'main'));
    assert.deepEqual(p.inventory.filter(row => /tickets/.test(row[1])), [['1234', 'tickets', '7'], ['1234', 'fortune_tickets', '2']]);
    assert.equal(p.referrals.length, 0);
    assert.deepEqual(p.issues.map(row => row[0]).sort(), ['INVALID_REFERRER', 'INVALID_WALLET']);
  } finally { db.close(); }
});

test('projection comparison rejects rounding, truncation or a changed balance', async () => {
  await verifyRows({ query: async () => [[{ id: '1', value: '9223372036854775807' }]] }, 'test', [['1', 9223372036854775807n]]);
  await assert.rejects(verifyRows({ query: async () => [[{ id: '1', value: '9223372036854775806' }]] }, 'test', [['1', 9223372036854775807n]]));
});

test('migration refuses unrelated target tables before executing DDL', async () => {
  const calls = [];
  await assert.rejects(applyFoundation({ query: async sql => { calls.push(sql); return [[{ table: 'unrelated_app' }]]; } }), { code: 'MIGRATION_TARGET_NOT_EMPTY' });
  assert.deepEqual(calls, ['SHOW TABLES']);
});

test('migration refuses an edited applied version before changing schema', async () => {
  const calls = [];
  await assert.rejects(applyFoundation({ query: async sql => { calls.push(sql); return sql === 'SHOW TABLES' ? [[{ table: 'schema_migrations' }]] : [[{ checksum: 'different' }]]; } }), { code: 'MIGRATION_SCHEMA_CHANGED' });
  assert.equal(calls.some(sql => sql.startsWith('CREATE')), false);
});

test('migration refuses an activated MariaDB runtime before any data import', async () => {
  await assert.rejects(applyFoundation({ query: async sql => {
    if (sql === 'SHOW TABLES' || sql.startsWith('SELECT checksum')) return [[]];
    if (sql.startsWith('SELECT runtime_active')) return [[{ runtime_active: 1 }]];
    return [{}];
  } }), { code: 'MIGRATION_RUNTIME_ACTIVE' });
});

test('run IDs cannot escape the backup folder and snapshots are immutable per run', async t => {
  for (const bad of ['', '../other', 'A', 'x/y', 'x'.repeat(65)]) assert.throws(() => validateRunId(bad));
  const { folder } = sourceFixture(t);
  const first = await createImportSnapshot(folder, 'test-run');
  const db = new Database(path.join(folder, 'database.sqlite'));
  db.exec('DELETE FROM example'); db.close();
  const again = await createImportSnapshot(folder, 'test-run');
  assert.equal(first.sha256, again.sha256);
  fs.appendFileSync(first.file, 'damage');
  await assert.rejects(createImportSnapshot(folder, 'test-run'), /checksum mismatch/);
});

test('startup import happens only when explicitly enabled and blocks services on failure', async () => {
  const order = [];
  await assert.rejects(runStartupChecks({ rootDir: path.resolve(__dirname, '..'),
    env: { MYSQL_PREFLIGHT: 'true', MYSQL_IMPORT_SQLITE: 'true' }, log: () => {},
    snapshot: async () => { order.push('snapshot'); return {}; },
    probe: async () => { order.push('probe'); return {}; },
    importer: async () => { order.push('import'); throw new Error('failed'); },
  }), /MYSQL_IMPORT_FAILED/);
  assert.deepEqual(order, ['snapshot', 'probe', 'import']);
});
