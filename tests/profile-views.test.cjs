'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createProfileViews}=require('../src/repositories/profileViews');
test('technical balance view sums PF exactly and preserves null display',async()=>{
  const api=createProfileViews({}, {getUserByNumericId:async()=>({numeric_id:12,username:'Fixture',balance:'9007199254740993',card_balance:7,df_balance:null,npf_shares:0,container_type_1:0,container_type_2:0,container_type_3:0})});
  const result=await api.getPlayerBalanceInfoByNumericId('12');assert.equal(result.data.total_balance_pf,'9007199254741000');assert.equal(result.data.balance_df,'null');
  assert.equal((await api.getPlayerBalanceInfoByNumericId('not_numeric')).success,false);
});
test('leaderboard retains false hyperlink setting and source row order for ties',async()=>{
  let sql;
  const api=createProfileViews({many:async query=>{sql=query;return [{numeric_id:'12',telegram_id:'1',username:'Fixture',disable_hyperlink:'0',card_balance:'5'}];}},{});
  const rows=await api.getTopPlayersByCardBalance();assert.equal(rows[0].disable_hyperlink,false);assert.equal(rows[0].card_balance,5);assert.match(sql,/p\.legacy_rowid/);
});
