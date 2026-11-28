'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');

test('Dice restores a committed round and retries delivery after a transient failure',async t=>{
  const gamePath=require.resolve('../games/diceGame');
  const dbPath=require.resolve('../db');
  const previousDb=require.cache[dbPath],previousGame=require.cache[gamePath];
  const calls=[];
  const pending={
    round_id:'fixture',chat_id:'-1',entry_amount:'100',end_time:'0',result_json:'{}',
  };
  const result={state:'finished',roundAmount:100,winner:'1',prize:190,credited:190};
  const db={
    async listPendingDiceRounds(){return [pending];},
    async getDiceBetsByRoundId(){return [{user_id:'1',username:'Fixture',amount:100}];},
    async resolveDiceRound(id){calls.push(['resolve',id]);return result;},
    async markDiceResultDelivered(id){calls.push(['delivered',id]);},
    async updateUserBalance(){assert.fail('The engine must not repeat the committed payout');},
  };
  require.cache[dbPath]={id:dbPath,filename:dbPath,loaded:true,exports:db};
  delete require.cache[gamePath];
  t.after(()=>{
    if(previousDb)require.cache[dbPath]=previousDb;
    else delete require.cache[dbPath];
    if(previousGame)require.cache[gamePath]=previousGame;
    else delete require.cache[gamePath];
  });
  t.mock.method(console,'error',()=>{});
  const {diceGame}=require(gamePath);
  let timer;
  t.mock.method(globalThis,'setTimeout',callback=>{timer=callback;});
  let messageFails=true;
  t.mock.method(diceGame,'sendRoundResult',async (_bot,chat,id,_amount,data)=>{
    calls.push(['send',chat,id,data.prizePerWinner]);
    if(messageFails)throw new Error('Fixture delivery unavailable');
  });
  await diceGame.restoreDiceRounds({});
  await timer();
  assert.equal(diceGame.chatRounds['-1'].length,1);
  assert.deepEqual(calls,[['resolve','fixture'],['send','-1','fixture',190]]);
  messageFails=false;
  await timer();
  assert.equal(diceGame.chatRounds['-1'].length,0);
  assert.deepEqual(calls.slice(2),[['resolve','fixture'],['send','-1','fixture',190],['delivered','fixture']]);
});
