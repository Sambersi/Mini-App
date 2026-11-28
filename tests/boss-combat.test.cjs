'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {bossDamage,makeBossQuestion}=require('../src/services/bossMath');
const {createBossAttackHandler}=require('../src/telegram/bossCombat');
test('boss damage preserves weapon modifiers and fifth-answer combo',()=>{
  assert.equal(bossDamage({name:'Кулак',baseDamage:3,attackPower:4,streak:0,correct:true}).damage,12n);
  assert.deepEqual(bossDamage({name:'Old',baseDamage:19,attackPower:10,streak:4,correct:true}),{damage:2n,streak:0,combo:true,reduced:true});
  assert.equal(bossDamage({name:'Ручка',baseDamage:19,streak:0,correct:true}).damage,19n);
  assert.equal(bossDamage({name:'Кулак',baseDamage:3,attackPower:4,streak:4,correct:false}).streak,0);
});
test('boss questions retain distinct answers and phase button counts',()=>{for(const phase of [1,2]){const q=makeBossQuestion(phase);assert.equal(q.answers.length,phase===1?4:8);assert.equal(new Set(q.answers).size,q.answers.length);assert.ok(q.answers.includes(q.correctResult));}});
test('boss menu commits question before publishing and binds message with version check',async()=>{
  const calls=[],q={playerId:'1',chatId:'2',questionId:'fixture',answers:[1,2,3,4],example:'1 + 1',currentStreak:0,timeLimit:10};
  const handler=createBossAttackHandler({prepare:async()=>{calls.push('commit');return {question:q,energy:'5',hp:'10'};},attach:async input=>{assert.equal(input.messageId,77);calls.push('attach');return true;},setTimer:()=>({unref(){}}),clearTimer(){}});
  await handler({from:{id:1},chat:{id:2},update:{update_id:9},replyWithHTML:async()=>{calls.push('reply');return {message_id:77};}});assert.deepEqual(calls,['commit','reply','attach']);handler.dispose();
});
test('answer adapter uses Telegram identity and replay has no publication or reward side effects',async()=>{
  const handler=createBossAttackHandler({answer:async input=>{assert.deepEqual(input,{playerId:'1',chatId:'-2',messageId:'77',index:0,operationKey:'telegram:1:9'});return {replayed:true};}});
  let replies=0;await handler({from:{id:1},chat:{id:-2},update:{update_id:9},match:['attack_boss_0','0'],callbackQuery:{message:{message_id:77}},isCorrectAnswer:true,answerCbQuery:async()=>replies++,replyWithHTML:()=>assert.fail('Replay must not publish')});assert.equal(replies,1);handler.dispose();
});
test('timer stops when its question version was replaced',async()=>{
  let tick,cleared=0;const q={playerId:'1',chatId:'2',questionId:'fixture',answers:[1,2,3,4],example:'1 + 1',currentStreak:0,timeLimit:10};
  const handler=createBossAttackHandler({prepare:async()=>({question:q,energy:'5',hp:'10'}),attach:async()=>true,read:async()=>null,expire:()=>assert.fail('A stale timer must not rotate state'),setTimer:fn=>{tick=fn;return 1;},clearTimer:()=>cleared++});await handler({from:{id:1},chat:{id:2},update:{update_id:9},replyWithHTML:async()=>({message_id:77})});await tick();assert.equal(cleared,1);handler.dispose();
});
