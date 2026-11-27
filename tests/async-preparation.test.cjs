'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {audit}=require('../scripts/audit-db-calls.cjs');
const {addAwaits}=require('../scripts/prepare-async-db.cjs');
test('async preparation preserves member access, comments and already awaited calls',()=>{
  const source="const {getUserById}=require('../db'); // retained\nasync function run(){ const name=getUserById('1').name; await getUserById('2'); } function later(){return getUserById('3');}";
  const report=audit(['handlers/fixture.js'],{readSource:()=>source});
  const result=addAwaits(source,report.calls);
  assert.ok(result.includes("(await getUserById('1')).name"));assert.ok(result.includes("await getUserById('2')"));
  assert.ok(result.includes("function later(){return getUserById('3');}"));assert.ok(result.includes('// retained'));
});
test('async preparation never inserts await into parameter defaults',()=>{
  const source="const {getUserById}=require('../db'); async function run(value=getUserById('1')){return value;}";
  const report=audit(['handlers/fixture.js'],{readSource:()=>source});assert.equal(addAwaits(source,report.calls),source);
});
