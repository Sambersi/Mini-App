'use strict';
const assert=require('node:assert/strict');
const {createMysqlApi}=require('../src/db/api');
const {createDatabaseRuntime}=require('../src/db/runtime');
async function runReferrerBankChecks({pool,runtime,now}){
  let checks=0;const id='900000100',api=createMysqlApi(runtime,{now:()=>now});const one=async(sql,args=[])=>{const [[row]]=await pool.execute(sql,args);return row;};const original=await one("SELECT balance FROM wallets WHERE player_id=? AND asset='PF' AND bucket='main'",[id]),old=await api.getReferrerBank(id);
  const request={referrerId:id,winAmount:'1000',operationKey:'fixture_refbank_credit'};
  try{
    await pool.execute('UPDATE player_referral_state SET referrer_bank=0 WHERE player_id=?',[id]);const repeats=await Promise.all(Array.from({length:20},()=>api.creditReferrerBank(request)));assert.equal(repeats.filter(row=>!row.replayed).length,1);assert.equal(await api.getReferrerBank(id),1);checks++;
    await assert.rejects(api.creditReferrerBank({...request,winAmount:'2000'}),{code:'OPERATION_KEY_CONFLICT'});checks++;
    await Promise.all(Array.from({length:20},(_,i)=>api.creditReferrerBank({...request,operationKey:'fixture_refbank_distinct_'+i})));assert.equal(await api.getReferrerBank(id),21);checks++;
    await pool.execute('UPDATE player_referral_state SET referrer_bank=24999 WHERE player_id=?',[id]);const cap=await api.creditReferrerBank({...request,winAmount:'10000',operationKey:'fixture_refbank_cap'});assert.equal(cap.added,1);assert.equal(cap.burned,9);assert.equal(await api.getReferrerBank(id),25000);checks++;
    await pool.execute('UPDATE player_referral_state SET referrer_bank=25001 WHERE player_id=?',[id]);const above=await api.creditReferrerBank({...request,operationKey:'fixture_refbank_above'});assert.equal(above.added,0);assert.equal(above.burned,1);assert.equal(above.newBank,25001);checks++;
    const before=BigInt(original.balance);const withdrawals=await Promise.all(Array.from({length:20},()=>api.withdrawReferrerBank(id,'fixture_refbank_withdraw')));assert.equal(withdrawals.filter(row=>!row.replayed).length,1);assert.equal(await api.getReferrerBank(id),0);assert.equal(BigInt((await one("SELECT balance FROM wallets WHERE player_id=? AND asset='PF' AND bucket='main'",[id])).balance),before+25001n);checks++;
    const emptied=await Promise.all(Array.from({length:20},(_,i)=>api.withdrawReferrerBank(id,'fixture_refbank_empty_'+i)));assert.ok(emptied.every(row=>!row.success));checks++;
    await pool.execute('UPDATE player_referral_state SET referrer_bank=10 WHERE player_id=?',[id]);const racing=await Promise.all(Array.from({length:20},(_,i)=>api.withdrawReferrerBank(id,'fixture_refbank_race_'+i)));assert.equal(racing.filter(row=>row.success).length,1);assert.equal(await api.getReferrerBank(id),0);checks++;
    await pool.execute('UPDATE player_referral_state SET referrer_bank=1.5 WHERE player_id=?',[id]);await assert.rejects(api.withdrawReferrerBank(id,'fixture_refbank_fraction'),{code:'REFERRER_BANK_FRACTIONAL'});assert.equal(await api.getReferrerBank(id),1.5);checks++;
    await pool.execute('UPDATE player_referral_state SET referrer_bank=7 WHERE player_id=?',[id]);const walletBefore=(await one("SELECT balance FROM wallets WHERE player_id=? AND asset='PF' AND bucket='main'",[id])).balance;
    const brokenPool={getConnection:async()=>{const c=await pool.getConnection();return new Proxy(c,{get(target,prop){if(prop==='execute')return(sql,args)=>sql.startsWith('INSERT INTO finance_log')?target.execute('SELECT missing_referrer_bank_fixture_column'):target.execute(sql,args);const value=target[prop];return typeof value==='function'?value.bind(target):value;}});}};
    await assert.rejects(createMysqlApi(createDatabaseRuntime(brokenPool),{now:()=>now}).withdrawReferrerBank(id,'fixture_refbank_failure'),{code:'ER_BAD_FIELD_ERROR'});assert.equal(await api.getReferrerBank(id),7);assert.equal((await one("SELECT balance FROM wallets WHERE player_id=? AND asset='PF' AND bucket='main'",[id])).balance,walletBefore);checks++;
    return checks;
  }finally{await pool.execute('UPDATE player_referral_state SET referrer_bank=? WHERE player_id=?',[old,id]);await pool.execute("UPDATE wallets SET balance=? WHERE player_id=? AND asset='PF' AND bucket='main'",[original.balance,id]);}
}
module.exports={runReferrerBankChecks};
