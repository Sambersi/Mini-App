'use strict';
const escape=value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
function createPartnerDecisionHandler({decide,decision,updateMessage,edit,link}){return async(ctx,request,adminId,customData=null)=>{
  let result;
  try{result=await decide({requestId:request.id,adminId:String(ctx.from.id),decision,overrides:customData});}
  catch(error){const messages={PARTNER_ADMIN_DENIED:'Недостаточно прав.',PARTNER_REQUEST_PROCESSED:'Запрос уже обработан.',PROMO_NAME_TAKEN:'Промокод с таким названием уже существует.',DESTINATION_LIMIT:'Весь приз не помещается на PF-балансе. Запрос остался ожидающим.',PARTNER_REQUEST_MISSING:'Запрос не найден.'};return ctx.reply('❌ '+(messages[error.code]||'Не удалось обработать запрос.'));}
  if(result.replayed)return edit(ctx,'⚠️ Запрос уже обработан ранее.',{parse_mode:'HTML'});
  const stored=result.request,approved=decision==='approve',adminLink=link(ctx.from.id,ctx.from.username||'Админ');
  const summary=approved?(result.currency?`Начислено: ${BigInt(result.amount).toLocaleString('ru-RU')} ${result.currency}.`:`Промокод <code>${escape(stored.name)}</code> создан.`):`Запрос <code>${escape(stored.name)}</code> отклонён.`;
  try{await updateMessage(ctx,stored,`${approved?'✅ <b>ОДОБРЕНО</b>':'❌ <b>ОТКЛОНЕНО</b>'} администратором ${adminLink}`);}catch{}
  await edit(ctx,`${approved?'✅':'❌'} Запрос #${stored.id}: ${summary}`,{parse_mode:'HTML'});
  try{await ctx.telegram.sendMessage(stored.partner_id,`${approved?'🎉 Запрос одобрен!':'❌ Запрос отклонён.'}\n\n${summary}`,{parse_mode:'HTML'});}catch{}
  return result;
};}
module.exports={createPartnerDecisionHandler};
