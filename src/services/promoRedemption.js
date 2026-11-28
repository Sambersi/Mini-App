'use strict';
const {createHash}=require('node:crypto');
const {integer}=require('./walletMovement');
const {lockWallet,saveWallet}=require('../repositories/wallets');
const {compatibleNumber}=require('../repositories/legacyReads');
const requiredRoles=Object.freeze({1:['Администратор'],2:['Тех админ','Тех администратор'],3:['Модератор'],4:['DIAMOND'],5:['PLATINUM'],6:['GOLD'],7:['Beto-tester']});
const prizeLabels={balance:'PF',df_balance:'DF',npf_shares:'NPF',container_type_1:'CONTAINER_1',container_type_2:'CONTAINER_2',container_type_3:'CONTAINER_3',tickets:'TICKETS'};
const fail=code=>{throw Object.assign(new Error(code),{code});};
function createPromoRedemption(runtime,inventory,{runTransaction,now=()=>Date.now(),random=Math.random}){
  async function performRedemption({playerId,name,promoId,operationKey}){
    if(typeof operationKey!=='string'||!/^[A-Za-z0-9:_-]{1,100}$/.test(operationKey))fail('OPERATION_KEY_INVALID');
    if((name===undefined)===(promoId===undefined))fail('PROMO_SELECTOR_INVALID');
    playerId=String(playerId);const key='promo:'+operationKey;
    const hash=createHash('sha256').update(JSON.stringify({playerId,...(name===undefined?{id:String(promoId)}:{name})})).digest('hex');
    return runTransaction(async connection=>{
      await connection.execute('INSERT INTO wallet_operations(operation_key,request_hash) VALUES (?,?) ON DUPLICATE KEY UPDATE operation_key=VALUES(operation_key)',[key,hash]);
      const [[receipt]]=await connection.execute('SELECT request_hash,result_json FROM wallet_operations WHERE operation_key=? FOR UPDATE',[key]);
      if(receipt.request_hash!==hash)fail('OPERATION_KEY_CONFLICT');if(receipt.result_json)return {...JSON.parse(receipt.result_json),replayed:true};
      const [[promo]]=await connection.execute('SELECT * FROM promos WHERE '+(name===undefined?'id':'name')+'=? FOR UPDATE',[name===undefined?promoId:name]);
      if(!promo)fail('PROMO_NOT_FOUND');
      const [[player]]=await connection.execute('SELECT telegram_id,display_name FROM players WHERE telegram_id=? FOR UPDATE',[playerId]);if(!player)fail('PLAYER_MISSING');
      const expiry=promo.expires_at===null?null:Number(promo.expires_at);
      if(expiry&&Math.floor(now()/1000)>expiry)fail('PROMO_EXPIRED');
      const remaining=BigInt(promo.activations_left);if(remaining!==-1n&&remaining<=0n)fail('PROMO_EXHAUSTED');
      if((await connection.execute('SELECT player_id FROM promo_redemptions WHERE promo_id=? AND player_id=?',[promo.id,playerId]))[0][0]||(await connection.execute('SELECT id FROM promo_activations WHERE promo_id=? AND user_id=? LIMIT 1',[promo.id,playerId]))[0][0])fail('PROMO_ALREADY_ACTIVATED');
      if(promo.audience_type==='referrals'&&promo.creator_id){
        const [[referral]]=await connection.execute('SELECT COALESCE(r.referrer_id,i.referral_code) AS referrer FROM players p LEFT JOIN player_referrals r ON r.player_id=p.telegram_id LEFT JOIN player_referral_intents i ON i.player_id=p.telegram_id WHERE p.telegram_id=?',[playerId]);
        if(referral?.referrer!==promo.creator_id)fail('PROMO_AUDIENCE_DENIED');
      }
      if(BigInt(promo.min_status_id)>0n){
        const allowed=requiredRoles[String(promo.min_status_id)];if(!allowed)fail('PROMO_ROLE_DENIED');
        const [roles]=await connection.execute('SELECT c.name FROM role_catalog c JOIN player_roles r ON r.role_id=c.id WHERE r.player_id=?',[playerId]);
        if(!roles.some(row=>allowed.includes(row.name)))fail('PROMO_ROLE_DENIED');
      }
      const amount=integer(String(promo.prize_amount).replace(/\.0+$/,''));
      if(['balance','df_balance','card_balance'].includes(promo.prize_type)){
        const wallet={playerId,asset:promo.prize_type==='df_balance'?'DF':'PF',bucket:promo.prize_type==='card_balance'?'card':'main'};
        const before=await lockWallet(connection,wallet);if(before+amount>9223372036854775807n)fail('WALLET_OVERFLOW');
        // Source updateUserField credits promo rewards without purchase caps.
        await saveWallet(connection,wallet,before+amount,amount,key+':reward','promo_reward');
      }else await inventory.adjustInventory({playerId,item:promo.prize_type,delta:String(amount),operationKey:key+':reward'});
      let candyBonus=0;if(random()<0.15){candyBonus=Math.floor(random()*4)+2;await inventory.adjustInventory({playerId,item:'candy',delta:candyBonus,operationKey:key+':candy'});}
      await connection.execute('INSERT INTO promo_activations(promo_id,user_id,activated_at) VALUES (?,?,?)',[promo.id,playerId,Math.floor(now()/1000)]);
      const result={success:true,promoId:String(promo.id),promoName:promo.name,prizeType:promo.prize_type,prizeAmount:compatibleNumber(String(amount)),candyBonus,replayed:false};
      await connection.execute('INSERT INTO promo_redemptions(promo_id,player_id,result_json) VALUES (?,?,?)',[promo.id,playerId,JSON.stringify(result)]);
      const label=prizeLabels[promo.prize_type]||promo.prize_type.toUpperCase();
      await connection.execute('INSERT INTO finance_log(ts,type,actor_user_id,amount,currency,ref,action,payload,success) VALUES (?,?,?,?,?,?,?,?,1)',[now(),'promo',playerId,String(amount),label,promo.name,`${player.display_name||'ID '+playerId} активировал(а) промокод «${promo.name}» → начислено ${amount.toLocaleString('ru-RU')} ${label}`,JSON.stringify({reason:null,prizeType:promo.prize_type,prizeAmount:result.prizeAmount})]);
      if(remaining!==-1n){
        if(remaining===1n){await connection.execute('DELETE FROM promo_activations WHERE promo_id=?',[promo.id]);await connection.execute('DELETE FROM promos WHERE id=?',[promo.id]);}
        else await connection.execute('UPDATE promos SET activations_left=activations_left-1 WHERE id=?',[promo.id]);
      }
      await connection.execute('UPDATE wallet_operations SET result_json=? WHERE operation_key=?',[JSON.stringify(result),key]);return result;
    });
  }
  async function redeemPromo(input){try{return await performRedemption(input);}catch(error){
    if(/^PROMO_/.test(error.code||'')&&input?.playerId)try{await runtime.execute('INSERT INTO finance_log(ts,type,actor_user_id,ref,reason,success) VALUES (?,?,?,?,?,0)',[now(),'promo',String(input.playerId),input.name??String(input.promoId??''),error.code]);}catch{}
    throw error;
  }}
  return {redeemPromo,async activatePromo(id,playerId){try{return await redeemPromo({playerId,promoId:id,operationKey:'legacy:'+playerId+':'+id});}catch(error){const known={PROMO_NOT_FOUND:'Промокод не найден.',PROMO_ALREADY_ACTIVATED:'Вы уже активировали этот код.',PROMO_EXPIRED:'Срок действия промокода истек.',PROMO_EXHAUSTED:'Активации промокода исчерпаны.',PROMO_ROLE_DENIED:'Недостаточный статус.',PROMO_AUDIENCE_DENIED:'Промокод недоступен для этого игрока.'};if(known[error.code])return {success:false,message:known[error.code]};throw error;}}};
}
module.exports={createPromoRedemption,requiredRoles};
