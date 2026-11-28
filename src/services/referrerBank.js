'use strict';
const {createHash,randomUUID}=require('node:crypto');
const {integer}=require('./walletMovement');
const {lockWallet,saveWallet}=require('../repositories/wallets');
const {compatibleNumber}=require('../repositories/legacyReads');
const {canonicalDecimal}=require('../migration/projectPlayers');
const CONFIG=require('../../config');
const SCALE=10n**30n;
function scaled(value){const text=canonicalDecimal(value),match=/^(-?)(\d+)(?:e([+-]?\d+))?$/.exec(text);if(!match)throw new TypeError('Invalid bank decimal');const exponent=Number(match[3]||0)+30;if(exponent<0||exponent>95)throw new TypeError('Invalid bank precision');return (match[1]?-1n:1n)*BigInt(match[2])*10n**BigInt(exponent);}
function decimal(value){const sign=value<0n?'-':'';if(value<0n)value=-value;const fraction=String(value%SCALE).padStart(30,'0').replace(/0+$/,'');return sign+String(value/SCALE)+(fraction?'.'+fraction:'');}
function getReferrerBankPercent(count){return (CONFIG.REFERRER_BANK_TIERS.find(tier=>count>=tier.minRefs&&count<=tier.maxRefs)||CONFIG.REFERRER_BANK_TIERS[0]).percent;}
const fail=code=>{throw Object.assign(new Error(code),{code});};
function createReferrerBank(runtime,reads,{runTransaction,now=()=>Date.now()}){
  async function operation(kind,id,operationKey,input,work){if(typeof operationKey!=='string'||!/^[A-Za-z0-9:_-]{1,100}$/.test(operationKey))fail('OPERATION_KEY_INVALID');const key='referrer_bank:'+operationKey,hash=createHash('sha256').update(JSON.stringify({kind,id,...input})).digest('hex');return runTransaction(async connection=>{
    await connection.execute('INSERT INTO wallet_operations(operation_key,request_hash) VALUES (?,?) ON DUPLICATE KEY UPDATE operation_key=VALUES(operation_key)',[key,hash]);const [[receipt]]=await connection.execute('SELECT request_hash,result_json FROM wallet_operations WHERE operation_key=? FOR UPDATE',[key]);if(receipt.request_hash!==hash)fail('OPERATION_KEY_CONFLICT');if(receipt.result_json)return {...JSON.parse(receipt.result_json),replayed:true};
    if(!(await connection.execute('SELECT telegram_id FROM players WHERE telegram_id=? FOR UPDATE',[id]))[0][0])fail('PLAYER_MISSING');const [[row]]=await connection.execute('SELECT referrer_bank FROM player_referral_state WHERE player_id=? FOR UPDATE',[id]);if(!row)fail('REFERRER_BANK_MISSING');const before=scaled(row.referrer_bank||0);if(before<0n)fail('REFERRER_BANK_INVALID');
    const result=await work(connection,before,key);await connection.execute('UPDATE wallet_operations SET result_json=? WHERE operation_key=?',[JSON.stringify(result),key]);return {...result,replayed:false};
  });}
  async function creditReferrerBank({referrerId,winAmount,operationKey}){const id=String(referrerId),win=integer(winAmount);return operation('credit',id,operationKey,{winAmount:String(win)},async(connection,before,key)=>{
    const count=await reads.getReferralCount(id),percent=getReferrerBankPercent(count),bonus=win*scaled(percent)/(100n*SCALE),limit=scaled(CONFIG.REFERRER_BANK_LIMIT),room=limit>before?limit-before:0n,added=bonus*SCALE<room?bonus*SCALE:room,burned=bonus*SCALE-added;
    await connection.execute('UPDATE player_referral_state SET referrer_bank=? WHERE player_id=?',[decimal(before+added),id]);
    await connection.execute('INSERT INTO finance_log(ts,type,actor_user_id,amount,currency,ref,action,payload,success) VALUES (?,?,?,?,?,?,?,?,1)',[now(),'referrer_bank_credit',id,decimal(added),'PF',key,'referrer_bank_credit',JSON.stringify({winAmount:String(win),percent,burned:decimal(burned)})]);
    return {added:compatibleNumber(decimal(added)),burned:compatibleNumber(decimal(burned)),newBank:compatibleNumber(decimal(before+added))};
  });}
  async function withdrawReferrerBank(id,operationKey='legacy:'+randomUUID()){id=String(id);return operation('withdraw',id,operationKey,{},async(connection,before,key)=>{
    if(before===0n)return {success:false,amount:0,message:'Банк пуст.'};if(before%SCALE!==0n)fail('REFERRER_BANK_FRACTIONAL');const amount=before/SCALE,wallet={playerId:id,asset:'PF',bucket:'main'},balance=await lockWallet(connection,wallet);if(balance+amount>9223372036854775807n)fail('WALLET_OVERFLOW');
    await connection.execute('UPDATE player_referral_state SET referrer_bank=0 WHERE player_id=?',[id]);await saveWallet(connection,wallet,balance+amount,amount,key+':credit','referrer_bank_withdraw');
    await connection.execute('INSERT INTO finance_log(ts,type,actor_user_id,amount,currency,ref,action,success) VALUES (?,?,?,?,?,?,?,1)',[now(),'referrer_bank_withdraw',id,String(amount),'PF','referrer_bank','referrer_bank_withdraw']);return {success:true,amount:compatibleNumber(String(amount))};
  });}
  return {getReferrerBankPercent,getReferrerBank:async id=>compatibleNumber((await runtime.one('SELECT referrer_bank FROM player_referral_state WHERE player_id=?',[String(id)]))?.referrer_bank||0),creditReferrerBank,addToReferrerBank:async(id,win)=>{if(!id||Number(win)<=0)return {added:0,burned:0,newBank:0};return creditReferrerBank({referrerId:id,winAmount:win,operationKey:'legacy:'+randomUUID()});},withdrawReferrerBank};
}
module.exports={createReferrerBank,getReferrerBankPercent,scaled,decimal};
