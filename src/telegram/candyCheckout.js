'use strict';
function createCandyCheckout({sku,purchase,menu,prefixMessage}){return async ctx=>{
  const update=ctx.update?.update_id;if(!Number.isSafeInteger(update))throw new Error('Telegram update ID required');
  let result;
  try{result=await purchase({playerId:String(ctx.from.id),sku,operationKey:'telegram:'+ctx.from.id+':'+update});}
  catch(error){const messages={INVENTORY_INSUFFICIENT:'Недостаточно конфет.',PLAYER_MISSING:'Вы не зарегистрированы.',PRODUCT_UNAVAILABLE:'Товар недоступен для покупки.',ALREADY_OWNED:'Этот предмет уже есть у вас.',DESTINATION_LIMIT:'Недостаточно места на PF-балансе.',INVENTORY_LIMIT:'Достигнут лимит контейнеров.'};return ctx.answerCbQuery('❌ '+(messages[error.code]||'Покупка не завершена. Попробуйте позже.'));}
  await ctx.answerCbQuery(`☑️ Вы получили ${result.reward} за ${result.cost} конфет!`);
  if(sku==='prefix'&&prefixMessage&&!result.replayed)try{await ctx.telegram.sendMessage(ctx.from.id,prefixMessage,{parse_mode:'HTML'});}catch{}
  return menu(ctx);
};}
module.exports={createCandyCheckout};
