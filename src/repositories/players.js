'use strict';
const {groups}=require('../db/playerFields');
const {withTransaction}=require('../db/transaction');
function numericIdentifier(value){
  if(typeof value==='number'&&!Number.isSafeInteger(value))return null;
  if(!['number','bigint','string'].includes(typeof value)||! /^-?\d+$/.test(String(value)))return null;
  const id=BigInt(value);return id< -9223372036854775808n||id>9223372036854775807n?null:String(id);
}
function createPlayersRepository(pool,{readTransaction=work=>withTransaction(pool,work)}={}){
  const fields=['p.telegram_id AS id','p.numeric_id','p.display_name AS username','p.registered AS is_registered','p.registration_ts AS registration_date','c.card_number','c.account_level','c.transfers_blocked','c.account_blocked AS is_blocked','COALESCE(r.referrer_id,ri.referral_code) AS referrer_id','mi.details_json AS _invalid_referrer'];
  const joins=['LEFT JOIN player_cards c ON c.player_id=p.telegram_id','LEFT JOIN player_referrals r ON r.player_id=p.telegram_id','LEFT JOIN player_referral_intents ri ON ri.player_id=p.telegram_id',"LEFT JOIN migration_issues mi ON mi.run_id=p.source_run_id AND mi.issue_code='INVALID_REFERRER' AND mi.record_key=CONCAT(p.telegram_id,':referrer_id')"];
  let index=0;
  for(const [table,columns]of Object.entries(groups)){
    const alias='s'+index++;fields.push(...Object.keys(columns).map(field=>alias+'.'+field));joins.push('LEFT JOIN '+table+' '+alias+' ON '+alias+'.player_id=p.telegram_id');
  }
  const base='SELECT '+fields.join(',')+' FROM players p '+joins.join(' ');
  const listSources=[
    ['prefix_ids','player_prefix_ownership','ordinal','value_json'," AND kind='regular'"],
    ['special_prefix_ids','player_prefix_ownership','ordinal','value_json'," AND kind='special'"],
    ['owned_weapons','player_weapon_ownership','ordinal','value_json',''],
    ['donations_history','player_donation_events','ordinal','value_json',''],
    ['form_ids','player_forms','ordinal','value_json',''],
    ['status_ids','player_roles','role_order','COALESCE(original_value_json,CAST(role_id AS CHAR))',''],
  ];
  async function load(connection,ids){
    if(!ids.length)return [];
    const placeholders=ids.map(()=>'?').join(','),filter='player_id IN ('+placeholders+')';
    const [rows]=await connection.execute(base+' WHERE p.telegram_id IN ('+placeholders+') ORDER BY p.telegram_id',ids);
    const players=new Map(rows.map(row=>[row.id,row]));
    if(!rows.length)return [];
    for(const player of rows){
      if(player.referrer_id===null&&player._invalid_referrer){const details=JSON.parse(player._invalid_referrer),[value]=JSON.parse(details.value);player.referrer_id=value&&typeof value==='object'&&Object.hasOwn(value,'i')?value.i:value;}
      delete player._invalid_referrer;Object.assign(player,{balance:null,card_balance:null,df_balance:null});
      for(const [field]of listSources)player[field]=[];
    }
    const [wallets]=await connection.execute('SELECT player_id,asset,bucket,balance FROM wallets WHERE '+filter,ids);
    const walletFields={'PF:main':'balance','PF:card':'card_balance','DF:main':'df_balance'};
    for(const row of wallets){const field=walletFields[row.asset+':'+row.bucket];if(field&&players.has(row.player_id))players.get(row.player_id)[field]=String(row.balance);}
    const [inventory]=await connection.execute('SELECT player_id,item_code,quantity FROM inventory_balances WHERE '+filter,ids);
    for(const row of inventory)if(players.has(row.player_id))players.get(row.player_id)[row.item_code]=String(row.quantity);
    const queries=listSources.map(([field,table,ordinal,value,extra])=>"SELECT player_id,'"+field+"' AS field_name,"+ordinal+' AS ordinal,'+value+' AS value_json FROM '+table+' WHERE '+filter+extra);
    const [lists]=await connection.execute(queries.join(' UNION ALL ')+' ORDER BY player_id,field_name,ordinal',listSources.flatMap(()=>ids));
    for(const row of lists)if(players.has(row.player_id))players.get(row.player_id)[row.field_name].push(row.value_json);
    for(const player of rows)for(const [field]of listSources)player[field]='['+player[field].join(',')+']';
    const [invalid]=await connection.execute('SELECT player_id,field_name,original_text FROM player_invalid_lists WHERE '+filter,ids);
    for(const row of invalid)if(players.has(row.player_id))players.get(row.player_id)[row.field_name]=row.original_text;
    return rows;
  }
  const repository={
    async getById(id){return readTransaction(async connection=>(await load(connection,[String(id)]))[0]||null);},
    async getAll(){return readTransaction(async connection=>{
      const [ids]=await connection.execute('SELECT telegram_id FROM players ORDER BY telegram_id');const result=[];
      for(let i=0;i<ids.length;i+=200)result.push(...await load(connection,ids.slice(i,i+200).map(row=>row.telegram_id)));
      return result;
    });},
    async findByNumericId(value){const id=numericIdentifier(value);if(id===null)return null;const [[row]]=await pool.execute('SELECT telegram_id FROM players WHERE numeric_id=?',[id]);return row?repository.getById(row.telegram_id):null;},
    async findByUsername(name){const [[row]]=await pool.execute('SELECT telegram_id FROM players WHERE display_name=? LIMIT 1',[name]);return row?repository.getById(row.telegram_id):null;},
    async findByCardNumber(number){const [rows]=await pool.execute("SELECT player_id FROM player_cards WHERE REPLACE(card_number,' ','')=?",[number.replaceAll(' ','')]);if(rows.length>1)throw Object.assign(new Error('Ambiguous card number'),{code:'CARD_NUMBER_AMBIGUOUS'});return rows[0]?repository.getById(rows[0].player_id):null;},
  };
  return repository;
}
module.exports={createPlayersRepository,numericIdentifier};
