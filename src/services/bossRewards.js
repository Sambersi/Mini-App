'use strict';
const {integer}=require('./walletMovement');
const {lockWallet,saveWallet}=require('../repositories/wallets');
const {itemFields}=require('../db/playerFields');
const fail=code=>{throw Object.assign(new Error(code),{code});};
function createBossRewards(runtime,inventory,{runTransaction,now=()=>Date.now()}){return async({bossId})=>runTransaction(async connection=>{
  const [[boss]]=await connection.execute('SELECT * FROM bosses WHERE id=? FOR UPDATE',[bossId]);if(!boss)fail('BOSS_MISSING');
  const [[receipt]]=await connection.execute('SELECT result_json FROM boss_reward_batches WHERE boss_id=?',[bossId]);if(receipt)return {...JSON.parse(receipt.result_json),replayed:true};
  const [[historical]]=await connection.execute('SELECT was_defeated FROM boss_import_states WHERE boss_id=?',[bossId]);if(Number(historical?.was_defeated))fail('BOSS_LEGACY_REWARDS_UNVERIFIED');
  const [[latest]]=await connection.execute('SELECT MAX(id) AS id FROM bosses');if(String(latest.id)!==String(bossId))fail('BOSS_REWARD_WINDOW_CLOSED');
  if(Number(boss.phase)!==2||BigInt(boss.phase1_hp)!==0n||BigInt(boss.phase2_hp)!==0n)fail('BOSS_NOT_DEFEATED');
  const amount=integer(String(boss.prize_amount).replace(/\.0+$/,''));if(amount===0n)fail('BOSS_PRIZE_INVALID');
  const walletPrize={balance:['PF','main'],card_balance:['PF','card'],df_balance:['DF','main']}[boss.prize_type];
  if(!walletPrize&&!itemFields.includes(boss.prize_type))fail('BOSS_PRIZE_UNSUPPORTED');
  // Preserve the original top: all profiles participate, including zero damage.
  const [recipients]=await connection.execute('SELECT p.telegram_id AS id,p.display_name AS username,SUM(d.damage) AS damage FROM players p LEFT JOIN boss_damage d ON d.user_id=p.telegram_id GROUP BY p.telegram_id,p.display_name ORDER BY damage DESC,p.telegram_id LIMIT 25');
  for(const id of recipients.map(row=>row.id).sort())if(!(await connection.execute('SELECT telegram_id FROM players WHERE telegram_id=? FOR UPDATE',[id]))[0][0])fail('PLAYER_MISSING');
  for(const recipient of recipients){
    const key='boss_reward:'+bossId+':'+recipient.id;
    if(walletPrize){
      const wallet={playerId:recipient.id,asset:walletPrize[0],bucket:walletPrize[1]},before=await lockWallet(connection,wallet);
      if(before+amount>9223372036854775807n)fail('WALLET_OVERFLOW');
      // Source rewards directly incremented the field without purchase caps.
      await saveWallet(connection,wallet,before+amount,amount,key,'boss_reward');
    }else await inventory.adjustInventory({playerId:recipient.id,item:boss.prize_type,delta:String(amount),operationKey:key});
    await connection.execute('INSERT INTO finance_log(ts,type,actor_user_id,amount,currency,ref,action,payload,success) VALUES (?,?,?,?,?,?,?,?,1)',[now(),'boss_reward',recipient.id,String(amount),walletPrize?walletPrize[0]:boss.prize_type,String(bossId),'boss_reward',JSON.stringify({bossId:String(bossId)})]);
  }
  const result={bossId:String(bossId),name:boss.name,prizeType:boss.prize_type,amount:String(amount),currency:walletPrize?walletPrize[0]:boss.prize_type,recipients:recipients.map(row=>({id:row.id,username:row.username,damage:row.damage})),replayed:false};
  await connection.execute('INSERT INTO boss_reward_batches(boss_id,result_json,settled_ms) VALUES (?,?,?)',[bossId,JSON.stringify(result),now()]);return result;
});}
module.exports={createBossRewards};
