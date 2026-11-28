'use strict';
function createDoubleBetGateway({getRound,place}){return async(userId,username,multiplier,amount,chatId,chatTitle=null,updateId)=>{
  const round=getRound();if(!round)return {success:false,message:'Раунд ещё не начался.'};
  if(!Number.isSafeInteger(updateId))return {success:false,message:'Не удалось определить событие ставки.'};
  try{return await place({playerId:String(userId),chatId:String(chatId),roundId:round.hash,multiplier,amount,chatTitle,operationKey:'telegram:'+userId+':'+updateId});}
  catch(error){const codes={DOUBLE_BET_COOLDOWN:'Не флудите, попробуйте через секунду.',INSUFFICIENT_FUNDS:'Недостаточно средств для ставки.',DOUBLE_CHAT_DISABLED:'Double в этом чате отключён.',DOUBLE_MULTIPLIER_INVALID:'Недопустимый множитель.',DOUBLE_ROUND_CHANGED:'Раунд изменился. Повторите ставку.',DOUBLE_BETS_CLOSED:'Ставки больше не принимаются.'};return {success:false,message:codes[error.code]||'Не удалось подтвердить ставку. Попробуйте ещё раз.'};}
};}
module.exports={createDoubleBetGateway};
