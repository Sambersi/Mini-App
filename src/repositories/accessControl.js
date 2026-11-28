'use strict';
const {compatibleNumber}=require('./legacyReads');
const adapt=row=>{if(row)for(const field of ['id','banned_until','muted_until','numeric_id'])if(Object.hasOwn(row,field))row[field]=compatibleNumber(row[field]);return row;};
function createAccessControl(runtime,reads,{now=()=>Date.now()}={}){
  const banSelect='SELECT player_id AS user_id,reason,banned_until FROM player_bans';
  const api={
    async isUserBanned(id){const row=await api.getBlacklistEntry(id);return !!row&&(!row.banned_until||now()/1000<=Number(row.banned_until));},
    async addToBlacklist(id,reason,until=null){await runtime.execute('INSERT INTO player_bans(player_id,reason,banned_until) VALUES (?,?,?)',[String(id),reason,until]);},
    async removeFromBlacklist(id){await runtime.execute('DELETE FROM player_bans WHERE player_id=?',[String(id)]);},
    async getBlacklist(){return (await runtime.many(banSelect+' ORDER BY player_id')).map(adapt);},
    async getBlacklistEntry(id){return adapt(await runtime.one(banSelect+' WHERE player_id=?',[String(id)]));},
    async addMute(id,chat,reason,until){await runtime.execute('INSERT INTO mutes(user_id,chat_id,muted_until,reason) VALUES (?,?,?,?)',[String(id),String(chat),until,reason]);},
    async removeMute(id,chat){await runtime.execute('DELETE FROM mutes WHERE user_id=? AND chat_id=?',[String(id),String(chat)]);},
    async getMuteList(chat){return (await runtime.many('SELECT * FROM mutes'+(chat?' WHERE chat_id=?':'')+' ORDER BY id',chat?[String(chat)]:[])).map(adapt);},
    async getUserMutesPm(id){return (await runtime.many('SELECT * FROM mutes WHERE user_id=? ORDER BY id',[String(id)])).map(adapt);},
    async isUserMuted(id,chat){
      const row=await runtime.one('SELECT * FROM mutes WHERE user_id=? AND chat_id=?',[String(id),String(chat)]);
      if(!row)return false;
      if(row.muted_until===null||Number(row.muted_until)>Math.floor(now()/1000))return adapt(row);
      await runtime.execute('DELETE FROM mutes WHERE id=? AND muted_until=?',[row.id,row.muted_until]);return false;
    },
    async createStatus(name,priority){return runtime.transaction(async()=>{
      await runtime.one('SELECT id FROM player_id_allocator WHERE id=1 FOR UPDATE');
      if(await runtime.one('SELECT id FROM role_catalog WHERE name=?',[name]))return {success:false,message:'Статус с таким названием уже существует.'};
      const row=await runtime.one('SELECT COALESCE(MAX(id),0)+1 AS next_id FROM role_catalog');
      await runtime.execute('INSERT INTO role_catalog(id,name,priority) VALUES (?,?,?)',[String(row.next_id),name,priority]);return {success:true};
    });},
    async updateUserStatus(id,statusId){return runtime.transaction(async()=>{
      if(!await runtime.one('SELECT telegram_id FROM players WHERE telegram_id=? FOR UPDATE',[String(id)]))return {success:false,message:'Пользователь не найден.'};
      if(await runtime.one('SELECT role_id FROM player_roles WHERE player_id=? AND role_id=?',[String(id),statusId]))return {success:true,message:'Статус уже назначен пользователю.'};
      if(!await runtime.one('SELECT id FROM role_catalog WHERE id=?',[statusId]))return {success:false,message:'Статус не существует.'};
      const last=await runtime.one('SELECT COALESCE(MAX(role_order),-1)+1 AS n FROM player_roles WHERE player_id=?',[String(id)]);
      await runtime.execute('INSERT INTO player_roles(player_id,role_id,role_order,original_value_json) VALUES (?,?,?,?)',[String(id),statusId,String(last.n),JSON.stringify(statusId)]);return {success:true};
    });},
    async removeUserStatus(id,statusId){return runtime.transaction(async()=>{
      if(!await runtime.one('SELECT telegram_id FROM players WHERE telegram_id=? FOR UPDATE',[String(id)]))return {success:false,message:'Пользователь не найден.'};
      const result=await runtime.execute('DELETE FROM player_roles WHERE player_id=? AND role_id=?',[String(id),statusId]);
      return result.changes?{success:true}:{success:false,message:'Указанный статус не найден у пользователя.'};
    });},
    async awardStatusToUser(id,name){const role=await reads.getStatusByName(name);if(!role)return {success:false,message:`Статус "${name}" не существует.`};const result=await api.updateUserStatus(id,role.id);if(!result.success)return result;return {success:true,message:result.message?`Статус "${name}" уже назначен пользователю.`:`Статус "${name}" успешно назначен.`};},
    async updateStatusPriority(name,priority){return {success:true,changes:(await runtime.execute('UPDATE role_catalog SET priority=? WHERE name=?',[priority,name])).changes};},
    async getUsersByStatus(name){return (await runtime.many('SELECT p.telegram_id,p.numeric_id,p.display_name AS username FROM players p JOIN player_roles r ON r.player_id=p.telegram_id JOIN role_catalog c ON c.id=r.role_id WHERE c.name=? ORDER BY p.legacy_rowid',[name])).map(adapt);},
    async getUsersByStatuses(names){
      if(!Array.isArray(names)||!names.length)return [];
      const rows=await runtime.many("SELECT p.telegram_id,GROUP_CONCAT(c.name ORDER BY c.id SEPARATOR ', ') AS status_names FROM players p JOIN player_roles r ON r.player_id=p.telegram_id JOIN role_catalog c ON c.id=r.role_id WHERE c.name IN ("+names.map(()=>'?').join(',')+') GROUP BY p.telegram_id ORDER BY MIN(c.priority),p.telegram_id',names);
      const result=[];for(const row of rows)result.push({...await reads.getUserById(row.telegram_id),status_names:row.status_names});return result;
    },
  };
  return api;
}
module.exports={createAccessControl};
