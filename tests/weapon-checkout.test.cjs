'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createWeaponCheckout}=require('../src/telegram/weaponCheckout');
test('weapon checkout preserves navigation after commit and does not repeat purchase notifications',async()=>{
  for(const replayed of [false,true]){const events=[],checkout=createWeaponCheckout({purchase:async input=>{assert.deepEqual(input,{playerId:'123',weaponId:'4',operationKey:'telegram:123:88'});events.push('commit');return {replayed,weapon:{name:'Fixture <weapon>'},price:'100',balance:'900'};},menu:async()=>events.push('menu'),format:String});await checkout({from:{id:123},match:['buy_weapon_4','4'],update:{update_id:88},reply:async()=>events.push('replay'),replyWithHTML:async(text,options)=>{assert.ok(text.includes('Fixture &lt;weapon&gt;'));assert.equal(options.reply_markup.inline_keyboard[0][0].callback_data,'change_weapon');assert.equal(options.reply_markup.inline_keyboard[1][0].callback_data,'close_energy_info');events.push('reply');}});assert.deepEqual(events,replayed?['commit','replay']:['commit','reply','menu']);}
});
