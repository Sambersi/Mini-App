'use strict';

const {createHash}=require('node:crypto');
const fail=code=>{throw Object.assign(new Error(code),{code});};

function createContainerOpening(runtime,{inventory,runTransaction}){
  return async function openContainersAtomic({playerId,type,quantity,operationKey},rewardWork){
    if(![1,2,3].includes(type)||!Number.isSafeInteger(quantity)||quantity<1)fail('CONTAINER_REQUEST_INVALID');
    if(typeof operationKey!=='string'||!/^[A-Za-z0-9:_-]{1,100}$/.test(operationKey))fail('OPERATION_KEY_INVALID');
    playerId=String(playerId);
    const key='container_open:'+operationKey;
    const requestHash=createHash('sha256').update(JSON.stringify({playerId,type,quantity})).digest('hex');
    return runTransaction(async()=>{
      await runtime.execute('INSERT INTO wallet_operations(operation_key,request_hash) VALUES (?,?) ON DUPLICATE KEY UPDATE operation_key=VALUES(operation_key)',[key,requestHash]);
      const receipt=await runtime.one('SELECT request_hash,result_json FROM wallet_operations WHERE operation_key=? FOR UPDATE',[key]);
      if(receipt.request_hash!==requestHash)fail('OPERATION_KEY_CONFLICT');
      if(receipt.result_json)return JSON.parse(receipt.result_json);
      const {quantity:remaining}=await inventory.adjustInventory({
        playerId,item:'container_type_'+type,delta:-quantity,operationKey:key,
      });
      const result=await rewardWork(remaining);
      if(typeof result!=='string')fail('CONTAINER_RESULT_INVALID');
      await runtime.execute('UPDATE wallet_operations SET result_json=? WHERE operation_key=?',[JSON.stringify(result),key]);
      return result;
    });
  };
}

module.exports={createContainerOpening};
