'use strict';
const assert=require('node:assert/strict'),crypto=require('node:crypto');
const {createMysqlApi}=require('../src/db/api');
const {createDatabaseRuntime}=require('../src/db/runtime');
async function runDoubleSettlementChecks({pool,runtime,now}){
  let clock=now,serial=0,checks=0;const id='900000100',chat='-9301',rounds=[],api=createMysqlApi(runtime,{now:()=>clock,random:()=>0});
  const one=async(sql,args=[])=>{const [[row]]=await pool.execute(sql,args);return row;};const balance=async()=>BigInt((await one("SELECT balance FROM wallets WHERE player_id=? AND asset='PF' AND bucket='main'",[id])).balance);
  const start=async(result='x2')=>{clock+=100000;const salt='fixture_settle_'+serial++,hash=crypto.createHash('md5').update(result.replace('x','')+'|'+salt).digest('hex');rounds.push(hash);await api.createDoubleRound(hash,clock);await api.setDoubleRoundState({state:'ACCEPTING',hash,result,salt,endTime:clock+60000,cellContents:result==='GAME'?{left:['x2','x5','x10'],right:['x25','x50','x100']}:null});return hash;};
  const stake=async(round,mult='x2',n=100)=>api.placeDoubleBet({playerId:id,chatId:chat,roundId:round,multiplier:mult,amount:n,operationKey:'fixture_settle_bet_'+serial++});
  let failure,referralChanged=false,previousReferrer;
  try{
    await api.activateDoubleMode(chat);
    previousReferrer=await one('SELECT referrer_id FROM player_referrals WHERE player_id=?',[id]);
    if(previousReferrer){
      await pool.execute('UPDATE player_referrals SET referrer_id=? WHERE player_id=?',['900000101',id]);
    }else{
      await pool.execute('INSERT INTO player_referrals(player_id,referrer_id) VALUES (?,?)',[id,'900000101']);
    }
    referralChanged=true;
    await pool.execute('UPDATE player_referral_state SET referrer_bank=0 WHERE player_id=?',['900000101']);await pool.execute("UPDATE wallets SET balance=1000000 WHERE player_id=? AND asset='PF' AND bucket='main'",[id]);
    let round=await start();await stake(round);await assert.rejects(api.prepareDoubleSettlement(round),{code:'DOUBLE_NOT_ENDED'});clock+=60000;const before=await balance(),result=await Promise.all(Array.from({length:20},()=>api.settleDoubleRound(round)));assert.equal(result.filter(row=>!row.replayed).length,1);assert.equal(await balance(),before+200n);assert.equal(Number((await one('SELECT COUNT(*) AS n FROM double_statistics_batches WHERE round_id=?',[round])).n),1);checks++;
    round=await start();await stake(round,'x3');clock+=60000;const loss=await balance();await api.settleDoubleRound(round);assert.equal(await balance(),loss);assert.equal((await api.getDoubleBetsByRound(round))[0].payout_status,'lost');checks++;
    round=await start('GAME');await stake(round,'GAME',100000);clock+=60000;const planned=await api.prepareDoubleSettlement(round);assert.equal(planned.outcomes[0].candy,1);const plannedText=JSON.stringify(planned),beforeFailure=await balance(),statsBefore=(await one('SELECT total_rounds FROM player_statistics WHERE player_id=?',[id])).total_rounds;
    const brokenPool={getConnection:async()=>{const c=await pool.getConnection();return new Proxy(c,{get(target,key){if(key==='execute')return(sql,args)=>sql.startsWith('INSERT INTO double_statistics_batches')?target.execute('SELECT missing_double_settle_fixture_column'):target.execute(sql,args);const value=target[key];return typeof value==='function'?value.bind(target):value;}});}};
    const candyBefore=(await api.getUserById(id)).candy;await assert.rejects(createMysqlApi(createDatabaseRuntime(brokenPool),{now:()=>clock,random:()=>0.99}).settleDoubleRound(round),{code:'ER_BAD_FIELD_ERROR'});assert.equal(await balance(),beforeFailure);assert.equal(await api.getReferrerBank('900000101'),0);assert.equal((await api.getUserById(id)).candy,candyBefore);assert.equal((await one('SELECT total_rounds FROM player_statistics WHERE player_id=?',[id])).total_rounds,statsBefore);assert.equal((await api.getDoubleBetsByRound(round))[0].payout_status,'pending');assert.equal(JSON.stringify(await api.prepareDoubleSettlement(round)),plannedText);checks++;
    const fixed=await api.settleDoubleRound(round);assert.equal(fixed.finalMultipliers.left,'x2');assert.equal(await balance(),beforeFailure+200000n);assert.equal(await api.getReferrerBank('900000101'),200);assert.equal((await api.getUserById(id)).candy,candyBefore+1);assert.equal((await api.settleDoubleRound(round)).replayed,true);assert.equal(await api.getReferrerBank('900000101'),200);checks++;
    round=await start();await pool.execute("UPDATE wallets SET balance=140001000 WHERE player_id=? AND asset='PF' AND bucket='main'",[id]);await stake(round);clock+=60000;const capped=await api.settleDoubleRound(round);assert.equal(capped.credits[0].credited,'0');assert.equal(capped.credits[0].burned,'200');assert.equal(await balance(),140000900n);checks++;
    await assert.rejects(api.settleDoubleRound('fixture_imported_unproven'),{code:'DOUBLE_LEGACY_ROUND'});checks++;
    round=await start();await api.logDoubleBet({roundId:round,userId:id,username:'Fixture',chatId:chat,multiplier:'x2',amount:100});clock+=60000;await assert.rejects(api.settleDoubleRound(round),{code:'DOUBLE_UNVERIFIED_BET'});checks++;
    await assert.rejects(api.refundDoubleRound(round),{code:'DOUBLE_UNVERIFIED_BET'});
    await assert.rejects(api.refundDoubleRound('fixture_imported_unproven'),{code:'DOUBLE_LEGACY_ROUND'});checks++;
    await pool.execute("UPDATE wallets SET balance=1000000 WHERE player_id=? AND asset='PF' AND bucket='main'",[id]);
    round=await start();await stake(round);
    const beforeRefund=await balance();
    const refundFailurePool={getConnection:async()=>{
      const connection=await pool.getConnection();
      return new Proxy(connection,{get(target,key){
        if(key==='execute')return(sql,args)=>sql.startsWith('UPDATE double_runtime_rounds SET refund_json')
          ?target.execute('SELECT missing_double_refund_fixture_column'):target.execute(sql,args);
        const value=target[key];
        return typeof value==='function'?value.bind(target):value;
      }});
    }};
    const refundFailure=createMysqlApi(createDatabaseRuntime(refundFailurePool),{now:()=>clock});
    await assert.rejects(refundFailure.refundDoubleRound(round),{code:'ER_BAD_FIELD_ERROR'});
    assert.equal(await balance(),beforeRefund);
    assert.equal((await api.getDoubleBetsByRound(round))[0].payout_status,'pending');
    assert.equal(Number((await one("SELECT COUNT(*) AS n FROM finance_log WHERE type='double_refund' AND entity_id=?",[round])).n),0);
    checks++;
    clock+=60000;
    const [firstRefund,competingSettlement]=await Promise.allSettled([api.refundDoubleRound(round),api.settleDoubleRound(round)]);
    if(firstRefund.status==='fulfilled'){
      assert.equal(competingSettlement.status,'rejected');
      assert.equal(competingSettlement.reason.code,'DOUBLE_ROUND_REFUNDED');
      assert.equal(await balance(),beforeRefund+100n);
    }else{
      assert.equal(firstRefund.reason.code,'DOUBLE_SETTLEMENT_STARTED');
      assert.equal(competingSettlement.status,'fulfilled');
      assert.equal(await balance(),beforeRefund+200n);
    }
    checks++;
    round=await start();await stake(round);
    await pool.execute("UPDATE double_round_state SET state='BLOCKED' WHERE id=1 AND hash=?",[round]);
    const charged=await balance();
    const refunds=await Promise.all(Array.from({length:20},()=>api.refundDoubleRound(round)));
    assert.ok(refunds.every(result=>result.bets===1&&result.amount==='100'));
    assert.equal(refunds.filter(result=>!result.replayed).length,1);
    assert.equal(await balance(),charged+100n);
    assert.equal((await api.getDoubleBetsByRound(round))[0].payout_status,'refunded');
    await assert.rejects(api.settleDoubleRound(round),{code:'DOUBLE_ROUND_REFUNDED'});
    checks++;
    round=await start();await stake(round);clock+=60000;
    await api.prepareDoubleSettlement(round);
    await assert.rejects(api.refundDoubleRound(round),{code:'DOUBLE_SETTLEMENT_STARTED'});
    await api.settleDoubleRound(round);
    await assert.rejects(api.refundDoubleRound(round),{code:'DOUBLE_SETTLEMENT_STARTED'});
    checks++;
    round=await start('GAME');await stake(round,'GAME');
    const choiceState={...await api.getDoubleRoundState(),state:'GAME_CHOICE',gameButtonActive:true};
    await api.updateOpenDoubleRoundState(choiceState);
    const selections=await Promise.all(Array.from({length:20},(_,index)=>api.recordDoubleGameChoice({
      roundId:round,userId:id,chatId:chat,choice:index%2?'right':'left',
    })));
    const [selection]=selections.filter(Boolean);
    assert.equal(selections.filter(Boolean).length,1);
    await assert.rejects(api.updateOpenDoubleRoundState({...choiceState,state:'BLOCKED'}),{code:'DOUBLE_STATE_STALE'});
    await api.updateOpenDoubleRoundState(choiceState);
    clock+=60000;
    const choicePlan=await api.prepareDoubleSettlement(round);
    assert.equal(choicePlan.outcomes[0].selected,selection.globalChoices['global_choice_'+id]);
    assert.equal(await api.recordDoubleGameChoice({roundId:round,userId:id,chatId:chat,choice:'right'}),null);
    await api.settleDoubleRound(round);
    checks++;
    round=await start();await stake(round);
    const beforeCommit=await balance();
    const lostAck=Object.assign(new Error('Fixture lost commit acknowledgement'),{code:'FIXTURE_COMMIT_ACK_LOST'});
    const lostAckPool={getConnection:async()=>{
      const connection=await pool.getConnection();
      return new Proxy(connection,{get(target,key){
        if(key==='commit')return async()=>{await target.commit();throw lostAck;};
        const value=target[key];
        return typeof value==='function'?value.bind(target):value;
      }});
    }};
    const disconnected=createMysqlApi(createDatabaseRuntime(lostAckPool),{now:()=>clock});
    await assert.rejects(disconnected.refundDoubleRound(round),{code:lostAck.code});
    const recovered=await createMysqlApi(createDatabaseRuntime(pool),{now:()=>clock}).refundDoubleRound(round);
    assert.equal(recovered.replayed,true);
    assert.equal(recovered.amount,'100');
    assert.equal(await balance(),beforeCommit+100n);
    assert.equal(Number((await one("SELECT COUNT(*) AS n FROM finance_log WHERE type='double_refund' AND entity_id=?",[round])).n),1);
    checks++;
    const previousHash=round;
    const candidates=Array.from({length:20},(_,index)=>({
      hash:`fixture_next_round_${index}`,result:'x2',salt:'fixture',endTime:clock+60000,
    }));
    rounds.push(...candidates.map(candidate=>candidate.hash));
    const opened=await Promise.all(candidates.map(candidate=>api.openDoubleRound({previousHash,round:candidate})));
    const [winner]=opened.filter(result=>result.created);
    assert.equal(opened.filter(result=>result.created).length,1);
    assert.ok(opened.every(result=>result.round.hash===winner.round.hash));
    await assert.rejects(api.updateOpenDoubleRoundState({hash:previousHash,state:'BLOCKED'}),{code:'DOUBLE_ROUND_CHANGED'});
    await assert.rejects(api.openDoubleRound({previousHash:winner.round.hash,round:candidates.at(-1)}),{code:'DOUBLE_ROUND_OPEN'});
    assert.equal((await api.getDoubleRoundState()).hash,winner.round.hash);
    checks++;
    return checks;
  }catch(error){
    failure=error;
    throw error;
  }finally{
    try{
      if(referralChanged){
        if(previousReferrer){
          await pool.execute('UPDATE player_referrals SET referrer_id=? WHERE player_id=?',[previousReferrer.referrer_id,id]);
        }else{
          await pool.execute('DELETE FROM player_referrals WHERE player_id=? AND referrer_id=?',[id,'900000101']);
        }
      }
      for(const round of rounds){
        await pool.execute('DELETE o FROM double_bet_operations o JOIN double_bets_log b ON b.id=o.bet_id WHERE b.round_id=?',[round]);
        await pool.execute('DELETE FROM double_statistics_batches WHERE round_id=?',[round]);
        await pool.execute('DELETE FROM double_runtime_rounds WHERE round_id=?',[round]);
        await pool.execute('DELETE FROM double_bets_log WHERE round_id=?',[round]);
        await pool.execute('DELETE FROM bet_history WHERE round_hash=?',[round]);
        await pool.execute('DELETE FROM double_rounds WHERE round_id=?',[round]);
      }
      if(rounds.length){
        await pool.execute('DELETE FROM double_round_state WHERE id=1 AND hash IN ('+rounds.map(()=>'?').join(',')+')',rounds);
      }
      await pool.execute('DELETE FROM double_bet_cooldowns WHERE player_id=?',[id]);
      await pool.execute('DELETE FROM chats WHERE chat_id=?',[chat]);
    }catch(cleanupError){
      if(!failure)throw cleanupError;
      console.error('[DOUBLE SETTLEMENT CLEANUP] '+(cleanupError.code||cleanupError.name));
    }
  }
}
module.exports={runDoubleSettlementChecks};
