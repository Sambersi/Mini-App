'use strict';
function createPromoCheckout({redeem,notify=async()=>{},describePlayer=async()=>''}){return async ctx=>{
  const parts=(ctx.message?.text||'').trim().split(/\s+/);if(parts.length!==2||parts[0].toLowerCase()!=='промо')return ctx.reply('❕ Использование: промо [название]');
  const update=ctx.update?.update_id;if(!Number.isSafeInteger(update))throw new Error('Telegram update ID required');
  let result;
  try{result=await redeem({playerId:String(ctx.from.id),name:parts[1],operationKey:'telegram:'+ctx.from.id+':'+update});}
  catch(error){const messages={PROMO_NOT_FOUND:'Промокод не найден.',PROMO_ALREADY_ACTIVATED:'Вы уже активировали этот код.',PROMO_EXPIRED:'Срок действия промокода истек.',PROMO_EXHAUSTED:'Активации исчерпаны.',PROMO_ROLE_DENIED:'Недостаточный статус.',PROMO_AUDIENCE_DENIED:'Код доступен только рефералам конкретного партнёра.'};return ctx.reply('❕ '+(messages[error.code]||'Активация не завершена. Попробуйте позже.'));}
  const labels={balance:'PF',df_balance:'DF',npf_shares:'NPF-акция',tickets:'Билетики',container_type_3:'GOLD-контейнер'};
  const link=await describePlayer(ctx);
  await ctx.reply(`✅ ${link?link+', ':''}промокод активирован!\n▫️ Получено: ${BigInt(result.prizeAmount).toLocaleString('ru-RU')} ${labels[result.prizeType]||result.prizeType}${result.candyBonus?'\n🍬 +'+result.candyBonus+' конфет бонусом!':''}`,{parse_mode:'HTML'});
  if(!result.replayed)try{await notify(ctx,result,link);}catch{}
  return result;
};}
module.exports={createPromoCheckout};
