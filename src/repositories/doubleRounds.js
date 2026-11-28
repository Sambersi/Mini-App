'use strict';
const {compatibleNumber}=require('./legacyReads');
function createDoubleRounds(runtime,{now=()=>Date.now()}={}){
  const adapt=row=>{if(row)for(const key of ['id','ts','amount','is_win','win_amount','start_ts','end_ts','total_bank','bets_count','chats_count','participants_count'])if(Object.hasOwn(row,key))row[key]=compatibleNumber(row[key]);return row;};
  async function createDoubleRound(id,start=now()){return runtime.transaction(async()=>{const created=await runtime.execute("INSERT IGNORE INTO double_rounds(round_id,start_ts,status) VALUES (?,?,'active')",[id,start]);if(created.changes)await runtime.execute('INSERT INTO double_runtime_rounds(round_id) VALUES (?)',[id]);return {success:true};});}
  async function getDoubleRoundByHash(id){return adapt(await runtime.one('SELECT * FROM double_rounds WHERE round_id=?',[id]));}
  async function getDoubleBetsByRound(id){return (await runtime.many('SELECT * FROM double_bets_log WHERE round_id=? ORDER BY ts,id',[id])).map(adapt);}
  async function logDoubleBet(entry){const result=await runtime.execute('INSERT INTO double_bets_log(ts,round_id,user_id,username,chat_id,chat_title,multiplier,amount,status,reject_reason,game_choice) VALUES (?,?,?,?,?,?,?,?,?,?,?)',[entry.ts||now(),entry.roundId,String(entry.userId),entry.username||'Неизвестный',entry.chatId==null?null:String(entry.chatId),entry.chatTitle||null,entry.multiplier,entry.amount,entry.status||'accepted',entry.rejectReason||null,entry.gameChoice||null]);return {success:true,id:compatibleNumber(result.lastInsertRowid)};}
  async function finishDoubleRoundLog(id,{endTs=now(),resultMultiplier=null,salt=null,status='finished'}={}){return runtime.transaction(async()=>{
    await runtime.one('SELECT round_id FROM double_rounds WHERE round_id=? FOR UPDATE',[id]);
    const raw=await runtime.one("SELECT COUNT(*) AS bets,COUNT(DISTINCT user_id) AS players,COUNT(DISTINCT chat_id) AS chats,COALESCE(SUM(amount),0) AS bank FROM double_bets_log WHERE round_id=? AND status='accepted'",[id]);
    const result=await runtime.execute('UPDATE double_rounds SET end_ts=?,result_multiplier=?,salt=?,total_bank=?,bets_count=?,chats_count=?,participants_count=?,status=? WHERE round_id=?',[endTs,resultMultiplier,salt,raw.bank,raw.bets,raw.chats,raw.players,status,id]);
    return {success:result.changes>0,agg:Object.fromEntries(Object.entries(raw).map(([key,value])=>[key,compatibleNumber(value)]))};
  });}
  async function getDoubleRoundState(){const row=await runtime.one('SELECT * FROM double_round_state WHERE id=1');if(!row)return null;try{return {state:row.state,hash:row.hash,result:row.result,salt:row.salt,endTime:compatibleNumber(row.end_time),cellContents:row.cell_contents?JSON.parse(row.cell_contents):null,finalMultipliers:row.final_multipliers?JSON.parse(row.final_multipliers):null,gameButtonActive:Boolean(Number(row.game_button_active)),processedChats:JSON.parse(row.processed_chats||'[]'),gameChoices:JSON.parse(row.game_choices||'{}'),globalChoices:JSON.parse(row.global_choices||'{}'),notifications:JSON.parse(row.notifications||'{}')};}catch{throw Object.assign(new Error('Invalid saved Double state'),{code:'DOUBLE_STATE_INVALID'});}}
  async function setDoubleRoundState(state){await runtime.execute('INSERT INTO double_round_state(id,state,hash,result,salt,end_time,cell_contents,final_multipliers,game_button_active,processed_chats,game_choices,global_choices,notifications,updated_at) VALUES (1,?,?,?,?,?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE state=VALUES(state),hash=VALUES(hash),result=VALUES(result),salt=VALUES(salt),end_time=VALUES(end_time),cell_contents=VALUES(cell_contents),final_multipliers=VALUES(final_multipliers),game_button_active=VALUES(game_button_active),processed_chats=VALUES(processed_chats),game_choices=VALUES(game_choices),global_choices=VALUES(global_choices),notifications=VALUES(notifications),updated_at=VALUES(updated_at)',[state.state||'ACCEPTING',state.hash||null,state.result||null,state.salt||null,state.endTime||null,state.cellContents?JSON.stringify(state.cellContents):null,state.finalMultipliers?JSON.stringify(state.finalMultipliers):null,state.gameButtonActive?1:0,JSON.stringify(state.processedChats||[]),JSON.stringify(state.gameChoices||{}),JSON.stringify(state.globalChoices||{}),JSON.stringify(state.notifications||{}),now()]);}
  async function openDoubleRound({previousHash=null,round,start=now()}){
    return runtime.transaction(async()=>{
      const current=await runtime.one('SELECT hash,state FROM double_round_state WHERE id=1 FOR UPDATE');
      if((current?.hash??null)!==previousHash)return {created:false,round:await getDoubleRoundState()};
      if(current?.hash&&current.state!=='FINISHED'){
        throw Object.assign(new Error('Current Double round is still open'),{code:'DOUBLE_ROUND_OPEN'});
      }
      await runtime.execute("INSERT INTO double_rounds(round_id,start_ts,status) VALUES (?,?,'active')",[round.hash,start]);
      await runtime.execute('INSERT INTO double_runtime_rounds(round_id) VALUES (?)',[round.hash]);
      const state={...round,state:'ACCEPTING'};
      await setDoubleRoundState(state);
      return {created:true,round:state};
    });
  }
  async function updateOpenDoubleRoundState(state){
    return runtime.transaction(async()=>{
      const current=await runtime.one('SELECT hash,state,game_choices,global_choices FROM double_round_state WHERE id=1 FOR UPDATE');
      if(!current||current.hash!==state.hash||['RESOLVING','FINISHED'].includes(current.state)){
        throw Object.assign(new Error('Double round is closed'),{code:'DOUBLE_ROUND_CHANGED'});
      }
      const phases=['ACCEPTING','BLOCKED','GAME_CHOICE'];
      if(phases.indexOf(state.state)<phases.indexOf(current.state)){
        throw Object.assign(new Error('Double round state moved forward'),{code:'DOUBLE_STATE_STALE'});
      }
      await setDoubleRoundState({...state,gameChoices:JSON.parse(current.game_choices||'{}'),globalChoices:JSON.parse(current.global_choices||'{}')});
    });
  }
  async function recordDoubleGameChoice({roundId,userId,chatId,choice}){
    if(!['left','right'].includes(choice))return null;
    return runtime.transaction(async()=>{
      const state=await runtime.one('SELECT * FROM double_round_state WHERE id=1 FOR UPDATE');
      if(!state||state.hash!==roundId||state.state!=='GAME_CHOICE'||state.result!=='GAME'||
        !Number(state.game_button_active)||now()>=Number(state.end_time))return null;
      const bet=await runtime.one(
        "SELECT id FROM double_bets_log WHERE round_id=? AND user_id=? AND multiplier='GAME' AND status='accepted' LIMIT 1",
        [roundId,String(userId)]);
      if(!bet)return null;
      const gameChoices=JSON.parse(state.game_choices||'{}');
      const globalChoices=JSON.parse(state.global_choices||'{}');
      const chatKey=`${chatId}_${userId}`, globalKey=`global_choice_${userId}`;
      if(gameChoices[chatKey]||(globalChoices[globalKey]&&globalChoices[globalKey]!==choice))return null;
      gameChoices[chatKey]=globalChoices[globalKey]=choice;
      await runtime.execute('UPDATE double_round_state SET game_choices=?,global_choices=?,updated_at=? WHERE id=1',
        [JSON.stringify(gameChoices),JSON.stringify(globalChoices),now()]);
      await updateGameChoicesForRoundUser(roundId,userId,chatId,choice);
      return {gameChoices,globalChoices};
    });
  }
  async function getDoubleNotification(key){return !!await runtime.one('SELECT notification_key FROM double_notifications WHERE notification_key=?',[key]);}
  async function markDoubleNotificationSent(key,hash=''){await runtime.execute('INSERT IGNORE INTO double_notifications(notification_key,round_hash,sent_at) VALUES (?,?,?)',[key,hash,now()]);}
  async function cleanupDoubleNotifications(days=7){if(typeof days!=='number'||!Number.isFinite(days)||days<0)throw new TypeError('Invalid retention');await runtime.execute('DELETE FROM double_notifications WHERE sent_at<?',[now()-days*86400000]);}
  async function updateGameChoicesForRoundUser(roundId,userId,chatId,choice){return (await runtime.execute("UPDATE double_bets_log SET game_choice=? WHERE round_id=? AND user_id=? AND chat_id=? AND multiplier='GAME' AND status='accepted'",[choice,roundId,String(userId),String(chatId)])).changes;}
  return {createDoubleRound,openDoubleRound,getDoubleRoundByHash,getDoubleBetsByRound,logDoubleBet,finishDoubleRoundLog,getDoubleRoundState,setDoubleRoundState,updateOpenDoubleRoundState,recordDoubleGameChoice,getDoubleNotification,markDoubleNotificationSent,cleanupDoubleNotifications,updateGameChoicesForRoundUser};
}
module.exports={createDoubleRounds};
