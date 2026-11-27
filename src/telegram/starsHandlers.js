'use strict';
const {normalizePayment}=require('../services/telegramPayments');
function invoiceInput(from,invoice,{chargeId}={chargeId:'precheckout'}){
  const input={playerId:String(from?.id||''),stars:invoice?.total_amount,currency:invoice?.currency,invoicePayload:invoice?.invoice_payload,chargeId};
  const normalized=normalizePayment(input);
  if(normalized.invoicePayload!==normalized.stars+'_stars')throw Object.assign(new Error('Invoice payload mismatch'),{code:'PAYMENT_INVOICE_MISMATCH'});
  return {...normalized,chargeId};
}
function installStarsHandlers(bot,{processPayment,findPlayer,notifyDonation,log=console}){
  bot.on('pre_checkout_query',async ctx=>{
    try{
      const input=invoiceInput(ctx.from,ctx.preCheckoutQuery);
      if(!await findPlayer(input.playerId))return ctx.answerPreCheckoutQuery(false,'Профиль не найден. Откройте бота и создайте новый счёт.');
      return ctx.answerPreCheckoutQuery(true);
    }catch{
      return ctx.answerPreCheckoutQuery(false,'Не удалось проверить счёт. Создайте новый счёт в разделе доната.');
    }
  });
  bot.on('successful_payment',async ctx=>{
    try{
    const payment=ctx.message.successful_payment;
    const input=invoiceInput(ctx.from,payment,{chargeId:payment.telegram_payment_charge_id});
    const result=await processPayment(input);
    if(result.replayed)return;
    // Telegram sends happen after the award transaction commits. Failures do
    // not run the payment again, nor expose charge IDs in console output.
    if(result.referrerId){
      try{await ctx.telegram.sendMessage(result.referrerId,`☑️ Вы получили +${result.referrerBonus} DF за донат вашего реферала!${result.partner?' (Партнёрский бонус 15%)':''}`,{parse_mode:'HTML'});}
      catch{log.warn('[STARS] Referrer notification failed after commit');}
    }
    try{await notifyDonation(ctx,input.playerId,result.stars);}catch{log.warn('[STARS] Donation log notification failed after commit');}
    await ctx.replyWithHTML(`<b>😇 Спасибо!</b>\n🍩 Ваш донат на сумму ${result.stars} звезд успешно принят.`,{reply_markup:{inline_keyboard:[[{text:'📊 Статистика донатов',callback_data:'donation_stats'}]]}});
    await ctx.replyWithHTML(`🍩 Вам зачислено: <b>${result.reward} DF</b>`);
    }catch(error){
      const code=/^[A-Z0-9_]{1,64}$/.test(error.code||'')?error.code:'STARS_PROCESSING_FAILED';
      throw Object.assign(new Error('Stars processing failed'),{code});
    }
  });
}
module.exports={invoiceInput,installStarsHandlers};
