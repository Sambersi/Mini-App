'use strict';
const {cardLimit}=require('../services/financePolicy');
const {RESERVED_NUMERIC_IDS}=require('../services/playerRegistration');
const {REFERRAL_BONUS_REFERRER_PF}=require('../../config');
function createPlayerSettings(runtime){
  const byNumeric=' FROM player_cards c JOIN players p ON p.telegram_id=c.player_id WHERE p.numeric_id=?';
  const setTransferBlock=(id,value)=>runtime.execute(
    'UPDATE player_cards c JOIN players p ON p.telegram_id=c.player_id SET c.transfers_blocked=? WHERE p.numeric_id=?',[value,id]);
  const updateForms=(id,work)=>runtime.transaction(async()=>{
    id=String(id);
    if(!await runtime.one('SELECT telegram_id FROM players WHERE telegram_id=? FOR UPDATE',[id]))return;
    if(await runtime.one("SELECT field_name FROM player_invalid_lists WHERE player_id=? AND field_name='form_ids'",[id])){
      throw Object.assign(new Error('Invalid legacy form list'),{code:'PLAYER_LIST_INVALID'});
    }
    await work(id);
  });
  return {
    getCardLimitByAccountLevel:level=>Number(cardLimit(level)),
    async saveCardNumber(id,number){await runtime.execute('UPDATE player_cards SET card_number=? WHERE player_id=?',[number,String(id)]);},
    async updateUserNotifications(id,enabled){await runtime.execute('UPDATE player_preferences SET notifications_enabled=? WHERE player_id=?',[enabled?1:0,String(id)]);},
    async getUserNotificationSettings(id){const row=await runtime.one('SELECT notifications_enabled FROM player_preferences WHERE player_id=?',[String(id)]);return row?{enabled:Number(row.notifications_enabled)!==0}:null;},
    async isHyperlinkDisabled(id){const row=await runtime.one('SELECT disable_hyperlink FROM player_preferences WHERE player_id=?',[String(id)]);return !!row&&Number(row.disable_hyperlink)!==0;},
    async toggleHyperlink(id){const result=await runtime.execute('UPDATE player_preferences SET disable_hyperlink=NOT disable_hyperlink WHERE player_id=?',[String(id)]);return result.changes>0;},
    async updateUserSelectedSkin(id,skinId){await runtime.execute('UPDATE player_preferences SET selected_skin_id=? WHERE player_id=?',[skinId,String(id)]);},
    async updateLastBonusTime(id,timestamp,privateChat=false){const field=privateChat?'last_private_bonus_time':'last_bonus_time';return runtime.execute('UPDATE player_bonus_state SET '+field+'=? WHERE player_id=?',[timestamp,String(id)]);},
    async getUserLastPrivateBonusTime(id){return (await runtime.one('SELECT last_private_bonus_time FROM player_bonus_state WHERE player_id=?',[String(id)]))?.last_private_bonus_time??0;},
    async blockTransfersByNumericId(id){await setTransferBlock(id,1);},
    async unblockTransfersByNumericId(id){await setTransferBlock(id,0);},
    async areTransfersBlockedByNumericId(id){return Boolean(Number((await runtime.one('SELECT c.transfers_blocked'+byNumeric,[id]))?.transfers_blocked));},
    async setAccountLevelByNumericId(id,newLevel){
      const level=parseInt(newLevel,10);
      if(!Number.isInteger(level)||level<1||level>20)return {success:false,message:'Некорректный уровень. Допустимые значения: 1-20.'};
      try{
        const result=await runtime.execute('UPDATE player_cards c JOIN players p ON p.telegram_id=c.player_id SET c.account_level=? WHERE p.numeric_id=?',[level,id]);
        return result.changes?{success:true,message:`Уровень  успешно установлен на ${level}.`}:{success:false,message:'Пользователь с указанным NUMERIC_ID не найден.'};
      }catch{return {success:false,message:'Произошла ошибка при обновлении уровня.'};}
    },
    async resetAllBonusTimes(){
      try{
        const {changes}=await runtime.execute('UPDATE player_bonus_state SET last_bonus_time=0,last_private_bonus_time=0');
        return {success:true,changes,message:`Таймеры бонусов успешно сброшены для ${changes} пользователей.`};
      }catch{return {success:false,message:'Произошла ошибка при сбросе таймеров бонусов.'};}
    },
    async getFreeReservedNumericIds(){
      const occupied=new Set((await runtime.many('SELECT numeric_id FROM players WHERE numeric_id IS NOT NULL')).map(row=>String(row.numeric_id)));
      return RESERVED_NUMERIC_IDS.filter(id=>!occupied.has(String(id)));
    },
    async updateReferralBonusAmount(id){
      try{
        const result=await runtime.execute('UPDATE player_referral_state s JOIN players p ON p.telegram_id=s.player_id SET s.referral_bonus_amount=? WHERE p.numeric_id=?',[REFERRAL_BONUS_REFERRER_PF,id]);
        return result.changes?{success:true}:{success:false,message:'Пользователь с указанным numeric_id не найден.'};
      }catch{return {success:false,message:'Произошла ошибка при обновлении суммы бонуса.'};}
    },
    async setReferralBonusForAllUsers(){
      try{
        const result=await runtime.execute('UPDATE player_referral_state SET referral_bonus_amount=?',[REFERRAL_BONUS_REFERRER_PF]);
        return result.changes?{success:true}:{success:false,message:'Нет пользователей для обновления.'};
      }catch{return {success:false,message:'Ошибка обновления бонуса.'};}
    },
    saveFormIdToDatabase(userId,formId){
      const value=JSON.stringify(formId===undefined?null:formId);
      return updateForms(userId,async id=>{
        const row=await runtime.one('SELECT MAX(ordinal) AS ordinal FROM player_forms WHERE player_id=?',[id]);
        const next=row.ordinal===null?'0':String(BigInt(row.ordinal)+1n);
        await runtime.execute('INSERT INTO player_forms(player_id,ordinal,value_json) VALUES (?,?,?)',[id,next,value]);
      });
    },
    deleteFormIdFromDatabase(userId){
      return updateForms(userId,id=>runtime.execute('DELETE FROM player_forms WHERE player_id=? ORDER BY ordinal LIMIT 1',[id]));
    },
    getTargetUserId(ctx){
      const reply=ctx.message?.reply_to_message?.from;
      if(reply)return {type:'telegramId',value:String(reply.id)};
      const id=parseInt(ctx.message?.text?.split(/\s+/)[1],10);
      return Number.isNaN(id)?null:{type:'numericId',value:String(id)};
    },
  };
}
module.exports={createPlayerSettings};
