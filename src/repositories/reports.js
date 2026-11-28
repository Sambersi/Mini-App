'use strict';

const {compatibleNumber}=require('./legacyReads');
const fields=['id','created_at','likes','dislikes','user_numeric_id'];
function adapt(row){
  if(row)for(const name of fields)if(Object.hasOwn(row,name))row[name]=compatibleNumber(row[name]);
  return row;
}

function createReports(runtime,{balances,statistics,runTransaction,now=()=>Date.now()}){
  return {
    async createReportRecord(userId,username,reportText){
      const result=await runtime.execute(
        "INSERT INTO reports(user_id,username,report_text,status,likes,dislikes,created_at) VALUES (?,?,?,'not_answered',0,0,?)",
        [String(userId),username,reportText,now()/1000]);
      return compatibleNumber(result.lastInsertRowid);
    },
    async getUnansweredReportRecords(){
      return (await runtime.many("SELECT r.*,p.numeric_id AS user_numeric_id FROM reports r LEFT JOIN players p ON p.telegram_id=r.user_id WHERE r.status='not_answered' ORDER BY r.id DESC LIMIT 15")).map(adapt);
    },
    async getLatestReportRecords(){
      return (await runtime.many('SELECT * FROM reports ORDER BY created_at DESC,id DESC LIMIT 20')).map(adapt);
    },
    async getReportRecord(id){return adapt(await runtime.one('SELECT * FROM reports WHERE id=?',[id]));},
    async answerReportRecord(id,text,adminId,adminName){
      return runTransaction(async()=>{
        const report=await runtime.one("SELECT * FROM reports WHERE id=? AND status='not_answered' FOR UPDATE",[id]);
        if(!report)return null;
        await runtime.execute("UPDATE reports SET status='answered',admin_response=?,admin_id=?,admin_username=? WHERE id=?",
          [text,String(adminId),adminName,id]);
        return adapt(report);
      });
    },
    async deleteReportRecord(id){return runtime.execute('DELETE FROM reports WHERE id=?',[id]);},
    async clearReportRecords(){return runtime.execute('DELETE FROM reports');},
    async setReportBlocked(id,blocked){
      await runtime.execute('UPDATE player_preferences SET report_blocked=? WHERE player_id=?',[blocked?1:0,String(id)]);
    },
    async rateReportRecord(id,userId,feedback){
      if(!['like','dislike'].includes(feedback))return {accepted:false};
      return runTransaction(async()=>{
        const report=await runtime.one("SELECT user_id,admin_id,user_feedback FROM reports WHERE id=? AND status='answered' FOR UPDATE",[id]);
        if(!report||report.user_id!==String(userId))return {accepted:false};
        if(report.user_feedback)return {accepted:false,alreadyRated:true};
        const admin=report.admin_id&&await runtime.one('SELECT telegram_id FROM players WHERE telegram_id=? FOR UPDATE',[report.admin_id]);
        if(admin){
          if(feedback==='like'){
            await statistics.incrementLikesReceived(admin.telegram_id);
            const result=await balances.updateUserDFBalance(admin.telegram_id,1,'df_balance','report_like:'+id);
            if(!result.success)throw Object.assign(new Error('Report reward failed'),{code:'REPORT_REWARD_FAILED'});
          }else await statistics.incrementDislikesReceived(admin.telegram_id);
        }
        await runtime.execute('UPDATE reports SET user_feedback=? WHERE id=?',[feedback,id]);
        return {accepted:true,adminId:admin?.telegram_id||null};
      });
    },
  };
}

module.exports={createReports};
