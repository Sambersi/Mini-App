'use strict';
const assert=require('node:assert/strict');
const {createMysqlApi}=require('../src/db/api');
const {createDatabaseRuntime}=require('../src/db/runtime');
async function runBossStateChecks({pool,runtime,service,playerId,now}){
  let checks=0;const seconds=Math.floor(now/1000);
  const one=async(sql,args=[])=>{const [[row]]=await pool.execute(sql,args);return row;};
  const state=()=>one('SELECT * FROM player_boss_state WHERE player_id=?',[playerId]);
  const oldState=await state();let bossId;
  try{
    await pool.execute('UPDATE player_boss_state SET energy=2,last_energy_restore=? WHERE player_id=?',[seconds-299,playerId]);assert.equal(await service.getCurrentEnergy(playerId),2);assert.equal(Number((await state()).last_energy_restore),seconds-299);checks++;
    await pool.execute('UPDATE player_boss_state SET last_energy_restore=? WHERE player_id=?',[seconds-650,playerId]);const restored=await Promise.all(Array.from({length:20},()=>service.getCurrentEnergy(playerId)));assert.ok(restored.every(value=>value===4));assert.equal(Number((await state()).last_energy_restore),seconds);checks++;
    assert.equal(await service.getMaxEnergyByStatus(playerId),10);await service.createStatus('DIAMOND',5);const role=await service.getStatusByName('DIAMOND');await service.updateUserStatus(playerId,role.id);assert.equal(await service.getMaxEnergyByStatus(playerId),40);await pool.execute('UPDATE player_boss_state SET energy=39,last_energy_restore=? WHERE player_id=?',[seconds-600,playerId]);assert.equal(await service.getCurrentEnergy(playerId),40);await service.removeUserStatus(playerId,role.id);checks++;
    await pool.execute('UPDATE player_boss_state SET energy=20,last_energy_restore=? WHERE player_id=?',[seconds-300,playerId]);assert.equal(await service.getCurrentEnergy(playerId),10);checks++;
    await pool.execute('UPDATE player_boss_state SET energy=5,last_energy_restore=? WHERE player_id=?',[seconds+300,playerId]);assert.equal(await service.getCurrentEnergy(playerId),5);await Promise.all(Array.from({length:20},()=>service.reduceUserEnergy(playerId)));assert.equal(Number((await state()).energy),0);checks++;
    await pool.execute('UPDATE player_boss_state SET energy=NULL,last_energy_restore=NULL WHERE player_id=?',[playerId]);assert.equal(await service.getCurrentEnergy(playerId),0);assert.equal(Number((await state()).last_energy_restore),seconds);assert.equal(await service.getCurrentEnergy('900099998'),0);checks++;
    await service.updateLastAttackTime(playerId,123);await service.setBossCallerId(playerId);assert.equal(await service.getLastAttackTime(playerId),123);assert.equal(await service.getBossCallerId(playerId),playerId);await service.updateLastAttackTime(playerId,456);assert.equal(await service.getBossCallerId(playerId),playerId);checks++;
    const inserted=await service.addNewBoss('FixtureBoss','fixture.png',101,'balance',100);bossId=inserted.lastInsertRowid;const boss=await one('SELECT * FROM bosses WHERE id=?',[bossId]);assert.equal(Number(boss.phase1_hp),50);assert.equal(Number(boss.phase2_hp),51);await pool.execute('UPDATE bosses SET phase2_hp=1 WHERE id=?',[bossId]);await service.transitionToPhase2(bossId);const transitioned=await one('SELECT * FROM bosses WHERE id=?',[bossId]);assert.equal(Number(transitioned.phase),2);assert.equal(Number(transitioned.phase2_hp),51);checks++;
    await Promise.all(Array.from({length:20},()=>service.addBossDamageToUser(playerId,3)));assert.equal(await service.getBossDamageByUserId(playerId),60);assert.deepEqual(await service.getUsersWithDamage(),[{user_id:playerId}]);checks++;
    await pool.execute('UPDATE player_boss_state SET attack_power=19 WHERE player_id=?',[playerId]);await service.reduceAttackPowerBy90Percent();assert.equal(Number((await state()).attack_power),1);checks++;
    const brokenPool={getConnection:async()=>{const c=await pool.getConnection();return new Proxy(c,{get(target,key){if(key==='execute')return(sql,args)=>sql.startsWith('UPDATE player_boss_state SET energy=?,last_energy_restore=?')?target.execute('SELECT missing_boss_fixture_column'):target.execute(sql,args);const value=target[key];return typeof value==='function'?value.bind(target):value;}});}};
    await pool.execute('UPDATE player_boss_state SET energy=2,last_energy_restore=? WHERE player_id=?',[seconds-300,playerId]);await assert.rejects(createMysqlApi(createDatabaseRuntime(brokenPool),{now:()=>now}).getCurrentEnergy(playerId),{code:'ER_BAD_FIELD_ERROR'});assert.equal(Number((await state()).energy),2);assert.equal(Number((await state()).last_energy_restore),seconds-300);checks++;
    return checks;
  }finally{
    if(bossId)await pool.execute('DELETE FROM bosses WHERE id=?',[bossId]);await pool.execute('DELETE FROM boss_state WHERE id=?',[playerId]);await pool.execute('DELETE FROM boss_damage WHERE user_id=?',[playerId]);
    await pool.execute('UPDATE player_boss_state SET energy=?,last_energy_restore=?,attack_power=? WHERE player_id=?',[oldState.energy,oldState.last_energy_restore,oldState.attack_power,playerId]);
    await pool.execute('DELETE r FROM player_roles r JOIN role_catalog c ON c.id=r.role_id WHERE c.name=?',['DIAMOND']);await pool.execute('DELETE FROM role_catalog WHERE name=?',['DIAMOND']);
  }
}
module.exports={runBossStateChecks};
