'use strict';
async function projectPlayerIdentity(connection,db,runId){
  const [[other]]=await connection.execute('SELECT COUNT(*) AS n FROM players WHERE source_run_id IS NULL OR source_run_id<>?',[runId]);
  if(Number(other.n))throw Object.assign(new Error('Identity projection contains runtime players'),{code:'IDENTITY_PROJECTION_NOT_INACTIVE'});
  const source=db.prepare('SELECT rowid AS source_rowid,id,referrer_id FROM users ORDER BY rowid').safeIntegers().all();
  const ids=new Set(source.map(row=>String(row.id)));let invalidReferrals=0;
  await connection.beginTransaction();
  try{
    await connection.execute('DELETE ri FROM player_referral_intents ri JOIN players p ON p.telegram_id=ri.player_id WHERE p.source_run_id=?',[runId]);
    for(const row of source){
      const id=String(row.id),code=row.referrer_id;
      const [updated]=await connection.execute('UPDATE players SET legacy_rowid=? WHERE telegram_id=? AND source_run_id=?',[String(row.source_rowid),id,runId]);
      if(updated.affectedRows!==1)throw Object.assign(new Error('Imported player identity missing'),{code:'IDENTITY_PLAYER_MISSING'});
      if(code!==null&&code!==undefined&&code!==''&&(String(code)===id||!ids.has(String(code)))){
        await connection.execute('INSERT INTO player_referral_intents(player_id,referral_code) VALUES (?,?)',[id,String(code)]);invalidReferrals++;
      }
    }
    const [actual]=await connection.execute('SELECT telegram_id FROM players WHERE source_run_id=? ORDER BY legacy_rowid',[runId]);
    if(actual.length!==source.length||actual.some((row,index)=>row.telegram_id!==String(source[index].id)))throw Object.assign(new Error('Imported player order mismatch'),{code:'IDENTITY_ORDER_MISMATCH'});
    await connection.commit();
  }catch(error){await connection.rollback();throw error;}
  return {players:source.length,invalidReferrals};
}
module.exports={projectPlayerIdentity};
