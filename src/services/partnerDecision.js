'use strict';
const {integer}=require('./walletMovement');
const {lockWallet,saveWallet}=require('../repositories/wallets');
const {mainLimit}=require('./financePolicy');
const {compatibleNumber}=require('../repositories/legacyReads');
const allowedPartnerRoleIds=Object.freeze([2,9,8]);
const fail=code=>{throw Object.assign(new Error(code),{code});};
function createPartnerDecision(runtime,{runTransaction,now=()=>Date.now()}){return async({requestId,adminId,decision,overrides=null})=>{
  if(!['approve','reject'].includes(decision))fail('PARTNER_DECISION_INVALID');adminId=String(adminId);
  return runTransaction(async connection=>{
    const [[request]]=await connection.execute('SELECT * FROM partner_requests WHERE id=? FOR UPDATE',[requestId]);if(!request)fail('PARTNER_REQUEST_MISSING');
    for(const id of [...new Set([adminId,request.partner_id])].sort())await connection.execute('SELECT telegram_id FROM players WHERE telegram_id=? FOR UPDATE',[id]);
    const [roles]=await connection.execute("SELECT role_id FROM player_roles WHERE player_id=? AND role_id IN (2,9,8) AND (original_value_json IS NULL OR JSON_TYPE(original_value_json) IN ('INTEGER','DOUBLE'))",[adminId]);if(!roles.length)fail('PARTNER_ADMIN_DENIED');
    const [[previous]]=await connection.execute('SELECT decision,result_json FROM partner_request_decisions WHERE request_id=?',[requestId]);
    if(previous){if(previous.decision!==decision)fail('PARTNER_REQUEST_PROCESSED');return {...JSON.parse(previous.result_json),replayed:true};}
    if(request.status!=='pending')fail('PARTNER_REQUEST_PROCESSED');
    const effective={...request};
    if(overrides&&decision==='approve')for(const field of ['name','prize_type','prize_amount','audience_type','template'])if(Object.hasOwn(overrides,field))effective[field]=overrides[field];
    let amount=null,currency=null,promoId=null;
    if(decision==='approve'){
      const value=integer(typeof effective.prize_amount==='string'?effective.prize_amount.replace(/\.0+$/,''):effective.prize_amount);if(value<=0n)fail('AMOUNT_INVALID');effective.prize_amount=String(value);
      if(request.request_type==='currency'){
        if(!['balance','df_balance'].includes(effective.prize_type))fail('PARTNER_PRIZE_INVALID');
        currency=effective.prize_type==='balance'?'PF':'DF';
        let limit=null;
        if(currency==='PF'){
          const [[card]]=await connection.execute('SELECT account_level FROM player_cards WHERE player_id=? FOR UPDATE',[request.partner_id]);if(!card)fail('FINANCE_CONTROLS_MISSING');
          limit=mainLimit(card.account_level);
        }
        const wallet={playerId:request.partner_id,asset:currency,bucket:'main'},before=await lockWallet(connection,wallet);
        if(before+value>9223372036854775807n)fail('WALLET_OVERFLOW');
        if(limit!==null&&before+value>limit)fail('DESTINATION_LIMIT');
        await saveWallet(connection,wallet,before+value,value,'partner:'+requestId+':credit','partner_credit');amount=String(value);
      }else{
        if(request.request_type!=='promo'||!['balance','df_balance','container_type_3','tickets'].includes(effective.prize_type))fail('PARTNER_PRIZE_INVALID');
        if(typeof effective.name!=='string'||!effective.name||effective.name.length>191)fail('PARTNER_NAME_INVALID');
        if(!['all','referrals'].includes(effective.audience_type)||!['normal','fat'].includes(effective.template))fail('PARTNER_PRIZE_INVALID');
        try{const [inserted]=await connection.execute('INSERT INTO promos(name,activations_left,prize_type,prize_amount,created_by,min_status_id,expires_at,creator_id,audience_type,template) VALUES (?,-1,?,?,?,0,NULL,?,?,?)',[effective.name,effective.prize_type,String(value),'partner_system',request.partner_id,effective.audience_type,effective.template]);promoId=String(inserted.insertId);}
        catch(error){if(error.code==='ER_DUP_ENTRY')fail('PROMO_NAME_TAKEN');throw error;}
      }
    }
    const status=decision==='approve'?'approved':'rejected';
    await connection.execute('UPDATE partner_requests SET status=?,name=?,prize_type=?,prize_amount=?,audience_type=?,template=? WHERE id=?',[status,effective.name,effective.prize_type,effective.prize_amount,effective.audience_type,effective.template,requestId]);
    const result={request:{...effective,prize_amount:compatibleNumber(effective.prize_amount),status},adminId,decision,amount,currency,promoId,replayed:false};
    await connection.execute('INSERT INTO partner_request_decisions(request_id,admin_id,decision,result_json) VALUES (?,?,?,?)',[requestId,adminId,decision,JSON.stringify({...result,original:request})]);
    await connection.execute('INSERT INTO finance_log(ts,type,actor_user_id,target_user_id,amount,currency,ref,action,payload,success) VALUES (?,?,?,?,?,?,?,?,?,1)',[now(),'partner_decision',adminId,request.partner_id,amount,currency,String(requestId),status,JSON.stringify({decision,promoId})]);
    return result;
  });
};}
module.exports={createPartnerDecision,allowedPartnerRoleIds};
