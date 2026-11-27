'use strict';
const {compatibleNumber}=require('./legacyReads');
const {integer}=require('../services/walletMovement');
const numeric=new Set(['id','start_time','end_time','total_bank','amount','dice1','dice2','is_win','win_amount','created_at']);
function gameRow(row){if(!row)return row;for(const key of numeric)if(Object.hasOwn(row,key))row[key]=compatibleNumber(row[key]);return row;}
function createGameRecords(runtime,{now=()=>Date.now()}={}){
  return {
    async saveDiceRound(chatId,startTime,endTime,roundId){await runtime.execute('INSERT INTO dice_rounds(chat_id,start_time,end_time,round_id) VALUES (?,?,?,?)',[String(chatId),startTime,endTime,roundId]);return roundId;},
    async saveDiceBet(roundId,id,name,amount){
      const value=integer(amount);if(value<=0n)throw Object.assign(new Error('Invalid bet'),{code:'AMOUNT_INVALID'});
      await runtime.transaction(async()=>{
        if(!await runtime.one('SELECT id FROM dice_rounds WHERE round_id=? FOR UPDATE',[roundId]))throw Object.assign(new Error('Round missing'),{code:'ROUND_MISSING'});
        await runtime.execute('INSERT INTO dice_bets(round_id,user_id,username,amount) VALUES (?,?,?,?)',[roundId,String(id),name,String(value)]);
      });
    },
    async getDiceBetsByRoundId(roundId){return (await runtime.many('SELECT * FROM dice_bets WHERE round_id=?',[roundId])).map(gameRow);},
    async updateDiceResults(id,first,second){await runtime.execute('UPDATE dice_bets SET dice1=?,dice2=? WHERE id=?',[first,second,id]);},
    async resetDiceRoundParticipants(chatId){await runtime.execute('DELETE b FROM dice_bets b JOIN dice_rounds r ON r.round_id=b.round_id WHERE r.chat_id=?',[String(chatId)]);},
    async saveBet(roundId,id,name,multiplier,amount,chatId,choice=null){
      const value=integer(amount);
      if(!roundId||!id||!name||!multiplier||value<=0n||!chatId)throw Object.assign(new Error('Invalid bet'),{code:'BET_INVALID'});
      await runtime.execute('INSERT INTO double_bets(round_id,chat_id,user_id,username,multiplier,amount,created_at,game_choice) VALUES (?,?,?,?,?,?,?,?)',[roundId,String(chatId),String(id),name,multiplier,String(value),now(),choice]);
    },
    async getBetsByRoundId(roundId){return (await runtime.many('SELECT * FROM double_bets WHERE round_id=?',[roundId])).map(gameRow);},
    async getActiveChatIdsByRoundHash(hash){return (await runtime.many('SELECT DISTINCT chat_id FROM double_bets WHERE round_id=?',[hash])).map(row=>row.chat_id);},
  };
}
module.exports={createGameRecords,gameRow};
