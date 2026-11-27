'use strict';

const { encodeRow } = require('./sqliteSource');

const walletFields = { balance: ['PF', 'main'], card_balance: ['PF', 'card'], df_balance: ['DF', 'main'] };
const {itemFields}=require('../db/playerFields');

function buildProjection(db) {
  const rows = db.prepare('SELECT * FROM users ORDER BY id').safeIntegers().all();
  const players = [], wallets = [], inventory = [], referrals = [], issues = [];
  const ids = new Set(rows.map(row => String(row.id)));
  const issue = (code, id, field, value) => issues.push([code, String(id) + ':' + field, JSON.stringify({ field, value: encodeRow([value]) })]);
  for (const row of rows) {
    const id = String(row.id);
    if (row.id === null || !/^[\x21-\x7e]{1,32}$/.test(id)) throw new Error('Player identifier needs a dedicated mapping');
    if (!/^-?\d{1,31}$/.test(id)) issue('NON_TELEGRAM_ID', id, 'id', row.id);
    players.push([id, row.numeric_id === null ? null : String(row.numeric_id), row.username, row.is_registered ? 1 : 0,
      row.registration_date === null ? null : String(row.registration_date)]);
    for (const [field, [asset, bucket]] of Object.entries(walletFields)) {
      const value = row[field];
      if (typeof value !== 'bigint' || value < 0n) issue('INVALID_WALLET', id, field, value);
      else wallets.push([id, asset, bucket, value.toString()]);
    }
    for (const field of itemFields) {
      const value = row[field];
      if (value === undefined) continue;
      if (typeof value !== 'bigint' || value < 0n) issue('INVALID_INVENTORY', id, field, value);
      else inventory.push([id, field, value.toString()]);
    }
    const referrer = row.referrer_id;
    if (referrer !== null && referrer !== '') {
      if (String(referrer) === id || !ids.has(String(referrer))) issue('INVALID_REFERRER', id, 'referrer_id', referrer);
      else referrals.push([id, String(referrer)]);
    }
  }
  const names = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(x => x.name));
  if (names.has('double_bets_log')) {
    const rows = db.prepare("SELECT id FROM double_bets_log WHERE payout_status='pending'").safeIntegers().all();
    for (const row of rows) issues.push(['PENDING_PAYOUT', String(row.id), JSON.stringify({ action: 'preserved; no replay or refund performed' })]);
  }
  return { players, wallets, inventory, referrals, issues };
}

async function insertBatches(connection, sql, rows) {
  for (let offset = 0; offset < rows.length; offset += 250) {
    await connection.query(sql, [rows.slice(offset, offset + 250)]);
  }
}

function canonicalDecimal(value) {
  if (value === null) return null;
  const match = String(value).match(/^(-?)(\d+)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/);
  if (!match) throw new Error('Invalid numeric timestamp');
  let digits = (match[2] + (match[3] || '')).replace(/^0+/, '') || '0';
  let exponent = Number(match[4] || 0) - (match[3] || '').length;
  if (digits === '0') return '0';
  while (digits.endsWith('0')) { digits = digits.slice(0, -1); exponent++; }
  return match[1] + digits + 'e' + exponent;
}

async function verifyRows(connection, sql, expected, decimalColumns = []) {
  const [rows] = await connection.query(sql);
  const normalize = row => JSON.stringify(row.map((v, i) => decimalColumns.includes(i) ? canonicalDecimal(v) : v === null ? null : String(v)));
  const actual = rows.map(row => normalize(Object.values(row))).sort();
  const wanted = expected.map(normalize).sort();
  const mismatch = actual.findIndex((row, i) => row !== wanted[i]);
  if (actual.length !== wanted.length || mismatch !== -1) {
    const error = Object.assign(new Error('Normalized projection differs from source'), { code: 'MIGRATION_PROJECTION_MISMATCH' });
    // Diagnostic row values are written only to the private backup report, never the console.
    error.details = { sql, actualCount: actual.length, expectedCount: wanted.length,
      actual: actual[mismatch], expected: wanted[mismatch] };
    throw error;
  }
}

async function projectPlayers(connection, db, runId) {
  const projection = buildProjection(db);
  const [[other]] = await connection.query('SELECT COUNT(*) AS n FROM players WHERE source_run_id IS NULL OR source_run_id <> ?', [runId]);
  if (Number(other.n)) throw new Error('Canonical tables belong to another import');
  await connection.beginTransaction();
  try {
    // Only this non-active import projection may be rebuilt; original rows stay archived.
    for (const table of ['wallet_entries', 'player_referrals', 'inventory_balances', 'wallets', 'players']) await connection.query('DELETE FROM ' + table);
    await connection.query('DELETE FROM migration_issues WHERE run_id = ?', [runId]);
    await insertBatches(connection, 'INSERT INTO players(telegram_id,numeric_id,display_name,registered,registration_ts,source_run_id) VALUES ?', projection.players.map(row => [...row, runId]));
    await insertBatches(connection, 'INSERT INTO wallets(player_id,asset,bucket,balance) VALUES ?', projection.wallets);
    await insertBatches(connection, 'INSERT INTO inventory_balances(player_id,item_code,quantity) VALUES ?', projection.inventory);
    await insertBatches(connection, 'INSERT INTO player_referrals(player_id,referrer_id) VALUES ?', projection.referrals);
    const entries = projection.wallets.map(([id, asset, bucket, amount]) => [
      'opening:' + runId + ':' + id + ':' + asset + ':' + bucket, id, asset, bucket, amount, 'migration_opening', runId,
    ]);
    await insertBatches(connection, 'INSERT INTO wallet_entries(operation_key,player_id,asset,bucket,amount,entry_type,source_run_id) VALUES ?', entries);
    await insertBatches(connection, 'INSERT INTO migration_issues(run_id,issue_code,record_key,details_json) VALUES ?', projection.issues.map(row => [runId, ...row]));
    await verifyProjection(connection, db, runId);
    await connection.query('UPDATE runtime_control SET projection_run_id = ? WHERE id = 1', [runId]);
    await connection.commit();
  } catch (error) { await connection.rollback(); throw error; }
  return projectionSummary(projection);
}

async function verifyProjection(connection, db, runId) {
  const data = buildProjection(db);
  await verifyRows(connection, 'SELECT telegram_id,numeric_id,display_name,registered,registration_ts FROM players', data.players, [4]);
  await verifyRows(connection, 'SELECT player_id,asset,bucket,balance FROM wallets', data.wallets);
  await verifyRows(connection, 'SELECT player_id,item_code,quantity FROM inventory_balances', data.inventory);
  await verifyRows(connection, 'SELECT player_id,referrer_id FROM player_referrals', data.referrals);
  await verifyRows(connection, 'SELECT operation_key,player_id,asset,bucket,amount,entry_type,source_run_id FROM wallet_entries',
    data.wallets.map(([id, asset, bucket, amount]) => [
      'opening:' + runId + ':' + id + ':' + asset + ':' + bucket, id, asset, bucket, amount, 'migration_opening', runId,
    ]));
  return projectionSummary(data);
}

function projectionSummary(data) {
  const issues = {};
  for (const [code] of data.issues) issues[code] = (issues[code] || 0) + 1;
  return { players: data.players.length, wallets: data.wallets.length, inventory: data.inventory.length,
    referrals: data.referrals.length, issues, readyForRuntime: false };
}

module.exports = { buildProjection, projectPlayers, verifyProjection, verifyRows, canonicalDecimal };
