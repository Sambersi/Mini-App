'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {propagate}=require('../scripts/propagate-async-db.cjs');
const {asyncArray}=require('../src/utils/asyncArray');
test('async propagation follows local helpers and exported functions across modules',()=>{
  const sources={
    'db.js':'function getUserById(){} module.exports={getUserById};',
    'handlers/source.js':"const {getUserById}=require('../db'); function lookup(){return getUserById('1');} module.exports={lookup};",
    'handlers/caller.js':"const {lookup}=require('./source'); async function handler(){const user=lookup();return user;} module.exports={handler};",
  };
  const result=propagate(sources);
  assert.ok(result.output['handlers/source.js'].includes('async function lookup'));
  assert.ok(result.output['handlers/caller.js'].includes('(await lookup())'));
});
test('async propagation waits for callbacks before using their accumulated output',()=>{
  const source="const {getUserById}=require('../db'); async function handler(ids){let text='';ids.forEach(id=>{text+=getUserById(id).name;});return text;}";
  const {output,stats}=propagate({'handlers/fixture.js':source});
  assert.equal(stats.arrays,1);assert.ok(output['handlers/fixture.js'].includes('__asyncDbArray("forEach", ids, async id=>'));
});
test('async array methods preserve order, short circuiting and reduction',async()=>{
  const events=[];
  await asyncArray('forEach',[1,2,3],async value=>{await Promise.resolve();events.push(value);});
  assert.deepEqual(events,[1,2,3]);
  assert.deepEqual(await asyncArray('map',[1,2],async value=>value*2),[2,4]);
  assert.equal(await asyncArray('some',[1,2,3],async value=>value===2),true);
  assert.deepEqual(await asyncArray('filter',[1,2,3],async value=>value%2),[1,3]);
  assert.equal(await asyncArray('reduce',[1,2,3],async(sum,value)=>sum+value,0),6);
  const values=[{key:2,id:1},{key:1,id:2},{key:2,id:3}];
  await asyncArray('sort',values,async(a,b)=>a.key-b.key);assert.deepEqual(values.map(v=>v.id),[2,1,3]);
});
test('async propagation awaits the inner database call before chained array methods',()=>{
  const source="const {getAllPromos}=require('../db'); function clean(){return getAllPromos().map(p=>p.name);}";
  const {output}=propagate({'handlers/fixture.js':source});
  assert.ok(output['handlers/fixture.js'].includes('(await getAllPromos()).map'));
});
