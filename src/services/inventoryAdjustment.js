'use strict';
const {createHash,randomUUID}=require('node:crypto');
const {itemFields}=require('../db/playerFields');
const {signedAmount}=require('./balanceAdjustment');
const {compatibleNumber}=require('../repositories/legacyReads');
const fail=code=>{throw Object.assign(new Error(code),{code});};
function createInventoryAdjustment(runtime,{reads,runTransaction=work=>runtime.transaction(()=>work(runtime.currentExecutor()))}={}){
  async function adjust({playerId,item,delta,quantity,operationKey,limit=null}){
    if(typeof operationKey!=='string'||!/^[A-Za-z0-9:_-]{1,150}$/.test(operationKey))fail('OPERATION_KEY_INVALID');
    if(!itemFields.includes(item))fail('INVENTORY_ITEM_INVALID');
    const setting=quantity!==undefined;
    const amount=signedAmount(setting?quantity:delta);
    playerId=String(playerId);
    const hash=createHash('sha256').update(JSON.stringify({playerId,item,[setting?'quantity':'delta']:String(amount),limit:limit===null?null:String(limit)})).digest('hex');
    return runTransaction(async connection=>{
      await connection.execute('INSERT INTO inventory_operations(operation_key,request_hash) VALUES (?,?) ON DUPLICATE KEY UPDATE operation_key=VALUES(operation_key)',[operationKey,hash]);
      const [[previous]]=await connection.execute('SELECT request_hash,result_json FROM inventory_operations WHERE operation_key=? FOR UPDATE',[operationKey]);
      if(previous.request_hash!==hash)fail('OPERATION_KEY_CONFLICT');
      if(previous.result_json)return JSON.parse(previous.result_json);
      const [[player]]=await connection.execute('SELECT telegram_id FROM players WHERE telegram_id=? FOR UPDATE',[playerId]);if(!player)fail('PLAYER_MISSING');
      const [[row]]=await connection.execute('SELECT quantity FROM inventory_balances WHERE player_id=? AND item_code=? FOR UPDATE',[playerId,item]);if(!row)fail('INVENTORY_MISSING');
      const before=BigInt(row.quantity),after=setting?amount:before+amount;
      const delta=after-before;
      if(after<0n)throw Object.assign(new Error('Insufficient inventory'),{code:'INVENTORY_INSUFFICIENT',available:String(before)});
      if(after>9223372036854775807n)fail('INVENTORY_OVERFLOW');
      if(limit!==null&&delta>0n&&after>BigInt(limit))fail('INVENTORY_LIMIT');
      await connection.execute('UPDATE inventory_balances SET quantity=? WHERE player_id=? AND item_code=?',[String(after),playerId,item]);
      await connection.execute('INSERT INTO inventory_entries(operation_key,player_id,item_code,amount,entry_type) VALUES (?,?,?,?,?)',['inventory:'+operationKey,playerId,item,String(delta),'inventory_adjustment']);
      const result={quantity:String(after),delta:String(delta)};
      await connection.execute('UPDATE inventory_operations SET result_json=? WHERE operation_key=?',[JSON.stringify(result),operationKey]);return result;
    });
  }
  async function simple(id,item,amount,remove,label,emoji){
    const number=signedAmount(amount);if(number<0n)return {success:false,message:`Количество ${label} не может быть отрицательным.`};
    try{const result=await adjust({playerId:id,item,delta:remove?-number:number,operationKey:'legacy:'+randomUUID()});return {success:true,message:`${remove?'Забрано':'Выдано'} ${amount} ${emoji} ${label}.`,quantity:result.quantity};}
    catch(error){if(error.code==='PLAYER_MISSING')return {success:false,message:'Пользователь не найден.'};if(error.code==='INVENTORY_INSUFFICIENT')return {success:false,message:`Недостаточно ${label}. Доступно: ${error.available}.`};throw error;}
  }
  const publicResult=async promise=>{const {quantity,...result}=await promise;return result;};
  const api={
    adjustInventory:adjust,
    giveCandy:(id,n)=>publicResult(simple(id,'candy',n,false,'конфет','🍬')),takeCandy:(id,n)=>publicResult(simple(id,'candy',n,true,'конфет','🍬')),
    giveTickets:(id,n)=>publicResult(simple(id,'tickets',n,false,'билетиков','🎫')),takeTickets:(id,n)=>publicResult(simple(id,'tickets',n,true,'билетиков','🎫')),
    addSecretGift:(id,n=1)=>publicResult(simple(id,'secret_gifts',n,false,'пакетиков','🎁')),takeSecretGift:(id,n=1)=>publicResult(simple(id,'secret_gifts',n,true,'пакетиков','🎁')),
    async giveFortuneTicket(id,n){try{await adjust({playerId:id,item:'fortune_tickets',delta:n,operationKey:'legacy:'+randomUUID()});return 1;}catch(error){if(error.code==='PLAYER_MISSING')return 0;throw error;}},
    async updateUserNpfShares(id,n){try{const result=await adjust({playerId:id,item:'npf_shares',delta:n,operationKey:'legacy:'+randomUUID()});return {success:true,newShares:compatibleNumber(result.quantity)};}catch(error){if(error.code==='INVENTORY_INSUFFICIENT')return {success:false,message:'Недостаточно акций для продажи.'};throw error;}},
    async decreaseContainerCount(id,type,quantity=1){if(![1,2,3].includes(Number(type)))fail('INVENTORY_ITEM_INVALID');const n=signedAmount(quantity);if(n<0n)fail('AMOUNT_INVALID');try{const result=await adjust({playerId:id,item:'container_type_'+type,delta:-n,operationKey:'legacy:'+randomUUID()});return {success:true,newCount:compatibleNumber(result.quantity)};}catch(error){if(error.code==='INVENTORY_INSUFFICIENT')return {success:false,message:`Недостаточно контейнеров данного типа. Доступно: ${error.available}, требуется: ${quantity}`};throw error;}},
    async giveTicketsAdmin(numeric,n){return adminTickets(numeric,n,false);},
    async takeTicketsAdmin(numeric,n){return adminTickets(numeric,n,true);},
    async updateContainerCount(id,type,delta){
      if(![1,2,3].includes(Number(type)))fail('INVENTORY_ITEM_INVALID');
      return runtime.transaction(async()=>{
        if(!await runtime.one('SELECT telegram_id FROM players WHERE telegram_id=? FOR UPDATE',[String(id)]))return {success:false,message:'Пользователь не найден'};
        const roles=await reads.getUserStatuses(id);
        let limit=150;
        for(const [name,value]of [['GOLD',200],['PLATINUM',250],['DIAMOND',300],['Администратор',500],['Тех администратор',1000000]])if(roles.includes(name))limit=value;
        try{await adjust({playerId:id,item:'container_type_'+type,delta,limit,operationKey:'legacy:'+randomUUID()});return {success:true};}
        catch(error){if(error.code==='INVENTORY_LIMIT')return {success:false,message:`Лимит контейнеров (${limit}) превышен.`,limits:{1:limit,2:limit,3:limit}};throw error;}
      });
    },
  };
  async function adminTickets(numeric,n,remove){
    const amount=signedAmount(n);if(amount<=0n)return {success:false,message:'Количество должно быть больше нуля.'};
    const user=await reads.getUserByNumericId(numeric);if(!user)return {success:false,message:'Пользователь не найден.'};
    const result=await simple(user.id,'tickets',n,remove,'билетиков','🎫');
    return result.success?{success:true,message:`Успешно ${remove?'изъято':'выдано'} ${n} билетиков ${remove?'у пользователя':'пользователю'} ${user.username}.`,newBalance:compatibleNumber(result.quantity)}:result;
  }
  return api;
}
module.exports={createInventoryAdjustment};
