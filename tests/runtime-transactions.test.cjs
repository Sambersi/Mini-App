'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createDatabaseRuntime}=require('../src/db/runtime');
function fixture(){const events=[];const c={beginTransaction:async()=>events.push('begin'),commit:async()=>events.push('commit'),rollback:async()=>events.push('rollback'),release:()=>events.push('release'),execute:async sql=>{events.push(sql);return [[{value:1}]];},query:async sql=>{events.push(sql);return [[]];}};const pool={getConnection:async()=>c,execute:async()=>{throw new Error('Transaction escaped to pool');}};return {runtime:createDatabaseRuntime(pool),events};}
test('runtime routes nested async repository calls to one transaction connection',async()=>{
  const {runtime,events}=fixture();
  await runtime.transaction(async()=>{await runtime.one('read');await Promise.resolve();await runtime.many('read-more');});
  assert.deepEqual(events,['begin','read','read-more','commit','release']);
});
test('nested operation rolls back to savepoint when its error is handled by the outer service',async()=>{
  const {runtime,events}=fixture();
  await runtime.transaction(async()=>{await runtime.one('outer');await assert.rejects(runtime.transaction(async()=>{await runtime.one('inner');throw new Error('failed');}),/failed/);await runtime.one('continue');});
  assert.deepEqual(events,['begin','outer','SAVEPOINT nested_1','inner','ROLLBACK TO SAVEPOINT nested_1','RELEASE SAVEPOINT nested_1','continue','commit','release']);
});
test('unhandled nested error rolls back the entire operation',async()=>{
  const {runtime,events}=fixture();
  await assert.rejects(runtime.transaction(()=>runtime.transaction(async()=>{throw new Error('failed');})),/failed/);
  assert.equal(events.includes('commit'),false);assert.deepEqual(events.slice(-2),['rollback','release']);
});
