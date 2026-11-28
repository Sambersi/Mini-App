'use strict';
const {signedAmount}=require('./balanceAdjustment');
const {compatibleNumber}=require('../repositories/legacyReads');
const fields={totalRounds:'total_rounds',roundWins:'round_wins',roundLosses:'round_losses',doubleTotalBets:'double_total_bets',doubleWins:'double_wins',doubleLosses:'double_losses',doubleTotalWinnings:'double_total_winnings',doubleTotalLosses:'double_total_losses'};
const exact=value=>signedAmount(typeof value==='string'?value.replace(/\.0+$/,''):value??0);
function summarizeDoubleRows(rows){const users=new Map();for(const row of rows){let u=users.get(row.user_id);if(!u){u={groups:new Map(),maxWin:0n,won:false};users.set(row.user_id,u);}const amount=exact(row.amount),win=Number(row.is_win)===1?exact(row.win_amount):0n;let group=u.groups.get(row.multiplier);if(!group){group={amount:0n,win:0n,won:false};u.groups.set(row.multiplier,group);}group.amount+=amount;group.win+=win;if(Number(row.is_win)===1){group.won=true;u.won=true;if(win>u.maxWin)u.maxWin=win;}}return users;}
function createDoubleStatistics(runtime,statistics,{runTransaction,now=()=>Date.now()}){
  async function updateRoundStatistics(id,stats){const values=Object.keys(fields).map(key=>String(exact(stats[key])));await runtime.execute('UPDATE player_statistics SET '+Object.values(fields).map(field=>field+'=COALESCE('+field+',0)+?').join(',')+' WHERE player_id=?',[...values,String(id)]);}
  async function updateDoubleStatistics(id,bets){const stats={doubleTotalBets:bets.length,doubleWins:0,doubleLosses:0,doubleTotalWinnings:0n,doubleTotalLosses:0n};for(const bet of bets)if(bet.isWin){stats.doubleWins++;stats.doubleTotalWinnings+=exact(bet.winAmount);}else{stats.doubleLosses++;stats.doubleTotalLosses+=exact(bet.amount);}await updateRoundStatistics(id,stats);}
  async function saveBetDetails(id,bets){if(!Array.isArray(bets))return;await runtime.transaction(async()=>{for(const bet of bets)await runtime.execute('INSERT INTO bet_history(user_id,round_hash,multiplier,amount,is_win,win_amount,timestamp) VALUES (?,?,?,?,?,?,?)',[String(id),bet.roundHash,bet.multiplier,bet.amount,bet.isWin?1:0,bet.winAmount||0,now()]);});}
  async function getDetailedStats(id){const row=await runtime.one('SELECT SUM(amount) AS total_bet_amount,SUM(CASE WHEN is_win=1 THEN 1 ELSE 0 END) AS total_wins,SUM(CASE WHEN is_win=0 THEN 1 ELSE 0 END) AS total_losses,SUM(win_amount) AS total_winnings FROM bet_history WHERE user_id=?',[String(id)]);return Object.fromEntries(Object.entries(row).map(([key,value])=>[key,compatibleNumber(value)]));}
  async function applyDoubleRoundStatistics(roundId){return runTransaction(async()=>{
    const origin=await runtime.one('SELECT payout_json FROM double_runtime_rounds WHERE round_id=? FOR UPDATE',[roundId]);if(!origin?.payout_json)throw Object.assign(new Error('Verified runtime payout required'),{code:'DOUBLE_PAYOUT_REQUIRED'});
    const previous=await runtime.one('SELECT result_json FROM double_statistics_batches WHERE round_id=?',[roundId]);if(previous)return {...JSON.parse(previous.result_json),replayed:true};
    const rows=await runtime.many("SELECT * FROM double_bets_log WHERE round_id=? AND status='accepted' ORDER BY id",[roundId]);if(rows.some(row=>!['paid','lost'].includes(row.payout_status)||![0,1].includes(Number(row.is_win))))throw Object.assign(new Error('Unsettled bets cannot update statistics'),{code:'DOUBLE_UNSETTLED_BETS'});
    const users=summarizeDoubleRows(rows);for(const id of [...users.keys()].sort())await runtime.one('SELECT telegram_id FROM players WHERE telegram_id=? FOR UPDATE',[id]);let groupCount=0;
    for(const [id,u]of users){let wins=0,losses=0,totalWin=0n,totalLoss=0n;for(const [multiplier,g]of u.groups){groupCount++;if(g.won){wins++;totalWin+=g.win;}else{losses++;totalLoss+=g.amount;}await statistics.incrementMultiplierCount(id,multiplier);await saveBetDetails(id,[{roundHash:roundId,multiplier,amount:String(g.amount),isWin:g.won,winAmount:String(g.win)}]);}
      await statistics.updateMaxWinIfGreater(id,String(u.maxWin));if(u.groups.get('GAME')?.won)await statistics.incrementGameWins(id);await statistics.updateWinStreak(id,u.groups.size===1&&u.won);
      await updateRoundStatistics(id,{totalRounds:1,roundWins:u.won?1:0,roundLosses:u.won?0:1,doubleTotalBets:u.groups.size,doubleWins:wins,doubleLosses:losses,doubleTotalWinnings:totalWin,doubleTotalLosses:totalLoss});
    }
    const result={roundId,players:users.size,groups:groupCount};await runtime.execute('INSERT INTO double_statistics_batches(round_id,result_json) VALUES (?,?)',[roundId,JSON.stringify(result)]);return {...result,replayed:false};
  });}
  return {updateRoundStatistics,updateDoubleStatistics,saveBetDetails,getDetailedStats,applyDoubleRoundStatistics};
}
module.exports={createDoubleStatistics,summarizeDoubleRows};
