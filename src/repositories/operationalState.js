'use strict';
const {compatibleNumber}=require('./legacyReads');
function createOperationalState(runtime,{now=()=>Date.now()}={}){
  const seconds=()=>Math.floor(now()/1000);
  const adapt=row=>{if(row)for(const key of ['id','timestamp','ts','is_command','message_id','created_at','minBet','minStep','highestBid'])if(Object.hasOwn(row,key))row[key]=compatibleNumber(row[key]);return row;};
  const cleanup=async(table,column,cutoff)=>({success:true,deletedCount:(await runtime.execute('DELETE FROM '+table+' WHERE '+column+'<?',[cutoff])).changes});
  const last=async(table,id)=>compatibleNumber((await runtime.one('SELECT MAX(timestamp) AS value FROM '+table+' WHERE admin_id=?',[String(id)]))?.value)||null;
  const range=async(table,id,from,to)=> (await runtime.many('SELECT * FROM '+table+' WHERE admin_id=? AND timestamp>=? AND timestamp<=? ORDER BY timestamp,id',[String(id),from??to-86400,to])).map(adapt);
  const api={
    async recordAdminAction(admin,type,target){const row=await runtime.execute('INSERT INTO daily_admin_actions(admin_id,action_type,target_user_id,timestamp) VALUES (?,?,?,?)',[String(admin),type,String(target),seconds()]);return {success:true,lastInsertRowid:row.lastInsertRowid};},
    async recordAdminKickAction(admin,target){const row=await runtime.execute('INSERT INTO daily_admin_kick_actions(admin_id,target_user_id,timestamp) VALUES (?,?,?)',[String(admin),String(target),seconds()]);return {success:true,lastInsertRowid:row.lastInsertRowid};},
    getLastAdminActionTime:id=>last('daily_admin_actions',id),getLastAdminKickActionTime:id=>last('daily_admin_kick_actions',id),
    getAdminActionsInRange:(id,from=null,to=seconds())=>range('daily_admin_actions',id,from,to),
    getAdminKickActionsInRange:(id,from=null,to=seconds())=>range('daily_admin_kick_actions',id,from,to),
    cleanupExpiredAdminActions:()=>cleanup('daily_admin_actions','timestamp',seconds()-86400),
    cleanupExpiredAdminKickActions:()=>cleanup('daily_admin_kick_actions','timestamp',seconds()-86400),
    async hasUnansweredReports(id){return BigInt((await runtime.one('SELECT COUNT(*) AS n FROM reports WHERE user_id=? AND status=?',[String(id),'not_answered'])).n)>0n;},
    async logMessage(id,type,chat,title,text,command=false){await runtime.execute('INSERT INTO message_log(user_id,ts,chat_type,chat_id,chat_title,message_text,is_command) VALUES (?,?,?,?,?,?,?)',[String(id),now(),type,String(chat),title,text?text.substring(0,1024):'',command?1:0]);},
    cleanupOldMessageLogs:(days=30)=>cleanup('message_log','ts',now()-days*86400000),
    async getUserMessageLog(id,limit=200){if(!Number.isSafeInteger(limit)||limit<0)throw new TypeError('Invalid message log limit');return (await runtime.many('SELECT * FROM message_log WHERE user_id=? ORDER BY ts DESC,id LIMIT '+limit,[String(id)])).map(adapt);},
    async saveAttackState(id,state,message){await runtime.execute('INSERT INTO user_attack_states(user_id,state_json,message_id,created_at) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE state_json=VALUES(state_json),message_id=VALUES(message_id),created_at=VALUES(created_at)',[String(id),state,message,seconds()]);},
    async deleteAttackState(id){await runtime.execute('DELETE FROM user_attack_states WHERE user_id=?',[String(id)]);},
    async updateAttackMessageId(id,message){await runtime.execute('UPDATE user_attack_states SET message_id=? WHERE user_id=?',[message,String(id)]);},
    async cleanupOldAttackStates(age=600){await cleanup('user_attack_states','created_at',seconds()-age);},
    async saveAuctionState(auction){
      await runtime.execute('INSERT INTO auction(id,prize,minBet,minStep,highestBid,highestBidder,participants,bids,isFinished) VALUES (1,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE prize=VALUES(prize),minBet=VALUES(minBet),minStep=VALUES(minStep),highestBid=VALUES(highestBid),highestBidder=VALUES(highestBidder),participants=VALUES(participants),bids=VALUES(bids),isFinished=VALUES(isFinished)',[auction.prize,auction.minBet,auction.minStep,auction.highestBid,auction.highestBidder?.userId||null,JSON.stringify(auction.participants),JSON.stringify(auction.bids.map(b=>({userId:b.userId,telegramId:b.telegramId,amount:b.amount}))),auction.isFinished?1:0]);
    },
    async getAuctionState(){const row=adapt(await runtime.one('SELECT * FROM auction LIMIT 1'));if(!row)return null;return {...row,participants:JSON.parse(row.participants||'[]'),bids:JSON.parse(row.bids||'[]').map(b=>({userId:b.userId,telegramId:b.telegramId,amount:b.amount})),isFinished:Boolean(Number(row.isFinished))};},
  };
  return api;
}
module.exports={createOperationalState};
