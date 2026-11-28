'use strict';
const {createHash}=require('node:crypto');
const {integer}=require('./walletMovement');
const {lockWallet,saveWallet}=require('../repositories/wallets');
const {mainLimit}=require('./financePolicy');
const fail=code=>{throw Object.assign(new Error(code),{code});};
const amount=value=>integer(String(value).replace(/\.0+$/,''));
const signature=rows=>createHash('sha256').update(JSON.stringify(rows.map(r=>[String(r.id),r.user_id,r.chat_id,r.multiplier,String(amount(r.amount))]))).digest('hex');
function createDoubleSettlement(runtime,{runTransaction,inventory,bank,views,doubleStatistics,now=()=>Date.now(),random=Math.random}){
  async function bets(roundId){return runtime.many("SELECT b.*,o.operation_key FROM double_bets_log b LEFT JOIN double_bet_operations o ON o.bet_id=b.id WHERE b.round_id=? AND b.status='accepted' ORDER BY b.id",[roundId]);}
  async function prepareDoubleSettlement(roundId){return runTransaction(async()=>{
    const state=await runtime.one('SELECT * FROM double_round_state WHERE id=1 FOR UPDATE');await runtime.one('SELECT round_id FROM double_rounds WHERE round_id=? FOR UPDATE',[roundId]);const origin=await runtime.one('SELECT * FROM double_runtime_rounds WHERE round_id=? FOR UPDATE',[roundId]);if(!origin)fail('DOUBLE_LEGACY_ROUND');if(origin.payout_json)return JSON.parse(origin.payout_json);if(origin.plan_json)return JSON.parse(origin.plan_json);
    if(origin.refund_json)fail('DOUBLE_ROUND_REFUNDED');
    if(!state||state.hash!==roundId)fail('DOUBLE_ROUND_CHANGED');if(now()<Number(state.end_time))fail('DOUBLE_NOT_ENDED');if(!['x2','x3','x5','GAME'].includes(state.result))fail('DOUBLE_RESULT_INVALID');
    const expected=createHash('md5').update(state.result.replace('x','')+'|'+state.salt).digest('hex');if(expected!==roundId)fail('DOUBLE_HASH_MISMATCH');
    const rows=await bets(roundId);if(rows.some(row=>!row.operation_key||row.payout_status!=='pending'))fail('DOUBLE_UNVERIFIED_BET');
    const choices=JSON.parse(state.global_choices||'{}'),perChat=JSON.parse(state.game_choices||'{}');let finals=state.final_multipliers?JSON.parse(state.final_multipliers):null;
    if(state.result==='GAME'&&!finals){const cells=JSON.parse(state.cell_contents);if(!cells?.left?.length||!cells?.right?.length)fail('DOUBLE_RESULT_INVALID');finals={left:cells.left[Math.floor(random()*cells.left.length)],right:cells.right[Math.floor(random()*cells.right.length)]};}
    if(state.result==='GAME'&&['left','right'].some(side=>!/^x(?:2|5|10|25|50|100)$/.test(finals?.[side])))fail('DOUBLE_RESULT_INVALID');
    const outcomes=rows.map(row=>{let selected=null,win=0n;if(state.result==='GAME'&&row.multiplier==='GAME'){const key='global_choice_'+row.user_id;selected=choices[key]||perChat[row.chat_id+'_'+row.user_id];if(!['left','right'].includes(selected))selected=random()<0.5?'left':'right';choices[key]=selected;win=amount(row.amount)*BigInt(finals[selected].slice(1));}else if(row.multiplier===state.result)win=amount(row.amount)*BigInt(state.result.slice(1));if(win>9223372036854775807n)fail('WALLET_OVERFLOW');const candy=win>0n&&amount(row.amount)>=100000n&&random()<0.25?Math.floor(random()*6)+1:0;return {id:String(row.id),playerId:row.user_id,chatId:row.chat_id,username:row.username,multiplier:row.multiplier,amount:String(amount(row.amount)),win:String(win),selected,candy};});
    const plan={roundId,result:state.result,salt:state.salt,finalMultipliers:finals,signature:signature(rows),outcomes};await runtime.execute("UPDATE double_round_state SET state='RESOLVING' WHERE id=1");await runtime.execute('UPDATE double_runtime_rounds SET plan_json=? WHERE round_id=?',[JSON.stringify(plan),roundId]);return plan;
  });}
  async function settleDoubleRound(roundId){await prepareDoubleSettlement(roundId);return runTransaction(async connection=>{
    await runtime.one('SELECT id FROM double_round_state WHERE id=1 FOR UPDATE');await runtime.one('SELECT round_id FROM double_rounds WHERE round_id=? FOR UPDATE',[roundId]);const origin=await runtime.one('SELECT * FROM double_runtime_rounds WHERE round_id=? FOR UPDATE',[roundId]);if(origin?.payout_json)return {...JSON.parse(origin.payout_json),replayed:true};if(!origin?.plan_json)fail('DOUBLE_PLAN_REQUIRED');const plan=JSON.parse(origin.plan_json),rows=await bets(roundId);if(signature(rows)!==plan.signature||rows.some(row=>!row.operation_key||row.payout_status!=='pending'))fail('DOUBLE_PLAN_CHANGED');
    const groups=new Map(),players=new Set();for(const row of plan.outcomes){players.add(row.playerId);const key=JSON.stringify([row.playerId,row.chatId,row.multiplier]);if(!groups.has(key))groups.set(key,{playerId:row.playerId,chatId:row.chatId,multiplier:row.multiplier,win:0n});groups.get(key).win+=BigInt(row.win);}
    for(const g of groups.values())if(g.win>0n){const id=await views.getReferrerId(g.playerId);if(id&&await runtime.one('SELECT telegram_id FROM players WHERE telegram_id=?',[id])){g.referrerId=id;players.add(id);}}
    const names=new Map();for(const id of [...players].sort()){const player=await runtime.one('SELECT telegram_id,display_name FROM players WHERE telegram_id=? FOR UPDATE',[id]);if(!player)fail('PLAYER_MISSING');names.set(id,player.display_name);}
    let index=0;const credits=[];for(const g of groups.values()){if(g.win===0n)continue;const key='double_payout:'+roundId+':'+index++,wallet={playerId:g.playerId,asset:'PF',bucket:'main'},before=await lockWallet(connection,wallet),card=await runtime.one('SELECT account_level FROM player_cards WHERE player_id=?',[g.playerId]);if(!card)fail('FINANCE_CONTROLS_MISSING');const limit=mainLimit(card.account_level),room=limit>before?limit-before:0n,credit=g.win<room?g.win:room;
      await saveWallet(connection,wallet,before+credit,credit,key,'double_payout');if(g.referrerId)await bank.creditReferrerBank({referrerId:g.referrerId,winAmount:String(g.win),operationKey:'double:'+roundId+':'+index});
      const record={playerId:g.playerId,chatId:g.chatId,multiplier:g.multiplier,gross:String(g.win),credited:String(credit),burned:String(g.win-credit)};credits.push(record);
      await connection.execute('INSERT INTO finance_log(ts,type,actor_user_id,target_user_id,amount,currency,ref,chat_id,action,payload,success,operation_key,entity_type,entity_id,actor_name_snapshot,target_name_snapshot) VALUES (?,?,?,?,?,?,?,?,?,?,1,?,?,?,?,?)',[now(),'double_payout','system:double',g.playerId,String(credit),'PF',roundId,g.chatId,'double_payout',JSON.stringify(record),key,'double_round',roundId,'Double',names.get(g.playerId)]);
    }
    for(const row of plan.outcomes){if(row.candy)await inventory.adjustInventory({playerId:row.playerId,item:'candy',delta:row.candy,operationKey:'double_candy:'+row.id});await runtime.execute('UPDATE double_bets_log SET is_win=?,win_amount=?,payout_status=?,game_choice=COALESCE(?,game_choice) WHERE id=?',[BigInt(row.win)>0n?1:0,row.win,BigInt(row.win)>0n?'paid':'lost',row.selected,row.id]);}
    const result={...plan,credits,replayed:false};await runtime.execute('UPDATE double_runtime_rounds SET payout_json=? WHERE round_id=?',[JSON.stringify(result),roundId]);await doubleStatistics.applyDoubleRoundStatistics(roundId);
    const total=plan.outcomes.reduce((n,row)=>n+BigInt(row.amount),0n);await runtime.execute("UPDATE double_rounds SET end_ts=?,result_multiplier=?,salt=?,total_bank=?,bets_count=?,chats_count=?,participants_count=?,status='finished' WHERE round_id=?",[now(),plan.result,plan.salt,String(total),plan.outcomes.length,new Set(plan.outcomes.map(row=>row.chatId)).size,new Set(plan.outcomes.map(row=>row.playerId)).size,roundId]);await runtime.execute("UPDATE double_round_state SET state='FINISHED' WHERE id=1 AND hash=?",[roundId]);return result;
  });}
  async function refundDoubleRound(roundId){
    return runTransaction(async connection=>{
      const state=await runtime.one('SELECT hash,state FROM double_round_state WHERE id=1 FOR UPDATE');
      const round=await runtime.one('SELECT status FROM double_rounds WHERE round_id=? FOR UPDATE',[roundId]);
      const origin=await runtime.one('SELECT * FROM double_runtime_rounds WHERE round_id=? FOR UPDATE',[roundId]);
      if(!origin)fail('DOUBLE_LEGACY_ROUND');
      if(origin.refund_json)return {...JSON.parse(origin.refund_json),replayed:true};
      if(origin.plan_json||origin.payout_json)fail('DOUBLE_SETTLEMENT_STARTED');
      if(state?.hash!==roundId||round?.status!=='active'||
        !['ACCEPTING','BLOCKED','GAME_CHOICE','RESOLVING'].includes(state.state))fail('DOUBLE_ROUND_CHANGED');

      const rows=await bets(roundId);
      for(const row of rows){
        if(!row.operation_key||row.payout_status!=='pending')fail('DOUBLE_UNVERIFIED_BET');
        const debit=await runtime.one(
          "SELECT amount FROM wallet_entries WHERE operation_key=? AND player_id=? AND asset='PF' AND bucket='main' AND entry_type='double_bet'",
          [row.operation_key+':debit',row.user_id]);
        const stake=amount(row.amount);
        if(stake===0n||!debit||BigInt(debit.amount)!==-stake)fail('DOUBLE_UNVERIFIED_BET');
      }
      const names=new Map();
      for(const id of [...new Set(rows.map(row=>row.user_id))].sort()){
        const player=await runtime.one('SELECT display_name FROM players WHERE telegram_id=? FOR UPDATE',[id]);
        if(!player)fail('PLAYER_MISSING');
        names.set(id,player.display_name);
      }

      let total=0n;
      for(const row of rows){
        const credit=amount(row.amount);
        const wallet={playerId:row.user_id,asset:'PF',bucket:'main'};
        const before=await lockWallet(connection,wallet);
        if(before+credit>9223372036854775807n)fail('WALLET_OVERFLOW');
        const key='double_refund:'+row.id;
        await saveWallet(connection,wallet,before+credit,credit,key,'double_refund');
        const details={betId:String(row.id),debitOperationKey:row.operation_key};
        await runtime.execute(
          'INSERT INTO finance_log(ts,type,actor_user_id,target_user_id,amount,currency,ref,chat_id,action,payload,success,operation_key,entity_type,entity_id,actor_name_snapshot,target_name_snapshot) VALUES (?,?,?,?,?,?,?,?,?,?,1,?,?,?,?,?)',
          [now(),'double_refund','system:double',row.user_id,String(credit),'PF',roundId,row.chat_id,'double_refund',JSON.stringify(details),key,'double_round',roundId,'Double',names.get(row.user_id)]);
        await runtime.execute("UPDATE double_bets_log SET payout_status='refunded',status='rejected' WHERE id=?",[row.id]);
        total+=credit;
      }
      const result={roundId,bets:rows.length,players:names.size,amount:String(total)};
      await runtime.execute('UPDATE double_runtime_rounds SET refund_json=? WHERE round_id=?',[JSON.stringify(result),roundId]);
      await runtime.execute("UPDATE double_rounds SET status='refunded',end_ts=? WHERE round_id=?",[now(),roundId]);
      await runtime.execute("UPDATE double_round_state SET state='FINISHED' WHERE id=1");
      return {...result,replayed:false};
    });
  }
  return {prepareDoubleSettlement,settleDoubleRound,refundDoubleRound};
}
module.exports={createDoubleSettlement};
