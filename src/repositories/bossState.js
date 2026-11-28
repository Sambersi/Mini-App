'use strict';
const {compatibleNumber}=require('./legacyReads');
const energyByRole=Object.freeze({GOLD:20,PLATINUM:30,DIAMOND:40,'Администратор':50,'Тех администратор':150});
function restoredEnergy({energy,lastRestore,maxEnergy,nowSeconds}){
  if(energy===null||lastRestore===null)return {energy:0n,lastRestore:nowSeconds,changed:true};
  const elapsed=Math.floor((nowSeconds-Number(lastRestore))/300);
  if(elapsed<=0)return {energy:BigInt(energy),lastRestore,changed:false};
  const restored=BigInt(energy)+BigInt(elapsed),maximum=BigInt(maxEnergy);
  // Preserve the source clock semantics: a restore resets the clock to now,
  // discards the partial interval and clamps an existing over-limit balance.
  return {energy:restored>maximum?maximum:restored,lastRestore:nowSeconds,changed:true};
}
function createBossState(runtime,{now=()=>Date.now()}={}){
  async function getMaxEnergyByStatus(id){const roles=await runtime.many('SELECT c.name FROM role_catalog c JOIN player_roles r ON r.role_id=c.id WHERE r.player_id=?',[String(id)]);return roles.reduce((max,row)=>Math.max(max,energyByRole[row.name]||10),10);}
  async function readRestoredEnergy(id){
    if(!await runtime.one('SELECT telegram_id FROM players WHERE telegram_id=? FOR UPDATE',[String(id)]))return null;
    const row=await runtime.one('SELECT energy,last_energy_restore FROM player_boss_state WHERE player_id=? FOR UPDATE',[String(id)]);if(!row)return null;
    const restored=restoredEnergy({energy:row.energy,lastRestore:row.last_energy_restore,maxEnergy:await getMaxEnergyByStatus(id),nowSeconds:Math.floor(now()/1000)});
    if(restored.changed)await runtime.execute('UPDATE player_boss_state SET energy=?,last_energy_restore=? WHERE player_id=?',[String(restored.energy),restored.lastRestore,String(id)]);
    return restored;
  }
  async function restoreEnergy(id){await runtime.transaction(()=>readRestoredEnergy(id));}
  async function getCurrentEnergy(id){return runtime.transaction(async()=>compatibleNumber(String((await readRestoredEnergy(id))?.energy??0n)));}
  async function reduceUserEnergy(id){return runtime.transaction(async()=>{
    if(!await runtime.one('SELECT telegram_id FROM players WHERE telegram_id=? FOR UPDATE',[String(id)]))return {changes:0,lastInsertRowid:0};
    // A duplicate or concurrent debit must not create negative energy.
    return runtime.execute('UPDATE player_boss_state SET energy=energy-1 WHERE player_id=? AND energy>0',[String(id)]);
  });}
  async function addNewBoss(name,imageFile,hp,prizeType,prizeAmount){
    if(!prizeType||!prizeAmount)throw Object.assign(new Error('Некорректные данные приза.'),{code:'BOSS_PRIZE_INVALID'});
    if(typeof hp==='number'&&!Number.isSafeInteger(hp))throw new TypeError('Invalid boss HP');
    if(!/^\d+$/.test(String(hp))||BigInt(hp)>9223372036854775807n)throw new TypeError('Invalid boss HP');
    const total=BigInt(hp),first=total/2n,second=total-first;
    return runtime.execute('INSERT INTO bosses(name,imageFile,phase1_hp,phase2_hp,phase1_max_hp,phase2_max_hp,prize_type,prize_amount) VALUES (?,?,?,?,?,?,?,?)',[name,imageFile,String(first),String(second),String(first),String(second),prizeType,prizeAmount]);
  }
  async function transitionToPhase2(id){return runtime.execute('UPDATE bosses SET phase=2,phase2_hp=phase2_max_hp WHERE id=?',[id]);}
  async function getUsersWithDamage(){return runtime.many('SELECT user_id FROM boss_damage WHERE damage>0 GROUP BY user_id ORDER BY MIN(id)');}
  async function addBossDamageToUser(id,damage){await runtime.execute('INSERT INTO boss_damage(user_id,damage,timestamp) VALUES (?,?,?)',[String(id),damage,Math.floor(now()/1000)]);return {success:true};}
  async function reduceAttackPowerBy90Percent(){await runtime.execute('UPDATE player_boss_state SET attack_power=TRUNCATE(attack_power/10,0)');}
  async function updateLastAttackTime(id,time){await runtime.execute('INSERT INTO boss_state(id,last_attack_time) VALUES (?,?) ON DUPLICATE KEY UPDATE last_attack_time=VALUES(last_attack_time)',[String(id),time]);}
  async function setBossCallerId(id){await runtime.execute('INSERT INTO boss_state(id,boss_caller_id) VALUES (?,?) ON DUPLICATE KEY UPDATE boss_caller_id=VALUES(boss_caller_id)',[String(id),String(id)]);}
  return {getMaxEnergyByStatus,restoreEnergy,getCurrentEnergy,reduceUserEnergy,addNewBoss,transitionToPhase2,getUsersWithDamage,addBossDamageToUser,reduceAttackPowerBy90Percent,updateLastAttackTime,setBossCallerId};
}
module.exports={createBossState,restoredEnergy,energyByRole};
