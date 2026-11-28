'use strict';

const {createHash,randomUUID}=require('node:crypto');
const {createBalanceAdjustment}=require('./balanceAdjustment');

function createAccountReset(runtime,{inventory,playerState,runTransaction}){
  const adjust=createBalanceAdjustment(null,{runTransaction});
  return async function resetAccount(id,operationId=randomUUID()){
    id=String(id);
    if(typeof operationId!=='string'||!/^[A-Za-z0-9:_-]{1,100}$/.test(operationId)){
      return {success:false,message:'Некорректный идентификатор операции.'};
    }
    const key='account_reset:'+operationId;
    const hash=createHash('sha256').update(id).digest('hex');
    try{
      return await runTransaction(async()=>{
        await runtime.execute('INSERT INTO wallet_operations(operation_key,request_hash) VALUES (?,?) ON DUPLICATE KEY UPDATE operation_key=VALUES(operation_key)',[key,hash]);
        const receipt=await runtime.one('SELECT request_hash,result_json FROM wallet_operations WHERE operation_key=? FOR UPDATE',[key]);
        if(receipt.request_hash!==hash)throw Object.assign(new Error('Reset operation conflict'),{code:'OPERATION_KEY_CONFLICT'});
        if(receipt.result_json)return JSON.parse(receipt.result_json);
        if(!await runtime.one('SELECT telegram_id FROM players WHERE telegram_id=? FOR UPDATE',[id])){
          throw Object.assign(new Error('Player missing'),{code:'PLAYER_MISSING'});
        }
        const activeDouble=await runtime.one(
          "SELECT b.id FROM double_bet_operations o JOIN double_bets_log b ON b.id=o.bet_id WHERE b.user_id=? AND b.payout_status='pending' LIMIT 1",[id]);
        const activeDice=await runtime.one(
          'SELECT o.bet_id FROM dice_bet_operations o JOIN dice_runtime_rounds r USING (round_id) WHERE o.player_id=? AND r.result_json IS NULL LIMIT 1',[id]);
        if(activeDouble||activeDice)throw Object.assign(new Error('Pending stakes'),{code:'ACCOUNT_HAS_PENDING_BETS'});

        for(const [asset,bucket] of [['PF','main'],['PF','card'],['DF','main']]){
          await adjust({playerId:id,asset,bucket,balance:0,operationKey:key+':'+asset+':'+bucket});
        }
        for(const item of ['npf_shares','container_type_1','container_type_2','container_type_3']){
          await inventory.adjustInventory({playerId:id,item,quantity:0,operationKey:key+':'+item});
        }
        await playerState.updateUserData(id,{
          username:'Press Эфыч',last_bonus_time:0,referral_join_date:null,referral_bonus_amount:0,
          likes_received:0,dislikes_received:0,transfers_blocked:false,is_hidden_in_top:0,
          is_registered:false,attack_power:1,energy:0,last_energy_restore:0,active_weapon:'fist',
        });
        for(const table of ['player_referrals','player_referral_intents','player_roles','player_forms','player_weapon_ownership']){
          await runtime.execute('DELETE FROM '+table+' WHERE player_id=?',[id]);
        }
        await runtime.execute("DELETE FROM player_prefix_ownership WHERE player_id=? AND kind='special'",[id]);
        await runtime.execute("DELETE FROM player_invalid_lists WHERE player_id=? AND field_name IN ('status_ids','form_ids','special_prefix_ids','owned_weapons')",[id]);
        for(const table of ['user_skins','promo_activations','mutes','user_weapon_durability','registration_sessions']){
          await runtime.execute('DELETE FROM '+table+' WHERE user_id=?',[id]);
        }
        const result={success:true,message:'Аккаунт успешно обнулен.'};
        await runtime.execute('UPDATE wallet_operations SET result_json=? WHERE operation_key=?',[JSON.stringify(result),key]);
        return result;
      });
    }catch(error){
      if(error.code==='PLAYER_MISSING')return {success:false,message:'Пользователь не найден.'};
      if(error.code==='ACCOUNT_HAS_PENDING_BETS')return {success:false,message:'У игрока есть незавершённые ставки.'};
      return {success:false,message:'Произошла ошибка при обнулении аккаунта.'};
    }
  };
}

module.exports={createAccountReset};
