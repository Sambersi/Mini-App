'use strict';
const {createPlayersRepository}=require('./players');
const {groups}=require('../db/playerFields');
const {canonicalDecimal}=require('../migration/projectPlayers');
function compatibleNumber(value){
  if(value===null||value===undefined)return value;
  const number=Number(value);
  if(!Number.isFinite(number)||Math.abs(number)>Number.MAX_SAFE_INTEGER)return String(value);
  try{return canonicalDecimal(value)===canonicalDecimal(String(number))?number:String(value);}catch{return value;}
}
function createLegacyReads(runtime){
  const executor={execute:(sql,params)=>runtime.currentExecutor().execute(sql,params)};
  const players=createPlayersRepository(executor,{readTransaction:work=>runtime.transaction(()=>work(runtime.currentExecutor()))});
  const scalarFields=new Set(['numeric_id','is_registered','registration_date','account_level','transfers_blocked','is_blocked','balance','card_balance','df_balance',
    'npf_shares','tickets','fortune_tickets','candy','secret_gifts','container_type_1','container_type_2','container_type_3',
    ...Object.values(groups).flatMap(fields=>Object.keys(fields).filter(key=>!['TEXT','LONGTEXT'].includes(fields[key])))]);
  const playerAdapter=row=>{if(!row)return row;for(const key of scalarFields)if(Object.hasOwn(row,key))row[key]=compatibleNumber(row[key]);return row;};
  const catalogAdapter=row=>{if(!row)return row;for(const key of ['id','priority','price','stock','max_stock','total_serials','glow_id','is_visible_in_shop','base_damage','durability','width','height','x_position','y_position','current_durability'])if(Object.hasOwn(row,key))row[key]=compatibleNumber(row[key]);return row;};
  const api={
    async getUserById(id){return playerAdapter(await players.getById(String(id)));},
    async getUserByNumericId(id){return playerAdapter(await players.findByNumericId(String(id)));},
    async getUserByCardNumber(number){return playerAdapter(await players.findByCardNumber(String(number)));},
    async getUserByAnyId(id){return await api.getUserByNumericId(id)||await api.getUserById(id);},
    async getUserStatuses(id){return (await runtime.many('SELECT c.name FROM role_catalog c JOIN player_roles r ON r.role_id=c.id WHERE r.player_id=? ORDER BY r.role_order',[String(id)])).map(r=>r.name);},
    async getUserStatusIds(id){return (await runtime.many('SELECT role_id,original_value_json FROM player_roles WHERE player_id=? ORDER BY role_order',[String(id)])).map(r=>r.original_value_json===null?compatibleNumber(r.role_id):JSON.parse(r.original_value_json));},
    async getUserMaxPriority(id){const row=await runtime.one('SELECT GREATEST(COALESCE(MAX(c.priority),0),0) AS priority FROM role_catalog c JOIN player_roles r ON r.role_id=c.id WHERE r.player_id=?',[String(id)]);return compatibleNumber(row.priority);},
    async getAllStatuses(){return (await runtime.many('SELECT * FROM role_catalog ORDER BY id')).map(catalogAdapter);},
    async getStatusById(id){return catalogAdapter(await runtime.one('SELECT * FROM role_catalog WHERE id=?',[id]));},
    async getStatusByName(name){return catalogAdapter(await runtime.one('SELECT * FROM role_catalog WHERE name=?',[name]));},
    async getCardDetails(id){const row=await runtime.one('SELECT card_number FROM player_cards WHERE player_id=?',[String(id)]);return row;},
    async getCardNumber(id){return (await api.getCardDetails(id))?.card_number;},
    async hasCard(id){return !!(await api.getCardNumber(id));},
    async isCardNumberUnique(number){return !(await runtime.one('SELECT 1 AS found FROM player_cards WHERE card_number=?',[number]));},
    async getCardBalance(id){const row=await runtime.one('SELECT balance FROM wallets WHERE player_id=? AND asset=? AND bucket=?',[String(id),'PF','card']);return row?compatibleNumber(row.balance):0;},
    async getUserBalance(id,currency){const row=await runtime.one('SELECT balance FROM wallets WHERE player_id=? AND asset=? AND bucket=?',[String(id),currency==='PF'?'PF':'DF','main']);return row?compatibleNumber(row.balance):0;},
    async getTotalBalance(id){const row=await runtime.one('SELECT SUM(balance) AS balance FROM wallets WHERE player_id=? AND asset=?',[String(id),'PF']);return compatibleNumber(row?.balance??0);},
    async getAccountLevel(id){return compatibleNumber((await runtime.one('SELECT account_level FROM player_cards WHERE player_id=?',[String(id)]))?.account_level??1);},
    async getAllSkins(visible=false){return (await runtime.many('SELECT * FROM skins'+(visible?' WHERE is_visible_in_shop=1':'')+' ORDER BY CASE WHEN stock>0 THEN 0 ELSE 1 END,id')).map(catalogAdapter);},
    async getSkinById(id){return catalogAdapter(await runtime.one('SELECT * FROM skins WHERE id=?',[id]));},
    async getSkinStock(id){return catalogAdapter(await runtime.one('SELECT stock,max_stock FROM skins WHERE id=?',[id]))||{stock:0,max_stock:0};},
    async getAllSkinIds(){return (await runtime.many('SELECT id FROM skins ORDER BY id')).map(row=>compatibleNumber(row.id));},
    async getUserAvailableSkins(id){return (await runtime.many('SELECT skin_id FROM user_skins WHERE user_id=? ORDER BY id',[String(id)])).map(row=>compatibleNumber(row.skin_id));},
    async getSelectedSkin(id){return compatibleNumber((await runtime.one('SELECT selected_skin_id FROM player_preferences WHERE player_id=?',[String(id)]))?.selected_skin_id)||null;},
    async getSelectedSkinFileName(id){const selected=await api.getSelectedSkin(id);if(!selected)return 'card.jpg';return (await api.getSkinById(selected))?.file_name||'card.jpg';},
    async getAttackState(id){const row=await runtime.one('SELECT state_json AS correct_button_index,message_id,created_at FROM user_attack_states WHERE user_id=?',[String(id)]);if(row){row.message_id=compatibleNumber(row.message_id);row.created_at=compatibleNumber(row.created_at);}return row;},
  };
  api.getUserStatusesSync=api.getUserStatuses;
  return api;
}
module.exports={compatibleNumber,createLegacyReads};
