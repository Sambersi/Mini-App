'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {serialNumber,createSkinPurchase}=require('../src/services/skinPurchase');
test('skin serial format preserves existing numbering and exact large counters',()=>{
  assert.equal(serialNumber(7,12),'0007-00000012');assert.equal(serialNumber('7',9007199254740993n),'0007-9007199254740993');
});
test('skin purchase validates identities before any database access',async()=>{
  const purchase=createSkinPurchase({getConnection:async()=>assert.fail('Invalid request must not connect')});
  for(const request of [{operationKey:'invalid key',playerId:'1',skinId:1},{operationKey:'ok',playerId:'',skinId:1},{operationKey:'ok',playerId:'1',skinId:0}])await assert.rejects(purchase(request));
});
