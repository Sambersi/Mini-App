'use strict';
const assert=require('node:assert/strict');
const {createMysqlApi}=require('../src/db/api');
const {createDatabaseRuntime}=require('../src/db/runtime');
async function runAttackUpgradeChecks({pool,service,playerId,now}){
  let checks=0;const seconds=Math.floor(now/1000);
  const one=async(sql,args=[])=>{const [[row]]=await pool.execute(sql,args);return row;};
  const balance=async()=>BigInt((await one("SELECT balance FROM wallets WHERE player_id=? AND asset='PF' AND bucket='main'",[playerId])).balance);
  const state=()=>one('SELECT * FROM player_boss_state WHERE player_id=?',[playerId]);
  const original=await state(),originalBalance=await balance();
  const request={playerId,operationKey:'fixture_attack_upgrade'};
  try{
    await pool.execute("UPDATE wallets SET balance=100000 WHERE player_id=? AND asset='PF' AND bucket='main'",[playerId]);await pool.execute('UPDATE player_boss_state SET attack_power=1,energy=10,last_energy_restore=? WHERE player_id=?',[seconds,playerId]);
    const repeated=await Promise.all(Array.from({length:20},()=>service.purchaseAttackUpgrade(request)));assert.equal(repeated.filter(row=>!row.replayed).length,1);assert.equal(await balance(),99900n);assert.equal(Number((await state()).energy),9);assert.equal(Number((await state()).attack_power),2);assert.equal(Number((await one("SELECT COUNT(*) AS n FROM finance_log WHERE type='attack_upgrade'")).n),1);checks++;
    await assert.rejects(service.purchaseAttackUpgrade({...request,playerId:'900000101'}),{code:'OPERATION_KEY_CONFLICT'});checks++;
    const concurrent=await Promise.all(Array.from({length:20},(_,i)=>service.purchaseAttackUpgrade({...request,operationKey:'fixture_attack_concurrent_'+i}).then(value=>({value}),error=>({error}))));assert.equal(concurrent.filter(row=>row.value).length,9);assert.ok(concurrent.filter(row=>row.error).every(row=>row.error.code==='ENERGY_EMPTY'));assert.equal(await balance(),94500n);assert.equal(Number((await state()).energy),0);assert.equal(Number((await state()).attack_power),11);checks++;
    await pool.execute('UPDATE player_boss_state SET energy=1 WHERE player_id=?',[playerId]);await pool.execute("UPDATE wallets SET balance=1 WHERE player_id=? AND asset='PF' AND bucket='main'",[playerId]);await assert.rejects(service.purchaseAttackUpgrade({...request,operationKey:'fixture_attack_no_funds'}),{code:'INSUFFICIENT_FUNDS'});assert.equal(Number((await state()).energy),1);assert.equal(Number((await state()).attack_power),11);checks++;
    await pool.execute("UPDATE wallets SET balance=100000 WHERE player_id=? AND asset='PF' AND bucket='main'",[playerId]);await pool.execute('UPDATE player_boss_state SET energy=0,last_energy_restore=? WHERE player_id=?',[seconds-300,playerId]);await service.purchaseAttackUpgrade({...request,operationKey:'fixture_attack_restored'});assert.equal(Number((await state()).energy),0);assert.equal(Number((await state()).attack_power),12);checks++;
    await pool.execute('UPDATE player_boss_state SET energy=NULL,last_energy_restore=NULL WHERE player_id=?',[playerId]);const beforeEmpty=await balance();await assert.rejects(service.purchaseAttackUpgrade({...request,operationKey:'fixture_attack_null_clock'}),{code:'ENERGY_EMPTY'});assert.equal(Number((await state()).last_energy_restore),seconds);assert.equal(await balance(),beforeEmpty);checks++;
    for(const prefix of ['UPDATE player_boss_state SET energy=?,attack_power=?','UPDATE wallet_operations SET result_json=?']){
      await pool.execute('UPDATE player_boss_state SET energy=1,last_energy_restore=? WHERE player_id=?',[seconds,playerId]);const before=await balance(),power=(await state()).attack_power;
      const brokenPool={getConnection:async()=>{const c=await pool.getConnection();return new Proxy(c,{get(target,key){if(key==='execute')return(sql,args)=>sql.startsWith(prefix)?target.execute('SELECT missing_attack_upgrade_fixture_column'):target.execute(sql,args);const value=target[key];return typeof value==='function'?value.bind(target):value;}});}};
      const key='fixture_attack_failure_'+checks;await assert.rejects(createMysqlApi(createDatabaseRuntime(brokenPool),{now:()=>now}).purchaseAttackUpgrade({...request,operationKey:key}),{code:'ER_BAD_FIELD_ERROR'});assert.equal(await balance(),before);assert.equal((await state()).attack_power,power);assert.equal(Number((await state()).energy),1);assert.equal(Number((await one('SELECT COUNT(*) AS n FROM wallet_operations WHERE operation_key=?',['attack_upgrade:'+key])).n),0);checks++;
    }
    return checks;
  }finally{await pool.execute('UPDATE player_boss_state SET energy=?,last_energy_restore=?,attack_power=? WHERE player_id=?',[original.energy,original.last_energy_restore,original.attack_power,playerId]);await pool.execute("UPDATE wallets SET balance=? WHERE player_id=? AND asset='PF' AND bucket='main'",[String(originalBalance),playerId]);}
}
module.exports={runAttackUpgradeChecks};
