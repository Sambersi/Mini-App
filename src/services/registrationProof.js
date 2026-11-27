'use strict';
const {randomBytes}=require('node:crypto');
function createCaptchaChallenge(numbers,correctIndex,{nonce=randomBytes(12).toString('hex')}={}){
  if(!Array.isArray(numbers)||numbers.length!==6||new Set(numbers).size!==6||numbers.some(n=>!Number.isSafeInteger(n))||!Number.isSafeInteger(correctIndex)||correctIndex<0||correctIndex>=numbers.length)throw new Error('Invalid captcha challenge');
  const answers=numbers.map(number=>'captcha_'+number+'_'+nonce);
  return {answers,correctAnswer:answers[correctIndex]};
}
function captchaDecision(session,data,{now=Date.now()}={}){
  if(!session?.captchaPending)return 'inactive';
  if(Number(session.captchaLockedUntil)>now)return 'locked';
  if(Array.isArray(session.captchaAnswers)){
    if(!session.captchaAnswers.includes(data))return 'inactive';
    return data===session.correctCaptchaAnswer?'correct':'wrong';
  }
  // Preserve a still-valid challenge from an old message after migration.
  if(data===session.correctCaptchaAnswer)return 'correct';
  return /^wrong_\d+$/.test(data||'')?'wrong':'inactive';
}
function hasCaptchaProof(session){
  if(!session||session.captchaPending)return false;
  return Number(session.captchaVerifiedAt)>0||(/^captcha_\d+$/.test(session.correctCaptchaAnswer||''));
}
module.exports={createCaptchaChallenge,captchaDecision,hasCaptchaProof};
