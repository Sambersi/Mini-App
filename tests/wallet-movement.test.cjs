'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { normalize, integer } = require('../src/services/walletMovement');
const { withTransaction } = require('../src/db/transaction');
const { testConfig } = require('../scripts/check-wallets.cjs');
test('money rejects rounded JS numbers and preserves exact BIGINT strings', () => {
  assert.equal(integer('9007199254740993'), 9007199254740993n);
  for (const value of [9007199254740992, -1, 0.5, '1e3', '1.5', '9223372036854775808', null]) assert.throws(() => integer(value));
});
test('movement rejects invalid wallets, same wallet, cross asset, zero and unsafe operation keys', () => {
  const r = { operationKey: 'tg:1', from: {playerId:'1',asset:'PF',bucket:'main'}, to:{playerId:'1',asset:'PF',bucket:'card'}, amount:'1' };
  assert.equal(normalize(r).amount, '1');
  for (const change of [{amount:'0'}, {operationKey:'x\n'}, {to:r.from}, {to:{...r.to,asset:'DF'}}]) assert.throws(() => normalize({...r,...change}));
});
test('transaction awaits work before committing, uses one connection and releases', async () => {
  const events = [], c = {beginTransaction:async()=>events.push('begin'),commit:async()=>events.push('commit'),rollback:async()=>events.push('rollback'),release:()=>events.push('release')};
  const result = await withTransaction({getConnection:async()=>c}, async connection => {assert.equal(connection,c); await Promise.resolve();events.push('work');return 42;});
  assert.equal(result,42);assert.deepEqual(events,['begin','work','commit','release']);
});
test('failure rolls back; ambiguous commit and failed rollback destroy the connection', async () => {
  for (const mode of ['work','commit','rollback']) {
    const events=[], error=new Error(mode);
    const c={beginTransaction:async()=>{},commit:async()=>{throw error;},rollback:async()=>{events.push('rollback');if(mode==='rollback')throw error;},release:()=>events.push('release'),destroy:()=>events.push('destroy')};
    await assert.rejects(withTransaction({getConnection:async()=>c},async()=>{if(mode!=='commit')throw error;}),e=>e===error);
    assert.deepEqual(events,['rollback',mode==='work'?'release':'destroy']);
  }
});
test('integration checks require a separate explicitly named checks database', () => {
  for (const env of [{},{MYSQL_DATABASE:'s_checks',MYSQL_TEST_DATABASE:'s_checks'},{MYSQL_DATABASE:'stage',MYSQL_TEST_DATABASE:'stage'}]) assert.throws(()=>testConfig(env),{code:'TEST_DATABASE_REQUIRED'});
});
