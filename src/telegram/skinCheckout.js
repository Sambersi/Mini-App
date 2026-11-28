'use strict';
const {getSkinQuote}=require('../services/skinQuote');
function createSkinCheckout({getSession,purchase}){return async ctx=>{
  const playerId=String(ctx.from.id),token=ctx.match[1],session=await getSession(playerId);
  const quote=getSkinQuote(session,token);
  if(!quote||session?.skinShop?.initiator!==playerId)return ctx.answerCbQuery('Меню устарело. Откройте выбор скина заново.',{show_alert:true});
  try{
    const result=await purchase({playerId,skinId:quote.skinId,expectedPrice:quote.price,expectedCurrency:quote.currency,operationKey:'skin:'+playerId+':'+token});
    const keyboard=ctx.callbackQuery?.message?.reply_markup?.inline_keyboard;
    if(keyboard){try{await ctx.editMessageReplyMarkup({inline_keyboard:keyboard.map(row=>row.map(button=>button.callback_data==='buy_skin_'+token?{text:'✅ Уже куплен',callback_data:'already_owned'}:button))});}catch{}}
    await ctx.answerCbQuery('Скин куплен.');
    return ctx.reply(`☑️ Скин успешно куплен за ${result.price} ${result.currency}!\n🔖 Серийный номер: ${result.serial}`);
  }catch(error){
    const messages={SKIN_QUOTE_CHANGED:'Цена изменилась. Откройте скин заново.',SKIN_ALREADY_OWNED:'Этот скин уже куплен.',SKIN_OUT_OF_STOCK:'Скины этого типа закончились.',INSUFFICIENT_FUNDS:'Недостаточно средств.',SKIN_UNAVAILABLE:'Скин недоступен.'};
    return ctx.answerCbQuery(messages[error.code]||'Не удалось завершить покупку. Попробуйте ещё раз.',{show_alert:true});
  }
};}
module.exports={createSkinCheckout};
