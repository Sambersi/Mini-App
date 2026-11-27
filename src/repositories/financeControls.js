'use strict';

async function lockControls(connection, ids) {
  const result = new Map();
  for (const id of [...new Set(ids)].sort()) {
    const [[row]] = await connection.execute('SELECT * FROM player_cards WHERE player_id=? FOR UPDATE', [id]);
    if (!row) throw Object.assign(new Error('Finance controls missing'), { code: 'FINANCE_CONTROLS_MISSING' });
    result.set(id, row);
  }
  return result;
}
async function getBan(connection, id) {
  const [[row]] = await connection.execute('SELECT banned_until FROM player_bans WHERE player_id=? FOR UPDATE', [id]);
  return row;
}
async function techAdmin(connection, id) {
  const [[row]] = await connection.execute('SELECT 1 AS found FROM player_roles r JOIN role_catalog c ON c.id=r.role_id WHERE r.player_id=? AND c.name=? LIMIT 1', [id, 'Тех администратор']);
  return !!row;
}
async function lockTotal(connection, id) {
  const [rows] = await connection.execute('SELECT balance FROM wallets WHERE player_id=? AND asset=? ORDER BY bucket FOR UPDATE', [id, 'PF']);
  return rows.reduce((sum, row) => sum + BigInt(row.balance), 0n);
}
module.exports = { lockControls, getBan, techAdmin, lockTotal };
