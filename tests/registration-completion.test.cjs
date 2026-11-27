'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {notifyCompletedRegistration}=require('../src/telegram/registrationCompletion');
function fixture(events){return {from:{id:123,first_name:'<Fixture>'},chat:{type:'private'},reply:async()=>events.push('reply'),replyWithHTML:async()=>events.push('bonus'),telegram:{sendMessage:async()=>{events.push('referrer');throw Error('blocked');}}};}
test('registration notifies only after commit and survives an unavailable referrer',async()=>{
  const events=[];
  await notifyCompletedRegistration(fixture(events),{complete:async()=>{events.push('commit');return {referrerId:'456',newUserPf:'5000',newUserTickets:'1',referrerPf:'10000',referrerTickets:'1',candy:'25'};},getUser:async()=>({username:'Fixture'}),log:{warn:()=>events.push('warning')}});
  assert.deepEqual(events,['commit','reply','referrer','warning','bonus']);
});
test('a rejected registration sends no success or reward notification',async()=>{
  const events=[];await assert.rejects(notifyCompletedRegistration(fixture(events),{complete:async()=>{throw Object.assign(Error('failed'),{code:'REGISTRATION_PROOF_REQUIRED'});}}),{code:'REGISTRATION_PROOF_REQUIRED'});
  assert.deepEqual(events,[]);
});
test('a repeated registration does not notify the referrer again',async()=>{
  const events=[];await notifyCompletedRegistration(fixture(events),{complete:async()=>({alreadyRegistered:true,referrerId:'456'})});assert.deepEqual(events,['reply']);
});
