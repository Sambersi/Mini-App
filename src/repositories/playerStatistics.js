'use strict';
const {compatibleNumber}=require('./legacyReads');
const {numericIdentifier}=require('./players');
function createPlayerStatistics(runtime,reads){
  const scalar=async(table,column,id,fallback=0)=>compatibleNumber((await runtime.one('SELECT '+column+' AS value FROM '+table+' WHERE player_id=?',[String(id)]))?.value)||fallback;
  const api={
    getFortuneTickets:id=>inventory(id,'fortune_tickets'),getTickets:id=>inventory(id,'tickets'),getSecretGifts:id=>inventory(id,'secret_gifts'),getUserNpfShares:id=>inventory(id,'npf_shares'),
    getTotalDonatedStars:id=>scalar('player_donation_state','total_donated_stars',id),
    getUserAttackPower:id=>scalar('player_boss_state','attack_power',id,1),
    async getDonationHistory(id){return JSON.parse((await reads.getUserById(id))?.donations_history||'[]');},
    async getMultiplierStats(id){try{return JSON.parse((await runtime.one('SELECT multiplier_stats FROM player_statistics WHERE player_id=?',[String(id)]))?.multiplier_stats||'{}');}catch(error){if(error instanceof SyntaxError)return {};throw error;}},
    async getDoubleStats(id){const row=await runtime.one('SELECT double_wins,double_losses,double_total_bets,double_total_winnings,double_total_losses FROM player_statistics WHERE player_id=?',[String(id)]);if(row)for(const key of Object.keys(row))row[key]=compatibleNumber(row[key]);return row;},
    async getUserEnergyData(id){const numeric=numericIdentifier(id);const row=await runtime.one('SELECT b.energy,b.last_energy_restore FROM players p JOIN player_boss_state b ON b.player_id=p.telegram_id WHERE p.telegram_id=?'+(numeric===null?'':' OR p.numeric_id=?')+' ORDER BY p.legacy_rowid LIMIT 1',numeric===null?[String(id)]:[String(id),numeric]);if(row)for(const key of Object.keys(row))row[key]=compatibleNumber(row[key]);return row;},
    async getLastAttackTime(id){return compatibleNumber((await runtime.one('SELECT last_attack_time FROM boss_state WHERE id=?',[String(id)]))?.last_attack_time??null);},
    async getBossCallerId(id){if(!id)return null;return (await runtime.one('SELECT boss_caller_id FROM boss_state WHERE id=?',[String(id)]))?.boss_caller_id??null;},
    async getBossDamageByUserId(id){return compatibleNumber((await runtime.one('SELECT COALESCE(SUM(damage),0) AS value FROM boss_damage WHERE user_id=?',[String(id)])).value);},
    async incrementLikesReceived(id){await increment(id,'likes_received',1);},
    async incrementDislikesReceived(id){await increment(id,'dislikes_received',1);},
    incrementGameWins:(id,amount=1)=>increment(id,'game_wins',amount),
    updateMaxBetIfGreater:(id,amount)=>maximum(id,'max_bet_amount',amount),
    updateMaxWinIfGreater:(id,amount)=>maximum(id,'max_win_amount',amount),
    async updateWinStreak(id,won){
      // MySQL evaluates assignments left to right: update the maximum first,
      // so it observes the same old streak as SQLite's simultaneous SET.
      return (await runtime.execute(won?'UPDATE player_statistics SET best_win_streak=GREATEST(best_win_streak,current_win_streak+1),current_win_streak=current_win_streak+1 WHERE player_id=?':'UPDATE player_statistics SET current_win_streak=0 WHERE player_id=? AND current_win_streak>0',[String(id)])).changes;
    },
    async incrementMultiplierCount(id,multiplier){return runtime.transaction(async()=>{
      const row=await runtime.one('SELECT multiplier_stats FROM player_statistics WHERE player_id=? FOR UPDATE',[String(id)]);if(!row)return 0;
      const stats=JSON.parse(row.multiplier_stats||'{}');
      Object.defineProperty(stats,String(multiplier),{value:(Object.hasOwn(stats,multiplier)?stats[multiplier]:0)+1,enumerable:true,writable:true,configurable:true});
      return (await runtime.execute('UPDATE player_statistics SET multiplier_stats=? WHERE player_id=?',[JSON.stringify(stats),String(id)])).changes;
    });},
    async toggleUserVisibilityInTop(id,hide=true){return (await runtime.execute('UPDATE player_preferences SET is_hidden_in_top=? WHERE player_id=?',[hide?1:0,String(id)])).changes>0;},
  };
  async function inventory(id,item){return compatibleNumber((await runtime.one('SELECT quantity FROM inventory_balances WHERE player_id=? AND item_code=?',[String(id),item]))?.quantity)||0;}
  async function increment(id,column,amount){return (await runtime.execute('UPDATE player_statistics SET '+column+'='+column+'+? WHERE player_id=?',[amount,String(id)])).changes;}
  async function maximum(id,column,amount){return (await runtime.execute('UPDATE player_statistics SET '+column+'=? WHERE player_id=? AND ?>'+column,[amount,String(id),amount])).changes;}
  return api;
}
module.exports={createPlayerStatistics};
