'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {planStateUpdate,createPlayerStateWrites}=require('../src/repositories/playerStateWrites');
test('state updates map only reviewed columns and reject money and SQL injection',()=>{
  const plan=planStateUpdate({username:'Fixture',is_registered:true,energy:5});
  assert.deepEqual(plan.get('players'),[{column:'display_name',value:'Fixture'},{column:'registered',value:1}]);
  assert.throws(()=>planStateUpdate({balance:10}),{code:'FIELD_REQUIRES_SERVICE'});
  assert.throws(()=>planStateUpdate({'username=?, balance':10}),{code:'PLAYER_FIELD_UNSUPPORTED'});
});
test('multi-domain state writes hold the player lock and use one outer transaction',async()=>{
  const events=[];
  const runtime={transaction:async work=>{events.push('begin');const result=await work();events.push('commit');return result;},one:async()=>({telegram_id:'1'}),execute:async(sql,args)=>{events.push([sql,args]);return {changes:1};}};
  assert.equal((await createPlayerStateWrites(runtime).updateUserData('1',{username:'Fixture',energy:5})).changes,1);
  assert.equal(events[0],'begin');assert.equal(events.at(-1),'commit');assert.equal(events.length,4);
  assert.ok(events[1][0].startsWith('UPDATE players'));assert.ok(events[2][0].startsWith('UPDATE player_boss_state'));
});
