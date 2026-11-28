'use strict';
const {createHash}=require('node:crypto');
const {integer}=require('./walletMovement');
const {lockWallet,saveWallet}=require('../repositories/wallets');
const {compatibleNumber}=require('../repositories/legacyReads');
const fail=code=>{throw Object.assign(new Error(code),{code});};
function createWeaponPurchase(runtime,equipment,{runTransaction,now=()=>Date.now()}){return async({playerId,weaponId,operationKey})=>{
  if(typeof operationKey!=='string'||!/^[A-Za-z0-9:_-]{1,100}$/.test(operationKey))fail('OPERATION_KEY_INVALID');
  const id=String(integer(weaponId));if(id==='0')fail('WEAPON_UNAVAILABLE');
  playerId=String(playerId);const key='weapon:'+operationKey,hash=createHash('sha256').update(JSON.stringify({playerId,weaponId:id})).digest('hex');
  return runTransaction(async connection=>{
    await connection.execute('INSERT INTO wallet_operations(operation_key,request_hash) VALUES (?,?) ON DUPLICATE KEY UPDATE operation_key=VALUES(operation_key)',[key,hash]);
    const [[receipt]]=await connection.execute('SELECT request_hash,result_json FROM wallet_operations WHERE operation_key=? FOR UPDATE',[key]);
    if(receipt.request_hash!==hash)fail('OPERATION_KEY_CONFLICT');if(receipt.result_json)return {...JSON.parse(receipt.result_json),replayed:true};
    if(!(await connection.execute('SELECT telegram_id FROM players WHERE telegram_id=? FOR UPDATE',[playerId]))[0][0])fail('PLAYER_MISSING');
    const [[weapon]]=await connection.execute('SELECT * FROM weapons WHERE id=? FOR UPDATE',[id]);if(!weapon)fail('WEAPON_UNAVAILABLE');
    // The existing weapon shop charges PF. Do not silently charge a different
    // asset if a future catalog entry declares an unsupported currency.
    if(weapon.price_type!=='PF')fail('WEAPON_CURRENCY_UNSUPPORTED');
    const price=integer(String(weapon.price).replace(/\.0+$/,''));
    if((await connection.execute('SELECT ordinal FROM player_weapon_ownership WHERE player_id=? AND weapon_id=? LIMIT 1',[playerId,id]))[0][0])fail('ALREADY_OWNED');
    if((await connection.execute('SELECT field_name FROM player_invalid_lists WHERE player_id=? AND field_name=?',[playerId,'owned_weapons']))[0][0])fail('PLAYER_LIST_INVALID');
    const wallet={playerId,asset:'PF',bucket:'main'},before=await lockWallet(connection,wallet);if(before<price)fail('INSUFFICIENT_FUNDS');
    await saveWallet(connection,wallet,before-price,-price,key+':debit','weapon_purchase');
    await equipment.addWeaponToUser(playerId,compatibleNumber(id));
    await connection.execute('INSERT INTO user_weapon_durability(user_id,weapon_id,current_durability) VALUES (?,?,?) ON DUPLICATE KEY UPDATE current_durability=VALUES(current_durability)',[playerId,id,weapon.durability]);
    const result={weapon:{id,name:weapon.name,baseDamage:String(weapon.base_damage),durability:String(weapon.durability)},price:String(price),balance:String(before-price),currency:'PF',replayed:false};
    await connection.execute('INSERT INTO finance_log(ts,type,actor_user_id,amount,currency,ref,action,payload,success) VALUES (?,?,?,?,?,?,?,?,1)',[now(),'weapon_purchase',playerId,String(price),'PF',id,'weapon_purchase',JSON.stringify({weaponId:id,durability:result.weapon.durability})]);
    await connection.execute('UPDATE wallet_operations SET result_json=? WHERE operation_key=?',[JSON.stringify(result),key]);return result;
  });
};}
module.exports={createWeaponPurchase};
