'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {groups,assertPlayerFieldCoverage}=require('../src/db/playerFields');
const {buildPlayerState}=require('../src/migration/projectPlayerState');
test('unmapped player columns stop import instead of being discarded',()=>{
  assertPlayerFieldCoverage(['id','balance','card_level','account_level','last_message_ts','tickets','fortune_tickets']);
  assert.throws(()=>assertPlayerFieldCoverage(['unreviewed_field']),{code:'PLAYER_FIELDS_UNMAPPED'});
});
test('player state preserves separate levels, bonus units and fractional balances',()=>{
  const Database=require('better-sqlite3'),db=new Database(':memory:');
  try {
    db.exec("CREATE TABLE users(id TEXT,card_level INTEGER,last_bonus_time INTEGER,last_private_bonus_time INTEGER,empire_imp_balance REAL); INSERT INTO users VALUES ('1',7,1700000000,1700000000123,1.125);");
    const r=buildPlayerState(db);
    assert.equal(r.player_preferences.rows[0][Object.keys(groups.player_preferences).indexOf('card_level')+1],'7');
    assert.deepEqual(r.player_bonus_state.rows[0],['1','1700000000','1700000000123',null]);
    assert.equal(r.player_empire_state.rows[0][1],'1.125');
  }finally{db.close();}
});
test('player counters with fractional storage types are rejected for review',()=>{
  const Database=require('better-sqlite3'),db=new Database(':memory:');
  try{db.exec("CREATE TABLE users(id TEXT,total_messages INTEGER); INSERT INTO users VALUES('1',1.5);");assert.throws(()=>buildPlayerState(db),{code:'PLAYER_FIELD_TYPE'});}finally{db.close();}
});
test('domain migration includes every declared field and has no balance copy',()=>{
  const sql=fs.readFileSync(require('node:path').join(__dirname,'../src/db/migrations/005-player-domain-state.sql'),'utf8');
  for(const [table,fields] of Object.entries(groups)) {assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS '+table));for(const [field,type]of Object.entries(fields))assert.ok(sql.includes(field+' '+type+' NULL'));}
  assert.ok(!/\b(?:card_balance|df_balance|balance)\s+BIGINT/.test(sql));
});
