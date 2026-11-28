'use strict';
const {createBossRewardDistribution}=require('./bossRewards');
const escape=value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
function createBossAttackHandler({prepare,answer,attach,expire,read,now=()=>Date.now(),mainAdmin=process.env.MAIN_ADMIN||'',setTimer=setInterval,clearTimer=clearInterval}){
  const timers=new Map();
  const keyboard=q=>({inline_keyboard:[...Array.from({length:q.answers.length/4},(_,row)=>q.answers.slice(row*4,row*4+4).map((value,col)=>({text:String(value),callback_data:'attack_boss_'+(row*4+col)}))),[{text:'↩️ Назад в меню',callback_data:'back_to_boss_handler'}]]});
  const text=(result,left=result.question.timeLimit)=>`✍🏻 Решите новый пример, чтобы атаковать босса:\n\n<b>${escape(result.question.example)} = ?</b>\n⏰ Время до обнуления серии: [${left}] секунд\n🔥 Серия правильных ответов: [${result.question.currentStreak}]\n♥️ Оставшееся HP босса: ${result.hp}\n⚡️ Ваша энергия: ${result.energy}`;
  const stop=id=>{if(timers.has(id)){clearTimer(timers.get(id));timers.delete(id);}};
  async function publish(ctx,result,{timer=false,prefix=''}={}){
    if(!result.question)return;const q=result.question,id=q.playerId;stop(id);
    const message=await ctx.replyWithHTML(prefix+text(result),{reply_markup:keyboard(q)});
    if(!await attach({playerId:id,questionId:q.questionId,chatId:q.chatId,messageId:message.message_id})){try{await ctx.telegram.deleteMessage(q.chatId,message.message_id);}catch{}return;}
    if(!timer)return;let busy=false;
    const timerId=setTimer(async()=>{if(busy)return;busy=true;try{
      const current=await read({playerId:id,questionId:q.questionId});if(!current||String(current.messageId)!==String(message.message_id)){stop(id);return;}
      const left=Math.ceil((current.createdAt+current.timeLimit*1000-now())/1000);
      if(left<=0){stop(id);const next=await expire({playerId:id,questionId:q.questionId});if(next){try{await ctx.telegram.deleteMessage(q.chatId,message.message_id);}catch{}await publish(ctx,next,{prefix:'⏰ Время истекло! Серия сброшена.\n\n'});}return;}
      try{await ctx.telegram.editMessageText(q.chatId,message.message_id,undefined,text(result,left),{parse_mode:'HTML',reply_markup:keyboard(q)});}catch{}
    }catch{stop(id);}finally{busy=false;}},2000);timerId?.unref?.();timers.set(id,timerId);
  }
  const handler=async ctx=>{
    const playerId=String(ctx.from.id),chatId=String(ctx.chat?.id??ctx.callbackQuery?.message?.chat?.id??ctx.from.id),update=ctx.update?.update_id;
    if(!Number.isSafeInteger(update))return ctx.reply('Не удалось определить событие. Откройте меню атаки заново.');
    const answering=!!ctx.match?.[1],operationKey='telegram:'+playerId+':'+update;let result;
    try{result=answering?await answer({playerId,chatId,messageId:String(ctx.callbackQuery?.message?.message_id),index:Number(ctx.match[1]),operationKey}):await prepare({playerId,chatId,operationKey});}
    catch(error){const messages={BOSS_PLAYER_BANNED:'Доступ к атаке ограничен.',BOSS_MENU_STALE:'Это меню устарело или открыто в другом чате. Откройте атаку заново.',BOSS_COOLDOWN:'Подождите немного перед следующей атакой.',ENERGY_EMPTY:'Недостаточно энергии. Энергия восстанавливается каждые 5 минут.',BOSS_DEFEATED:'Босс уже повержен!',BOSS_MISSING:'В данный момент активных боссов нет.',BOSS_ANSWER_INVALID:'Несуществующая кнопка ответа.'};const message='❌ '+(messages[error.code]||'Не удалось подтвердить атаку. Попробуйте ещё раз.');return ctx.callbackQuery?ctx.answerCbQuery(message):ctx.reply(message);}
    if(result.replayed)return ctx.callbackQuery?ctx.answerCbQuery('Этот запрос уже обработан.'):ctx.reply('Этот запрос уже обработан.');
    if(answering){stop(playerId);try{await ctx.deleteMessage();}catch{}}
    let prefix='';if(answering){prefix=result.expired?'⏰ Время истекло! Серия сброшена.\n\n':result.correct?`⚔️ Вы нанесли ${result.damage} урона с помощью ${escape(result.weaponName)}${result.reduced?' (Пониженный урон)':''}.\n${result.combo?'🔥 КОМБО АТАКА! Урон увеличен в 2 раза!\n':''}\n`:`❌ Неверный ответ. Правильный ответ: ${result.correctResult}. Энергия потрачена, урон не засчитан.\n\n`;if(result.broken)prefix+='Ваше оружие сломалось. Применён Кулак; оружие можно снова приобрести в магазине.\n\n';}
    if(result.reward){await ctx.reply('🎉 Босс побежден!');const report=await createBossRewardDistribution({settle:async()=>result.reward})(ctx,{id:result.reward.bossId});if(mainAdmin)try{await ctx.telegram.sendMessage(mainAdmin,report,{parse_mode:'HTML'});}catch{}}
    else await publish(ctx,result,{timer:!answering,prefix});
    if(result.phaseChanged)await ctx.reply('👾 Босс переходит во вторую фазу!');
    if(result.phaseChanged||result.reward)for(const user of result.participants||[])try{await ctx.telegram.sendMessage(user.user_id,result.reward?'🎉 Босс повержен! Спасибо за участие в битве!':'👾 Босс перешёл во вторую фазу! Готовьтесь к сложной битве!');}catch{}
  };
  handler.dispose=()=>{for(const id of timers.keys())stop(id);};return handler;
}
module.exports={createBossAttackHandler};
