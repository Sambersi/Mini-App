'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {percentage,normalizePayment}=require('../src/services/telegramPayments');
test('Stars payment validation rejects untrusted currencies, missing charge IDs and overflowing awards',()=>{
  const base={currency:'XTR',chargeId:'fixture-charge',playerId:'900000011',invoicePayload:'fixture',stars:10};
  assert.equal(normalizePayment(base).stars,'10');
  for(const changed of [{currency:'USD'},{chargeId:''},{stars:0},{stars:9007199254740992},{stars:'922337203685477581'},{playerId:'not-a-telegram-id'}])assert.throws(()=>normalizePayment({...base,...changed}));
});
test('referral percentages use exact integer division without floating point rounding',()=>{
  const rate=percentage('12.5');assert.equal(101n*rate.numerator/rate.denominator,12n);
  assert.equal(10n*percentage(15).numerator/percentage(15).denominator,1n);
  for(const value of [-1,101,'NaN','1e2'])assert.throws(()=>percentage(value),{code:'DONATION_RATE_INVALID'});
});
