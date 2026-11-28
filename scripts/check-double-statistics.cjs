'use strict';
const assert=require('node:assert/strict');
const {createMysqlApi}=require('../src/db/api');
const {createDatabaseRuntime}=require('../src/db/runtime');
async function runDoubleStatisticsChecks({pool,runtime,now}){
  let checks=0;const id='900000100',rounds=['fixture_double_stats','fixture_double_stats_rollback','fixture_double_stats_legacy'],api=createMysqlApi(runtime,{now:()=>now});
  const one=async(sql,args=[])=>{const [[row]]=await pool.execute(sql,args);return row;};
  const state=()=>one('SELECT * FROM player_statistics WHERE player_id=?',[id]);
  const populate=async round=>{for(const [chat,multiplier,amount,win]of [['A','x2',100,200],['B','x2',300,600],['B','x3',50,0]])await pool.execute("INSERT INTO double_bets_log(ts,round_id,user_id,username,chat_id,multiplier,amount,is_win,win_amount,payout_status) VALUES (?,?,?,?,?,?,?,?,?,?)",[now,round,id,'Fixture',chat,multiplier,amount,win?1:0,win,win?'paid':'lost']);};
  try{
    await pool.execute("UPDATE player_statistics SET total_rounds=0,round_wins=0,round_losses=0,double_total_bets=0,double_wins=0,double_losses=0,double_total_winnings=0,double_total_losses=0,game_wins=0,max_win_amount=0,current_win_streak=0,best_win_streak=0,multiplier_stats='{}' WHERE player_id=?",[id]);
    await api.createDoubleRound(rounds[0]);await populate(rounds[0]);await assert.rejects(api.applyDoubleRoundStatistics(rounds[0]),{code:'DOUBLE_PAYOUT_REQUIRED'});assert.equal(Number((await state()).total_rounds),0);checks++;
    // Simulated proof for statistics-only tests; no payout service is claimed.
    await pool.execute('UPDATE double_runtime_rounds SET payout_json=? WHERE round_id=?',['{"fixture":true}',rounds[0]]);
    const repeated=await Promise.all(Array.from({length:20},()=>api.applyDoubleRoundStatistics(rounds[0])));assert.equal(repeated.filter(row=>!row.replayed).length,1);const row=await state();assert.equal(Number(row.total_rounds),1);assert.equal(Number(row.double_total_bets),2);assert.equal(Number(row.double_wins),1);assert.equal(Number(row.double_losses),1);assert.equal(Number(row.double_total_winnings),800);assert.equal(Number(row.double_total_losses),50);assert.equal(Number(row.max_win_amount),600);assert.equal(Number(row.current_win_streak),0);assert.deepEqual(JSON.parse(row.multiplier_stats),{x2:1,x3:1});assert.equal(Number((await one('SELECT COUNT(*) AS n FROM bet_history WHERE round_hash=?',[rounds[0]])).n),2);checks++;
    const details=await api.getDetailedStats(id);assert.equal(details.total_bet_amount,450);assert.equal(details.total_winnings,800);assert.deepEqual(await api.getDetailedStats('fixture_no_player'),{total_bet_amount:null,total_wins:null,total_losses:null,total_winnings:null});checks++;
    await api.createDoubleRound(rounds[1]);await populate(rounds[1]);await pool.execute('UPDATE double_runtime_rounds SET payout_json=? WHERE round_id=?',['{"fixture":true}',rounds[1]]);const before=await state();
    const brokenPool={getConnection:async()=>{const c=await pool.getConnection();return new Proxy(c,{get(target,key){if(key==='execute')return(sql,args)=>sql.startsWith('INSERT INTO double_statistics_batches')?target.execute('SELECT missing_double_stats_fixture_column'):target.execute(sql,args);const value=target[key];return typeof value==='function'?value.bind(target):value;}});}};
    await assert.rejects(createMysqlApi(createDatabaseRuntime(brokenPool),{now:()=>now}).applyDoubleRoundStatistics(rounds[1]),{code:'ER_BAD_FIELD_ERROR'});assert.deepEqual(await state(),before);assert.equal(Number((await one('SELECT COUNT(*) AS n FROM bet_history WHERE round_hash=?',[rounds[1]])).n),0);checks++;
    await api.applyDoubleRoundStatistics(rounds[1]);assert.equal(Number((await state()).total_rounds),2);checks++;
    await pool.execute("INSERT INTO double_rounds(round_id,start_ts,status) VALUES (?,?,'finished')",[rounds[2],now]);await populate(rounds[2]);await assert.rejects(api.applyDoubleRoundStatistics(rounds[2]),{code:'DOUBLE_PAYOUT_REQUIRED'});assert.equal(Number((await state()).total_rounds),2);checks++;
    await api.updateDoubleStatistics(id,[{isWin:true,amount:10,winAmount:20},{isWin:false,amount:5}]);assert.equal(Number((await state()).double_total_bets),6);assert.equal(Number((await state()).double_total_winnings),1620);checks++;
    return checks;
  }finally{for(const round of rounds){await pool.execute('DELETE FROM double_statistics_batches WHERE round_id=?',[round]);await pool.execute('DELETE FROM double_runtime_rounds WHERE round_id=?',[round]);await pool.execute('DELETE FROM double_bets_log WHERE round_id=?',[round]);await pool.execute('DELETE FROM bet_history WHERE round_hash=?',[round]);await pool.execute('DELETE FROM double_rounds WHERE round_id=?',[round]);}}
}
module.exports={runDoubleStatisticsChecks};
