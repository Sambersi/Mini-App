'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createStartupTasks}=require('../src/runtime/startupTasks');
test('startup tasks restore state sequentially and run once before callers proceed',async()=>{
  const tasks=createStartupTasks(),events=[];
  tasks.add('first',async()=>{await Promise.resolve();events.push('first');});
  tasks.add('second',async()=>events.push('second'));
  const first=tasks.run(),second=tasks.run();assert.equal(first,second);await first;
  assert.deepEqual(events,['first','second']);assert.throws(()=>tasks.add('late',async()=>{}),/completed/);
});
test('failed state restoration prevents later startup tasks',async()=>{
  const tasks=createStartupTasks(),events=[];
  tasks.add('broken',async()=>{throw new Error('restoration failed');});tasks.add('later',async()=>events.push('later'));
  await assert.rejects(tasks.run(),/restoration failed/);assert.deepEqual(events,[]);
});
