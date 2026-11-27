'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{createHmac}=require('node:crypto');
const {validateInitData,ownPlayer,adminOnly}=require('../src/api/telegramAuth');
const options={botToken:'fixture-token',now:()=>1000000000,maxAgeSeconds:3600};
function signed(extra={}){const values={auth_date:'1000000',user:JSON.stringify({id:900000001,first_name:'Fixture'}),...extra};const chain=Object.keys(values).sort().map(key=>key+'='+values[key]).join('\n');const secret=createHmac('sha256','WebAppData').update(options.botToken).digest();return new URLSearchParams({...values,hash:createHmac('sha256',secret).update(chain).digest('hex')}).toString();}
test('Telegram authentication validates signed identity and rejects modification, expiry and duplicates',()=>{
  assert.equal(validateInitData(signed(),options).userId,'900000001');
  for(const raw of [signed().replace('900000001','900000002'),signed({auth_date:'900000'}),signed({auth_date:'1000100'}),signed()+'&auth_date=1000000',signed().replace('hash=','hash=bad')])assert.throws(()=>validateInitData(raw,options),{code:'TELEGRAM_AUTH_INVALID'});
  assert.throws(()=>validateInitData(signed(),{...options,botToken:'wrong'}),{code:'TELEGRAM_AUTH_INVALID'});
});
test('player and admin access depend on authenticated identity instead of caller-supplied IDs',async()=>{
  let status,next=0;const res={status(value){status=value;return this;},json(){return this;}};
  ownPlayer()({auth:{userId:'1'},params:{userId:'2'}},res,()=>next++);assert.equal(status,403);assert.equal(next,0);
  await adminOnly(async id=>id==='1')({auth:{userId:'2'},params:{userId:'1'}},res,()=>next++);assert.equal(status,403);assert.equal(next,0);
  await adminOnly(async id=>id==='1')({auth:{userId:'1'},params:{}},res,()=>next++);assert.equal(next,1);
});
