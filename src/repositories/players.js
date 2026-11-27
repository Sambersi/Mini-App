'use strict';
const {groups}=require('../db/playerFields');
const {withTransaction}=require('../db/transaction');
function numericIdentifier(value){
  if(typeof value==='number'&&!Number.isSafeInteger(value))return null;
  if(!['number','bigint','string'].includes(typeof value)||! /^-?\d+$/.test(String(value)))return null;
  const id=BigInt(value);return id< -9223372036854775808n||id>9223372036854775807n?null:String(id);
}
// The legacy-shaped result is an adapter contract. Data ownership stays in
// separate domain tables; balances are read only from canonical wallets.
function createPlayersRepository(pool,{readTransaction=work=>withTransaction(pool,work)}={}) {
  const repository={
    async getById(id) {
      return readTransaction(async connection=>{
      const fields=['p.telegram_id AS id','p.numeric_id','p.display_name AS username','p.registered AS is_registered','p.registration_ts AS registration_date',
        'c.card_number','c.account_level','c.transfers_blocked','c.account_blocked AS is_blocked','r.referrer_id'];
      const joins=['LEFT JOIN player_cards c ON c.player_id=p.telegram_id','LEFT JOIN player_referrals r ON r.player_id=p.telegram_id'];
      let index=0;
      for(const [table,columns] of Object.entries(groups)) {
        const alias='s'+index++;
        fields.push(...Object.keys(columns).map(field=>alias+'.'+field));
        joins.push('LEFT JOIN '+table+' '+alias+' ON '+alias+'.player_id=p.telegram_id');
      }
      const [[player]]=await connection.execute('SELECT '+fields.join(',')+' FROM players p '+joins.join(' ')+' WHERE p.telegram_id=?',[id]);
      if(!player)return null;
      const [wallets]=await connection.execute('SELECT asset,bucket,balance FROM wallets WHERE player_id=?',[id]);
      Object.assign(player,{balance:null,card_balance:null,df_balance:null});
      const names={'PF:main':'balance','PF:card':'card_balance','DF:main':'df_balance'};
      for(const w of wallets)player[names[w.asset+':'+w.bucket]]=String(w.balance);
      const [inventory]=await connection.execute('SELECT item_code,quantity FROM inventory_balances WHERE player_id=?',[id]);
      for(const item of inventory)player[item.item_code]=String(item.quantity);
      const listQueries=[
        ["SELECT 'prefix_ids' AS field_name,ordinal,value_json FROM player_prefix_ownership WHERE player_id=? AND kind='regular'",id],
        ["SELECT 'special_prefix_ids' AS field_name,ordinal,value_json FROM player_prefix_ownership WHERE player_id=? AND kind='special'",id],
        ["SELECT 'owned_weapons' AS field_name,ordinal,value_json FROM player_weapon_ownership WHERE player_id=?",id],
        ["SELECT 'donations_history' AS field_name,ordinal,value_json FROM player_donation_events WHERE player_id=?",id],
        ["SELECT 'form_ids' AS field_name,ordinal,value_json FROM player_forms WHERE player_id=?",id],
        ["SELECT 'status_ids' AS field_name,role_order AS ordinal,COALESCE(original_value_json,CAST(role_id AS CHAR)) AS value_json FROM player_roles WHERE player_id=?",id],
      ];
      const [lists]=await connection.execute(listQueries.map(q=>q[0]).join(' UNION ALL ')+' ORDER BY field_name,ordinal',listQueries.map(q=>q[1]));
      const values=Object.fromEntries(['prefix_ids','special_prefix_ids','owned_weapons','donations_history','form_ids','status_ids'].map(key=>[key,[]]));
      for(const row of lists)values[row.field_name].push(row.value_json);
      for(const [field,tokens]of Object.entries(values))player[field]='['+tokens.join(',')+']';
      const [invalid]=await connection.execute('SELECT field_name,original_text FROM player_invalid_lists WHERE player_id=?',[id]);
      for(const row of invalid)player[row.field_name]=row.original_text;
      return player;
      });
    },
    async findByNumericId(numericId) {
      const identifier=numericIdentifier(numericId);if(identifier===null)return null;
      const [[row]]=await pool.execute('SELECT telegram_id FROM players WHERE numeric_id=?',[identifier]);
      return row?repository.getById(row.telegram_id):null;
    },
    async findByCardNumber(cardNumber) {
      const [[row]]=await pool.execute('SELECT player_id FROM player_cards WHERE REPLACE(card_number,\' \',\'\')=?',[cardNumber.replaceAll(' ','')]);
      return row?repository.getById(row.player_id):null;
    },
  };
  return repository;
}
module.exports={createPlayersRepository,numericIdentifier};
