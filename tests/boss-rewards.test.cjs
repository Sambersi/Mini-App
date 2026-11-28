'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createBossRewardDistribution}=require('../src/telegram/bossRewards');
test('boss reward notifications follow settlement and failure does not claim failed credit',async()=>{
  const events=[],distribute=createBossRewardDistribution({settle:async input=>{assert.deepEqual(input,{bossId:7});events.push('commit');return {replayed:false,name:'Fixture <boss>',prizeType:'balance',currency:'PF',amount:'10',recipients:[{id:'123',username:'Fixture'}]};}});
  const report=await distribute({telegram:{sendMessage:async()=>{events.push('notify');throw new Error('fixture_offline');}}},{id:7},999);assert.deepEqual(events,['commit','notify']);assert.ok(report.includes('Fixture &lt;boss&gt;'));assert.ok(report.includes('награда начислена'));
});
test('replayed boss distribution never repeats notifications',async()=>{const distribute=createBossRewardDistribution({settle:async()=>({replayed:true})});assert.ok((await distribute({telegram:{sendMessage:async()=>assert.fail('Replay must not notify')}},{id:7})).includes('уже распределены'));});
