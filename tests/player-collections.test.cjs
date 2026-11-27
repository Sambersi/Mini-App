'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {parseSourceList,buildCollections}=require('../src/migration/projectPlayerCollections');
test('collection import retains exact JSON numeric tokens and nested strings',()=>{
  const raw='[9007199254740993,{"amount":999999999999999999999999,"note":"a,]\\\""},[1,2]]';
  const parsed=parseSourceList(raw);assert.equal(parsed.tokens[0],'9007199254740993');assert.ok(parsed.tokens[1].includes('999999999999999999999999'));assert.equal(parsed.tokens[2],'[1,2]');
  assert.equal(parseSourceList('{broken').invalid,'{broken');assert.deepEqual(parseSourceList(null).values,[]);
});
test('collection import retains order, duplicate ownership and dangling references',()=>{
  const Database=require('better-sqlite3'),db=new Database(':memory:');
  try{
    db.exec("CREATE TABLE users(id TEXT,prefix_ids TEXT,special_prefix_ids TEXT,owned_weapons TEXT,donations_history TEXT,form_ids TEXT); CREATE TABLE prefixes(id INTEGER); CREATE TABLE special_prefixes(id INTEGER); CREATE TABLE weapons(id INTEGER); INSERT INTO prefixes VALUES(1); INSERT INTO users VALUES('fixture','[1,1,99]','[]','[3]','[{\"amount\":10}]','[\"a\",\"b\"]');");
    const data=buildCollections(db);assert.equal(data.prefixes.length,3);assert.equal(data.prefixes[2][3],null);assert.equal(data.prefixes[2][5],'99');assert.equal(data.ownedWeapons[0][2],null);assert.deepEqual(data.forms.map(r=>r[2]),['"a"','"b"']);
  }finally{db.close();}
});
