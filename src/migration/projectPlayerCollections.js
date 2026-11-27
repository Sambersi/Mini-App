'use strict';
const {verifyRows}=require('./projectPlayers');
const listFields=['prefix_ids','special_prefix_ids','owned_weapons','donations_history','form_ids'];
function parseSourceList(raw){
  if(raw===null||raw==='')return {values:[],tokens:[]};
  try{
    const values=JSON.parse(raw);if(!Array.isArray(values))return {invalid:raw};
    const text=raw.trim(),tokens=[];let start=1,depth=1,string=false,escaped=false;
    for(let i=1;i<text.length;i++){
      const c=text[i];
      if(string){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c==='"')string=false;continue;}
      if(c==='"'){string=true;continue;}
      if(c==='['||c==='{')depth++;
      if(c===']'||c==='}')depth--;
      if((c===','&&depth===1)||(c===']'&&depth===0)){
        const token=text.slice(start,i).trim();if(token)tokens.push(token);start=i+1;
      }
    }
    if(tokens.length!==values.length)throw new Error('JSON token boundary mismatch');
    return {values,tokens};
  }catch{return {invalid:raw};}
}
function buildCollections(db){
  const catalog=table=>new Set(db.prepare('SELECT id FROM '+table).safeIntegers().all().map(row=>String(row.id)));
  const regular=catalog('prefixes'),special=catalog('special_prefixes'),weapons=catalog('weapons');
  const prefixes=[],ownedWeapons=[],donations=[],forms=[],invalid=[];
  for(const row of db.prepare('SELECT id,'+listFields.join(',')+' FROM users ORDER BY id').all()){
    const id=String(row.id);
    for(const field of listFields){
      const list=parseSourceList(row[field]);
      if(list.invalid!==undefined){invalid.push([id,field,list.invalid]);continue;}
      list.values.forEach((value,index)=>{
        const json=list.tokens[index],key=String(value);
        if(field==='prefix_ids')prefixes.push([id,'regular',index,regular.has(key)?key:null,null,json]);
        else if(field==='special_prefix_ids')prefixes.push([id,'special',index,null,special.has(key)?key:null,json]);
        else if(field==='owned_weapons')ownedWeapons.push([id,index,weapons.has(key)?key:null,json]);
        else if(field==='donations_history')donations.push([id,index,json]);
        else forms.push([id,index,json]);
      });
    }
  }
  return {prefixes,ownedWeapons,donations,forms,invalid};
}
async function projectPlayerCollections(connection,db,runId){
  const data=buildCollections(db);
  const tables=[
    ['player_prefix_ownership','player_id,kind,ordinal,regular_prefix_id,special_prefix_id,value_json',data.prefixes],
    ['player_weapon_ownership','player_id,ordinal,weapon_id,value_json',data.ownedWeapons],
    ['player_donation_events','player_id,ordinal,value_json',data.donations],
    ['player_forms','player_id,ordinal,value_json',data.forms],
    ['player_invalid_lists','player_id,field_name,original_text',data.invalid],
  ];
  await connection.beginTransaction();
  try{
    const [[control]]=await connection.query('SELECT runtime_active,projection_run_id FROM runtime_control WHERE id=1 FOR UPDATE');
    const [[operations]]=await connection.query('SELECT COUNT(*) AS n FROM wallet_operations');
    if(!control||control.runtime_active||control.projection_run_id!==runId||Number(operations.n))throw new Error('Matching inactive snapshot without writes required');
    for(const [table,columns,rows]of tables){
      await connection.query('DELETE FROM '+table);
      for(let i=0;i<rows.length;i+=200)await connection.query('INSERT INTO '+table+'('+columns+') VALUES ?',[rows.slice(i,i+200)]);
      await verifyRows(connection,'SELECT '+columns+' FROM '+table,rows);
    }
    await connection.commit();return Object.fromEntries(tables.map(([table,,rows])=>[table,rows.length]));
  }catch(e){await connection.rollback();throw e;}
}
module.exports={listFields,parseSourceList,buildCollections,projectPlayerCollections};
