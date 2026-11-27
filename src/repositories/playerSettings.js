'use strict';
const {cardLimit}=require('../services/financePolicy');
function createPlayerSettings(runtime){
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
  };
}
module.exports={createPlayerSettings};
