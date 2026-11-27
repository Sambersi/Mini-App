'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {cardLimit,mainLimit,parseAmount,financePolicy,isBanned}=require('../src/services/financePolicy');
const {legacyCeilings}=require('../src/migration/projectFinance');
test('card and effective main limits preserve all level boundaries',()=>{
  assert.deepEqual([1,10,15,18,19,20,21].map(x=>String(cardLimit(x))),['10000000','28000000','38000000','44000000','44000000','45000000','10000000']);
  assert.deepEqual([1,9,10,14,15,19,20].map(x=>String(mainLimit(x))),['140000000','140000000','175000000','175000000','185000000','185000000','200000000']);
});
test('amount parser preserves Cyrillic suffixes and all without floating point',()=>{
  assert.equal(parseAmount('2кк'),'2000000');assert.equal(parseAmount(' ВСЁ '),'all');assert.equal(parseAmount('9007199254740993'),'9007199254740993');
  for(const value of ['-1','0','1.5','1e6','2k','999999999999999999999999999к'])assert.throws(()=>parseAmount(value));
});
test('transfer enforces both players restrictions and gives only intended admin exemption',()=>{
  const sender={player_id:'a',card_number:'card-a',account_level:1,transfers_blocked:0,transfer_ceiling:'50000000'};
  const recipient={player_id:'b',card_number:'card-b',account_level:20,transfers_blocked:0};
  const input={kind:'transfer',sender,recipient,nowSeconds:100,totalBalance:50000000n};
  assert.throws(()=>financePolicy(input),{code:'TRANSFER_CEILING'});
  assert.equal(financePolicy({...input,admin:true}),45000000n);
  for(const admin of [true,false]){
    assert.throws(()=>financePolicy({...input,admin,sender:{...sender,transfers_blocked:1}}),{code:'SENDER_TRANSFERS_BLOCKED'});
    assert.throws(()=>financePolicy({...input,admin,recipient:{...recipient,account_blocked:1}}),{code:'RECIPIENT_BLOCKED'});
    assert.throws(()=>financePolicy({...input,admin,senderBan:{banned_until:null}}),{code:'SENDER_BANNED'});
  }
});
test('expired, permanent and boundary bans match old seconds contract',()=>{
  assert.equal(isBanned({banned_until:'100'},100),true);assert.equal(isBanned({banned_until:'100'},101),false);
  assert.equal(isBanned({banned_until:null},101),true);assert.equal(isBanned(undefined,100),false);
});
test('exceptional transfer ceilings are read without importing the legacy bot',()=>{
  const map=legacyCeilings("const SPECIAL_USER_IDS=['11']; const SPECIAL_TRANSFER_LIMIT=60; const PREMIUM_USER_IDS=['22']; const PREMIUM_TRANSFER_LIMIT=120;");
  assert.equal(map.get('11'),'60');assert.equal(map.get('22'),'120');assert.throws(()=>legacyCeilings('unknown'));
});
test('finance projection preserves cards, levels, roles and bans and reports missing references',()=>{
  const Database=require('better-sqlite3');const db=new Database(':memory:');
  try {
    db.exec("CREATE TABLE users(id TEXT,card_number TEXT,account_level INTEGER,transfers_blocked INTEGER,is_blocked INTEGER,status_ids TEXT); CREATE TABLE statuses(id INTEGER,name TEXT,priority INTEGER); CREATE TABLE blacklist(user_id TEXT,reason TEXT,banned_until INTEGER); INSERT INTO users VALUES ('1','1111 2222',20,1,0,'[1,1,99]'); INSERT INTO statuses VALUES(1,'test',5); INSERT INTO blacklist VALUES ('1','fixture',123),('2','orphan',NULL);");
    const {buildFinanceProjection}=require('../src/migration/projectFinance');
    const result=buildFinanceProjection(db,new Map([['1','60000000']]));
    assert.deepEqual(result.cards,[['1','1111 2222','20',1,0,'60000000']]);
    assert.deepEqual(result.memberships,[['1','1',0,'1']]);assert.deepEqual(result.bans,[['1','fixture','123']]);
    assert.equal(result.issues.length,2);
  } finally {db.close();}
});
