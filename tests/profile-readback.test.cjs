'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {verifyLegacyProfiles}=require('../src/migration/verifyLegacyProfiles');
test('profile readback compares exact INT64, decimal padding, list tokens and null balances',async()=>{
  const Database=require('better-sqlite3'),db=new Database(':memory:');
  try{
    db.exec("CREATE TABLE users(id TEXT,numeric_id INTEGER,balance INTEGER,empire_imp_balance REAL,prefix_ids TEXT,is_registered BOOLEAN); INSERT INTO users VALUES('fixture',9007199254740993,NULL,1.125,'[1, 2]',1);");
    const value={id:'fixture',numeric_id:'9007199254740993',balance:null,empire_imp_balance:'1.125000000000000000000000000000',prefix_ids:'[1,2]',is_registered:1};
    const result=await verifyLegacyProfiles(db,{getUserById:async()=>({...value})});assert.deepEqual(result,{profiles:1,fields:6});
    await assert.rejects(verifyLegacyProfiles(db,{getUserById:async()=>({...value,balance:0})}),{code:'PROFILE_FIELD_MISMATCH'});
  }finally{db.close();}
});
