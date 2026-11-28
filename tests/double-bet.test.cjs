'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createDoubleBetGateway}=require('../src/telegram/doubleBet');
test('Double gateway binds event identity and delegates one atomic bet',async()=>{
  const calls=[],gateway=createDoubleBetGateway({getRound:()=>({hash:'fixture_round'}),place:async input=>{calls.push(input);return {success:true,replayed:true};}});assert.deepEqual(await gateway(123,'Untrusted nickname','x2','100',-9,'Fixture',77),{success:true,replayed:true});assert.deepEqual(calls,[{playerId:'123',chatId:'-9',roundId:'fixture_round',multiplier:'x2',amount:'100',chatTitle:'Fixture',operationKey:'telegram:123:77'}]);
});
test('Double gateway rejects a missing event and does not compensate a failed atomic bet',async()=>{
  let calls=0;const gateway=createDoubleBetGateway({getRound:()=>({hash:'fixture'}),place:async()=>{calls++;throw new Error('fixture_sql');}});assert.equal((await gateway(123,'','x2',100,-9)).success,false);assert.equal(calls,0);assert.equal((await gateway(123,'','x2',100,-9,null,77)).success,false);assert.equal(calls,1);
});
