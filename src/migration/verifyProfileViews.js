'use strict';
const {canonicalDecimal}=require('./projectPlayers');
const CUTOFF=Date.parse('2025-06-23')/1000;
function normalize(value,key=''){
  if(value===null||value===undefined)return value;
  if(Array.isArray(value))return value.map(row=>normalize(row));
  if(typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(field=>[field,normalize(value[field],field)]));
  if(key==='disable_hyperlink')return Boolean(Number(value));
  if(['id','telegram_id','username','referrer_id'].includes(key))return String(value);
  if(typeof value==='number'||typeof value==='bigint'||typeof value==='boolean'||/^-?\d+(\.\d+)?(?:e[+-]?\d+)?$/i.test(String(value)))return canonicalDecimal(typeof value==='boolean'?Number(value):value);
  return value;
}
async function verifyProfileViews(db,api,{now=Date.now()}={}){
  let checks=0;
  const check=async(method,sql,{args=[],params=args,transform=rows=>rows}={})=>{
    const expected=transform(db.prepare(sql).safeIntegers().all(...params));
    const actual=await api[method](...args);
    const wanted=normalize(expected),got=normalize(actual);
    if(JSON.stringify(wanted)!==JSON.stringify(got)){
      const details={method};
      if(Array.isArray(wanted)&&Array.isArray(got)){
        details.expectedCount=wanted.length;details.actualCount=got.length;
        details.orderOnly=JSON.stringify(wanted.map(row=>JSON.stringify(row)).sort())===JSON.stringify(got.map(row=>JSON.stringify(row)).sort());
        const index=wanted.findIndex((row,i)=>JSON.stringify(row)!==JSON.stringify(got[i]));
        if(index>=0&&wanted[index]&&got[index])details.fields=Object.keys(wanted[index]).filter(key=>JSON.stringify(wanted[index][key])!==JSON.stringify(got[index][key]));
      }
      throw Object.assign(new Error('Profile view differs from SQLite'),{code:'PROFILE_VIEW_MISMATCH',details});
    }
    checks++;
  };
  const zero=(fields,defaults={})=>rows=>rows.map(row=>{
    for(const field of fields)row[field]??=0;
    for(const [field,value]of Object.entries(defaults))if(!row[field])row[field]=value;
    return row;
  });
  const identity='numeric_id,id AS telegram_id,username,disable_hyperlink';
  for(const [method,field]of [['getTopPlayersByCardBalance','card_balance'],['getTopPlayersByDfBalance','df_balance'],['getTopPlayersByNpfShares','npf_shares']])await check(method,'SELECT '+identity+','+field+' FROM users WHERE username IS NOT NULL ORDER BY '+field+' DESC LIMIT 10',{transform:zero([field])});
  await check('getTopPlayersByContainers','SELECT '+identity+',container_type_1+container_type_2+container_type_3 AS total_containers FROM users WHERE username IS NOT NULL ORDER BY total_containers DESC LIMIT 10',{transform:zero(['total_containers'])});
  await check('getDetailedTopPlayers','SELECT '+identity+',balance,card_balance FROM users WHERE username IS NOT NULL ORDER BY (balance+card_balance) DESC LIMIT 12',{transform:zero(['balance','card_balance'])});
  await check('getTopPlayersByTotalBalance','SELECT id,username,balance,card_balance FROM users WHERE is_hidden_in_top=0 ORDER BY (balance+card_balance) DESC');
  await check('getTopPlayersByAttackPower','SELECT '+identity+',attack_power FROM users WHERE username IS NOT NULL ORDER BY attack_power DESC LIMIT 10',{transform:zero(['attack_power'],{numeric_id:'Не найден',telegram_id:'Не найден',username:'Неизвестный'})});
  await check('getTopPlayersByBossDamage','SELECT u.id,u.numeric_id,u.username,SUM(b.damage) AS total_damage FROM users u LEFT JOIN boss_damage b ON b.user_id=u.id GROUP BY u.id ORDER BY total_damage DESC',{transform:zero(['total_damage'],{numeric_id:'Не найден',id:'Не найден',username:'Неизвестный'})});
  await check('getTopDonatorsFromDatabase','SELECT id,username,total_donated_stars FROM users WHERE total_donated_stars>0 ORDER BY total_donated_stars DESC LIMIT 10');
  await check('getUsersWithCards',"SELECT id,card_balance,npf_shares FROM users WHERE card_number IS NOT NULL AND card_number<>''");
  await check('getNpfStats',"SELECT COALESCE((SELECT SUM(card_balance) FROM users WHERE card_number IS NOT NULL AND card_number<>''),0) AS total_card_pf,(SELECT COUNT(*) FROM users WHERE card_number IS NOT NULL AND card_number<>'') AS total_cardholders,COALESCE(SUM(npf_shares),0) AS total_shares FROM users",{transform:rows=>rows[0]});
  await check('getTopReferrers','SELECT u.numeric_id,u.id AS telegram_id,u.username,u.disable_hyperlink,COUNT(r.id) AS referrals_count FROM users u LEFT JOIN users r ON r.referrer_id=u.id WHERE u.username IS NOT NULL GROUP BY u.id ORDER BY referrals_count DESC LIMIT 12');
  await check('getTopSeasonalReferrers','SELECT u.id AS telegram_id,u.numeric_id,u.username,COUNT(r.id) AS referrals_count FROM users u JOIN users r ON r.referrer_id=u.id WHERE r.is_registered=1 AND r.registration_date>=? GROUP BY u.id ORDER BY referrals_count DESC',{params:[CUTOFF]});
  await check('getActivePlayersCount','SELECT COUNT(DISTINCT user_id) AS c FROM message_log WHERE ts>=?',{params:[now-300000],transform:rows=>rows[0].c});
  await check('getMaxNumericId','SELECT MAX(numeric_id) AS n FROM users',{transform:rows=>rows[0].n||0});
  const ids=db.prepare('SELECT id FROM users ORDER BY rowid LIMIT 3').all().map(row=>String(row.id));
  const financeColumns='f.id,f.ts,f.type,f.actor_user_id,f.target_user_id,f.amount,f.currency,f.ref,f.reason,f.action,f.payload,f.success,f.chat_id,f.chat_title,f.chat_type,a.username AS actor_name,a.numeric_id AS actor_num,t.username AS target_name,t.numeric_id AS target_num';
  const financeFrom=" FROM finance_log f LEFT JOIN users a ON CAST(a.id AS TEXT)=CAST(f.actor_user_id AS TEXT) LEFT JOIN users t ON CAST(t.id AS TEXT)=CAST(f.target_user_id AS TEXT) WHERE ((f.action IS NOT NULL AND f.action!='') OR f.amount IS NOT NULL OR f.target_user_id IS NOT NULL OR f.actor_user_id IS NOT NULL)";
  const financeResult=rows=>({rows,total:rows.length,page:1,pages:1});
  await check('getAdminLogsFinance','SELECT '+financeColumns+financeFrom+' ORDER BY f.ts DESC,f.id DESC LIMIT 50',{transform:financeResult});
  await check('getAdminLogsFinance','SELECT '+financeColumns+financeFrom+" AND f.type IN ('transfer','promo') ORDER BY f.ts DESC,f.id DESC LIMIT 20",{args:[{types:['transfer','promo'],limit:20}],params:[],transform:financeResult});
  await check('getAdminLogsFinance','SELECT '+financeColumns+financeFrom+' AND (f.actor_user_id=? OR f.target_user_id=?) ORDER BY f.ts DESC,f.id DESC LIMIT 20',{args:[{searchIds:[ids[0]],limit:20}],params:[ids[0],ids[0]],transform:financeResult});
  const financeTotal=db.prepare('SELECT COUNT(*) AS n FROM finance_log f WHERE ((f.action IS NOT NULL AND f.action!=\'\') OR f.amount IS NOT NULL OR f.target_user_id IS NOT NULL OR f.actor_user_id IS NOT NULL)').get().n;
  await check('getFinanceLogPage','SELECT '+financeColumns+financeFrom+' ORDER BY f.ts DESC,f.id DESC LIMIT 10 OFFSET 5',{args:[{limit:10,offset:5}],params:[],transform:rows=>({rows,total:financeTotal,offset:5})});
  for(const id of ids){
    for(const [method,field,fallback]of [['getFortuneTickets','fortune_tickets',0],['getTickets','tickets',0],['getSecretGifts','secret_gifts',0],['getUserNpfShares','npf_shares',0],['getTotalDonatedStars','total_donated_stars',0],['getUserAttackPower','attack_power',1]])await check(method,'SELECT '+field+' AS value FROM users WHERE id=?',{args:[id],transform:rows=>rows[0]?.value||fallback});
    await check('getDoubleStats','SELECT double_wins,double_losses,double_total_bets,double_total_winnings,double_total_losses FROM users WHERE id=?',{args:[id],transform:rows=>rows[0]});
    await check('getDonationHistory','SELECT donations_history FROM users WHERE id=?',{args:[id],transform:rows=>JSON.parse(rows[0]?.donations_history||'[]')});
    await check('getMultiplierStats','SELECT multiplier_stats FROM users WHERE id=?',{args:[id],transform:rows=>JSON.parse(rows[0]?.multiplier_stats||'{}')});
    await check('getUserEnergyData','SELECT energy,last_energy_restore FROM users WHERE id=? OR numeric_id=?',{args:[id],params:[id,id],transform:rows=>rows[0]});
    await check('getReferralsByReferrerId','SELECT id,username,is_registered,registration_date FROM users WHERE referrer_id=? AND (is_registered=1 OR registration_date<?)',{args:[id],params:[id,CUTOFF]});
    await check('getSeasonalReferralsByReferrerId','SELECT id,username,is_registered,registration_date FROM users WHERE referrer_id=? AND is_registered=1 AND registration_date>=?',{args:[id],params:[id,CUTOFF]});
    await check('getReferralCount','SELECT COUNT(*) AS n FROM users WHERE referrer_id=?',{args:[id],transform:rows=>rows[0].n});
    await check('getReferralCountPm','SELECT COUNT(*) AS n FROM users WHERE referrer_id=?',{args:[id],transform:rows=>rows[0].n});
    await check('getReferrerId','SELECT referrer_id FROM users WHERE id=?',{args:[id],transform:rows=>rows[0]?.referrer_id||null});
    await check('getNumericIdByUserId','SELECT numeric_id FROM users WHERE id=?',{args:[id],transform:rows=>rows[0]?.numeric_id||null});
    await check('isUserHiddenInTop','SELECT is_hidden_in_top FROM users WHERE id=?',{args:[id],transform:rows=>Boolean(rows[0]?.is_hidden_in_top)});
    await check('getUserBalances','SELECT balance AS pfBalance,card_balance AS cardBalance,df_balance AS dfBalance FROM users WHERE id=?',{args:[id],transform:rows=>zero(['pfBalance','cardBalance','dfBalance'])(rows)[0]});
  }
  return {checks,playersSampled:ids.length};
}
module.exports={verifyProfileViews,normalize};
