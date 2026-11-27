'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {audit}=require('../scripts/audit-db-calls.cjs');
test('database call audit resolves aliases, namespace imports, awaits and missing exports',()=>{
  const sources={
    'db.js':'function getUserById(){}; module.exports={getUserById};',
    'handlers/fixture.js':"const {getUserById:find,missing}=require('../db'); const store=require('../db'); async function handler(){await find('1');store.getUserById('2');missing();}",
  };
  const report=audit(Object.keys(sources),{readSource:file=>sources[file]});
  assert.equal(report.calls.length,3);assert.equal(report.summary.unawaited,2);assert.deepEqual(report.summary.missingExports,['db.js:missing']);
});
test('database audit does not confuse a shadowing parameter with the imported function',()=>{
  const sources={'handlers/fixture.js':"const {getUserById}=require('../db'); function unrelated(getUserById){getUserById();} function actual(){getUserById('1');}"};
  const report=audit(Object.keys(sources),{readSource:file=>sources[file]});assert.equal(report.calls.length,1);assert.equal(report.calls[0].owner,'actual');
});

test('repeated requires in nested scopes do not hide the global import',()=>{
  const sources={'handlers/fixture.js':"const {getUserById}=require('../db'); const store=require('../db'); async function outer(){getUserById('1');store.getUserById('2');} async function inner(){const {getUserById}=require('../db');const store=require('../db');await getUserById('3');await store.getUserById('4');} async function direct(){return require('../db').getUserById('5');}"};
  const report=audit(Object.keys(sources),{readSource:file=>sources[file]});
  assert.equal(report.calls.length,5);assert.equal(report.summary.unawaited,3);
  assert.equal(report.calls.filter(call=>call.owner==='outer').length,2);
});
