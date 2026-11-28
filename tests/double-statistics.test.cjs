'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {summarizeDoubleRows}=require('../src/services/doubleStatistics');
test('Double statistics merge chats by multiplier while retaining single-bet maximum',()=>{
  const users=summarizeDoubleRows([{user_id:'1',chat_id:'A',multiplier:'x2',amount:'100',is_win:1,win_amount:'200'},{user_id:'1',chat_id:'B',multiplier:'x2',amount:'300',is_win:1,win_amount:'600'},{user_id:'1',multiplier:'x3',amount:'50',is_win:0,win_amount:'0'}]);const user=users.get('1');assert.equal(user.groups.size,2);assert.equal(user.groups.get('x2').win,800n);assert.equal(user.maxWin,600n);assert.equal(user.groups.get('x3').won,false);
});
