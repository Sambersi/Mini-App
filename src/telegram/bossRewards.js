'use strict';
const escape=value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
function createBossRewardDistribution({settle}){return async(ctx,boss,fixedPrizeAmount)=>{
  let result;
  try{result=await settle({bossId:boss.id});}catch{return 'Не удалось подтвердить распределение призов. Повторите проверку.';}
  if(result.replayed)return 'Награды за этого босса уже распределены.';
  let report=`🏆 Отчет о раздаче призов:\nБосс: <b>${escape(result.name)}</b>\nТип приза: <b>${escape(result.prizeType)}</b>\nКоличество приза на игрока: <b>${result.amount}</b>\nКоличество участников: <b>${result.recipients.length}</b>\n`;
  for(const player of result.recipients){report+=`• <a href="tg://user?id=${escape(player.id)}">${escape(player.username||'Неизвестный')}</a>: <b>${result.amount} ${escape(result.prizeType)}</b>\n`;try{await ctx.telegram.sendMessage(player.id,`🎉 Вы заняли место в топе по урону боссу! Ваш приз: <b>${result.amount} ${escape(result.currency)}</b>.`,{parse_mode:'HTML'});}catch{report+='• Уведомление не доставлено; награда начислена.\n';}}
  return report;
};}
module.exports={createBossRewardDistribution};
