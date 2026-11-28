'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {auditFilters,logCursor}=require('../src/repositories/auditFilters');
const {parseFinanceFilters}=require('../src/api/logsQuery');
test('audit filters bind identities and exact decimal amounts as values',()=>{
  const f=auditFilters({actorId:"1' OR 1=1 --",minAmount:'9007199254740993.125',success:false,currencies:['PF','DF']});assert.ok(!f.clauses.join(' ').includes('OR 1=1'));assert.ok(f.params.includes("1' OR 1=1 --"));assert.ok(f.params.includes('9007199254740993.125'));assert.throws(()=>auditFilters({fromTs:20,toTs:10}));assert.throws(()=>auditFilters({success:'false'}));assert.throws(()=>logCursor({ts:1,id:'1;DROP'}));
});
test('HTTP log parser preserves false and rejects ambiguous arrays',()=>{assert.deepEqual(parseFinanceFilters({success:'false',fromTs:'100',currencies:'PF,DF'}),{fromTs:100,success:false,currencies:['PF','DF']});assert.throws(()=>parseFinanceFilters({actorId:['1','2']}));});
