'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createMysqlApi,getApiCoverage,assertApiComplete}=require('../src/db/api');
const {runStartupChecks}=require('../src/startupChecks');
test('incomplete API refuses activation instead of falling back to SQLite for missing functions',()=>{
  const api=createMysqlApi({}),coverage=getApiCoverage(api);
  assert.ok(coverage.implemented.includes('getUserById'));assert.ok(coverage.missing.length>0);
  assert.throws(()=>assertApiComplete(api),{code:'MYSQL_API_INCOMPLETE'});
});
test('a MySQL feature flag cannot start a partially migrated runtime',async()=>{
  await assert.rejects(runStartupChecks({env:{DB_BACKEND:'mysql'},log:()=>{},snapshot:async()=>assert.fail('Readiness must be checked before touching data')}),{code:'MYSQL_API_INCOMPLETE'});
});
