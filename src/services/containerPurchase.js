'use strict';
const {createHash}=require('node:crypto');
const {integer}=require('./walletMovement');
const {lockWallet,saveWallet}=require('../repositories/wallets');
const products=Object.freeze({1:Object.freeze({name:'CLASSIC',currency:'PF',price:10000}),2:Object.freeze({name:'PREMIUM',currency:'PF',price:50000}),3:Object.freeze({name:'GOLD',currency:'DF',price:200})});
const fail=code=>{throw Object.assign(new Error(code),{code});};
function createContainerPurchase(runtime,inventory,{runTransaction=work=>runtime.transaction(()=>work(runtime.currentExecutor()))}={}){return async({playerId,type,quantity,operationKey})=>{
  if(typeof operationKey!=='string'||!/^[A-Za-z0-9:_-]{1,100}$/.test(operationKey))fail('OPERATION_KEY_INVALID');
  if(!Object.hasOwn(products,String(type)))fail('CONTAINER_TYPE_INVALID');
  const product=products[type],count=integer(quantity);if(count===0n)fail('AMOUNT_INVALID');
  const price=BigInt(product.price)*count;if(price>9223372036854775807n)fail('AMOUNT_INVALID');
  playerId=String(playerId);const key='container:'+operationKey;
  const hash=createHash('sha256').update(JSON.stringify({playerId,type:String(type),quantity:String(count)})).digest('hex');
  return runTransaction(async connection=>{
    await connection.execute('INSERT INTO wallet_operations(operation_key,request_hash) VALUES (?,?) ON DUPLICATE KEY UPDATE operation_key=VALUES(operation_key)',[key,hash]);
    const [[operation]]=await connection.execute('SELECT request_hash,result_json FROM wallet_operations WHERE operation_key=? FOR UPDATE',[key]);
    if(operation.request_hash!==hash)fail('OPERATION_KEY_CONFLICT');if(operation.result_json)return JSON.parse(operation.result_json);
    if(!(await connection.execute('SELECT telegram_id FROM players WHERE telegram_id=? FOR UPDATE',[playerId]))[0][0])fail('PLAYER_MISSING');
    const wallet={playerId,asset:product.currency,bucket:'main'},before=await lockWallet(connection,wallet);if(before<price)fail('INSUFFICIENT_FUNDS');
    await saveWallet(connection,wallet,before-price,-price,'purchase:'+key,'container_purchase');
    const granted=await inventory.updateContainerCount(playerId,type,String(count));if(!granted.success)fail('INVENTORY_LIMIT');
    const result={name:product.name,quantity:String(count),price:String(price),currency:product.currency};
    await connection.execute('UPDATE wallet_operations SET result_json=? WHERE operation_key=?',[JSON.stringify(result),key]);return result;
  });
};}
module.exports={createContainerPurchase,products};
