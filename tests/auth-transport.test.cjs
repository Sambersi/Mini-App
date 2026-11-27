'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
test('plain API transport adds signed Telegram data only to its own API origin',async()=>{
  const calls=[];
  const window={location:{href:'https://fixture.example/v2/',origin:'https://fixture.example'},Telegram:{WebApp:{initData:'fixture-signed-data'}},fetch:async(...args)=>{calls.push(args);return {};}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../app/frontend/plain/auth-fetch.js'),'utf8'),{window,Request,Headers,URL});
  await window.fetch('/api/v2/user/1',{headers:{'X-Test':'yes'}});
  assert.equal(calls[0][1].headers.get('authorization'),'tma fixture-signed-data');assert.equal(calls[0][1].headers.get('x-test'),'yes');
  await window.fetch('https://external.example/api/user/1');assert.equal(calls[1][1].headers,undefined);
  await window.fetch('/v2/style.css');assert.equal(calls[2][1].headers,undefined);
});
