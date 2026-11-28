'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createFinanceLogs}=require('../src/repositories/financeLogs');
test('audit SQL errors are sanitized outside a transaction and propagate within it',async()=>{
  const failure=Object.assign(new Error('fixture sensitive SQL text'),{code:'ER_BAD_FIELD_ERROR'});
  for(const active of [false,true]){const logs=createFinanceLogs({execute:async()=>{throw failure;},inTransaction:()=>active});const call=logs.logFinance({type:'fixture',actorUserId:'1'});if(active)await assert.rejects(call,error=>error===failure);else assert.deepEqual(await call,{success:false,error:'FINANCE_LOG_WRITE_FAILED'});}
});
test('scheduled cleanup awaits each task and stops on failure',async()=>{
  const events=[],logs=createFinanceLogs({execute:async sql=>{events.push(sql);throw new Error('fixture_failure');}},{cleanupOldMessageLogs:async()=>events.push('message')});await assert.rejects(logs.runLogsCleanup(),/fixture_failure/);assert.equal(events[0],'message');assert.equal(events.length,2);
});
