'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {Telegraf}=require('telegraf');
const {installStarsHandlers,invoiceInput}=require('../src/telegram/starsHandlers');
const payment={currency:'XTR',total_amount:10,invoice_payload:'10_stars',telegram_payment_charge_id:'fixture_charge'};
test('Stars invoices bind currency, amount, actor and successful charge to Telegram fields',()=>{
  assert.equal(invoiceInput({id:123},payment,{chargeId:payment.telegram_payment_charge_id}).playerId,'123');
  assert.throws(()=>invoiceInput({id:123},{...payment,invoice_payload:'11_stars'}),{code:'PAYMENT_INVOICE_MISMATCH'});
  assert.throws(()=>invoiceInput({id:123},{...payment,currency:'USD'}),{code:'PAYMENT_CURRENCY_INVALID'});
  assert.throws(()=>invoiceInput({id:123},payment,{chargeId:undefined}),{code:'PAYMENT_CHARGE_INVALID'});
});
test('Stars middleware handles payment before post capture and notifies only after commit',async()=>{
  const events=[],bot=new Telegraf('fixture');
  bot.botInfo={id:1,is_bot:true,username:'fixture_bot',first_name:'Fixture'};
  installStarsHandlers(bot,{processPayment:async input=>{assert.equal(input.chargeId,'fixture_charge');events.push('commit');return {reward:'100',stars:'10',referrerId:'456',referrerBonus:'10'};},findPlayer:async()=>({}),notifyDonation:async()=>events.push('donation_log'),log:{warn:()=>events.push('warning')}});
  bot.on('message',()=>events.push('post_capture'));
  // Build a real Telegraf middleware context with Telegram sends stubbed.
  const update={update_id:1,message:{message_id:1,date:1,from:{id:123,is_bot:false,first_name:'Fixture'},chat:{id:123,type:'private'},successful_payment:payment}};
  const ctx=new bot.options.contextType(update,bot.telegram,bot.botInfo);
  ctx.telegram.sendMessage=async()=>{events.push('referrer');throw Error('blocked');};ctx.replyWithHTML=async()=>events.push('reply');
  await bot.middleware()(ctx,()=>Promise.resolve());
  assert.deepEqual(events,['commit','referrer','warning','donation_log','reply','reply']);
});
test('replayed payments send no second notification and failed commits send no success',async()=>{
  for(const replayed of [true,false]){
    const handlers={},events=[];
    installStarsHandlers({on:(name,handler)=>handlers[name]=handler},{processPayment:async()=>{if(!replayed)throw Error('DB failed');return {replayed:true};},notifyDonation:async()=>events.push('notify')});
    const ctx={from:{id:123},message:{successful_payment:payment},replyWithHTML:async()=>events.push('reply')};
    if(replayed)await handlers.successful_payment(ctx);else await assert.rejects(handlers.successful_payment(ctx));
    assert.deepEqual(events,[]);
  }
});

test('pre-checkout refuses a mismatched invoice or missing player and approves a valid profile',async()=>{
  for(const state of ['valid','missing','invalid']){
    const handlers={},answers=[];
    installStarsHandlers({on:(name,handler)=>handlers[name]=handler},{findPlayer:async()=>state==='missing'?null:{id:'123'}});
    const ctx={from:{id:123},preCheckoutQuery:state==='invalid'?{...payment,invoice_payload:'11_stars'}:payment,answerPreCheckoutQuery:async value=>answers.push(value)};
    await handlers.pre_checkout_query(ctx);assert.deepEqual(answers,[state==='valid']);
  }
});
