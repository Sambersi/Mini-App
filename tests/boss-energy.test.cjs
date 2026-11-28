'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {restoredEnergy}=require('../src/repositories/bossState');
test('energy restoration preserves source interval, ceiling and clock behavior',()=>{
  const calculate=extra=>restoredEnergy({energy:'2',lastRestore:'1000',maxEnergy:10,nowSeconds:1299,...extra});
  assert.deepEqual(calculate({}),{energy:2n,lastRestore:'1000',changed:false});
  assert.deepEqual(calculate({nowSeconds:1650}),{energy:4n,lastRestore:1650,changed:true});
  assert.deepEqual(calculate({energy:'20',nowSeconds:1300}),{energy:10n,lastRestore:1300,changed:true});
  assert.deepEqual(calculate({nowSeconds:999}),{energy:2n,lastRestore:'1000',changed:false});
  assert.deepEqual(calculate({energy:null}),{energy:0n,lastRestore:1299,changed:true});
});
