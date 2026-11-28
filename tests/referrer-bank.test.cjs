'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {scaled,decimal,getReferrerBankPercent}=require('../src/services/referrerBank');
test('referrer bank decimals and tier boundaries remain exact',()=>{
  assert.equal(decimal(scaled('24999.500000000000000000000000000001')),'24999.500000000000000000000000000001');
  assert.deepEqual([0,20,21,40,41,60,61,80,81].map(getReferrerBankPercent),[0.1,0.1,0.2,0.2,0.3,0.3,0.4,0.4,0.5]);assert.equal(999n*scaled(0.1)/(100n*10n**30n),0n);assert.equal(1000n*scaled(0.1)/(100n*10n**30n),1n);
});
