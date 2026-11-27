'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {Telegraf}=require('telegraf');
const parser=require('@babel/parser'),traverse=require('@babel/traverse').default;
function registration(){const code=fs.readFileSync(path.join(__dirname,'../bot.js'),'utf8'),nodes=[];traverse(parser.parse(code,{sourceType:'script'}),{CallExpression(p){const n=p.node;if(n.callee.type==='MemberExpression'&&n.callee.object.name==='bot'&&n.callee.property.name==='action'&&n.arguments[0]?.value==='card')nodes.push(n);}});assert.equal(nodes.length,1);return code.slice(nodes[0].start,nodes[0].end);}
for(const allowed of [true,false])test('card button preserves access middleware and invokes at most once, allowed='+allowed,async()=>{
  const bot=new Telegraf('dummy-test-token');bot.botInfo={id:123,is_bot:true,first_name:'Fixture',username:'fixture_bot'};
  let checks=0,shown=0,wrapped=0;
  vm.runInNewContext(registration(),{bot,checkUserStatus:async()=>{checks++;return allowed;},handleCallbackWithErrorHandling:async(ctx,fn)=>{wrapped++;await fn();},cardInfoHandler:async()=>shown++});
  await bot.handleUpdate({update_id:1,callback_query:{id:'test',from:{id:1,is_bot:false,first_name:'Fixture'},chat_instance:'test',data:'card',message:{message_id:1,date:1,chat:{id:1,type:'private'}}}});
  assert.equal(checks,1);assert.equal(shown,allowed?1:0);assert.equal(wrapped,allowed?1:0);
});
