'use strict';

const {randomUUID}=require('node:crypto');
const {createBalanceAdjustment,signedAmount}=require('./balanceAdjustment');
const {compatibleNumber}=require('../repositories/legacyReads');
const {itemFields}=require('../db/playerFields');

const walletFields={
  balance:{asset:'PF',bucket:'main'}, card_balance:{asset:'PF',bucket:'card'}, df_balance:{asset:'DF',bucket:'main'},
};
const goods=new Set(['npf_shares','container_type_1','container_type_2','container_type_3']);
const operationKey=id=>id===undefined?'legacy:'+randomUUID():'legacy:'+id;
const PM_EDITABLE_FIELDS=Object.freeze([
  'balance','card_balance','df_balance','npf_shares','tickets','fortune_tickets','candy','secret_gifts',
  'container_type_1','container_type_2','container_type_3','energy','attack_power','account_level',
  'double_wins','double_losses','round_wins','round_losses','game_wins','max_win_amount','max_bet_amount',
  'current_win_streak','best_win_streak','double_total_bets','double_total_winnings','double_total_losses',
  'disable_hyperlink','transfers_blocked','is_hidden_in_top','notifications_enabled','report_blocked','is_registered',
  'referral_bonus_amount','referrer_bank','username','total_donated_stars','likes_received','dislikes_received',
  'selected_skin_id','active_prefix_id',
]);
const message=error=>{
  if(error.code==='INSUFFICIENT_FUNDS')return 'Недостаточно средств для выполнения операции.';
  if(error.code==='PLAYER_MISSING')return 'Пользователь не найден.';
  return 'Произошла ошибка при обновлении баланса.';
};

function createLegacyBalances({reads,inventory,bank,playerState,runTransaction}){
  const adjust=createBalanceAdjustment(null,{runTransaction});
  const modify=(id,field,delta,key,limitMode)=>adjust({
    playerId:String(id),...walletFields[field],delta,operationKey:operationKey(key),limitMode,
  });
  async function limited(id,field,delta,key,mode){
    try{await modify(id,field,delta,key,mode);return true;}catch{return false;}
  }
  async function modifyItem(input,field,amount,take,key){
    if(!Object.hasOwn(walletFields,field)&&!goods.has(field))return {success:false,message:'Неверный тип предмета.'};
    try{
      const user=await reads.getUserById(input)||await reads.getUserByNumericId(input);
      if(!user)return {success:false,message:'Пользователь не найден.'};
      const value=signedAmount(amount);
      if(value<0n)return {success:false,message:'Количество должно быть неотрицательным.'};
      const delta=take?-value:value;
      if(Object.hasOwn(walletFields,field))await modify(user.id,field,delta,key);
      else await inventory.adjustInventory({playerId:user.id,item:field,delta,operationKey:operationKey(key)});
      return {success:true,message:`Успешно ${take?'забрано':'выдано'} ${amount} единиц предмета (${field}).`};
    }catch(error){
      return {success:false,message:error.code==='INVENTORY_INSUFFICIENT'? 'Недостаточно предметов.':message(error)};
    }
  }
  return {
    PM_EDITABLE_FIELDS,
    async setUserFieldPm(id,field,value,key){
      if(!PM_EDITABLE_FIELDS.includes(field))return {success:false,message:`Поле "${field}" не входит в белый список.`};
      try{
        if(Object.hasOwn(walletFields,field)){
          await adjust({playerId:String(id),...walletFields[field],balance:value,operationKey:operationKey(key)});
        }else if(itemFields.includes(field)){
          await inventory.adjustInventory({playerId:id,item:field,quantity:value,operationKey:operationKey(key)});
        }else if(field==='referrer_bank'){
          await bank.setReferrerBank(id,value,operationKey(key));
        }else{
          const result=await playerState.updateUserData(id,{[field]:value});
          if(!result.changes)return {success:false,message:'Пользователь не найден или значение не изменилось.'};
        }
        return {success:true};
      }catch(error){return {success:false,message:message(error)};}
    },
    updateUserBalance:(id,delta,key)=>modify(id,'balance',delta,key,'main-level').then(()=>undefined),
    updateMainBalance:(id,delta,key)=>limited(id,'balance',delta,key,'main-level'),
    updateCardBalance:(id,delta,key)=>limited(id,'card_balance',delta,key,'card-level'),
    async updateUserDFBalance(id,delta,_field,key){
      try{
        const result=await modify(id,'df_balance',delta,key);
        return {success:true,newBalance:compatibleNumber(result.newBalance)};
      }catch(error){return {success:false,message:message(error)};}
    },
    async updateUserBalanceByNumericId(id,delta,currency='PF',key){
      try{
        const player=await reads.getUserByNumericId(id);
        if(!player)return {success:false,message:'Пользователь с таким numeric_id не найден.'};
        await modify(player.id,currency==='DF'?'df_balance':'balance',delta,key);
        return {success:true};
      }catch(error){return {success:false,message:message(error)};}
    },
    async setPlayerBalanceByNumericId(id,newBalance,key){
      try{
        const player=await reads.getUserByNumericId(id);
        if(!player)return {success:false,message:`Пользователь с numeric_id ${id} не найден.`};
        await adjust({playerId:player.id,...walletFields.balance,balance:newBalance,operationKey:operationKey(key)});
        return {success:true,message:`Баланс PF для игрока с numeric_id ${id} успешно установлен на ${newBalance}.`};
      }catch(error){return {success:false,message:message(error)};}
    },
    async deductCurrencyFromUser(id,currency,value,key){
      const amount=signedAmount(value);
      if(amount<0n)return false;
      return limited(id,currency==='PF'?'balance':'df_balance',-amount,key);
    },
    async updateUserField(id,field,delta,key){
      if(!Object.hasOwn(walletFields,field))return {success:false,message:'Поле требует отдельной операции.'};
      try{await modify(id,field,delta,key);return {success:true};}
      catch(error){return {success:false,message:message(error)};}
    },
    giveItemToUser:(id,field,amount,key)=>modifyItem(id,field,amount,false,key),
    takeItemFromUser:(id,field,amount,key)=>modifyItem(id,field,amount,true,key),
  };
}

module.exports={createLegacyBalances};
