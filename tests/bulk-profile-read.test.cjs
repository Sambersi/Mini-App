'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createPlayersRepository}=require('../src/repositories/players');
test('bulk player read batches profiles without one transaction per player',async()=>{
  let queries=0,transactions=0;
  const ids=Array.from({length:401},(_,i)=>String(i+1));
  const connection={execute:async(sql,params)=>{
    queries++;
    if(sql==='SELECT telegram_id FROM players ORDER BY telegram_id')return [ids.map(telegram_id=>({telegram_id}))];
    if(sql.startsWith('SELECT p.telegram_id AS id'))return [params.map(id=>({id,referrer_id:null,_invalid_referrer:null}))];
    if(sql.includes('FROM wallets'))return [params.map(player_id=>({player_id,asset:'PF',bucket:'main',balance:'100'}))];
    return [[]];
  }};
  const repository=createPlayersRepository({}, {readTransaction:async work=>{transactions++;return work(connection);}});
  const rows=await repository.getAll();
  assert.equal(rows.length,401);assert.equal(transactions,1);assert.equal(queries,16);
  assert.equal(rows[0].balance,'100');assert.equal(rows[0].card_balance,null);assert.equal(rows[0].prefix_ids,'[]');
});
