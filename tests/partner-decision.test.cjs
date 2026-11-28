'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createPartnerDecisionHandler}=require('../src/telegram/partnerDecision');
test('partner decision uses authenticated actor and notifies after commit only once',async()=>{
  for(const replayed of [false,true]){const events=[];const handler=createPartnerDecisionHandler({decision:'approve',decide:async input=>{assert.equal(input.adminId,'123');events.push('commit');return {replayed,request:{id:1,partner_id:'456',name:'Fixture'},currency:'DF',amount:'10'};},updateMessage:async()=>events.push('card'),edit:async()=>events.push('reply'),link:()=> 'Fixture'});
    await handler({from:{id:123},telegram:{sendMessage:async()=>events.push('notify')}},{id:1},'spoofed');assert.deepEqual(events,replayed?['commit','reply']:['commit','card','reply','notify']);}
});
