'use strict';
const {createHash}=require('node:crypto');
const {withTransaction,withDeadlockRetry}=require('../db/transaction');
const {integer}=require('./walletMovement');
const {lockWallet,saveWallet}=require('../repositories/wallets');
const hash=value=>createHash('sha256').update(value).digest('hex');
const fail=code=>{throw Object.assign(new Error(code),{code});};
function percentage(value){
  const match=/^(\d{1,3})(?:\.(\d{1,18}))?$/.exec(String(value));
  if(!match)fail('DONATION_RATE_INVALID');
  const scale=10n**BigInt((match[2]||'').length),numerator=BigInt(match[1])*scale+BigInt(match[2]||0);
  if(numerator>100n*scale)fail('DONATION_RATE_INVALID');
  return {numerator,denominator:100n*scale};
}
function normalizePayment(event){
  if(event?.currency!=='XTR')fail('PAYMENT_CURRENCY_INVALID');
  if(typeof event.chargeId!=='string'||!event.chargeId||event.chargeId.length>1024)fail('PAYMENT_CHARGE_INVALID');
  if(typeof event.playerId!=='string'||!/^\d{1,31}$/.test(event.playerId))fail('PAYMENT_PLAYER_INVALID');
  if(typeof event.invoicePayload!=='string'||event.invoicePayload.length>128)fail('PAYMENT_PAYLOAD_INVALID');
  const stars=integer(event.stars);if(stars<=0n||stars*10n>9223372036854775807n)fail('PAYMENT_AMOUNT_INVALID');
  return {playerId:event.playerId,stars:String(stars),currency:'XTR',invoicePayload:event.invoicePayload};
}
function createTelegramPayments(pool,{referralPercent=10,now=()=>Date.now()}={}){
  const defaultRate=percentage(referralPercent);
  return async event=>{
    const request=normalizePayment(event),key=hash(event.chargeId),requestHash=hash(JSON.stringify(request));
    return withDeadlockRetry(()=>withTransaction(pool,async connection=>{
      await connection.execute('INSERT INTO telegram_payments(charge_hash,request_hash,player_id,stars,currency,created_ms) VALUES (?,?,?,?,?,?) ON DUPLICATE KEY UPDATE charge_hash=VALUES(charge_hash)',[key,requestHash,request.playerId,request.stars,'XTR',now()]);
      const [[previous]]=await connection.execute('SELECT request_hash,result_json FROM telegram_payments WHERE charge_hash=? FOR UPDATE',[key]);
      if(previous.request_hash!==requestHash)fail('PAYMENT_CHARGE_CONFLICT');
      if(previous.result_json)return JSON.parse(previous.result_json);
      const [[referral]]=await connection.execute('SELECT referrer_id FROM player_referrals WHERE player_id=? FOR UPDATE',[request.playerId]);
      const referrer=referral?.referrer_id;
      const ids=[...new Set([request.playerId,...(referrer?[referrer]:[])])].sort();
      for(const id of ids){const [[row]]=await connection.execute('SELECT telegram_id FROM players WHERE telegram_id=? FOR UPDATE',[id]);if(!row)fail('PAYMENT_PLAYER_MISSING');}
      const reward=BigInt(request.stars)*10n;
      let bonus=0n,partner=false;
      if(referrer){
        const [roles]=await connection.execute('SELECT c.name FROM role_catalog c JOIN player_roles r ON r.role_id=c.id WHERE r.player_id=?',[referrer]);
        partner=roles.some(r=>['партнёр','partner'].includes(r.name.toLowerCase()));
        const rate=partner?percentage(15):defaultRate;
        bonus=reward*rate.numerator/rate.denominator;
      }
      for(const id of ids){
        const amount=id===request.playerId?reward:bonus;
        if(!amount)continue;
        const wallet={playerId:id,asset:'DF',bucket:'main'};
        const before=await lockWallet(connection,wallet);
        if(before+amount>9223372036854775807n)fail('WALLET_OVERFLOW');
        await saveWallet(connection,wallet,before+amount,amount,'payment:'+key+':'+(id===request.playerId?'payer':'referral'),'payment_credit');
      }
      const [[stats]]=await connection.execute('SELECT total_donated_stars FROM player_donation_state WHERE player_id=? FOR UPDATE',[request.playerId]);
      if(stats?.total_donated_stars===null||stats?.total_donated_stars===undefined)fail('DONATION_STATE_INVALID');
      const total=BigInt(stats.total_donated_stars)+BigInt(request.stars);
      if(total>9223372036854775807n)fail('DONATION_STATE_OVERFLOW');
      await connection.execute('UPDATE player_donation_state SET total_donated_stars=? WHERE player_id=?',[String(total),request.playerId]);
      const [[last]]=await connection.execute('SELECT MAX(ordinal) AS n FROM player_donation_events WHERE player_id=?',[request.playerId]);
      const ordinal=last.n===null?0n:BigInt(last.n)+1n;
      const history='{"amount":'+request.stars+',"timestamp":'+Math.floor(now()/1000)+'}';
      await connection.execute('INSERT INTO player_donation_events(player_id,ordinal,value_json) VALUES (?,?,?)',[request.playerId,String(ordinal),history]);
      await connection.execute('INSERT INTO finance_log(ts,type,actor_user_id,amount,currency,payload,success) VALUES (?,?,?,?,?,?,1)',[now(),'donation',request.playerId,String(reward),'DF',JSON.stringify({chargeHash:key,stars:request.stars})]);
      const result={reward:String(reward),stars:request.stars,referrerId:referrer||null,referrerBonus:String(bonus),partner};
      await connection.execute('UPDATE telegram_payments SET result_json=? WHERE charge_hash=?',[JSON.stringify(result),key]);
      return result;
    }));
  };
}
module.exports={percentage,normalizePayment,createTelegramPayments};
