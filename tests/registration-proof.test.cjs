'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createCaptchaChallenge,captchaDecision,hasCaptchaProof}=require('../src/services/registrationProof');
test('captcha answers share a format and are bound to the current nonce',()=>{
  const current=createCaptchaChallenge([10,11,12,13,14,15],2,{nonce:'current'});
  assert.ok(current.answers.every(answer=>answer.startsWith('captcha_')));
  const session={captchaPending:true,captchaAnswers:current.answers,correctCaptchaAnswer:current.correctAnswer};
  assert.equal(captchaDecision(session,'captcha_12_old'),'inactive');
  assert.equal(captchaDecision(session,current.answers[0]),'wrong');assert.equal(captchaDecision(session,current.answers[2]),'correct');
  assert.equal(captchaDecision({...session,captchaLockedUntil:200},current.answers[2],{now:100}),'locked');
});
test('policy acceptance requires captcha proof while retaining old completed challenges',()=>{
  assert.equal(hasCaptchaProof({captchaPending:true,correctCaptchaAnswer:'captcha_12'}),false);
  assert.equal(hasCaptchaProof({captchaPending:false,correctCaptchaAnswer:'captcha_12'}),true);
  assert.equal(hasCaptchaProof({captchaPending:false,correctCaptchaAnswer:'captcha_12_current'}),false);
  assert.equal(hasCaptchaProof({captchaPending:false,captchaVerifiedAt:100}),true);
});
