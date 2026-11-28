'use strict';
const escape=value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
function createWeaponCheckout({purchase,menu,format}){return async ctx=>{
  const update=ctx.update?.update_id;if(!Number.isSafeInteger(update))return ctx.reply('Не удалось определить событие. Нажмите кнопку ещё раз.');
  let result;
  try{result=await purchase({playerId:String(ctx.from.id),weaponId:ctx.match[1],operationKey:'telegram:'+ctx.from.id+':'+update});}
  catch(error){const messages={PLAYER_MISSING:'Пользователь не найден.',WEAPON_UNAVAILABLE:'Оружие не найдено.',ALREADY_OWNED:'Это оружие уже куплено.',INSUFFICIENT_FUNDS:'Недостаточно PF для покупки оружия.',WEAPON_CURRENCY_UNSUPPORTED:'Оружие недоступно для покупки.'};return ctx.reply('❌ '+(messages[error.code]||'Произошла ошибка при покупке оружия.'));}
  if(result.replayed)return ctx.reply('⚠️ Эта покупка оружия уже выполнена.');
  await ctx.replyWithHTML(`🛒 <b>Покупка завершена!</b>\n\n🔫 Вы купили: <b>${escape(result.weapon.name)}</b>\n➖ Списано с баланса: -<b>${format(result.price)} PF</b>\n💰 Оставшийся баланс PF: <b>${format(result.balance)}</b>`,{reply_markup:{inline_keyboard:[[{text:'🔫 Применить оружие',callback_data:'change_weapon'}],[{text:'Закрыть',callback_data:'close_energy_info'}]]}});
  return menu(ctx);
};}
module.exports={createWeaponCheckout};
