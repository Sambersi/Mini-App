'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const specs=require('../src/migration/domainTables.json');
const {canonicalRow,fingerprintSource,fingerprintTarget}=require('../src/migration/projectDomains');
test('native domain mapping covers all reviewed nonplayer tables and keeps user money out',()=>{
  assert.equal(specs.length,43);assert.equal(new Set(specs.map(s=>s.name)).size,43);
  for(const name of ['users','statuses','blacklist','wallets'])assert.ok(!specs.some(s=>s.name===name));
  for(const name of ['double_bets','dice_bets','registration_sessions','skin_shop_sessions','promos','finance_log','user_skins','empire_businesses'])assert.ok(specs.some(s=>s.name===name));
  const sql=fs.readFileSync(path.join(__dirname,'../src/db/migrations/006-domain-tables.sql'),'utf8')+fs.readFileSync(path.join(__dirname,'../src/db/migrations/007-historical-money-precision.sql'),'utf8');
  for(const spec of specs){assert.equal(spec.primary.length,1);assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS '+spec.name));for(const c of spec.columns)assert.ok(sql.includes('`'+c.name+'` '+c.type));}
});
test('native checksums preserve strings and INT64, normalize decimals and reject fractional integers',()=>{
  const spec={name:'test',columns:[{name:'id',type:'BIGINT'},{name:'quantity',type:'DECIMAL(65,30)'},{name:'payload',type:'LONGTEXT'}]};
  assert.equal(canonicalRow(spec,[9007199254740993n,1.125,'001']),canonicalRow(spec,['9007199254740993','1.125000000000000000000000000000','001']));
  assert.notEqual(canonicalRow(spec,[1n,0,'001']),canonicalRow(spec,[1n,0,'1']));
  assert.throws(()=>canonicalRow(spec,[1.5,0,'x']),{code:'DOMAIN_VALUE_TYPE'});
});
test('native target fingerprint pages by key and detects a missing historical row',async()=>{
  const Database=require('better-sqlite3'),db=new Database(':memory:');
  try{
    db.exec("CREATE TABLE fixture(id INTEGER PRIMARY KEY,payload TEXT); INSERT INTO fixture VALUES(1,'first'),(2,'second');");
    const spec={name:'fixture',primary:['id'],columns:[{name:'id',type:'BIGINT'},{name:'payload',type:'LONGTEXT'}]};
    const source=fingerprintSource(db,spec);
    const target=await fingerprintTarget({query:async(q,p)=>[p.length?[]:[[1,'first'],[2,'second']]]},spec);
    assert.deepEqual(source,target);
    const missing=await fingerprintTarget({query:async(q,p)=>[p.length?[]:[[1,'first']]]},spec);
    assert.notEqual(missing.hash,source.hash);assert.equal(missing.count,1);
  }finally{db.close();}
});
