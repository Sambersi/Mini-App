'use strict';
function operationKey(ctx,kind){
  const id=ctx.update?.update_id;
  if(!Number.isSafeInteger(id)||id<0)throw Object.assign(new Error('Telegram update ID required'),{code:'UPDATE_ID_REQUIRED'});
  return 'card:'+String(ctx.from.id)+':'+kind+':'+id;
}
function createCardOperations({perform,notify=async()=>{}}){return async(ctx,{kind,recipientId,amountText})=>{
  let result;
  try{result=await perform({kind,playerId:String(ctx.from.id),recipientId,amountText:String(amountText),operationKey:operationKey(ctx,kind)});}
  catch(error){
    const messages={AMOUNT_INVALID:'Некорректная сумма.',INSUFFICIENT_FUNDS:'Недостаточно средств.',DESTINATION_LIMIT:'Достигнут лимит баланса получателя.',CARD_REQUIRED:'У вас нет зарегистрированной карты.',RECIPIENT_CARD_REQUIRED:'У получателя нет карты.',SENDER_BANNED:'Ваш аккаунт заблокирован.',RECIPIENT_BANNED:'Получатель заблокирован.',SENDER_TRANSFERS_BLOCKED:'Вам заблокированы переводы.',RECIPIENT_BLOCKED:'Переводы получателю заблокированы.',TRANSFER_CEILING:'Переводы недоступны из-за лимита общего баланса.',SELF_TRANSFER:'Нельзя перевести самому себе.'};
    return ctx.reply('✖️ '+(messages[error.code]||'Операция не завершена. Повторите попытку.'));
  }
  const action=kind==='topup'?'Карта пополнена':kind==='withdraw'?'С карты снято':'Переведено';
  await ctx.reply(`☑️ ${action}: ${BigInt(result.amount).toLocaleString('ru-RU')} PF.${result.limited?' Сумма ограничена свободным местом получателя.':''}`);
  if(kind==='transfer')try{await notify(ctx,recipientId,`📮 На вашу карту переведено ${BigInt(result.amount).toLocaleString('ru-RU')} PF.\n💳 Баланс: ${BigInt(result.toBalance).toLocaleString('ru-RU')} PF.`);}catch{}
  return result;
};}
module.exports={createCardOperations,operationKey};
