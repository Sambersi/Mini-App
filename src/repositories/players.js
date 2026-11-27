'use strict';
const {groups}=require('../db/playerFields');
const {withTransaction}=require('../db/transaction');
// The legacy-shaped result is an adapter contract. Data ownership stays in
// separate domain tables; balances are read only from canonical wallets.
function createPlayersRepository(pool) {
  return {
    async getById(id) {
      return withTransaction(pool,async connection=>{
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
      const names={'PF:main':'balance','PF:card':'card_balance','DF:main':'df_balance'};
      for(const w of wallets)player[names[w.asset+':'+w.bucket]]=String(w.balance);
      const [inventory]=await connection.execute('SELECT item_code,quantity FROM inventory_balances WHERE player_id=?',[id]);
      for(const item of inventory)player[item.item_code]=String(item.quantity);
      return player;
      });
    },
    async findByNumericId(numericId) {
      const [[row]]=await pool.execute('SELECT telegram_id FROM players WHERE numeric_id=?',[numericId]);
      return row?this.getById(row.telegram_id):null;
    },
    async findByCardNumber(cardNumber) {
      const [[row]]=await pool.execute('SELECT player_id FROM player_cards WHERE REPLACE(card_number,\' \',\'\')=?',[cardNumber.replaceAll(' ','')]);
      return row?this.getById(row.player_id):null;
    },
  };
}
module.exports={createPlayersRepository};
