'use strict';
const {createHash}=require('node:crypto');
const {withTransaction,withDeadlockRetry}=require('../db/transaction');
const {integer}=require('./walletMovement');
const {lockWallet,saveWallet}=require('../repositories/wallets');
const fail=code=>{throw Object.assign(new Error(code),{code});};
function serialNumber(skinId,serial){return String(skinId).padStart(4,'0')+'-'+String(serial).padStart(8,'0');}
function createSkinPurchase(pool){return async({operationKey,playerId,skinId})=>{
  if(typeof operationKey!=='string'||!/^[A-Za-z0-9:_-]{1,150}$/.test(operationKey))fail('OPERATION_KEY_INVALID');
  if(typeof playerId!=='string'||!/^[\x21-\x7e]{1,32}$/.test(playerId))fail('PLAYER_INVALID');
  const id=String(integer(skinId));if(id==='0')fail('SKIN_INVALID');
  const hash=createHash('sha256').update(JSON.stringify({kind:'skin-purchase',playerId,skinId:id})).digest('hex');
  return withDeadlockRetry(()=>withTransaction(pool,async connection=>{
    await connection.execute('INSERT INTO wallet_operations(operation_key,request_hash) VALUES (?,?) ON DUPLICATE KEY UPDATE operation_key=VALUES(operation_key)',[operationKey,hash]);
    const [[operation]]=await connection.execute('SELECT request_hash,result_json FROM wallet_operations WHERE operation_key=? FOR UPDATE',[operationKey]);
    if(operation.request_hash!==hash)fail('OPERATION_KEY_CONFLICT');
    if(operation.result_json)return JSON.parse(operation.result_json);
    const [[player]]=await connection.execute('SELECT telegram_id FROM players WHERE telegram_id=? FOR UPDATE',[playerId]);
    if(!player)fail('PLAYER_MISSING');
    const [[skin]]=await connection.execute('SELECT id,name,price,currency_type,stock,total_serials,is_visible_in_shop FROM skins WHERE id=? FOR UPDATE',[id]);
    if(!skin||Number(skin.is_visible_in_shop)!==1)fail('SKIN_UNAVAILABLE');
    const [[owned]]=await connection.execute('SELECT id FROM user_skins WHERE user_id=? AND skin_id=? LIMIT 1 FOR UPDATE',[playerId,id]);
    if(owned)fail('SKIN_ALREADY_OWNED');
    if(BigInt(skin.stock??0)<=0n)fail('SKIN_OUT_OF_STOCK');
    if(!['PF','DF'].includes(skin.currency_type))fail('SKIN_CURRENCY_INVALID');
    const price=integer(String(skin.price).replace(/\.0+$/,''));
    const wallet={playerId,asset:skin.currency_type,bucket:'main'};
    const before=await lockWallet(connection,wallet);
    if(before<price)fail('INSUFFICIENT_FUNDS');
    const serial=serialNumber(id,BigInt(skin.total_serials??0)+1n);
    await saveWallet(connection,wallet,before-price,-price,'purchase:'+operationKey,'skin_purchase');
    await connection.execute('INSERT INTO user_skins(user_id,skin_id,serial_number) VALUES (?,?,?)',[playerId,id,serial]);
    await connection.execute('UPDATE skins SET stock=stock-1,total_serials=total_serials+1 WHERE id=?',[id]);
    const result={success:true,serial,price:String(price),currency:skin.currency_type,newBalance:String(before-price)};
    await connection.execute('UPDATE wallet_operations SET result_json=? WHERE operation_key=?',[JSON.stringify(result),operationKey]);
    return result;
  }));
};}
module.exports={createSkinPurchase,serialNumber};
