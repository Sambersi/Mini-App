'use strict';
const {numericIdentifier}=require('./players');
const {compatibleNumber}=require('./legacyReads');
const fields={prefix_ids:{table:'player_prefix_ownership',kind:'regular',catalog:'prefixes',column:'regular_prefix_id'},special_prefix_ids:{table:'player_prefix_ownership',kind:'special',catalog:'special_prefixes',column:'special_prefix_id'},owned_weapons:{table:'player_weapon_ownership',catalog:'weapons',column:'weapon_id'}};
function createPlayerEquipment(runtime,reads,catalogs){
  async function mutate(id,field,value,remove=false){return runtime.transaction(async()=>{
    id=String(id);if(!await runtime.one('SELECT telegram_id FROM players WHERE telegram_id=? FOR UPDATE',[id]))return false;
    if(await runtime.one('SELECT field_name FROM player_invalid_lists WHERE player_id=? AND field_name=?',[id,field]))throw Object.assign(new Error('Invalid legacy collection requires review'),{code:'PLAYER_LIST_INVALID'});
    const spec=fields[field],where='player_id=?'+(spec.kind?' AND kind=?':''),args=spec.kind?[id,spec.kind]:[id];
    const rows=await runtime.many('SELECT ordinal,value_json FROM '+spec.table+' WHERE '+where+' ORDER BY ordinal',args);
    const matching=rows.filter(row=>JSON.parse(row.value_json)===value);
    if(remove){for(const row of matching)await runtime.execute('DELETE FROM '+spec.table+' WHERE '+where+' AND ordinal=?',[...args,row.ordinal]);return matching.length>0;}
    if(matching.length)return false;
    const key=numericIdentifier(value),target=key===null?null:await runtime.one('SELECT id FROM '+spec.catalog+' WHERE id=?',[key]);
    const ordinal=rows.length?String(BigInt(rows.at(-1).ordinal)+1n):'0';
    await runtime.execute('INSERT INTO '+spec.table+'(player_id,'+(spec.kind?'kind,':'')+'ordinal,'+spec.column+',value_json) VALUES ('+[...args,ordinal,target?.id??null,JSON.stringify(value)].map(()=>'?').join(',')+')',[...args,ordinal,target?.id??null,JSON.stringify(value)]);return true;
  });}
  const api={
    addPrefixToUser:(id,value)=>mutate(id,'prefix_ids',value),removePrefixFromUser:(id,value)=>mutate(id,'prefix_ids',value,true),
    async assignSpecialPrefixToUser(numeric,value){const user=await reads.getUserByNumericId(numeric);if(!user)return {success:false,message:'Пользователь не найден.'};return await mutate(user.id,'special_prefix_ids',value)?{success:true,message:'Префикс успешно выдан.'}:{success:false,message:'У пользователя уже есть этот префикс.'};},
    async removeSpecialPrefixFromUser(numeric,value){const user=await reads.getUserByNumericId(numeric);if(!user)return {success:false,message:'Пользователь не найден.'};return await mutate(user.id,'special_prefix_ids',value,true)?{success:true,message:'Префикс успешно забран.'}:{success:false,message:'У пользователя нет этого префикса.'};},
    async listUserPrefixes(id){return (await runtime.many("SELECT DISTINCT p.id,p.prefix AS name FROM prefixes p JOIN player_prefix_ownership o ON o.regular_prefix_id=p.id WHERE o.player_id=? AND o.kind='regular' ORDER BY p.id",[String(id)])).map(row=>({...row,id:compatibleNumber(row.id)}));},
    async getOwnedWeapons(id){const player=await reads.getUserById(id);if(!player)throw new Error('Player missing');try{return JSON.parse(player.owned_weapons||'[]');}catch{return [];}},
    async addWeaponToUser(id,value){if(!await reads.getUserById(id))throw new Error('Player missing');await mutate(id,'owned_weapons',value);},
    async getUserWeapons(id){if(!await reads.getUserById(id))return [];const ids=(await api.getOwnedWeapons(id)).map(Number),all=await catalogs.getAllWeapons(),fist=await catalogs.getWeaponByName('Кулак');return fist?[fist,...all.filter(row=>ids.includes(row.id))]:[];},
    async setActiveWeapon(id,value){await runtime.execute('UPDATE player_boss_state SET active_weapon=? WHERE player_id=?',[String(value),String(id)]);},
    async switchToDefaultWeapon(id){const fist=await catalogs.getWeaponByName('Кулак');if(!fist)throw new Error('Default weapon missing');await api.setActiveWeapon(id,fist.id);},
    async getActiveWeapon(id){const state=await runtime.one('SELECT active_weapon FROM player_boss_state WHERE player_id=?',[String(id)]);const key=numericIdentifier(state?.active_weapon);return (key===null?null:await catalogs.getWeaponById(key))||await catalogs.getWeaponByName('Кулак');},
    async getCurrentWeaponDurability(id,weapon){const row=await runtime.one('SELECT current_durability FROM user_weapon_durability WHERE user_id=? AND weapon_id=?',[String(id),weapon]);return row?compatibleNumber(row.current_durability):(await catalogs.getWeaponById(weapon))?.durability??0;},
    async reduceWeaponDurability(id,weapon,amount=1){return runtime.transaction(async()=>{
      if(!Number.isSafeInteger(amount)||amount<0)throw new TypeError('Invalid durability decrement');
      await runtime.one('SELECT telegram_id FROM players WHERE telegram_id=? FOR UPDATE',[String(id)]);
      await runtime.execute('INSERT INTO user_weapon_durability(user_id,weapon_id,current_durability) VALUES (?,?,(SELECT durability FROM weapons WHERE id=?)) ON DUPLICATE KEY UPDATE current_durability=GREATEST(current_durability-?,0)',[String(id),weapon,weapon,amount]);
      return BigInt((await runtime.one('SELECT current_durability FROM user_weapon_durability WHERE user_id=? AND weapon_id=?',[String(id),weapon])).current_durability)===0n;
    });},
    async removeBrokenWeapon(id,weapon){await runtime.transaction(async()=>{await mutate(id,'owned_weapons',weapon,true);await runtime.execute('DELETE FROM user_weapon_durability WHERE user_id=? AND weapon_id=?',[String(id),weapon]);});},
    async getUserPrefixesDetailedPm(id){const player=await reads.getUserById(id);if(!player)return {regular:[],special:[],activeId:null};const result={regular:[],special:[],activeId:player.active_prefix_id};for(const [field,key,get]of [['prefix_ids','regular',catalogs.getPrefixById],['special_prefix_ids','special',catalogs.getSpecialPrefixById]]){let values=[];try{values=JSON.parse(player[field]||'[]');}catch{}for(const value of values){const row=await get(value);result[key].push(row?{id:row.id,name:row.prefix}:{id:value,name:`[ID:${value}]`});}}return result;},
    async getUserPrefixNamesPm(id){const data=await api.getUserPrefixesDetailedPm(id);return {regular:data.regular.map(row=>row.name),special:data.special.map(row=>row.name),activeId:data.activeId};},
  };
  return api;
}
module.exports={createPlayerEquipment};
