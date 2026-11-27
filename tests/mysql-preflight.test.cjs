'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { readMysqlConfig, checkMysqlConnection, safeMysqlError } = require('../src/db/mysql');
const { runStartupChecks } = require('../src/startupChecks');
const { snapshotLegacySqlite } = require('../src/db/legacySnapshot');
const { getRuntimeInfo } = require('../src/runtimeInfo');

const env = {
  MYSQL_HOST: 'test.invalid', MYSQL_USER: 'test-user', MYSQL_PASSWORD: 'test-only-secret',
  MYSQL_DATABASE: 'test_schema',
};

test('configuration preserves exact credentials and uses safe numeric and SQL defaults', () => {
  const config = readMysqlConfig({ ...env, MYSQL_PASSWORD: ' password:@^ ' });
  assert.equal(config.password, ' password:@^ ');
  assert.equal(config.port, 3306);
  assert.equal(config.connectionLimit, 2);
  assert.equal(config.charset, 'utf8mb4');
  assert.equal(config.bigNumberStrings, true);
  assert.equal(config.decimalNumbers, false);
  assert.equal(config.jsonStrings, true);
  assert.equal(config.multipleStatements, false);
  assert.deepEqual(readMysqlConfig({ ...env, MYSQL_SSL: 'true' }).ssl, { rejectUnauthorized: true });
});

test('invalid connection configuration fails before any network attempt', async () => {
  const cases = [
    { MYSQL_PASSWORD: '' }, { MYSQL_HOST: 'mysql://test.invalid' },
    { MYSQL_PORT: '3306x' }, { MYSQL_PORT: '0' }, { MYSQL_PORT: '65536' },
    { MYSQL_POOL_SIZE: '0' }, { MYSQL_POOL_SIZE: '11' },
    { MYSQL_SSL: 'yes' }, { MYSQL_CONNECT_TIMEOUT_MS: 'NaN' },
  ];
  for (const invalid of cases) {
    await assert.rejects(checkMysqlConnection({ ...env, ...invalid }, () => {
      assert.fail('must not create a pool for invalid configuration');
    }), { code: 'MYSQL_CONFIG_INVALID' });
  }
});

function fakePool({ connectError, queryError, databaseName = env.MYSQL_DATABASE } = {}) {
  const events = [];
  return {
    events,
    pool: {
      async getConnection() {
        events.push('acquire');
        if (connectError) throw connectError;
        return {
          async execute(sql) {
            events.push(sql);
            if (queryError) throw queryError;
            return [[{ server_version: '11.4-test', database_name: databaseName, database_charset: 'utf8mb4' }]];
          },
          release() { events.push('release'); },
        };
      },
      async end() { events.push('end'); },
    },
  };
}

test('successful preflight only reads metadata and releases its connection and pool', async () => {
  const mock = fakePool();
  const result = await checkMysqlConnection(env, () => mock.pool);
  assert.equal(result.serverVersion, '11.4-test');
  assert.equal(result.activeStorage, 'sqlite');
  assert.equal(mock.events.filter(x => x.startsWith('SELECT ')).length, 1);
  assert.deepEqual(mock.events.slice(-2), ['release', 'end']);
  assert.ok(!JSON.stringify(result).includes(env.MYSQL_PASSWORD));
});

test('failed connection closes the pool', async () => {
  const mock = fakePool({ connectError: Object.assign(new Error('secret address'), { code: 'ETIMEDOUT' }) });
  await assert.rejects(checkMysqlConnection(env, () => mock.pool), { code: 'ETIMEDOUT' });
  assert.deepEqual(mock.events, ['acquire', 'end']);
});

test('query failure releases both resources and the error is propagated', async () => {
  const mock = fakePool({ queryError: Object.assign(new Error('secret user'), { code: 'ER_ACCESS_DENIED_ERROR' }) });
  await assert.rejects(checkMysqlConnection(env, () => mock.pool), { code: 'ER_ACCESS_DENIED_ERROR' });
  assert.deepEqual(mock.events.slice(-2), ['release', 'end']);
});

test('unexpected database response is rejected', async () => {
  const mock = fakePool({ databaseName: 'another_schema' });
  await assert.rejects(checkMysqlConnection(env, () => mock.pool), { code: 'MYSQL_PROBE_INVALID_RESPONSE' });
  assert.deepEqual(mock.events.slice(-2), ['release', 'end']);
});

test('diagnostics never include raw error messages, passwords, hosts or usernames', () => {
  const result = safeMysqlError({ code: 'ER_ACCESS_DENIED_ERROR', message: JSON.stringify(env) });
  assert.equal(result.code, 'ER_ACCESS_DENIED_ERROR');
  for (const value of Object.values(env)) assert.ok(!JSON.stringify(result).includes(value));
  assert.equal(safeMysqlError({ code: 'password\nsecret' }).code, 'MYSQL_CHECK_FAILED');
});

test('disabled MySQL preflight still snapshots SQLite but never connects', async () => {
  const events = [];
  await runStartupChecks({ rootDir: path.resolve(__dirname, '..'), env: {}, log: () => {},
    snapshot: async () => { events.push('snapshot'); return { status: 'test' }; },
    probe: async () => assert.fail('MySQL check is disabled'),
  });
  assert.deepEqual(events, ['snapshot']);
});

test('startup snapshots before probing MySQL and stops on connection failure', async () => {
  const events = [], logs = [];
  await assert.rejects(runStartupChecks({ rootDir: path.resolve(__dirname, '..'),
    env: { ...env, MYSQL_PREFLIGHT: 'true' }, log: s => logs.push(s),
    snapshot: async () => { events.push('snapshot'); return { status: 'test' }; },
    probe: async () => { events.push('probe'); throw Object.assign(new Error(env.MYSQL_PASSWORD), { code: 'ETIMEDOUT' }); },
  }), /MYSQL_PREFLIGHT_FAILED/);
  assert.deepEqual(events, ['snapshot', 'probe']);
  assert.ok(logs.some(s => s.includes('ETIMEDOUT')));
  assert.ok(!logs.join('\n').includes(env.MYSQL_PASSWORD));
});

test('failed backup stops startup before the connection probe', async () => {
  await assert.rejects(runStartupChecks({ rootDir: path.resolve(__dirname, '..'), env,
    log: () => {}, snapshot: async () => { throw new Error('disk full'); },
    probe: async () => assert.fail('backup must finish before probe'),
  }), /SQLITE_SNAPSHOT_FAILED/);
});

test('malformed MYSQL_PREFLIGHT flag cannot silently disable the connection check', async () => {
  await assert.rejects(runStartupChecks({ rootDir: path.resolve(__dirname, '..'),
    env: { MYSQL_PREFLIGHT: 'yes' }, log: () => {}, snapshot: async () => ({ status: 'test' }),
    probe: async () => assert.fail('invalid flag'),
  }), /MYSQL_PREFLIGHT_FAILED/);
});

function temporaryWorkspace(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mybot-stage01-test-'));
  t.after(() => {
    const resolved = path.resolve(directory);
    const expectedParent = path.resolve(os.tmpdir());
    if (path.dirname(resolved) !== expectedParent || !path.basename(resolved).startsWith('mybot-stage01-test-')) {
      throw new Error('Refusing to remove an unexpected test path');
    }
    fs.rmSync(resolved, { recursive: true, force: true });
  });
  return directory;
}

test('host-side snapshot restores SQLite data and is not overwritten on later startup', async t => {
  const root = temporaryWorkspace(t);
  const Database = require('better-sqlite3');
  const source = new Database(path.join(root, 'database.sqlite'));
  source.exec('CREATE TABLE sentinel (value TEXT); INSERT INTO sentinel VALUES (\'before\')');
  try {
    assert.equal((await snapshotLegacySqlite(root)).status, 'created-and-verified');
    source.exec("UPDATE sentinel SET value = 'after'");
    assert.equal((await snapshotLegacySqlite(root)).status, 'already-verified');
    const restored = new Database(path.join(root, 'backups/migration/stage-01-before-start/database.sqlite'), { readonly: true });
    try { assert.equal(restored.prepare('SELECT value FROM sentinel').get().value, 'before'); }
    finally { restored.close(); }
  } finally { source.close(); }
});

test('a damaged existing snapshot is rejected rather than overwritten', async t => {
  const root = temporaryWorkspace(t);
  const Database = require('better-sqlite3');
  const source = new Database(path.join(root, 'database.sqlite'));
  source.exec('CREATE TABLE sentinel (value INTEGER)');
  source.close();
  await snapshotLegacySqlite(root);
  fs.appendFileSync(path.join(root, 'backups/migration/stage-01-before-start/database.sqlite'), 'corrupted');
  await assert.rejects(snapshotLegacySqlite(root), /checksum does not match/);
});

test('missing source does not create an empty SQLite database', async t => {
  const root = temporaryWorkspace(t);
  assert.equal((await snapshotLegacySqlite(root)).status, 'source-missing');
  assert.equal(fs.existsSync(path.join(root, 'database.sqlite')), false);
  assert.equal(getRuntimeInfo(root).commit, 'unknown');
});
