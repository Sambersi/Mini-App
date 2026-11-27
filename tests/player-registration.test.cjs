'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {firstAvailableNumericId,defaultPlayerState,createPlayerRegistration}=require('../src/services/playerRegistration');
test('numeric allocation preserves reserved IDs and reuses the first gap',()=>{
  assert.equal(firstAvailableNumericId([]),'12');assert.equal(firstAvailableNumericId(['12','13','15',null]),'14');
  assert.equal(firstAvailableNumericId(['9007199254740993']),'12');
});
test('new player defaults preserve deployed registration overrides',()=>{
  const state=defaultPlayerState({now:1000001,referralJoinDate:0,referralBonusAmount:10000});
  assert.equal(state.player_referral_state.referral_join_date,1000);assert.equal(state.player_referral_state.referral_bonus_amount,10000);
  assert.equal(state.player_preferences.card_level,null);assert.equal(state.player_preferences.notifications_enabled,1);
  assert.equal(state.player_boss_state.active_weapon,'1');assert.equal(state.player_boss_state.attack_power,1);assert.equal(state.player_statistics.multiplier_stats,'{}');
});
test('registration rejects unsafe IDs before acquiring a database connection',async()=>{
  const service=createPlayerRegistration({getConnection:()=>{throw Error('must not connect');}});
  await assert.rejects(service.createUserOrUpdate({id:9007199254740992}),{code:'PLAYER_ID_INVALID'});
  await assert.rejects(service.completePlayerRegistration('0'),{code:'PLAYER_ID_INVALID'});
});
