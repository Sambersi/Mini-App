'use strict';
function createContainerCheckout(purchase){return async ctx=>{
  const parts=(ctx.message?.text||'').trim().toLowerCase().split(/\s+/);
  if(parts.length!==4||parts[1]!=='купить'||! /^[123]$/.test(parts[2])||! /^\d+$/.test(parts[3]))return ctx.reply('❕ Использование: контейнер купить [номер 1–3] [количество]');
  const update=ctx.update?.update_id;if(!Number.isSafeInteger(update))throw new Error('Telegram update ID required');
  let result;
  try{result=await purchase({playerId:String(ctx.from.id),type:Number(parts[2]),quantity:parts[3],operationKey:'telegram:'+ctx.from.id+':'+update});}
  catch(error){const messages={INSUFFICIENT_FUNDS:'Недостаточно средств.',INVENTORY_LIMIT:'Превышен лимит контейнеров вашего статуса.',AMOUNT_INVALID:'Укажите корректное положительное количество.',PLAYER_MISSING:'Вы ещё не зарегистрированы.'};return ctx.reply('⚠️ '+(messages[error.code]||'Покупка не завершена. Попробуйте позже.'));}
  return ctx.reply(`✔️ Вы успешно купили ${result.quantity} ${result.name} контейнера за ${BigInt(result.price).toLocaleString('ru-RU')} ${result.currency}.`);
};}
module.exports={createContainerCheckout};
