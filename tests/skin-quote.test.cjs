'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {addSkinQuote,getSkinQuote}=require('../src/services/skinQuote');
const {createSkinCheckout}=require('../src/telegram/skinCheckout');
test('skin quote preserves product and price independently of catalog index',()=>{
  const session={},skin={id:42,price:'10.000',currency_type:'DF'};
  const token=addSkinQuote(session,skin,{now:1000,nonce:'a'.repeat(24)});skin.id=99;
  assert.equal(getSkinQuote(session,token,{now:1001}).skinId,'42');
  assert.equal(getSkinQuote(session,token,{now:1001}).price,'10');
  assert.equal(getSkinQuote(session,'0',{now:1001}),null);
  assert.equal(getSkinQuote(session,token,{now:901001}),null);
});
test('legacy purchase buttons never charge an item at a changed index',async()=>{
  let called=false;
  const checkout=createSkinCheckout({getSession:async()=>({skinShop:{initiator:'123'}}),purchase:async()=>{called=true;}});
  await checkout({from:{id:123},match:['buy_skin_0','0'],answerCbQuery:async()=>{}});assert.equal(called,false);
});
