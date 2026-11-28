'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createContainerCheckout}=require('../src/telegram/containerCheckout');
test('container checkout rejects partial numbers and binds a stable Telegram key',async()=>{
  const requests=[],handler=createContainerCheckout(async input=>{requests.push(input);return {name:'CLASSIC',quantity:'2',price:'20000',currency:'PF'};});
  const ctx={message:{text:'контейнер купить 1x 2'},from:{id:123},update:{update_id:42},reply:async()=>{}};
  await handler(ctx);assert.equal(requests.length,0);ctx.message.text='контейнер купить 1 2';await handler(ctx);assert.equal(requests[0].operationKey,'telegram:123:42');assert.equal(requests[0].quantity,'2');
});
