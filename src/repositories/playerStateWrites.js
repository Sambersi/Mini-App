'use strict';
const {groups}=require('../db/playerFields');
const {numericIdentifier}=require('./players');
const {processUsername}=require('../services/username');
const protectedMoney=new Set(['balance','card_balance','df_balance','empire_imp_balance','empire_total_imp_generated','empire_total_imp_spent','referrer_bank']);
const owners=new Map(Object.entries(groups).flatMap(([table,fields])=>Object.keys(fields).map(field=>[field,{table,column:field}])));
for(const [field,column]of Object.entries({username:'display_name',is_registered:'registered',registration_date:'registration_ts',numeric_id:'numeric_id'}))owners.set(field,{table:'players',column});
for(const field of ['card_number','account_level','transfers_blocked'])owners.set(field,{table:'player_cards',column:field});
function planStateUpdate(updates){
  if(!updates||typeof updates!=='object'||Array.isArray(updates))throw new TypeError('Updates must be an object');
  const plan=new Map();
  for(const [field,value]of Object.entries(updates)){
    if(protectedMoney.has(field))throw Object.assign(new Error('Financial mutation requires an accounting service'),{code:'FIELD_REQUIRES_SERVICE'});
    const owner=owners.get(field);
    if(!owner)throw Object.assign(new Error('Unsupported player state field'),{code:'PLAYER_FIELD_UNSUPPORTED'});
    if(value!==null&&!['string','number','bigint','boolean'].includes(typeof value))throw new TypeError('Unsupported state value');
    if(typeof value==='number'&&!Number.isFinite(value))throw new TypeError('State value must be finite');
    if(!plan.has(owner.table))plan.set(owner.table,[]);
    plan.get(owner.table).push({column:owner.column,value:typeof value==='boolean'?Number(value):typeof value==='bigint'?String(value):value});
  }
  return plan;
}
function createPlayerStateWrites(runtime){
  const updateByEither=async(id,updates)=>runtime.transaction(async()=>{
    const numeric=numericIdentifier(id);
    const rows=await runtime.many('SELECT telegram_id FROM players WHERE telegram_id=?'+(numeric===null?'':' OR numeric_id=?')+' ORDER BY telegram_id FOR UPDATE',numeric===null?[String(id)]:[String(id),numeric]);
    let changes=0;for(const row of rows)changes+=(await api.updateUserData(row.telegram_id,updates)).changes;
    return {changes};
  });
  const api={
    async updateUserData(id,updates){
      const plan=planStateUpdate(updates);
      if(!plan.size)return {changes:0};
      return runtime.transaction(async()=>{
        const player=await runtime.one('SELECT telegram_id FROM players WHERE telegram_id=? FOR UPDATE',[String(id)]);
        if(!player)return {changes:0};
        for(const [table,fields]of plan){
          const key=table==='players'?'telegram_id':'player_id';
          const result=await runtime.execute('UPDATE '+table+' SET '+fields.map(field=>field.column+'=?').join(',')+' WHERE '+key+'=?',[...fields.map(field=>field.value),String(id)]);
          if(!result.changes)throw Object.assign(new Error('Player state row is missing'),{code:'PLAYER_STATE_MISSING'});
        }
        return {changes:1};
      });
    },
    async updateUsername(id,name){const result=await api.updateUserData(id,{username:processUsername(name)});return result.changes?{success:true}:{success:false,message:'Пользователь не найден.'};},
    async updateAccountLevel(id,level){return (await api.updateUserData(id,{account_level:level})).changes>0;},
    async updateUserEnergy(id,energy,lastEnergyRestore){return updateByEither(id,{energy,last_energy_restore:lastEnergyRestore});},
    async updateAttackPower(id,value){await updateByEither(id,{attack_power:value});},
    async updateUserSelectedSkin(id,skinId){return (await api.updateUserData(id,{selected_skin_id:skinId})).changes>0;},
    async updateUserNotifications(id,enabled){await api.updateUserData(id,{notifications_enabled:!!enabled});},
  };
  return api;
}
module.exports={planStateUpdate,createPlayerStateWrites};
