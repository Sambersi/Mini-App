'use strict';
function createAttackUpgradeHandler({upgrade,getUserById,isHyperlinkDisabled,link,format,now=()=>Date.now()}){return async ctx=>{
  const id=String(ctx.from.id),update=ctx.update?.update_id;if(!Number.isSafeInteger(update))return ctx.reply('Не удалось определить событие. Нажмите кнопку ещё раз.');
  const user=await getUserById(id);if(!user)return ctx.reply('❌ Пользователь не найден.');
  const userLink=link(id,user.username,await isHyperlinkDisabled(id));let result;
  try{result=await upgrade({playerId:id,operationKey:'telegram:'+id+':'+update});}
  catch(error){
    if(error.code==='INSUFFICIENT_FUNDS')return ctx.reply(`❌ ${userLink}, недостаточно PF для повышения силы урона. Требуется ${format(error.details.price)} PF.`,{parse_mode:'HTML'});
    if(error.code==='ENERGY_EMPTY'){
      const left=Math.max(0,Math.ceil(error.details.nextRestoreTime-now()/1000));
      return ctx.replyWithHTML(`❌ ${userLink}, у вас недостаточно энергии для улучшения силы урона. Подождите, пока она восстановится.\n\n⚡️ Текущая энергия: <b>${error.details.energy}/${error.details.maxEnergy}</b>\n⏳ Пополнение энергии: <b>${Math.floor(left/60)} мин ${left%60} сек</b>`,{reply_markup:{inline_keyboard:[[{text:'↩️ Назад в меню',callback_data:'back_to_menu'}]]}});
    }
    return ctx.reply('Произошла ошибка при попытке улучшить силу урона.');
  }
  if(result.replayed)return ctx.reply('⚠️ Это повышение силы уже выполнено.');
  return ctx.replyWithHTML(`⚔️ ${userLink}, сила урона успешно повышена!\n\n➖ Списано с баланса: -<b>${format(result.price)} PF</b>\n\n⚔️ Текущая сила урона: <b>${result.attackPower}</b>\n💰 Оставшийся баланс PF: <b>${format(result.balance)}</b>\n⚡️ Энергия: <b>${result.energy}/${result.maxEnergy}</b>`,{reply_markup:{inline_keyboard:[[{text:`💪 Прокачать удар атаки (${format(String(BigInt(result.attackPower)*100n))} PF)`,callback_data:'upgrade_attack_power'}]]}});
};}
module.exports={createAttackUpgradeHandler};
