'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createAttackUpgradeHandler}=require('../src/telegram/attackUpgrade');
test('upgrade handler binds Telegram identity and keeps replay from reporting another upgrade',async()=>{
  for(const replayed of [false,true]){const events=[];const handler=createAttackUpgradeHandler({upgrade:async input=>{assert.deepEqual(input,{playerId:'123',operationKey:'telegram:123:77'});events.push('commit');return {replayed,price:'100',balance:'900',attackPower:'2',energy:'4',maxEnergy:10};},getUserById:async()=>({username:'Fixture'}),isHyperlinkDisabled:async()=>true,link:()=> 'Fixture',format:String});await handler({from:{id:123},update:{update_id:77},reply:async()=>events.push('replay'),replyWithHTML:async(text,options)=>{assert.equal(options.reply_markup.inline_keyboard[0][0].callback_data,'upgrade_attack_power');events.push('success');}});assert.deepEqual(events,['commit',replayed?'replay':'success']);}
});
