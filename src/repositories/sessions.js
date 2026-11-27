'use strict';

const DAY_SECONDS=24*60*60;
function createSessionsRepository(pool,{now=()=>Date.now()}={}) {
  const seconds=()=>Math.floor(now()/1000);
  return {
    async getRegistrationSession(userId) {
      const [[row]]=await pool.execute('SELECT registration_data,started_at FROM registration_sessions WHERE user_id=?',[String(userId)]);
      if(!row?.registration_data)return {};
      const started=Number(row.started_at)||seconds();
      if(seconds()-started>DAY_SECONDS){
        // Do not delete a fresh session that another process replaced since read.
        await pool.execute('DELETE FROM registration_sessions WHERE user_id=? AND started_at=?',[String(userId),row.started_at]);
        return {};
      }
      return JSON.parse(row.registration_data);
    },
    async saveRegistrationSession(userId,data) {
      const timestamp=seconds();
      await pool.execute('INSERT INTO registration_sessions(user_id,registration_data,last_accessed,started_at) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE registration_data=VALUES(registration_data),last_accessed=VALUES(last_accessed)',[String(userId),JSON.stringify(data),timestamp,timestamp]);
    },
    async destroyRegistrationSession(userId) {
      await pool.execute('DELETE FROM registration_sessions WHERE user_id=?',[String(userId)]);
    },
    async resetRegistrationSession(userId) {await pool.execute('DELETE FROM registration_sessions WHERE user_id=?',[String(userId)]);},
    async cleanupExpiredSessions() {
      const [result]=await pool.execute('DELETE FROM registration_sessions WHERE started_at>0 AND started_at<?',[seconds()-DAY_SECONDS]);
      return result.affectedRows;
    },
    async getSkinShopSession(userId) {
      const [[row]]=await pool.execute('SELECT skin_shop_data FROM skin_shop_sessions WHERE user_id=?',[String(userId)]);
      return row?.skin_shop_data?JSON.parse(row.skin_shop_data):{};
    },
    async saveSkinShopSession(userId,data) {
      await pool.execute('INSERT INTO skin_shop_sessions(user_id,skin_shop_data,last_accessed) VALUES (?,?,?) ON DUPLICATE KEY UPDATE skin_shop_data=VALUES(skin_shop_data),last_accessed=VALUES(last_accessed)',[String(userId),JSON.stringify(data),seconds()]);
    },
    async destroySkinShopSession(userId) {
      await pool.execute('DELETE FROM skin_shop_sessions WHERE user_id=?',[String(userId)]);
    },
  };
}
module.exports={createSessionsRepository,DAY_SECONDS};
