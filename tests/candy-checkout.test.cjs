'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createCandyCheckout}=require('../src/telegram/candyCheckout');
test('candy checkout notifies only after commit and preserves its event key',async()=>{
  const events=[];const handler=createCandyCheckout({sku:'fortuneTicket',purchase:async input=>{assert.equal(input.operationKey,'telegram:123:7');events.push('commit');return {reward:'Ticket',cost:250};},menu:async()=>events.push('menu')});
  await handler({from:{id:123},update:{update_id:7},answerCbQuery:async()=>events.push('answer')});assert.deepEqual(events,['commit','answer','menu']);
});
