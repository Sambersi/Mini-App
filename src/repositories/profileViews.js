'use strict';
const {compatibleNumber}=require('./legacyReads');
const {numericIdentifier}=require('./players');
const CUTOFF=Date.parse('2025-06-23')/1000;
const referrals='(SELECT player_id,referrer_id FROM player_referrals UNION ALL SELECT player_id,referral_code AS referrer_id FROM player_referral_intents)';
const order='p.legacy_rowid IS NULL,p.legacy_rowid,p.telegram_id';
const identity='p.numeric_id,p.telegram_id,p.display_name AS username,s.disable_hyperlink';
const preferences=' LEFT JOIN player_preferences s ON s.player_id=p.telegram_id';
const wallet=(alias,asset,bucket)=>` LEFT JOIN wallets ${alias} ON ${alias}.player_id=p.telegram_id AND ${alias}.asset='${asset}' AND ${alias}.bucket='${bucket}'`;
const item=(alias,code)=>` LEFT JOIN inventory_balances ${alias} ON ${alias}.player_id=p.telegram_id AND ${alias}.item_code='${code}'`;
function adapt(row,{booleans=[],zero=[]}={}){
  if(!row)return row;
  for(const key of Object.keys(row))if(!['id','telegram_id','username','referrer_id'].includes(key))row[key]=compatibleNumber(row[key]);
  for(const key of booleans)row[key]=Boolean(Number(row[key]));
  for(const key of zero)row[key]??=0;
  return row;
}
function createProfileViews(runtime,reads,{now=()=>Date.now()}={}){
  const many=async(sql,args=[],options)=> (await runtime.many(sql,args)).map(row=>adapt(row,options));
  const leaderboard=async(field,expression,joins,limit=10)=>many('SELECT '+identity+','+expression+' AS '+field+' FROM players p'+preferences+joins+' WHERE p.display_name IS NOT NULL ORDER BY '+expression+' DESC,'+order+' LIMIT '+limit,[],{booleans:['disable_hyperlink'],zero:[field]});
  const api={
    async getPhysicsPlayers(){
      return many("SELECT p.telegram_id AS id,p.numeric_id,p.display_name AS username,w.balance FROM players p LEFT JOIN wallets w ON w.player_id=p.telegram_id AND w.asset='PF' AND w.bucket='main' ORDER BY w.balance DESC,p.legacy_rowid,p.telegram_id LIMIT 2000");
    },
    async getReferralsByReferrerId(id){return many('SELECT p.telegram_id AS id,p.display_name AS username,p.registered AS is_registered,p.registration_ts AS registration_date FROM players p JOIN '+referrals+' r ON r.player_id=p.telegram_id WHERE r.referrer_id=? AND (p.registered=1 OR p.registration_ts<?) ORDER BY '+order,[String(id),CUTOFF]);},
    async subtractReferrals(id,count){
      if(!Number.isSafeInteger(count)||count<0)return {success:false,message:'Некорректное количество рефералов.'};
      if(!count)return {success:true};
      try{
        return await runtime.transaction(async()=>{
          id=String(id);
          await runtime.one('SELECT telegram_id FROM players WHERE telegram_id=? FOR UPDATE',[id]);
          const eligible=await api.getReferralsByReferrerId(id);
          if(eligible.length<count)return {success:false,message:'Недостаточно рефералов для вычитания.'};
          for(const {id:playerId} of eligible.slice(-count)){
            await runtime.execute('DELETE FROM player_referrals WHERE player_id=? AND referrer_id=?',[playerId,id]);
            await runtime.execute('DELETE FROM player_referral_intents WHERE player_id=? AND referral_code=?',[playerId,id]);
          }
          return {success:true};
        });
      }catch{return {success:false,message:'Произошла ошибка при обновлении данных.'};}
    },
    async getSeasonalReferralsByReferrerId(id){return many('SELECT p.telegram_id AS id,p.display_name AS username,p.registered AS is_registered,p.registration_ts AS registration_date FROM players p JOIN '+referrals+' r ON r.player_id=p.telegram_id WHERE r.referrer_id=? AND p.registered=1 AND p.registration_ts>=? ORDER BY '+order,[String(id),CUTOFF]);},
    async getReferralCount(id){return compatibleNumber((await runtime.one('SELECT COUNT(*) AS n FROM '+referrals+' r WHERE r.referrer_id=?',[String(id)])).n);},
    async getReferralCountPm(id){return api.getReferralCount(id);},
    async getReferrerId(id){return (await runtime.one('SELECT referrer_id FROM '+referrals+' r WHERE r.player_id=?',[String(id)]))?.referrer_id||null;},
    async getTopReferrers(){return many('SELECT '+identity+',COALESCE(r.n,0) AS referrals_count FROM players p'+preferences+' LEFT JOIN (SELECT referrer_id,COUNT(*) AS n FROM '+referrals+' r GROUP BY referrer_id) r ON r.referrer_id=p.telegram_id WHERE p.display_name IS NOT NULL ORDER BY referrals_count DESC,p.telegram_id LIMIT 12',[],{booleans:['disable_hyperlink']});},
    // The source SQLite GROUP BY + DESC sort emits equal seasonal counts in
    // descending ID order. The overall top has the opposite tie order.
    async getTopSeasonalReferrers(){return many('SELECT p.telegram_id,p.numeric_id,p.display_name AS username,COUNT(*) AS referrals_count FROM players p JOIN '+referrals+' r ON r.referrer_id=p.telegram_id JOIN players child ON child.telegram_id=r.player_id WHERE child.registered=1 AND child.registration_ts>=? GROUP BY p.telegram_id,p.numeric_id,p.display_name ORDER BY referrals_count DESC,p.telegram_id DESC',[CUTOFF]);},
    getTopPlayersByCardBalance:()=>leaderboard('card_balance','w.balance',wallet('w','PF','card')),
    getTopPlayersByDfBalance:()=>leaderboard('df_balance','w.balance',wallet('w','DF','main')),
    getTopPlayersByNpfShares:()=>leaderboard('npf_shares','i.quantity',item('i','npf_shares')),
    getTopPlayersByContainers:()=>leaderboard('total_containers','(CAST(a.quantity AS DECIMAL(65,0))+b.quantity+c.quantity)',item('a','container_type_1')+item('b','container_type_2')+item('c','container_type_3')),
    async getDetailedTopPlayers(){return many('SELECT '+identity+',a.balance,b.balance AS card_balance FROM players p'+preferences+wallet('a','PF','main')+wallet('b','PF','card')+' WHERE p.display_name IS NOT NULL ORDER BY (CAST(a.balance AS DECIMAL(65,0))+b.balance) DESC,'+order+' LIMIT 12',[],{booleans:['disable_hyperlink'],zero:['balance','card_balance']});},
    async getTopPlayersByTotalBalance(){return many('SELECT p.telegram_id AS id,p.display_name AS username,a.balance,b.balance AS card_balance FROM players p'+preferences+wallet('a','PF','main')+wallet('b','PF','card')+' WHERE s.is_hidden_in_top=0 ORDER BY (CAST(a.balance AS DECIMAL(65,0))+b.balance) DESC,'+order);},
    async getTopPlayersByAttackPower(){return (await leaderboard('attack_power','b.attack_power',' LEFT JOIN player_boss_state b ON b.player_id=p.telegram_id')).map(row=>({...row,numeric_id:row.numeric_id||'Не найден',telegram_id:row.telegram_id||'Не найден',username:row.username||'Неизвестный'}));},
    async getTopPlayersByBossDamage(){return (await many('SELECT p.telegram_id AS id,p.numeric_id,p.display_name AS username,SUM(b.damage) AS total_damage FROM players p LEFT JOIN boss_damage b ON b.user_id=p.telegram_id GROUP BY p.telegram_id,p.numeric_id,p.display_name ORDER BY total_damage DESC,p.telegram_id')).map(row=>({...row,numeric_id:row.numeric_id||'Не найден',id:row.id||'Не найден',username:row.username||'Неизвестный',total_damage:row.total_damage||0}));},
    async getTopDonatorsFromDatabase(){return many('SELECT p.telegram_id AS id,p.display_name AS username,s.total_donated_stars FROM players p JOIN player_donation_state s ON s.player_id=p.telegram_id WHERE s.total_donated_stars>0 ORDER BY s.total_donated_stars DESC,'+order+' LIMIT 10');},
    async getUsersWithCards(){return many('SELECT p.telegram_id AS id,w.balance AS card_balance,i.quantity AS npf_shares FROM players p JOIN player_cards c ON c.player_id=p.telegram_id'+wallet('w','PF','card')+item('i','npf_shares')+" WHERE c.card_number IS NOT NULL AND c.card_number<>'' ORDER BY "+order);},
    async getNpfStats(){return adapt(await runtime.one("SELECT (SELECT COALESCE(SUM(w.balance),0) FROM wallets w JOIN player_cards c ON c.player_id=w.player_id WHERE w.asset='PF' AND w.bucket='card' AND c.card_number IS NOT NULL AND c.card_number<>'') AS total_card_pf,(SELECT COUNT(*) FROM player_cards WHERE card_number IS NOT NULL AND card_number<>'') AS total_cardholders,(SELECT COALESCE(SUM(quantity),0) FROM inventory_balances WHERE item_code='npf_shares') AS total_shares"));},
    async getActivePlayersCount(windowMs=300000){return compatibleNumber((await runtime.one('SELECT COUNT(DISTINCT user_id) AS c FROM message_log WHERE ts>=?',[now()-windowMs])).c);},
    async getUserBalances(id){const user=await reads.getUserById(id);return {pfBalance:user?.balance||0,cardBalance:user?.card_balance||0,dfBalance:user?.df_balance||0};},
    async getNumericIdByUserId(id){return compatibleNumber((await runtime.one('SELECT numeric_id FROM players WHERE telegram_id=?',[String(id)]))?.numeric_id)||null;},
    async getMaxNumericId(){return compatibleNumber((await runtime.one('SELECT MAX(numeric_id) AS n FROM players')).n)||0;},
    async isUserHiddenInTop(id){return Boolean(Number((await runtime.one('SELECT is_hidden_in_top FROM player_preferences WHERE player_id=?',[String(id)]))?.is_hidden_in_top));},
    async getPlayerBalanceInfoByNumericId(id){
      if(numericIdentifier(id)===null)return {success:false,message:`Игрок с numeric_id ${id} не найден.`};
      const user=await reads.getUserByNumericId(id);if(!user)return {success:false,message:`Игрок с numeric_id ${id} не найден.`};
      const mapping={balance_pf:'balance',card_balance:'card_balance',balance_df:'df_balance',shares_npf:'npf_shares',containers_1:'container_type_1',containers_2:'container_type_2',containers_3:'container_type_3'};
      const data={numeric_id:user.numeric_id,username:user.username||'Не указано',total_balance_pf:compatibleNumber(String(BigInt(user.balance||0)+BigInt(user.card_balance||0)))};
      for(const [target,field]of Object.entries(mapping))data[target]=user[field]??'null';return {success:true,data};
    },
  };
  return api;
}
module.exports={createProfileViews};
