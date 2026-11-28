'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createCardOperations,operationKey}=require('../src/telegram/cardOperations');
test('bank retries bind to the Telegram update rather than a new random key',()=>{
  const ctx={from:{id:123},update:{update_id:456}};
  assert.equal(operationKey(ctx,'transfer'),'card:123:transfer:456');
  assert.throws(()=>operationKey({from:{id:123}},'transfer'),{code:'UPDATE_ID_REQUIRED'});
});
test('bank adapter preserves all and notifies after the committed result',async()=>{
  const events=[];const operation=createCardOperations({perform:async request=>{assert.equal(request.amountText,'всё');events.push('commit');return {amount:'9007199254740993',toBalance:'9007199254740993'};},notify:async()=>events.push('notify')});
  await operation({from:{id:123},update:{update_id:456},reply:async()=>events.push('reply')},{kind:'transfer',recipientId:'789',amountText:'всё'});
  assert.deepEqual(events,['commit','reply','notify']);
});
