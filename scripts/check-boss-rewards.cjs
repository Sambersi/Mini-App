'use strict';
const assert=require('node:assert/strict');
const {createMysqlApi}=require('../src/db/api');
const {createDatabaseRuntime}=require('../src/db/runtime');
async function runBossRewardChecks({pool,service,playerId,now}){
  let checks=0;const bosses=[];
  const one=async(sql,args=[])=>{const [[row]]=await pool.execute(sql,args);return row;};
  const create=async(type='balance',amount=7)=>{const boss=await service.addNewBoss('FixtureRewardBoss','fixture.png',10,type,amount);bosses.push(boss.lastInsertRowid);await pool.execute('UPDATE bosses SET phase=2,phase1_hp=0,phase2_hp=0 WHERE id=?',[boss.lastInsertRowid]);return boss.lastInsertRowid;};
  const balances=async()=>Object.fromEntries((await pool.execute("SELECT player_id,balance FROM wallets WHERE asset='PF' AND bucket='main' ORDER BY player_id"))[0].map(row=>[row.player_id,row.balance]));
  try{
    await service.addBossDamageToUser(playerId,10);
    const bossId=await create(),before=await balances();const expected=(await service.getTopPlayersByBossDamage()).slice(0,25).map(row=>row.id);
    const settled=await Promise.all(Array.from({length:20},()=>service.settleBossRewards({bossId})));assert.equal(settled.filter(row=>!row.replayed).length,1);assert.deepEqual(settled[0].recipients.map(row=>row.id),expected);const after=await balances();for(const id of Object.keys(before))assert.equal(BigInt(after[id]),BigInt(before[id])+(expected.includes(id)?7n:0n));assert.equal(Number((await one("SELECT COUNT(*) AS n FROM finance_log WHERE type='boss_reward' AND ref=?",[String(bossId)])).n),expected.length);checks++;
    await pool.execute('UPDATE bosses SET prize_amount=99 WHERE id=?',[bossId]);assert.equal((await service.settleBossRewards({bossId})).amount,'7');assert.deepEqual(await balances(),after);checks++;
    const alive=await create();await pool.execute('UPDATE bosses SET phase2_hp=1 WHERE id=?',[alive]);await assert.rejects(service.settleBossRewards({bossId:alive}),{code:'BOSS_NOT_DEFEATED'});checks++;
    const invalid=await create('coins');await assert.rejects(service.settleBossRewards({bossId:invalid}),{code:'BOSS_PRIZE_UNSUPPORTED'});assert.deepEqual(await balances(),after);checks++;
    const inventoryBoss=await create('tickets',2),beforeTickets=Object.fromEntries((await pool.execute("SELECT player_id,quantity FROM inventory_balances WHERE item_code='tickets'"))[0].map(row=>[row.player_id,row.quantity]));await service.settleBossRewards({bossId:inventoryBoss});for(const id of expected)assert.equal(BigInt((await one("SELECT quantity FROM inventory_balances WHERE player_id=? AND item_code='tickets'",[id])).quantity),BigInt(beforeTickets[id])+2n);checks++;
    const rollbackBoss=await create(),beforeFailure=await balances();let inserts=0;
    const brokenPool={getConnection:async()=>{const c=await pool.getConnection();return new Proxy(c,{get(target,key){if(key==='execute')return(sql,args)=>sql.startsWith('INSERT INTO finance_log')&&++inserts===2?target.execute('SELECT missing_boss_rewards_fixture_column'):target.execute(sql,args);const value=target[key];return typeof value==='function'?value.bind(target):value;}});}};
    await assert.rejects(createMysqlApi(createDatabaseRuntime(brokenPool),{now:()=>now}).settleBossRewards({bossId:rollbackBoss}),{code:'ER_BAD_FIELD_ERROR'});assert.deepEqual(await balances(),beforeFailure);assert.equal(Number((await one('SELECT COUNT(*) AS n FROM boss_reward_batches WHERE boss_id=?',[rollbackBoss])).n),0);assert.equal(Number((await one("SELECT COUNT(*) AS n FROM finance_log WHERE type='boss_reward' AND ref=?",[String(rollbackBoss)])).n),0);checks++;
    await service.settleBossRewards({bossId:rollbackBoss});assert.equal(Number((await one('SELECT COUNT(*) AS n FROM boss_reward_batches WHERE boss_id=?',[rollbackBoss])).n),1);checks++;
    const historicalBoss=await create();await pool.execute('INSERT INTO migration_runs(run_id,snapshot_sha256,metadata_json,status) VALUES (?,?,?,?)',['fixture_boss_legacy','0'.repeat(64),'{}','verified']);await pool.execute('INSERT INTO boss_import_states(boss_id,source_run_id,was_defeated) VALUES (?,?,1)',[historicalBoss,'fixture_boss_legacy']);const beforeHistorical=await balances();await assert.rejects(service.settleBossRewards({bossId:historicalBoss}),{code:'BOSS_LEGACY_REWARDS_UNVERIFIED'});assert.deepEqual(await balances(),beforeHistorical);checks++;
    return checks;
  }finally{for(const id of bosses){await pool.execute('DELETE FROM boss_import_states WHERE boss_id=?',[id]);await pool.execute('DELETE FROM boss_reward_batches WHERE boss_id=?',[id]);await pool.execute('DELETE FROM bosses WHERE id=?',[id]);}await pool.execute('DELETE FROM migration_runs WHERE run_id=?',['fixture_boss_legacy']);await pool.execute('DELETE FROM boss_damage WHERE user_id=?',[playerId]);}
}
module.exports={runBossRewardChecks};
