'use strict';
const {createHash}=require('node:crypto');
const {lockWallet,saveWallet}=require('../repositories/wallets');
const fail=(code,details)=>{throw Object.assign(new Error(code),{code,details});};
function createAttackUpgrade(runtime,bossState,{runTransaction,now=()=>Date.now()}){return async({playerId,operationKey})=>{
  if(typeof operationKey!=='string'||!/^[A-Za-z0-9:_-]{1,100}$/.test(operationKey))fail('OPERATION_KEY_INVALID');
  playerId=String(playerId);const key='attack_upgrade:'+operationKey,hash=createHash('sha256').update(JSON.stringify({playerId})).digest('hex');
  const outcome=await runTransaction(async connection=>{
    await connection.execute('INSERT INTO wallet_operations(operation_key,request_hash) VALUES (?,?) ON DUPLICATE KEY UPDATE operation_key=VALUES(operation_key)',[key,hash]);
    const [[receipt]]=await connection.execute('SELECT request_hash,result_json FROM wallet_operations WHERE operation_key=? FOR UPDATE',[key]);
    if(receipt.request_hash!==hash)fail('OPERATION_KEY_CONFLICT');if(receipt.result_json)return {...JSON.parse(receipt.result_json),replayed:true};
    if(!(await connection.execute('SELECT telegram_id FROM players WHERE telegram_id=? FOR UPDATE',[playerId]))[0][0])fail('PLAYER_MISSING');
    const [[state]]=await connection.execute('SELECT attack_power FROM player_boss_state WHERE player_id=? FOR UPDATE',[playerId]);if(!state)fail('PLAYER_STATE_MISSING');
    const power=state.attack_power===null||BigInt(state.attack_power)===0n?1n:BigInt(state.attack_power),price=power*100n;
    if(power<1n||price>9223372036854775807n)fail('ATTACK_POWER_INVALID');
    const wallet={playerId,asset:'PF',bucket:'main'},before=await lockWallet(connection,wallet);if(before<price)fail('INSUFFICIENT_FUNDS',{price:String(price)});
    const energy=BigInt(await bossState.getCurrentEnergy(playerId)),maxEnergy=await bossState.getMaxEnergyByStatus(playerId);
    if(energy<=0n){const [[clock]]=await connection.execute('SELECT last_energy_restore FROM player_boss_state WHERE player_id=?',[playerId]);return {failure:'ENERGY_EMPTY',details:{energy:String(energy),maxEnergy,nextRestoreTime:Number(clock.last_energy_restore)+300}};}
    await saveWallet(connection,wallet,before-price,-price,key+':debit','attack_upgrade');
    await connection.execute('UPDATE player_boss_state SET energy=?,attack_power=? WHERE player_id=?',[String(energy-1n),String(power+1n),playerId]);
    const result={price:String(price),balance:String(before-price),attackPower:String(power+1n),energy:String(energy-1n),maxEnergy,replayed:false};
    await connection.execute('INSERT INTO finance_log(ts,type,actor_user_id,amount,currency,ref,action,payload,success) VALUES (?,?,?,?,?,?,?,?,1)',[now(),'attack_upgrade',playerId,String(price),'PF',key,'attack_upgrade',JSON.stringify({attackPower:result.attackPower,energy:result.energy})]);
    await connection.execute('UPDATE wallet_operations SET result_json=? WHERE operation_key=?',[JSON.stringify(result),key]);return result;
  });
  // Persist initialization of an absent energy clock even on an empty-energy
  // refusal, as the old independent restore did. No purchase is receipted.
  if(outcome.failure)fail(outcome.failure,outcome.details);
  return outcome;
};}
module.exports={createAttackUpgrade};
