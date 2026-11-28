'use strict';
const {createHash}=require('node:crypto');
const {withTransaction,withDeadlockRetry}=require('../db/transaction');
const {lockWallet,saveWallet}=require('../repositories/wallets');
const {mainLimit,cardLimit}=require('./financePolicy');
const MAX=9223372036854775807n;
const fail=code=>{throw Object.assign(new Error(code),{code});};
function signedAmount(value){
  if(typeof value==='number'&&!Number.isSafeInteger(value))fail('AMOUNT_INVALID');
  if(!['number','string','bigint'].includes(typeof value)||! /^-?\d+$/.test(String(value)))fail('AMOUNT_INVALID');
  const result=BigInt(value);if(result>MAX||result< -MAX)fail('AMOUNT_INVALID');return result;
}
function calculateAdjustment(before,delta,limit=null){
  if(before+delta<0n)fail('INSUFFICIENT_FUNDS');
  let applied=delta;
  if(delta>0n&&limit!==null){const room=limit>before?limit-before:0n;applied=delta<room?delta:room;}
  if(before+applied>MAX)fail('WALLET_OVERFLOW');
  return {newBalance:String(before+applied),applied:String(applied),limited:applied!==delta};
}
function createBalanceAdjustment(pool,{runTransaction=work=>withDeadlockRetry(()=>withTransaction(pool,work))}={}){return async input=>{
  if(!input||typeof input.operationKey!=='string'||!/^[A-Za-z0-9:_-]{1,150}$/.test(input.operationKey))fail('OPERATION_KEY_INVALID');
  if(typeof input.playerId!=='string'||!/^[\x21-\x7e]{1,32}$/.test(input.playerId)||!['PF','DF'].includes(input.asset)||!['main','card'].includes(input.bucket)||(input.asset==='DF'&&input.bucket!=='main'))fail('WALLET_INVALID');
  const mode=input.limitMode||'none';
  if(!['none','main-level','card-level'].includes(mode)||(input.asset==='DF'&&mode!=='none')||(mode==='main-level'&&input.bucket!=='main')||(mode==='card-level'&&input.bucket!=='card'))fail('WALLET_LIMIT_INVALID');
  const absolute=input.balance!==undefined;
  const value=signedAmount(absolute?input.balance:input.delta),key=input.operationKey;
  if(absolute&&value<0n)fail('AMOUNT_INVALID');
  const hash=createHash('sha256').update(JSON.stringify({kind:absolute?'set':'adjust',playerId:input.playerId,asset:input.asset,bucket:input.bucket,delta:String(value),mode})).digest('hex');
  return runTransaction(async connection=>{
    await connection.execute('INSERT INTO wallet_operations(operation_key,request_hash) VALUES (?,?) ON DUPLICATE KEY UPDATE operation_key=VALUES(operation_key)',[key,hash]);
    const [[previous]]=await connection.execute('SELECT request_hash,result_json FROM wallet_operations WHERE operation_key=? FOR UPDATE',[key]);
    if(previous.request_hash!==hash)fail('OPERATION_KEY_CONFLICT');
    if(previous.result_json)return JSON.parse(previous.result_json);
    const [[player]]=await connection.execute('SELECT telegram_id FROM players WHERE telegram_id=? FOR UPDATE',[input.playerId]);
    if(!player)fail('PLAYER_MISSING');
    let limit=null;
    if(mode!=='none'){
      const [[card]]=await connection.execute('SELECT account_level FROM player_cards WHERE player_id=? FOR UPDATE',[input.playerId]);
      if(!card)fail('FINANCE_CONTROLS_MISSING');
      limit=mode==='main-level'?mainLimit(card.account_level):cardLimit(card.account_level);
    }
    const wallet={playerId:input.playerId,asset:input.asset,bucket:input.bucket};
    const before=await lockWallet(connection,wallet);
    const delta=absolute?value-before:value;
    const result=calculateAdjustment(before,delta,limit);
    await saveWallet(connection,wallet,BigInt(result.newBalance),BigInt(result.applied),'adjust:'+key,'adjustment');
    await connection.execute('UPDATE wallet_operations SET result_json=? WHERE operation_key=?',[JSON.stringify(result),key]);
    return result;
  });
};}
module.exports={signedAmount,calculateAdjustment,createBalanceAdjustment};
