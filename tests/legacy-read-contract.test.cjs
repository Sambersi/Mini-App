'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {compatibleNumber,createLegacyReads}=require('../src/repositories/legacyReads');
test('read adapter keeps old small numeric types while refusing precision loss',()=>{
  assert.equal(compatibleNumber('42'),42);assert.equal(compatibleNumber('42.000000000000'),42);
  assert.equal(compatibleNumber('9007199254740993'),'9007199254740993');
  assert.equal(compatibleNumber(null),null);assert.equal(compatibleNumber('0.123456789012345678901'),'0.123456789012345678901');
});
test('legacy role and catalog reads use dedicated normalized tables',async()=>{
  const queries=[];const runtime={many:async(sql)=>{queries.push(sql);return sql.includes('c.name')?[{name:'Fixture'}]:[{id:'1',price:'100.000000',stock:'2'}];},one:async()=>({stock:'2',max_stock:'3'})};
  const api=createLegacyReads(runtime);
  assert.deepEqual(await api.getUserStatusesSync('1'),['Fixture']);
  assert.equal((await api.getAllSkins())[0].id,1);assert.equal((await api.getAllSkins())[0].price,100);
  assert.deepEqual(await api.getSkinStock(1),{stock:2,max_stock:3});
  assert.ok(queries[0].includes('role_catalog'));
});
