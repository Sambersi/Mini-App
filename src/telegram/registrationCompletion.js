'use strict';
const {Markup}=require('telegraf');
const escapeHtml=value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
async function notifyCompletedRegistration(ctx,{complete,getUser,log=console}){
  const id=String(ctx.from.id);
  // No Telegram request takes place until all grants and registration commit.
  const result=await complete(id);
  if(result.alreadyRegistered){
    await ctx.reply('Вы уже завершили регистрацию.');return result;
  }
  const user=await getUser(id);
  const name=escapeHtml(user?.username||ctx.from.first_name||'Press Эфыч');
  const label=ctx.chat.type==='private'?'':`<a href="tg://user?id=${id}">${name}</a>, `;
  await ctx.reply(`☑️ <b>${label}Регистрация прошла успешно!</b>\n❔ Ознакомьтесь с функционалом бота, используя команду "/help"!`,{parse_mode:'HTML'});
  if(!result.referrerId)return result;
  const ticketText=result.referrerTickets!=='0'?`\n🎟 +${result.referrerTickets} билет(ов) на фортуну!`:'';
  const note=result.partner?' (Партнёрский бонус x2)':'';
  try{
    await ctx.telegram.sendMessage(result.referrerId,
      `☑️ Вы получили +${result.referrerPf} PF за привлечение нового пользователя!${note}\n`+
      `👥 Реферал: <a href="tg://user?id=${id}">${name}</a>${ticketText}\n🍬 +${result.candy} конфет!`,{parse_mode:'HTML'});
  }catch{
    // A blocked bot does not roll back a committed reward or prevent the new
    // player from receiving their confirmation. Never log player details.
    log.warn('[REGISTRATION] Referrer notification failed after commit');
  }
  const newTickets=result.newUserTickets!=='0'?`\n🎟 +${result.newUserTickets} билет(ов) на фортуну!`:'';
  await ctx.replyWithHTML(`🎁 <b>Бонус за регистрацию по реф. ссылке:</b>\n💰 +${result.newUserPf} PF${newTickets}\n🔗 Теперь и вы можете приглашать друзей и получать бонусы!`,
    Markup.inlineKeyboard([Markup.button.callback('🔗 Реферальная ссылка','referral_link')]));
  return result;
}
module.exports={notifyCompletedRegistration};
