'use strict';
const {createHash}=require('node:crypto');
const {lockWallet,saveWallet}=require('../repositories/wallets');
const {mainLimit}=require('./financePolicy');
const {serialNumber}=require('./skinPurchase');
const prices=Object.freeze({pf:100,fortuneTicket:250,card:700,prefix:100,containers:80});
const fail=code=>{throw Object.assign(new Error(code),{code});};
function createCandyPurchase(runtime,{inventory,equipment,runTransaction}){return async({playerId,sku,operationKey})=>{
  if(!Object.hasOwn(prices,sku))fail('PRODUCT_UNAVAILABLE');
  if(typeof operationKey!=='string'||!/^[A-Za-z0-9:_-]{1,100}$/.test(operationKey))fail('OPERATION_KEY_INVALID');
  playerId=String(playerId);const key='candy:'+operationKey;
  const hash=createHash('sha256').update(JSON.stringify({playerId,sku})).digest('hex');
  return runTransaction(async connection=>{
    await connection.execute('INSERT INTO wallet_operations(operation_key,request_hash) VALUES (?,?) ON DUPLICATE KEY UPDATE operation_key=VALUES(operation_key)',[key,hash]);
    const [[previous]]=await connection.execute('SELECT request_hash,result_json FROM wallet_operations WHERE operation_key=? FOR UPDATE',[key]);
    if(previous.request_hash!==hash)fail('OPERATION_KEY_CONFLICT');if(previous.result_json)return {...JSON.parse(previous.result_json),replayed:true};
    if(!(await connection.execute('SELECT telegram_id FROM players WHERE telegram_id=? FOR UPDATE',[playerId]))[0][0])fail('PLAYER_MISSING');
    await inventory.adjustInventory({playerId,item:'candy',delta:-prices[sku],operationKey:key+':debit'});
    let reward;
    if(sku==='pf'){
      const [[card]]=await connection.execute('SELECT account_level FROM player_cards WHERE player_id=?',[playerId]);if(!card)fail('FINANCE_CONTROLS_MISSING');
      const wallet={playerId,asset:'PF',bucket:'main'},before=await lockWallet(connection,wallet),after=before+1000000n;
      if(after>mainLimit(card.account_level))fail('DESTINATION_LIMIT');
      await saveWallet(connection,wallet,after,1000000n,key+':credit','candy_purchase');reward='1 000 000 PF';
    }else if(sku==='fortuneTicket'){
      await inventory.adjustInventory({playerId,item:'fortune_tickets',delta:1,operationKey:key+':ticket'});reward='🎡 Билет в Колесо Фортуны';
    }else if(sku==='containers'){
      if(!(await inventory.updateContainerCount(playerId,3,2)).success)fail('INVENTORY_LIMIT');reward='2 GOLD контейнера';
    }else if(sku==='prefix'){
      const [rows]=await connection.execute('SELECT id FROM prefixes WHERE prefix=? ORDER BY id LIMIT 1',['🎄 SNOWMAN 🎄']);
      if(rows.length!==1)fail('PRODUCT_UNAVAILABLE');
      const id=Number(rows[0].id);if(!Number.isSafeInteger(id))fail('PRODUCT_UNAVAILABLE');
      if((await connection.execute("SELECT ordinal FROM player_prefix_ownership WHERE player_id=? AND kind='regular' AND regular_prefix_id=? LIMIT 1",[playerId,id]))[0][0])fail('ALREADY_OWNED');
      if(!await equipment.addPrefixToUser(playerId,id))fail('ALREADY_OWNED');reward='Префикс 🎄 SNOWMAN 🎄';
    }else{
      const [[skin]]=await connection.execute('SELECT id,stock,total_serials FROM skins WHERE id=1001 FOR UPDATE');if(!skin)fail('PRODUCT_UNAVAILABLE');
      if((await connection.execute('SELECT id FROM user_skins WHERE user_id=? AND skin_id=1001 LIMIT 1',[playerId]))[0][0])fail('ALREADY_OWNED');
      if(BigInt(skin.stock??0)<=0n)fail('PRODUCT_UNAVAILABLE');
      const serial=serialNumber(1001,BigInt(skin.total_serials??0)+1n);
      await connection.execute('INSERT INTO user_skins(user_id,skin_id,serial_number) VALUES (?,1001,?)',[playerId,serial]);
      await connection.execute('UPDATE skins SET stock=stock-1,total_serials=total_serials+1 WHERE id=1001');
      await connection.execute('UPDATE player_preferences SET selected_skin_id=1001 WHERE player_id=?',[playerId]);reward='НОВОГОДНЯЯ карта';
    }
    const result={sku,cost:prices[sku],reward,replayed:false};
    await connection.execute('UPDATE wallet_operations SET result_json=? WHERE operation_key=?',[JSON.stringify(result),key]);return result;
  });
};}
module.exports={createCandyPurchase,prices};
