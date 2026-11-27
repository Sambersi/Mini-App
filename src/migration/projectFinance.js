'use strict';

const { verifyRows } = require('./projectPlayers');
const { encodeRow } = require('./sqliteSource');
const {parseSourceList}=require('./projectPlayerCollections');

// Read the existing exceptional limits without copying player identifiers into
// a second configuration. No eval and no import of the legacy runtime.
function legacyCeilings(source) {
  const result = new Map();
  for (const [list, limit] of [['SPECIAL_USER_IDS', 'SPECIAL_TRANSFER_LIMIT'], ['PREMIUM_USER_IDS', 'PREMIUM_TRANSFER_LIMIT']]) {
    const ids = source.match(new RegExp('const\\s+' + list + '\\s*=\\s*\\[([^\\]]*)\\]'));
    const amount = source.match(new RegExp('const\\s+' + limit + '\\s*=\\s*(\\d+)'));
    if (!ids || !amount || !/^\s*(?:'\d+'\s*,?\s*)*$/.test(ids[1])) throw new Error('Legacy transfer policy must be reviewed');
    for (const match of ids[1].matchAll(/'(\d+)'/g)) result.set(match[1], amount[1]);
  }
  return result;
}

function buildFinanceProjection(db, ceilings = new Map()) {
  const users = db.prepare('SELECT * FROM users ORDER BY id').safeIntegers().all();
  const ids = new Set(users.map(u => String(u.id)));
  const cards = [], bans = [], roles = [], memberships = [], issues = [];
  const issue = (id, field, value) => issues.push(['INVALID_FINANCE_REFERENCE', String(id) + ':' + field, JSON.stringify({ field, value: encodeRow([value]) })]);
  for (const row of db.prepare('SELECT id,name,priority FROM statuses ORDER BY id').safeIntegers().all()) roles.push([String(row.id), row.name, row.priority === null ? null : String(row.priority)]);
  const roleIds = new Set(roles.map(r => r[0]));
  for (const u of users) {
    const id = String(u.id), number = u.card_number;
    if (number !== null && (typeof number !== 'string' || !/^[\x20-\x7e]{0,64}$/.test(number))) throw new Error('Card number needs a dedicated mapping');
    if (u.account_level !== null && (typeof u.account_level !== 'bigint' || u.account_level < -2147483648n || u.account_level > 2147483647n)) throw new Error('Account level needs a dedicated mapping');
    cards.push([id, number, u.account_level === null ? null : String(u.account_level), u.transfers_blocked ? 1 : 0, u.is_blocked ? 1 : 0, ceilings.get(id) || '50000000']);
    let values;
    try { values = JSON.parse(u.status_ids || '[]'); } catch (_) { issue(id, 'status_ids', u.status_ids); continue; }
    if (!Array.isArray(values)) { issue(id, 'status_ids', u.status_ids); continue; }
    const tokens=parseSourceList(u.status_ids||'[]').tokens;
    const seen=new Set();
    for (let index=0;index<values.length;index++) {
      const role=String(values[index]);if(seen.has(role))continue;seen.add(role);
      if (roleIds.has(role)) memberships.push([id, role,index,tokens[index]]);
      else issue(id, 'role:' + role, role);
    }
  }
  for (const row of db.prepare('SELECT user_id,reason,banned_until FROM blacklist ORDER BY user_id').safeIntegers().all()) {
    if (!ids.has(String(row.user_id))) { issue(row.user_id, 'blacklist', row.user_id); continue; }
    bans.push([String(row.user_id), row.reason, row.banned_until === null ? null : String(row.banned_until)]);
  }
  return { cards, bans, roles, memberships, issues };
}
async function projectFinance(connection, db, runId, ceilings) {
  const data = buildFinanceProjection(db, ceilings);
  await connection.beginTransaction();
  try {
    const [[control]] = await connection.query('SELECT runtime_active,projection_run_id FROM runtime_control WHERE id=1 FOR UPDATE');
    if (!control || control.runtime_active || control.projection_run_id !== runId) throw new Error('Finance import requires the matching inactive projection');
    const [[operations]] = await connection.query('SELECT COUNT(*) AS n FROM wallet_operations');
    if (Number(operations.n)) throw new Error('Refusing to replace live finance controls');
    for (const table of ['player_roles','player_bans','player_cards','role_catalog']) await connection.query('DELETE FROM ' + table);
    const statements = [
      ['INSERT INTO role_catalog(id,name,priority) VALUES ?', data.roles],
      ['INSERT INTO player_cards(player_id,card_number,account_level,transfers_blocked,account_blocked,transfer_ceiling) VALUES ?', data.cards],
      ['INSERT INTO player_bans(player_id,reason,banned_until) VALUES ?', data.bans],
      ['INSERT INTO player_roles(player_id,role_id,role_order,original_value_json) VALUES ?', data.memberships],
    ];
    for (const [sql, rows] of statements) for (let i=0;i<rows.length;i+=200) await connection.query(sql,[rows.slice(i,i+200)]);
    await connection.query('DELETE FROM migration_issues WHERE run_id=? AND issue_code=?',[runId,'INVALID_FINANCE_REFERENCE']);
    if (data.issues.length) await connection.query('INSERT INTO migration_issues(run_id,issue_code,record_key,details_json) VALUES ?', [data.issues.map(row=>[runId,...row])]);
    await verifyRows(connection,'SELECT player_id,card_number,account_level,transfers_blocked,account_blocked,transfer_ceiling FROM player_cards',data.cards);
    await verifyRows(connection,'SELECT player_id,reason,banned_until FROM player_bans',data.bans,[2]);
    await verifyRows(connection,'SELECT id,name,priority FROM role_catalog',data.roles);
    await verifyRows(connection,'SELECT player_id,role_id,role_order,original_value_json FROM player_roles',data.memberships);
    await connection.commit();
    return { cards:data.cards.length,bans:data.bans.length,roles:data.roles.length,memberships:data.memberships.length,issues:data.issues.length };
  } catch(e) { await connection.rollback(); throw e; }
}
module.exports = { legacyCeilings, buildFinanceProjection, projectFinance };
