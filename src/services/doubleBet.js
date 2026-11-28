'use strict';
const {createHash}=require('node:crypto');
const {integer}=require('./walletMovement');
const {lockWallet,saveWallet}=require('../repositories/wallets');
const fail=code=>{throw Object.assign(new Error(code),{code});};
function createDoubleBet(runtime,{runTransaction,now=()=>Date.now()}){return async({playerId,chatId,roundId,multiplier,amount,operationKey,chatTitle=null})=>{
  if(typeof operationKey!=='string'||!/^[A-Za-z0-9:_-]{1,100}$/.test(operationKey))fail('OPERATION_KEY_INVALID');if(!['x2','x3','x5','GAME'].includes(multiplier))fail('DOUBLE_MULTIPLIER_INVALID');
  const requested=integer(amount);if(requested<1n)fail('AMOUNT_INVALID');playerId=String(playerId);chatId=String(chatId);const key='double_bet:'+operationKey,hash=createHash('sha256').update(JSON.stringify({playerId,chatId,roundId,multiplier,amount:String(requested)})).digest('hex');
  return runTransaction(async connection=>{
    await connection.execute('INSERT INTO wallet_operations(operation_key,request_hash) VALUES (?,?) ON DUPLICATE KEY UPDATE operation_key=VALUES(operation_key)',[key,hash]);
    const [[receipt]]=await connection.execute('SELECT request_hash,result_json FROM wallet_operations WHERE operation_key=? FOR UPDATE',[key]);if(receipt.request_hash!==hash)fail('OPERATION_KEY_CONFLICT');if(receipt.result_json)return {...JSON.parse(receipt.result_json),replayed:true};
    const [[state]]=await connection.execute('SELECT state,hash,result,end_time FROM double_round_state WHERE id=1 FOR UPDATE');
    if(!state||state.hash!==roundId)fail('DOUBLE_ROUND_CHANGED');if(state.state!=='ACCEPTING'||now()>=Number(state.end_time)-(state.result==='GAME'?20000:5000))fail('DOUBLE_BETS_CLOSED');
    const [[round]]=await connection.execute('SELECT status FROM double_rounds WHERE round_id=? FOR UPDATE',[roundId]);if(!round||round.status!=='active')fail('DOUBLE_BETS_CLOSED');
    const [[player]]=await connection.execute('SELECT display_name FROM players WHERE telegram_id=? FOR UPDATE',[playerId]);if(!player)fail('PLAYER_MISSING');
    const [[ban]]=await connection.execute('SELECT banned_until FROM player_bans WHERE player_id=? FOR UPDATE',[playerId]);if(ban&&(!Number(ban.banned_until)||Math.floor(now()/1000)<=Number(ban.banned_until)))fail('PLAYER_BANNED');
    const [[chat]]=await connection.execute('SELECT is_double_chat FROM chats WHERE chat_id=?',[chatId]);if(Number(chat?.is_double_chat)!==1)fail('DOUBLE_CHAT_DISABLED');
    const [[last]]=await connection.execute('SELECT last_accepted_ms FROM double_bet_cooldowns WHERE player_id=? AND multiplier=? FOR UPDATE',[playerId,multiplier]);if(last&&now()-Number(last.last_accepted_ms)<1000)fail('DOUBLE_BET_COOLDOWN');
    const wallet={playerId,asset:'PF',bucket:'main'},before=await lockWallet(connection,wallet);if(before<requested)fail('INSUFFICIENT_FUNDS');await saveWallet(connection,wallet,before-requested,-requested,key+':debit','double_bet');
    const [inserted]=await connection.execute("INSERT INTO double_bets_log(ts,round_id,user_id,username,chat_id,chat_title,multiplier,amount,status) VALUES (?,?,?,?,?,?,?,?,'accepted')",[now(),roundId,playerId,player.display_name||'Неизвестный',chatId,chatTitle,multiplier,String(requested)]);
    await connection.execute('UPDATE player_statistics SET max_bet_amount=GREATEST(COALESCE(max_bet_amount,0),?) WHERE player_id=?',[String(requested),playerId]);
    await connection.execute('INSERT INTO double_bet_cooldowns(player_id,multiplier,last_accepted_ms) VALUES (?,?,?) ON DUPLICATE KEY UPDATE last_accepted_ms=VALUES(last_accepted_ms)',[playerId,multiplier,now()]);
    const result={success:true,id:String(inserted.insertId),roundId,multiplier,amount:String(requested),currency:'PF',replayed:false};
    await connection.execute('INSERT INTO finance_log(ts,type,actor_user_id,amount,currency,ref,chat_id,chat_title,action,payload,success,operation_key,entity_type,entity_id,actor_name_snapshot) VALUES (?,?,?,?,?,?,?,?,?,?,1,?,?,?,?)',[now(),'double_bet',playerId,String(requested),'PF',roundId,chatId,chatTitle,'double_bet',JSON.stringify({betId:result.id,multiplier}),key,'double_round',roundId,player.display_name]);
    await connection.execute('UPDATE wallet_operations SET result_json=? WHERE operation_key=?',[JSON.stringify(result),key]);return result;
  });
};}
module.exports={createDoubleBet};
