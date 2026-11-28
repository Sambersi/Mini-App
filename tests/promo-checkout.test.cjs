'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createPromoCheckout}=require('../src/telegram/promoCheckout');
test('promo reply follows commit and replay does not repeat external log',async()=>{
  for(const replayed of [false,true]){const events=[];const handler=createPromoCheckout({redeem:async input=>{assert.equal(input.name,'Fixture');assert.equal(input.operationKey,'telegram:123:4');events.push('commit');return {prizeAmount:100,prizeType:'balance',candyBonus:2,replayed};},notify:async()=>events.push('notify')});await handler({message:{text:'промо Fixture'},from:{id:123},update:{update_id:4},reply:async()=>events.push('reply')});assert.deepEqual(events,replayed?['commit','reply']:['commit','reply','notify']);}
});
