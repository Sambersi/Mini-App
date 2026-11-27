'use strict';
const {withTransaction,withDeadlockRetry}=require('../db/transaction');
const {groups,itemFields}=require('../db/playerFields');
const {processUsername}=require('./username');
const {hasCaptchaProof}=require('./registrationProof');
const {lockWallet,saveWallet}=require('../repositories/wallets');
const {calculateAdjustment}=require('./balanceAdjustment');
const {mainLimit}=require('./financePolicy');
const CONFIG=require('../../config');
const MAX=9223372036854775807n;
const RESERVED_NUMERIC_IDS=Object.freeze([0,1,2,3,4,5,6,7,8,9,10,11,22,33,42,44,52,55,69,77,88,99,100,666,777]);
const fail=code=>{throw Object.assign(new Error(code),{code});};
function firstAvailableNumericId(values){
  const used=new Set([...RESERVED_NUMERIC_IDS,...values].filter(v=>v!==null).map(String));
  let id=0n;while(used.has(String(id)))id++;
  if(id>MAX)fail('PLAYER_IDS_EXHAUSTED');return String(id);
}
function playerId(value){
  if(typeof value==='number'&&!Number.isSafeInteger(value))fail('PLAYER_ID_INVALID');
  if(!['string','number','bigint'].includes(typeof value)||!/^\d{1,31}$/.test(String(value))||BigInt(value)<=0n)fail('PLAYER_ID_INVALID');
  return String(value);
}
function defaultPlayerState({now,referralJoinDate,referralBonusAmount}){
  // Defaults of the deployed SQLite users schema, with createUserOrUpdate's
  // explicit overrides. Existing imported profiles are never passed here.
  const defaults={};
  for(const [table,columns]of Object.entries(groups))defaults[table]=Object.fromEntries(Object.keys(columns).map(field=>[field,0]));
  Object.assign(defaults.player_preferences,{notifications_enabled:1,active_prefix_id:null,card_level:null});
  defaults.player_statistics.multiplier_stats='{}';
  Object.assign(defaults.player_boss_state,{attack_power:1,active_weapon:'1'});
  defaults.player_empire_state.empire_clan_id=null;
  Object.assign(defaults.player_referral_state,{referral_join_date:referralJoinDate||Math.floor(now/1000),referral_bonus_amount:referralBonusAmount});
  return defaults;
}
async function setReferral(connection,id,code){
  await connection.execute('DELETE FROM player_referrals WHERE player_id=?',[id]);
  await connection.execute('DELETE FROM player_referral_intents WHERE player_id=?',[id]);
  if(!code)return;
  const text=String(code);
  const [[target]]=text!==id&&/^[\x21-\x7e]{1,32}$/.test(text)?await connection.execute('SELECT telegram_id FROM players WHERE telegram_id=?',[text]):[[]];
  if(target)await connection.execute('INSERT INTO player_referrals(player_id,referrer_id) VALUES (?,?)',[id,text]);
  else await connection.execute('INSERT INTO player_referral_intents(player_id,referral_code) VALUES (?,?)',[id,text]);
}
async function addInventory(connection,id,item,amount,key){
  if(amount===0n)return;
  const [[row]]=await connection.execute('SELECT quantity FROM inventory_balances WHERE player_id=? AND item_code=? FOR UPDATE',[id,item]);
  if(!row)fail('INVENTORY_MISSING');
  const quantity=BigInt(row.quantity)+amount;
  if(quantity<0n||quantity>MAX)fail('INVENTORY_OVERFLOW');
  await connection.execute('UPDATE inventory_balances SET quantity=? WHERE player_id=? AND item_code=?',[String(quantity),id,item]);
  await connection.execute('INSERT INTO inventory_entries(operation_key,player_id,item_code,amount,entry_type) VALUES (?,?,?,?,?)',[key,id,item,String(amount),'registration_reward']);
}
function createPlayerRegistration(pool,{now=()=>Date.now(),config=CONFIG,runTransaction=work=>withDeadlockRetry(()=>withTransaction(pool,work))}={}){
  const amounts={newUserPf:config.REFERRAL_BONUS_NEW_USER_PF,newUserTickets:config.REFERRAL_BONUS_NEW_USER_TICKETS,referrerPf:config.REFERRAL_BONUS_REFERRER_PF,referrerTickets:config.REFERRAL_BONUS_REFERRER_TICKETS,candy:config.REGISTRATION_CANDY_AMOUNT};
  for(const [key,value]of Object.entries(amounts)){
    if(typeof value==='number'&&!Number.isSafeInteger(value)||!/^\d+$/.test(String(value))||BigInt(value)>MAX)fail('REGISTRATION_CONFIG_INVALID');
    amounts[key]=BigInt(value);
  }
  return {
    async createUserOrUpdate(user){
      const id=playerId(user?.id),name=processUsername(user.first_name);
      return runTransaction(async connection=>{
        // Numeric ID assignment and every administrative numeric_id mutation
        // take this same mutex before locking any player row.
        await connection.execute('SELECT id FROM player_id_allocator WHERE id=1 FOR UPDATE');
        const [[existing]]=await connection.execute('SELECT telegram_id FROM players WHERE telegram_id=? FOR UPDATE',[id]);
        if(existing){
          await connection.execute('UPDATE players SET display_name=? WHERE telegram_id=?',[name,id]);
          await setReferral(connection,id,user.referrer_id);
          await connection.execute('UPDATE player_referral_state SET referral_join_date=? WHERE player_id=?',[user.referral_join_date||Math.floor(now()/1000),id]);
          return;
        }
        const [ids]=await connection.execute('SELECT numeric_id,legacy_rowid FROM players');
        const numericId=firstAvailableNumericId(ids.map(row=>row.numeric_id));
        const rowid=ids.reduce((max,row)=>row.legacy_rowid!==null&&BigInt(row.legacy_rowid)>max?BigInt(row.legacy_rowid):max,0n)+1n;
        if(rowid>MAX)fail('PLAYER_IDS_EXHAUSTED');
        const timestamp=now();
        await connection.execute('INSERT INTO players(telegram_id,numeric_id,display_name,registered,registration_ts,source_run_id,legacy_rowid) VALUES (?,?,?,0,?,NULL,?)',[id,numericId,name,String(timestamp/1000),String(rowid)]);
        await connection.execute('INSERT INTO player_cards(player_id) VALUES (?)',[id]);
        for(const [asset,bucket]of [['PF','main'],['PF','card'],['DF','main']])await connection.execute('INSERT INTO wallets(player_id,asset,bucket,balance) VALUES (?,?,?,0)',[id,asset,bucket]);
        for(const item of itemFields)await connection.execute('INSERT INTO inventory_balances(player_id,item_code,quantity) VALUES (?,?,0)',[id,item]);
        const state=defaultPlayerState({now:timestamp,referralJoinDate:user.referral_join_date,referralBonusAmount:user.referral_bonus_amount||config.REFERRAL_BONUS_REFERRER_PF});
        for(const [table,values]of Object.entries(state)){
          const columns=Object.keys(values);
          await connection.execute('INSERT INTO '+table+'(player_id,'+columns.join(',')+') VALUES ('+[id,...columns].map(()=>'?').join(',')+')',[id,...Object.values(values)]);
        }
        await setReferral(connection,id,user.referrer_id);
      });
    },
    async completePlayerRegistration(value){
      const id=playerId(value);
      return runTransaction(async connection=>{
        const [[saved]]=await connection.execute('SELECT registration_data,started_at FROM registration_sessions WHERE user_id=? FOR UPDATE',[id]);
        const session=saved?.registration_data?JSON.parse(saved.registration_data):null;
        const code=session?.referralCode?String(session.referralCode):null;
        const possibleReferrer=code&&code!==id&&/^[\x21-\x7e]{1,32}$/.test(code)?code:null;
        const players=new Map();
        for(const key of [...new Set([id,...(possibleReferrer?[possibleReferrer]:[])])].sort()){
          const [[row]]=await connection.execute('SELECT telegram_id,registered FROM players WHERE telegram_id=? FOR UPDATE',[key]);
          if(row)players.set(key,row);
        }
        const player=players.get(id);if(!player)fail('PLAYER_MISSING');
        const [[receipt]]=await connection.execute('SELECT result_json FROM registration_completions WHERE player_id=?',[id]);
        if(Number(player.registered)){
          await connection.execute('DELETE FROM registration_sessions WHERE user_id=?',[id]);
          return receipt?{...JSON.parse(receipt.result_json),alreadyRegistered:true}:{playerId:id,alreadyRegistered:true,referrerId:null};
        }
        if(!session?.registrationInProgress||!session.policyAccepted||!hasCaptchaProof(session))fail('REGISTRATION_PROOF_REQUIRED');
        if((saved.started_at&&now()/1000-Number(saved.started_at)>86400)||(session.startedAt&&now()-Number(session.startedAt)>86400000))fail('REGISTRATION_EXPIRED');
        if(Number(session.captchaLockedUntil)>now())fail('REGISTRATION_CAPTCHA_LOCKED');
        if(receipt){
          await connection.execute('UPDATE players SET registered=1 WHERE telegram_id=?',[id]);
          await connection.execute('DELETE FROM registration_sessions WHERE user_id=?',[id]);
          return {...JSON.parse(receipt.result_json),alreadyRegistered:true};
        }
        const referrer=possibleReferrer&&players.has(possibleReferrer)?possibleReferrer:null;
        let partner=false;
        if(referrer){
          const [roles]=await connection.execute('SELECT c.name FROM role_catalog c JOIN player_roles r ON r.role_id=c.id WHERE r.player_id=?',[referrer]);
          partner=roles.some(row=>['partner','партнёр'].includes(row.name.toLowerCase()));
        }
        const result={playerId:id,alreadyRegistered:false,referrerId:referrer,partner,newUserPf:'0',newUserTickets:'0',referrerPf:'0',referrerTickets:'0',candy:'0'};
        if(referrer){
          for(const key of [...players.keys()].sort()){
            const isNew=key===id,multiplier=partner&&!isNew?2n:1n;
            const wallet={playerId:key,asset:'PF',bucket:'main'};
            const before=await lockWallet(connection,wallet);
            const [[card]]=await connection.execute('SELECT account_level FROM player_cards WHERE player_id=? FOR UPDATE',[key]);
            if(!card)fail('FINANCE_CONTROLS_MISSING');
            const applied=calculateAdjustment(before,(isNew?amounts.newUserPf:amounts.referrerPf)*multiplier,mainLimit(card.account_level));
            await saveWallet(connection,wallet,BigInt(applied.newBalance),BigInt(applied.applied),'registration:'+id+':'+key+':PF','registration_reward');
            const tickets=(isNew?amounts.newUserTickets:amounts.referrerTickets)*multiplier;
            await addInventory(connection,key,'fortune_tickets',tickets,'registration:'+id+':'+key+':ticket');
            result[isNew?'newUserPf':'referrerPf']=applied.applied;
            result[isNew?'newUserTickets':'referrerTickets']=String(tickets);
          }
          await addInventory(connection,referrer,'candy',amounts.candy,'registration:'+id+':'+referrer+':candy');
          result.candy=String(amounts.candy);
        }
        await setReferral(connection,id,code);
        await connection.execute('UPDATE players SET registered=1 WHERE telegram_id=?',[id]);
        await connection.execute('INSERT INTO registration_completions(player_id,result_json,completed_ms) VALUES (?,?,?)',[id,JSON.stringify(result),now()]);
        await connection.execute('DELETE FROM registration_sessions WHERE user_id=?',[id]);
        return result;
      });
    },
  };
}
module.exports={createPlayerRegistration,defaultPlayerState,firstAvailableNumericId,RESERVED_NUMERIC_IDS};
