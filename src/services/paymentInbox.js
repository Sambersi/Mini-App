'use strict';
const {createHash}=require('node:crypto');
const {withTransaction,withDeadlockRetry}=require('../db/transaction');
const {createTelegramPayments,normalizePayment}=require('./telegramPayments');
const hash=value=>createHash('sha256').update(value).digest('hex');
const fail=code=>{throw Object.assign(new Error(code),{code});};
function createPaymentInbox(pool,{now=()=>Date.now(),referralPercent=10,inTransaction=()=>false,runTransaction=work=>withDeadlockRetry(()=>withTransaction(pool,work))}={}){
  const process=async key=>runTransaction(async connection=>{
    const [[row]]=await connection.execute('SELECT event_json,state,result_json FROM payment_inbox WHERE charge_hash=? FOR UPDATE',[key]);
    if(!row)fail('PAYMENT_INBOX_MISSING');
    if(row.state==='processed')return {...JSON.parse(row.result_json),replayed:true};
    const apply=createTelegramPayments(connection,{now,referralPercent,runTransaction:work=>work(connection)});
    const result=await apply(JSON.parse(row.event_json));
    await connection.execute("UPDATE payment_inbox SET state='processed',result_json=?,attempts=attempts+1,last_error=NULL,last_attempt_ms=? WHERE charge_hash=?",[JSON.stringify(result),now(),key]);
    return result;
  });
  const recordFailure=async(key,error)=>{
    const code=/^[A-Z_0-9]{1,64}$/.test(error.code||'')?error.code:'PAYMENT_PROCESSING_FAILED';
    try{await pool.execute("UPDATE payment_inbox SET attempts=attempts+1,last_error=?,last_attempt_ms=? WHERE charge_hash=? AND state='pending'",[code,now(),key]);}catch{}
  };
  return {
    async processTelegramPayment(input){
      if(inTransaction())fail('PAYMENT_RECEIVE_REQUIRES_OUTER_COMMIT');
      const request=normalizePayment(input),key=hash(input.chargeId),fingerprint=hash(JSON.stringify(request));
      const event={...request,chargeId:input.chargeId};
      // This receipt commits before the award transaction, so failures of
      // downstream tables leave a durable pending payment for recovery.
      await pool.execute('INSERT INTO payment_inbox(charge_hash,request_hash,event_json,received_ms) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE charge_hash=VALUES(charge_hash)',[key,fingerprint,JSON.stringify(event),now()]);
      const [[row]]=await pool.execute('SELECT request_hash FROM payment_inbox WHERE charge_hash=?',[key]);
      if(row.request_hash!==fingerprint)fail('PAYMENT_CHARGE_CONFLICT');
      try{return await process(key);}catch(error){await recordFailure(key,error);throw error;}
    },
    async recoverTelegramPayments(limit=50){
      if(inTransaction())fail('PAYMENT_RECEIVE_REQUIRES_OUTER_COMMIT');
      if(!Number.isSafeInteger(limit)||limit<1||limit>100)fail('PAYMENT_RECOVERY_LIMIT_INVALID');
      const [rows]=await pool.execute("SELECT charge_hash FROM payment_inbox WHERE state='pending' ORDER BY GREATEST(received_ms,last_attempt_ms),charge_hash LIMIT "+limit);
      let processed=0,failed=0;
      for(const row of rows){try{await process(row.charge_hash);processed++;}catch(error){await recordFailure(row.charge_hash,error);failed++;}}
      return {processed,failed};
    },
  };
}
module.exports={createPaymentInbox};
