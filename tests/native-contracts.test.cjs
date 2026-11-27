'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createCatalogs}=require('../src/repositories/catalogs');
const {createGameRecords}=require('../src/repositories/gameRecords');
const {createChatModes}=require('../src/repositories/chatModes');
const {numericIdentifier}=require('../src/repositories/players');
test('catalog adapters retain object and boolean return contracts',async()=>{
  const api=createCatalogs({one:async()=>({file_name:'fixture.png'}),execute:async()=>({changes:1})});
  assert.deepEqual(await api.getCardTemplateById(1),{file_name:'fixture.png'});assert.equal(await api.updateSkinPrice(1,100),true);
});
test('numeric identifiers reject MySQL implicit coercion of text to numeric zero',()=>{
  assert.equal(numericIdentifier('system_account'),null);assert.equal(numericIdentifier('1e3'),null);assert.equal(numericIdentifier('001'),'1');assert.equal(numericIdentifier('9223372036854775808'),null);
});
test('Dice participant reset follows round-to-chat relation instead of nonexistent bet column',async()=>{
  let query,args;
  await createGameRecords({execute:async(sql,values)=>{query=sql;args=values;}}).resetDiceRoundParticipants('-123');
  assert.ok(query.includes('JOIN dice_rounds'));assert.ok(query.includes('r.chat_id=?'));assert.deepEqual(args,['-123']);
});
test('chat mode activation preserves the mutually exclusive old replacement semantics',async()=>{
  const requests=[];const api=createChatModes({execute:async(sql,args)=>{requests.push(args);return {changes:1};}});
  assert.equal((await api.activateDoubleMode('-123')).success,true);assert.equal((await api.activateDiceMode('-123')).success,true);
  assert.deepEqual(requests,[['-123',1,0],['-123',0,1]]);
});
test('shop catalog keeps in-stock-first ordering used by existing button indexes',async()=>{
  const {createLegacyReads}=require('../src/repositories/legacyReads');let query;
  const api=createLegacyReads({many:async sql=>{query=sql;return [];}});
  await api.getAllSkins(true);assert.ok(query.includes('WHERE is_visible_in_shop=1'));assert.ok(query.includes('ORDER BY CASE WHEN stock>0 THEN 0 ELSE 1 END,id'));
});
