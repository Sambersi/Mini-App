'use strict';

const assert = require('node:assert/strict');
const { readMysqlConfig } = require('../src/db/mysql');
const { applyFoundation } = require('../src/db/migrate');
const { moveWalletFunds } = require('../src/services/walletMovement');
const { createCardFinance } = require('../src/services/cardFinance');
const { createSessionsRepository } = require('../src/repositories/sessions');

function testConfig(env) {
  if (!env.MYSQL_TEST_DATABASE || env.MYSQL_TEST_DATABASE === env.MYSQL_DATABASE || !/^[a-zA-Z0-9_]+_checks$/.test(env.MYSQL_TEST_DATABASE)) {
    throw Object.assign(new Error('Separate checks database required'), { code: 'TEST_DATABASE_REQUIRED' });
  }
  return readMysqlConfig({ ...env, MYSQL_DATABASE: env.MYSQL_TEST_DATABASE,
    MYSQL_USER: env.MYSQL_TEST_USER, MYSQL_PASSWORD: env.MYSQL_TEST_PASSWORD });
}

async function runWalletChecks(env = process.env) {
  const pool = require('mysql2/promise').createPool(testConfig(env));
  let checks = 0, seeded = false;
  const a = { playerId: 'fixture_a', asset: 'PF', bucket: 'main' };
  const b = { playerId: 'fixture_b', asset: 'PF', bucket: 'card' };
  const request = (operationKey, amount, extra = {}) => ({ operationKey, from: a, to: b, amount, ...extra });
  const balance = async id => { const [[r]] = await pool.execute('SELECT balance FROM wallets WHERE player_id=? AND bucket=?', [id,id===a.playerId?'main':'card']); return String(r.balance); };
  const count = async table => { const [[r]] = await pool.query('SELECT COUNT(*) AS n FROM ' + table); return Number(r.n); };
  const reset = async (x = '100', y = '0') => {
    await pool.query('DELETE FROM wallet_entries');
    await pool.query('DELETE FROM wallet_operations');
    await pool.execute('UPDATE wallets SET balance=? WHERE player_id=?', [x, a.playerId]);
    await pool.execute('UPDATE wallets SET balance=? WHERE player_id=?', [y, b.playerId]);
  };
  try {
    const c = await pool.getConnection();
    try { await applyFoundation(c); } finally { c.release(); }
    assert.equal(await count('players'), 0, 'Checks database must have no players');
    assert.equal(await count('wallet_operations'), 0);
    await pool.execute('INSERT INTO migration_runs(run_id,snapshot_sha256,metadata_json,status) VALUES (?,?,?,?)', ['wallet_fixture', '0'.repeat(64), '{}', 'test']);
    seeded = true;
    for (const w of [a, b]) {
      await pool.execute('INSERT INTO players(telegram_id,display_name,registered,source_run_id) VALUES (?,?,1,?)', [w.playerId, 'Fixture', 'wallet_fixture']);
      await pool.execute('INSERT INTO wallets(player_id,asset,bucket,balance) VALUES (?,?,?,0)', [w.playerId, w.asset, w.bucket]);
    }
    await reset('9007199254740993');
    const exact = await moveWalletFunds(pool, request('exact', '9007199254740993'));
    assert.equal(exact.amount, '9007199254740993'); assert.equal(await balance(a.playerId), '0'); checks++;
    assert.deepEqual(await moveWalletFunds(pool, request('exact', '9007199254740993')), exact);
    assert.equal(await count('wallet_entries'), 2); checks++;
    await assert.rejects(moveWalletFunds(pool, request('exact', '1')), { code: 'OPERATION_KEY_CONFLICT' }); checks++;
    await reset();
    const limited = await moveWalletFunds(pool, request('limited', '80', { destinationLimit: '30' }));
    assert.equal(limited.amount, '30'); assert.equal(limited.limited, true); assert.equal(await balance(a.playerId), '70'); checks++;
    await reset();
    await assert.rejects(moveWalletFunds(pool, request('poor', '101')), { code: 'INSUFFICIENT_FUNDS' });
    assert.equal(await count('wallet_operations'), 0); assert.equal(await balance(a.playerId), '100'); checks++;
    // Force an actual SQL failure after debit+entry, before credit can succeed.
    await pool.execute('INSERT INTO wallet_entries(operation_key,player_id,asset,bucket,amount,entry_type,source_run_id) VALUES (?,?,?,?,0,?,NULL)', ['move:rollback:credit', b.playerId, b.asset, b.bucket, 'fixture']);
    await assert.rejects(moveWalletFunds(pool, request('rollback', '10')), { code: 'ER_DUP_ENTRY' });
    assert.equal(await balance(a.playerId), '100'); assert.equal(await balance(b.playerId), '0');
    assert.equal(await count('wallet_entries'), 1); assert.equal(await count('wallet_operations'), 0); checks++;
    await reset();
    const duplicates = await Promise.all(Array.from({ length: 20 }, () => moveWalletFunds(pool, request('same', '10'))));
    assert.ok(duplicates.every(r => r.amount === '10')); assert.equal(await balance(a.playerId), '90');
    assert.equal(await count('wallet_entries'), 2); checks++;
    await reset();
    const competing = await Promise.allSettled(Array.from({ length: 20 }, (_, i) => moveWalletFunds(pool, request('race_' + i, '10'))));
    assert.equal(competing.filter(r => r.status === 'fulfilled').length, 10);
    assert.ok(competing.filter(r => r.status === 'rejected').every(r => r.reason.code === 'INSUFFICIENT_FUNDS'));
    assert.equal(await balance(a.playerId), '0'); assert.equal(await balance(b.playerId), '100');
    assert.equal(await count('wallet_entries'), 20); checks++;
    await reset();
    const all = await moveWalletFunds(pool, request('all', 'all'));
    assert.equal(all.amount, '100'); assert.equal(await balance(a.playerId), '0'); checks++;
    await reset('10', '9223372036854775806');
    const overflow = await moveWalletFunds(pool, request('overflow', '10'));
    assert.equal(overflow.amount, '1'); assert.equal(await balance(b.playerId), '9223372036854775807'); checks++;
    await reset('10000','0');
    await pool.execute('INSERT INTO wallets(player_id,asset,bucket,balance) VALUES (?,?,?,0)',[a.playerId,'PF','card']);
    for(const id of [a.playerId,b.playerId]) await pool.execute('INSERT INTO player_cards(player_id,card_number,account_level) VALUES (?,?,1)',[id,'test-'+id]);
    const finance=createCardFinance(pool,{now:()=>100000});
    const topup={kind:'topup',playerId:a.playerId,amountText:'2к',operationKey:'finance-topup'};
    const topped=await finance(topup);assert.equal(topped.amount,'2000');assert.equal(await balance(a.playerId),'8000');checks++;
    assert.deepEqual(await finance(topup),topped);assert.equal(await balance(a.playerId),'8000');checks++;
    await pool.execute('UPDATE wallets SET balance=? WHERE player_id=? AND bucket=?',['139999999',a.playerId,'main']);
    const withdrawn=await finance({kind:'withdraw',playerId:a.playerId,amountText:'100',operationKey:'finance-withdraw'});
    assert.equal(withdrawn.amount,'1');assert.equal(await balance(a.playerId),'140000000');checks++;
    const transfer={kind:'transfer',playerId:a.playerId,recipientId:b.playerId,amountText:'10',operationKey:'finance-transfer'};
    await assert.rejects(finance(transfer),{code:'TRANSFER_CEILING'});checks++;
    const adminFinance=createCardFinance(pool,{mainAdmin:a.playerId,now:()=>100000});
    assert.equal((await adminFinance(transfer)).amount,'10');checks++;
    await pool.execute('UPDATE player_cards SET transfers_blocked=1 WHERE player_id=?',[a.playerId]);
    await assert.rejects(adminFinance({...transfer,operationKey:'blocked-admin'}),{code:'SENDER_TRANSFERS_BLOCKED'});checks++;
    await pool.execute('UPDATE player_cards SET transfers_blocked=0 WHERE player_id=?',[a.playerId]);
    await pool.execute('INSERT INTO player_bans(player_id,reason,banned_until) VALUES (?,?,NULL)',[b.playerId,'test']);
    await assert.rejects(adminFinance({...transfer,operationKey:'banned-recipient'}),{code:'RECIPIENT_BANNED'});checks++;
    await pool.execute('UPDATE player_bans SET banned_until=99 WHERE player_id=?',[b.playerId]);
    assert.equal((await adminFinance({...transfer,operationKey:'expired-ban'})).amount,'10');checks++;
    await pool.execute('UPDATE player_cards SET card_number=NULL WHERE player_id=?',[b.playerId]);
    await assert.rejects(adminFinance({...transfer,operationKey:'missing-card'}),{code:'RECIPIENT_CARD_REQUIRED'});checks++;
    let clock=1000000000;
    const sessions=createSessionsRepository(pool,{now:()=>clock});
    const sessionId='900000001';
    assert.deepEqual(await sessions.getRegistrationSession(sessionId),{});checks++;
    await sessions.saveRegistrationSession(sessionId,{step:'agreement',attempts:2});
    clock+=1000;
    await sessions.saveRegistrationSession(sessionId,{step:'captcha',attempts:3});
    assert.deepEqual(await sessions.getRegistrationSession(sessionId),{step:'captcha',attempts:3});
    const [[started]]=await pool.execute('SELECT started_at FROM registration_sessions WHERE user_id=?',[sessionId]);
    assert.equal(String(started.started_at),'1000000');checks++;
    clock+=24*60*60*1000+1;
    assert.deepEqual(await sessions.getRegistrationSession(sessionId),{});checks++;
    await sessions.saveRegistrationSession(sessionId,{step:'new'});
    const {resetRegistrationSession}=sessions;
    await resetRegistrationSession(sessionId);assert.deepEqual(await sessions.getRegistrationSession(sessionId),{});checks++;
    await sessions.saveSkinShopSession(sessionId,{page:3,selected:[1,2]});
    assert.deepEqual(await sessions.getSkinShopSession(sessionId),{page:3,selected:[1,2]});checks++;
    await Promise.all(Array.from({length:10},(_,i)=>sessions.saveSkinShopSession(sessionId,{page:i})));
    assert.equal(typeof (await sessions.getSkinShopSession(sessionId)).page,'number');checks++;
    await sessions.destroySkinShopSession(sessionId);assert.deepEqual(await sessions.getSkinShopSession(sessionId),{});checks++;
    return { checks, concurrentRequests: 20, activeStorage: 'sqlite', isolatedDatabase: true };
  } finally {
    try {
      if (seeded) {
        await pool.execute('DELETE FROM registration_sessions WHERE user_id=?',['900000001']);
        await pool.execute('DELETE FROM skin_shop_sessions WHERE user_id=?',['900000001']);
        await pool.query('DELETE FROM wallet_entries');
        await pool.query('DELETE FROM wallet_operations');
        await pool.query('DELETE FROM player_roles');
        await pool.query('DELETE FROM player_bans');
        await pool.query('DELETE FROM player_cards');
        await pool.query('DELETE FROM wallets');
        await pool.query('DELETE FROM players');
        await pool.execute('DELETE FROM migration_runs WHERE run_id=?', ['wallet_fixture']);
      }
    } finally { await pool.end(); }
  }
}

module.exports = { runWalletChecks, testConfig };
if (require.main === module) {
  require('dotenv').config();
  runWalletChecks().then(r => console.log('[WALLET CHECKS] VERIFIED ' + JSON.stringify(r)))
    .catch(e => { console.log('[WALLET CHECKS] FAILED ' + JSON.stringify(require('../src/db/mysql').safeMysqlError(e))); process.exitCode = 1; });
}
