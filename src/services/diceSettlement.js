'use strict';

const {lockWallet,saveWallet}=require('../repositories/wallets');
const {mainLimit}=require('./financePolicy');
const {integer}=require('./walletMovement');

const roundQuery='SELECT r.round_id,r.chat_id,r.start_time,r.end_time,m.*,l.status FROM dice_runtime_rounds m JOIN dice_rounds r ON r.round_id=m.round_id JOIN dice_rounds_log l ON l.round_id=m.round_id';
const amount=value=>integer(String(value).replace(/\.0+$/,''));
const fail=code=>{throw Object.assign(new Error(code),{code});};

function createDiceSettlement(runtime,{records,runTransaction,now=()=>Date.now(),random=Math.random}){
  const lockRound=id=>runtime.one(roundQuery+' WHERE m.round_id=? FOR UPDATE',[id]);
  async function getBets(roundId){
    const rows=await runtime.many(
      'SELECT o.*,b.amount,b.username,l.id AS existing_log FROM dice_bet_operations o JOIN dice_bets b ON b.id=o.bet_id AND b.round_id=o.round_id AND b.user_id=o.player_id LEFT JOIN dice_bets_log l ON l.id=o.log_id AND l.round_id=o.round_id AND l.user_id=o.player_id WHERE o.round_id=? ORDER BY o.player_id',
      [roundId]);
    for(const bet of rows){
      const debit=await runtime.one(
        "SELECT amount FROM wallet_entries WHERE operation_key=? AND player_id=? AND asset='PF' AND bucket='main' AND entry_type='dice_bet'",
        [bet.operation_key+':debit',bet.player_id]);
      if(!bet.existing_log||!debit||BigInt(debit.amount)!==-amount(bet.amount))fail('DICE_UNVERIFIED_BET');
    }
    const count=await runtime.one('SELECT COUNT(*) AS count FROM dice_bets WHERE round_id=?',[roundId]);
    if(Number(count.count)!==rows.length)fail('DICE_UNVERIFIED_BET');
    return rows;
  }

  function makePlan(round,bets){
    const participants=Object.fromEntries(bets.map(bet=>[bet.player_id,{username:bet.username,amount:Number(amount(bet.amount))}]));
    const totalBank=bets.reduce((total,bet)=>total+Number(amount(bet.amount)),0);
    const base={participants,totalBank,roundAmount:Number(round.entry_amount)};
    if(!bets.length||(bets.length<2&&!round.bot_mode))return {...base,state:'refunded'};
    if(round.bot_mode)participants.F_BOT={username:'F BOT',amount:Number(round.entry_amount),isBot:true};
    const results={};
    if(round.bot_mode==='challenge'&&bets.length===1){
      const player=bets[0].player_id;
      const winner=random()<0.55?'F_BOT':player;
      results[winner]={dice1:6,dice2:6,totalPoints:12};
      results[winner===player?'F_BOT':player]={dice1:5,dice2:6,totalPoints:11};
    }else{
      const ids=Object.keys(participants);
      let distinct=false;
      for(let attempt=0;attempt<1000&&!distinct;attempt++){
        for(const id of ids){
          const dice1=Math.floor(random()*6)+1,dice2=Math.floor(random()*6)+1;
          results[id]={dice1,dice2,totalPoints:dice1+dice2};
        }
        distinct=new Set(Object.values(results).map(result=>result.totalPoints)).size===ids.length;
      }
      if(!distinct)fail('DICE_ROLLS_UNAVAILABLE');
    }
    const winner=Object.keys(results).reduce((best,id)=>results[id].totalPoints>results[best].totalPoints?id:best);
    const commissionRate=base.roundAmount<100000?5:10;
    const prize=winner==='F_BOT'?0:Math.floor(totalBank*(100-commissionRate)/100);
    return {...base,state:'finished',results,winner,commissionRate,prize};
  }

  async function acceptDiceBotChallenge({roundId,chatId,playerId}){
    return runTransaction(async()=>{
      const round=await lockRound(roundId);
      if(!round||round.chat_id!==String(chatId)||round.status!=='active'||round.plan_json)return null;
      const [bet]=await getBets(roundId);
      if(bet?.player_id!==String(playerId))return null;
      if(round.bot_mode==='challenge')return {endTime:Number(round.end_time),replayed:true};
      if(round.bot_mode||!round.offer_until||now()>=Number(round.offer_until))return null;
      const endTime=now()+10000;
      await runtime.execute("UPDATE dice_runtime_rounds SET bot_mode='challenge',offer_until=NULL WHERE round_id=?",[roundId]);
      await runtime.execute('UPDATE dice_rounds SET end_time=? WHERE round_id=?',[endTime,roundId]);
      return {endTime,replayed:false};
    });
  }

  async function resolveDiceRound(roundId){
    const ready=await runTransaction(async()=>{
      const round=await lockRound(roundId);
      if(!round)fail('DICE_LEGACY_ROUND');
      if(round.result_json||round.plan_json)return true;
      if(round.status!=='active')fail('DICE_ROUND_CLOSED');
      const deadline=Number(round.offer_until??round.end_time);
      if(now()<deadline)return {state:round.offer_until?'waiting_bot':'pending',endTime:deadline};
      const bets=await getBets(roundId);
      if(bets.length===1&&!round.bot_mode&&!round.offer_until&&random()<0.5){
        const endTime=now()+20000;
        await runtime.execute('UPDATE dice_runtime_rounds SET offer_until=? WHERE round_id=?',[endTime,roundId]);
        return {state:'waiting_bot',endTime};
      }
      await runtime.execute('UPDATE dice_runtime_rounds SET plan_json=? WHERE round_id=?',[JSON.stringify(makePlan(round,bets)),roundId]);
      return true;
    });
    if(ready!==true)return ready;
    return runTransaction(async connection=>{
      const round=await lockRound(roundId);
      if(round.result_json)return {...JSON.parse(round.result_json),replayed:true};
      const plan=JSON.parse(round.plan_json);
      const bets=await getBets(roundId);
      for(const bet of bets){
        const player=await runtime.one('SELECT telegram_id FROM players WHERE telegram_id=? FOR UPDATE',[bet.player_id]);
        if(!player)fail('PLAYER_MISSING');
      }
      let credited=0;
      for(const bet of bets){
        const refunded=plan.state==='refunded',won=plan.winner===bet.player_id;
        const gross=refunded?Number(amount(bet.amount)):won?plan.prize:0;
        let credit=BigInt(gross);
        if(gross){
          const wallet={playerId:bet.player_id,asset:'PF',bucket:'main'};
          const balance=await lockWallet(connection,wallet);
          if(refunded){
            if(balance+credit>9223372036854775807n)fail('WALLET_OVERFLOW');
          }else{
            const card=await runtime.one('SELECT account_level FROM player_cards WHERE player_id=?',[bet.player_id]);
            const limit=mainLimit(card?.account_level);
            const room=limit>balance?limit-balance:0n;
            if(credit>room)credit=room;
          }
          const type=refunded?'dice_refund':'dice_payout',key=type+':'+bet.bet_id;
          await saveWallet(connection,wallet,balance+credit,credit,key,type);
          await runtime.execute(
            'INSERT INTO finance_log(ts,type,actor_user_id,target_user_id,amount,currency,ref,chat_id,action,payload,success,operation_key,entity_type,entity_id,actor_name_snapshot,target_name_snapshot) VALUES (?,?,?,?,?,?,?,?,?,?,1,?,?,?,?,?)',
            [now(),type,'system:dice',bet.player_id,String(credit),'PF',roundId,round.chat_id,type,JSON.stringify({betId:bet.bet_id,gross,burned:gross-Number(credit)}),key,'dice_round',roundId,'Dice',bet.username]);
        }
        if(won)credited=Number(credit);
        if(!refunded){
          const {dice1,dice2,totalPoints}=plan.results[bet.player_id];
          await records.updateDiceResults(bet.bet_id,dice1,dice2);
          await records.updateDiceBetResult(bet.log_id,dice1,dice2,totalPoints,won,gross);
        }
      }
      if(plan.state==='refunded'){
        await runtime.execute("UPDATE dice_rounds_log SET status='refunded',end_ts=?,total_bank=?,participants_count=? WHERE round_id=?",
          [now(),plan.totalBank,bets.length,roundId]);
      }else{
        await records.finishDiceRoundLog(roundId,plan.winner==='F_BOT'?null:plan.winner,plan.totalBank,Object.keys(plan.participants).length);
      }
      await runtime.execute('UPDATE dice_rounds SET total_bank=? WHERE round_id=?',[plan.totalBank,roundId]);
      const result={...plan,credited};
      await runtime.execute('UPDATE dice_runtime_rounds SET result_json=? WHERE round_id=?',[JSON.stringify(result),roundId]);
      return {...result,replayed:false};
    });
  }

  async function listPendingDiceRounds(){
    return runtime.many(roundQuery+" WHERE l.status='active' OR (m.result_json IS NOT NULL AND m.delivered_at IS NULL)");
  }
  async function markDiceResultDelivered(roundId){
    await runtime.execute('UPDATE dice_runtime_rounds SET delivered_at=COALESCE(delivered_at,?) WHERE round_id=? AND result_json IS NOT NULL',[now(),roundId]);
  }
  return {acceptDiceBotChallenge,resolveDiceRound,listPendingDiceRounds,markDiceResultDelivered};
}

module.exports={createDiceSettlement};
