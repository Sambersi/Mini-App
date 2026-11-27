'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {signedAmount,calculateAdjustment}=require('../src/services/balanceAdjustment');
test('wallet adjustments retain exact signed amounts and reject rounded input',()=>{
  assert.equal(signedAmount('-9007199254740993'),-9007199254740993n);
  for(const value of [9007199254740992,1.5,'1e3','-9223372036854775808',undefined])assert.throws(()=>signedAmount(value),{code:'AMOUNT_INVALID'});
});
test('credit caps never remove an existing above-limit balance and debits keep the excess',()=>{
  assert.deepEqual(calculateAdjustment(150n,10n,100n),{newBalance:'150',applied:'0',limited:true});
  assert.deepEqual(calculateAdjustment(150n,-10n,100n),{newBalance:'140',applied:'-10',limited:false});
  assert.deepEqual(calculateAdjustment(90n,20n,100n),{newBalance:'100',applied:'10',limited:true});
  assert.throws(()=>calculateAdjustment(9n,-10n),{code:'INSUFFICIENT_FUNDS'});
  assert.throws(()=>calculateAdjustment(9223372036854775807n,1n),{code:'WALLET_OVERFLOW'});
});
