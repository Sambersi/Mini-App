'use strict';
const {groups,assertPlayerFieldCoverage}=require('../db/playerFields');
const {verifyRows}=require('./projectPlayers');

function buildPlayerState(db) {
  const columns=db.prepare('PRAGMA table_info(users)').all().map(c=>c.name);
  assertPlayerFieldCoverage(columns);
  const users=db.prepare('SELECT * FROM users ORDER BY id').safeIntegers().all();
  const result={};
  for(const [table,fields] of Object.entries(groups)) {
    const names=Object.keys(fields);
    const rows=users.map(u=>[String(u.id),...names.map(field=>{
      const value=u[field]===undefined?null:u[field];
      if(value===null)return null;
      const type=fields[field];
      if(type==='BIGINT'&&typeof value!=='bigint')throw Object.assign(new Error('Integer field has a different SQLite storage type'),{code:'PLAYER_FIELD_TYPE',details:{field}});
      if((type==='TEXT'||type==='LONGTEXT')&&typeof value!=='string')throw Object.assign(new Error('Text field has a different SQLite storage type'),{code:'PLAYER_FIELD_TYPE',details:{field}});
      return String(value);
    })]);
    result[table]={names,rows,decimalColumns:names.flatMap((name,i)=>fields[name].startsWith('DECIMAL')?[i+1]:[])};
  }
  return result;
}
async function projectPlayerState(connection,db,runId) {
  const data=buildPlayerState(db);
  await connection.beginTransaction();
  try {
    const [[control]]=await connection.query('SELECT runtime_active,projection_run_id FROM runtime_control WHERE id=1 FOR UPDATE');
    if(!control||control.runtime_active||control.projection_run_id!==runId)throw new Error('Matching inactive import required');
    for(const [table,{names,rows,decimalColumns}] of Object.entries(data)) {
      await connection.query('DELETE FROM '+table);
      for(let i=0;i<rows.length;i+=200)await connection.query('INSERT INTO '+table+'(player_id,'+names.join(',')+') VALUES ?',[rows.slice(i,i+200)]);
      await verifyRows(connection,'SELECT player_id,'+names.join(',')+' FROM '+table,rows,decimalColumns);
    }
    await connection.commit();
    return Object.fromEntries(Object.entries(data).map(([table,value])=>[table,value.rows.length]));
  }catch(e){await connection.rollback();throw e;}
}
module.exports={buildPlayerState,projectPlayerState};
