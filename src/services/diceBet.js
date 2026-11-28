'use strict';

const {createHash} = require('node:crypto');
const {lockWallet,saveWallet} = require('../repositories/wallets');
const {integer} = require('./walletMovement');

const fail = code => { throw Object.assign(new Error(code),{code}); };
function betAmount(value) {
  const amount=integer(value);
  if(amount<100n||amount>4000000n)fail('AMOUNT_INVALID');
  return String(amount);
}
function validateRoundId(roundId) {
  if(typeof roundId!=='string'||!/^[A-Za-z0-9_-]{1,100}$/.test(roundId))fail('DICE_ROUND_INVALID');
}

function createDiceBet(runtime,{records,runTransaction,now=()=>Date.now()}) {
  async function lockChat(chatId) {
    const chat=await runtime.one('SELECT is_dice_chat FROM chats WHERE chat_id=? FOR UPDATE',[chatId]);
    if(Number(chat?.is_dice_chat)!==1)fail('DICE_CHAT_DISABLED');
  }

  async function openDiceRound({roundId,chatId,amount}) {
    validateRoundId(roundId);
    chatId=String(chatId);
    const stake=betAmount(amount);
    return runTransaction(async()=>{
      await lockChat(chatId);
      const existing=await runtime.one(
        'SELECT r.chat_id,r.start_time,r.end_time,m.entry_amount FROM dice_rounds r LEFT JOIN dice_runtime_rounds m USING (round_id) WHERE r.round_id=? FOR UPDATE',
        [roundId]);
      if(existing){
        if(existing.chat_id!==chatId||existing.entry_amount!==stake)fail('OPERATION_KEY_CONFLICT');
        return {roundId,chatId,amount:stake,startTime:Number(existing.start_time),endTime:Number(existing.end_time),replayed:true};
      }
      if(await runtime.one('SELECT round_id FROM dice_rounds_log WHERE round_id=? FOR UPDATE',[roundId]))fail('OPERATION_KEY_CONFLICT');
      const active=await runtime.many(
        "SELECT m.entry_amount FROM dice_runtime_rounds m JOIN dice_rounds r USING (round_id) JOIN dice_rounds_log l USING (round_id) WHERE r.chat_id=? AND l.status='active'",
        [chatId]);
      if(active.length>=3)fail('DICE_CHAT_FULL');
      if(active.some(round=>round.entry_amount===stake))fail('DICE_ROUND_AMOUNT_EXISTS');
      const startTime=now(),endTime=startTime+30000;
      await records.saveDiceRound(chatId,startTime,endTime,roundId);
      await records.logDiceRound(roundId,chatId,startTime,stake);
      await runtime.execute('INSERT INTO dice_runtime_rounds (round_id,entry_amount) VALUES (?,?)',[roundId,stake]);
      return {roundId,chatId,amount:stake,startTime,endTime,replayed:false};
    });
  }

  async function placeDiceBet({roundId,chatId,playerId,amount,operationKey,extend=false,withBot=false}) {
    validateRoundId(roundId);
    if(typeof operationKey!=='string'||!/^[A-Za-z0-9:_-]{1,100}$/.test(operationKey))fail('OPERATION_KEY_INVALID');
    if(typeof extend!=='boolean'||typeof withBot!=='boolean')fail('DICE_EXTENSION_INVALID');
    const stake=betAmount(amount);
    chatId=String(chatId);
    playerId=String(playerId);
    const key='dice_bet:'+operationKey;
    const request={roundId,chatId,playerId,stake,extend};
    if(withBot)request.withBot=true;
    const requestHash=createHash('sha256').update(JSON.stringify(request)).digest('hex');
    return runTransaction(async connection=>{
      await runtime.execute(
        'INSERT INTO wallet_operations(operation_key,request_hash) VALUES (?,?) ON DUPLICATE KEY UPDATE operation_key=VALUES(operation_key)',
        [key,requestHash]);
      const receipt=await runtime.one('SELECT request_hash,result_json FROM wallet_operations WHERE operation_key=? FOR UPDATE',[key]);
      if(receipt.request_hash!==requestHash)fail('OPERATION_KEY_CONFLICT');
      if(receipt.result_json)return {...JSON.parse(receipt.result_json),replayed:true};

      await lockChat(chatId);
      const round=await runtime.one(
        'SELECT r.chat_id,r.end_time,m.entry_amount,m.bot_mode,m.offer_until,m.plan_json,l.status FROM dice_rounds r JOIN dice_runtime_rounds m USING (round_id) JOIN dice_rounds_log l USING (round_id) WHERE r.round_id=? FOR UPDATE',
        [roundId]);
      if(!round||round.chat_id!==chatId||round.status!=='active'||now()>=Number(round.end_time))fail('DICE_BETS_CLOSED');
      if(round.bot_mode||round.offer_until||round.plan_json)fail('DICE_BETS_CLOSED');
      if(round.entry_amount!==stake)fail('DICE_AMOUNT_MISMATCH');
      const participants=await runtime.many('SELECT player_id FROM dice_bet_operations WHERE round_id=?',[roundId]);
      if(participants.some(row=>row.player_id===playerId))fail('DICE_ALREADY_JOINED');
      if(participants.length>=5)fail('DICE_ROUND_FULL');
      if(withBot&&participants.length)fail('DICE_BETS_CLOSED');
      const player=await runtime.one('SELECT display_name FROM players WHERE telegram_id=? FOR UPDATE',[playerId]);
      if(!player)fail('PLAYER_MISSING');
      const ban=await runtime.one('SELECT banned_until FROM player_bans WHERE player_id=? FOR UPDATE',[playerId]);
      if(ban&&(!Number(ban.banned_until)||Math.floor(now()/1000)<=Number(ban.banned_until)))fail('PLAYER_BANNED');

      const wallet={playerId,asset:'PF',bucket:'main'};
      const before=await lockWallet(connection,wallet);
      const amount=BigInt(stake);
      if(before<amount)fail('INSUFFICIENT_FUNDS');
      await saveWallet(connection,wallet,before-amount,-amount,key+':debit','dice_bet');
      const username=player.display_name||'Неизвестный';
      const bet=await runtime.execute(
        'INSERT INTO dice_bets (round_id,user_id,username,amount) VALUES (?,?,?,?)',[roundId,playerId,username,stake]);
      const betId=String(bet.lastInsertRowid);
      const logId=String(await records.logDiceBet(roundId,chatId,playerId,username,stake));
      await runtime.execute(
        'INSERT INTO dice_bet_operations (round_id,player_id,bet_id,log_id,operation_key) VALUES (?,?,?,?,?)',
        [roundId,playerId,betId,logId,key]);
      const endTime=Number(round.end_time)+(extend?10000:0);
      if(extend)await runtime.execute('UPDATE dice_rounds SET end_time=? WHERE round_id=?',[endTime,roundId]);
      if(withBot)await runtime.execute("UPDATE dice_runtime_rounds SET bot_mode='auto' WHERE round_id=?",[roundId]);
      await runtime.execute(
        'INSERT INTO finance_log(ts,type,actor_user_id,amount,currency,ref,chat_id,action,payload,success,operation_key,entity_type,entity_id,actor_name_snapshot) VALUES (?,?,?,?,?,?,?,?,?,1,?,?,?,?)',
        [now(),'dice_bet',playerId,stake,'PF',roundId,chatId,'dice_bet',JSON.stringify({betId,logId}),key,'dice_round',roundId,username]);
      const result={success:true,roundId,playerId,amount:stake,betId,logId,endTime,replayed:false};
      await runtime.execute('UPDATE wallet_operations SET result_json=? WHERE operation_key=?',[JSON.stringify(result),key]);
      return result;
    });
  }
  return {openDiceRound,placeDiceBet};
}

module.exports={createDiceBet};
