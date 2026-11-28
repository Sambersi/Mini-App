'use strict';
const assert=require('node:assert/strict');
const {createMysqlApi}=require('../src/db/api');
const {createDatabaseRuntime}=require('../src/db/runtime');
async function runWeaponPurchaseChecks({pool,service,playerId,now}){
  let checks=0;
  const one=async(sql,args=[])=>{const [[row]]=await pool.execute(sql,args);return row;};
  const balance=async()=>BigInt((await one("SELECT balance FROM wallets WHERE player_id=? AND asset='PF' AND bucket='main'",[playerId])).balance);
  const beforeBalance=await balance(),request={playerId,weaponId:'900002',operationKey:'fixture_weapon_purchase'};
  try{
    for(const [id,price,type,durability]of [[900002,100,'PF',7],[900003,200,'PF',-1],[900004,0,'PF',-1],[900005,100,'DF',5]])await pool.execute('INSERT INTO weapons(id,name,image_file,base_damage,price,price_type,width,height,x_position,y_position,durability) VALUES (?,?,?,?,?,?,1,1,0,0,?)',[id,'FixtureWeapon','fixture.png',3,price,type,durability]);
    await pool.execute("UPDATE wallets SET balance=1000 WHERE player_id=? AND asset='PF' AND bucket='main'",[playerId]);
    const results=await Promise.all(Array.from({length:20},()=>service.purchaseWeapon(request)));assert.equal(results.filter(row=>!row.replayed).length,1);assert.equal(await balance(),900n);assert.equal(Number((await one('SELECT current_durability FROM user_weapon_durability WHERE user_id=? AND weapon_id=900002',[playerId])).current_durability),7);assert.equal(Number((await one('SELECT COUNT(*) AS n FROM player_weapon_ownership WHERE player_id=? AND weapon_id=900002',[playerId])).n),1);assert.equal(Number((await one("SELECT COUNT(*) AS n FROM finance_log WHERE type='weapon_purchase'")).n),1);checks++;
    await pool.execute('UPDATE player_weapon_ownership SET value_json=? WHERE player_id=? AND weapon_id=900002',['"900002"',playerId]);await assert.rejects(service.purchaseWeapon({...request,operationKey:'fixture_weapon_owned'}),{code:'ALREADY_OWNED'});assert.equal(await balance(),900n);checks++;
    await assert.rejects(service.purchaseWeapon({...request,weaponId:'900003'}),{code:'OPERATION_KEY_CONFLICT'});await assert.rejects(service.purchaseWeapon({...request,weaponId:'999999999',operationKey:'fixture_weapon_missing'}),{code:'WEAPON_UNAVAILABLE'});await assert.rejects(service.purchaseWeapon({...request,weaponId:'900005',operationKey:'fixture_weapon_currency'}),{code:'WEAPON_CURRENCY_UNSUPPORTED'});checks++;
    const race=await Promise.allSettled(Array.from({length:20},(_,i)=>service.purchaseWeapon({...request,weaponId:'900003',operationKey:'fixture_weapon_race_'+i})));assert.equal(race.filter(row=>row.status==='fulfilled').length,1);assert.ok(race.filter(row=>row.status==='rejected').every(row=>row.reason.code==='ALREADY_OWNED'));assert.equal(await balance(),700n);assert.equal(Number((await one('SELECT current_durability FROM user_weapon_durability WHERE user_id=? AND weapon_id=900003',[playerId])).current_durability),-1);checks++;
    const free=await service.purchaseWeapon({...request,weaponId:'900004',operationKey:'fixture_weapon_free'});assert.equal(free.price,'0');assert.equal(await balance(),700n);checks++;
    await pool.execute("UPDATE wallets SET balance=0 WHERE player_id='900000101' AND asset='PF' AND bucket='main'");await assert.rejects(service.purchaseWeapon({...request,playerId:'900000101',operationKey:'fixture_weapon_poor'}),{code:'INSUFFICIENT_FUNDS'});assert.equal(Number((await one("SELECT COUNT(*) AS n FROM player_weapon_ownership WHERE player_id='900000101' AND weapon_id=900002")).n),0);checks++;
    for(const prefix of ['INSERT INTO user_weapon_durability','UPDATE wallet_operations SET result_json=?']){
      const brokenPool={getConnection:async()=>{const c=await pool.getConnection();return new Proxy(c,{get(target,key){if(key==='execute')return(sql,args)=>sql.startsWith(prefix)?target.execute('SELECT missing_weapon_purchase_fixture_column'):target.execute(sql,args);const value=target[key];return typeof value==='function'?value.bind(target):value;}});}};
      await pool.execute("UPDATE wallets SET balance=1000 WHERE player_id='900000101' AND asset='PF' AND bucket='main'");const key='fixture_weapon_failure_'+checks;
      await assert.rejects(createMysqlApi(createDatabaseRuntime(brokenPool),{now:()=>now}).purchaseWeapon({...request,playerId:'900000101',operationKey:key}),{code:'ER_BAD_FIELD_ERROR'});assert.equal((await one("SELECT balance FROM wallets WHERE player_id='900000101' AND asset='PF' AND bucket='main'")).balance,'1000');assert.equal(Number((await one("SELECT COUNT(*) AS n FROM player_weapon_ownership WHERE player_id='900000101' AND weapon_id=900002")).n),0);assert.equal(Number((await one('SELECT COUNT(*) AS n FROM wallet_operations WHERE operation_key=?',['weapon:'+key])).n),0);checks++;
    }
    return checks;
  }finally{
    await pool.execute('DELETE FROM player_weapon_ownership WHERE weapon_id IN (900002,900003,900004,900005)');await pool.execute('DELETE FROM user_weapon_durability WHERE weapon_id IN (900002,900003,900004,900005)');await pool.execute('DELETE FROM weapons WHERE id IN (900002,900003,900004,900005)');await pool.execute("UPDATE wallets SET balance=? WHERE player_id=? AND asset='PF' AND bucket='main'",[String(beforeBalance),playerId]);
  }
}
module.exports={runWeaponPurchaseChecks};
