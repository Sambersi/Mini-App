'use strict';
const {randomUUID,createHash}=require('node:crypto');
const {integer}=require('./walletMovement');
const {itemFields}=require('../db/playerFields');
const {makeBossQuestion,bossDamage}=require('./bossMath');
const fail=code=>{throw Object.assign(new Error(code),{code});};
function createBossCombat(runtime,bossState,equipment,{runTransaction,settleBossRewards,now=()=>Date.now(),mainAdmin=process.env.MAIN_ADMIN||''}){
  const keyFor=key=>{if(typeof key!=='string'||!/^[A-Za-z0-9:_-]{1,100}$/.test(key))fail('OPERATION_KEY_INVALID');return 'boss:'+key;};
  const lock=()=>runtime.one('SELECT id FROM boss_runtime_mutex WHERE id=1 FOR UPDATE');
  const playerLock=async id=>{if(!await runtime.one('SELECT telegram_id FROM players WHERE telegram_id=? FOR UPDATE',[id]))fail('PLAYER_MISSING');const ban=await runtime.one('SELECT banned_until FROM player_bans WHERE player_id=? FOR UPDATE',[id]);if(ban&&(!Number(ban.banned_until)||Math.floor(now()/1000)<=Number(ban.banned_until)))fail('BOSS_PLAYER_BANNED');};
  const latest=()=>runtime.one('SELECT * FROM bosses ORDER BY id DESC LIMIT 1 FOR UPDATE');
  const alive=boss=>{if(!boss)fail('BOSS_MISSING');if(BigInt(boss.phase1_hp||0)===0n&&BigInt(boss.phase2_hp||0)===0n)fail('BOSS_DEFEATED');};
  const read=async id=>{const row=await runtime.one('SELECT state_json,message_id FROM user_attack_states WHERE user_id=? FOR UPDATE',[id]);if(!row)return null;try{return {...JSON.parse(row.state_json),messageId:row.message_id};}catch{return null;}};
  const save=q=>runtime.execute('INSERT INTO user_attack_states(user_id,state_json,message_id,created_at) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE state_json=VALUES(state_json),message_id=VALUES(message_id),created_at=VALUES(created_at)',[q.playerId,JSON.stringify(q),q.messageId,Math.floor(q.createdAt/1000)]);
  const question=(id,chat,boss,streak)=>({questionId:randomUUID(),playerId:id,chatId:chat,bossId:String(boss.id),phase:Number(boss.phase),messageId:null,...makeBossQuestion(Number(boss.phase)),currentStreak:streak,timeLimit:Math.max(10-Math.min(streak,4),6),createdAt:now()});
  async function cooldown(id){const previous=await runtime.one('SELECT last_attack_time FROM boss_state WHERE id=? FOR UPDATE',[id]);if(previous?.last_attack_time&&now()-Number(previous.last_attack_time)<800)fail('BOSS_COOLDOWN');await bossState.updateLastAttackTime(id,now());}
  async function event(kind,input,work){const key=keyFor(input.operationKey),request={kind,...input};delete request.operationKey;const hash=createHash('sha256').update(JSON.stringify(request)).digest('hex');return runTransaction(async()=>{
    await lock();const receipt=await runtime.one('SELECT request_hash,result_json FROM boss_event_receipts WHERE event_key=?',[key]);if(receipt){if(receipt.request_hash!==hash)fail('OPERATION_KEY_CONFLICT');return {...JSON.parse(receipt.result_json),replayed:true};}
    const result=await work();await runtime.execute('INSERT INTO boss_event_receipts(event_key,request_hash,consumed_question,result_json) VALUES (?,?,?,?)',[key,hash,result.consumedQuestion||null,JSON.stringify(result)]);return result;
  });}
  async function prepareBossAttack({playerId,chatId,operationKey}){playerId=String(playerId);chatId=String(chatId);const outcome=await event('prepare',{playerId,chatId,operationKey},async()=>{
    const boss=await latest();alive(boss);await playerLock(playerId);await cooldown(playerId);const energy=await bossState.getCurrentEnergy(playerId);if(BigInt(energy)<=0n)return {refusal:'ENERGY_EMPTY',replayed:false};
    const old=await read(playerId),streak=old?.bossId===String(boss.id)&&old.phase===Number(boss.phase)&&now()<=old.createdAt+old.timeLimit*1000?old.currentStreak:0;
    const q=question(playerId,chatId,boss,Number.isSafeInteger(streak)?Math.min(streak,4):0);await save(q);return {question:q,energy:String(energy),hp:String(Number(boss.phase)===1?boss.phase1_hp:boss.phase2_hp),replayed:false};
  });if(outcome.refusal)fail(outcome.refusal);return outcome;}
  async function attachBossQuestion({playerId,questionId,chatId,messageId}){return runTransaction(async()=>{await lock();const q=await read(String(playerId));if(!q||q.questionId!==questionId||q.chatId!==String(chatId))return false;if(q.messageId!==null)return String(q.messageId)===String(messageId);q.messageId=String(messageId);q.createdAt=now();await save(q);return true;});}
  async function answerBossAttack({playerId,chatId,messageId,index,operationKey}){playerId=String(playerId);chatId=String(chatId);messageId=String(messageId);if(!Number.isSafeInteger(index)||index<0)fail('BOSS_ANSWER_INVALID');return event('answer',{playerId,chatId,messageId,index,operationKey},async()=>{
    const boss=await latest();alive(boss);await playerLock(playerId);const q=await read(playerId);
    if(!q?.questionId||q.chatId!==chatId||String(q.messageId)!==messageId||q.bossId!==String(boss.id)||q.phase!==Number(boss.phase))fail('BOSS_MENU_STALE');
    if(index>=q.answers.length)fail('BOSS_ANSWER_INVALID');await cooldown(playerId);const energy=BigInt(await bossState.getCurrentEnergy(playerId));if(energy<=0n)fail('ENERGY_EMPTY');
    const weapon=await equipment.getActiveWeapon(playerId);if(!weapon)fail('WEAPON_UNAVAILABLE');
    if(weapon.name!=='Кулак'&&!await runtime.one('SELECT ordinal FROM player_weapon_ownership WHERE player_id=? AND weapon_id=? LIMIT 1',[playerId,weapon.id]))fail('ACTIVE_WEAPON_NOT_OWNED');
    const state=await runtime.one('SELECT attack_power FROM player_boss_state WHERE player_id=?',[playerId]);
    const expired=now()>q.createdAt+q.timeLimit*1000,correct=!expired&&Number(q.answers[index])===q.correctResult;
    const calculation=bossDamage({name:weapon.name,baseDamage:weapon.base_damage,attackPower:state.attack_power,streak:q.currentStreak,correct});
    let hp=BigInt(Number(boss.phase)===1?boss.phase1_hp:boss.phase2_hp),damage=calculation.damage>hp?hp:calculation.damage,broken=false,phaseChanged=false,reward=null;
    await runtime.execute('UPDATE player_boss_state SET energy=? WHERE player_id=?',[String(energy-1n),playerId]);
    if(correct){hp-=damage;await runtime.execute('UPDATE bosses SET '+(Number(boss.phase)===1?'phase1_hp':'phase2_hp')+'=? WHERE id=?',[String(hp),boss.id]);await bossState.addBossDamageToUser(playerId,String(damage));}
    else if(weapon.name!=='Кулак'&&BigInt(weapon.durability)!==-1n){
      const row=await runtime.one('SELECT current_durability FROM user_weapon_durability WHERE user_id=? AND weapon_id=? FOR UPDATE',[playerId,weapon.id]);const remaining=BigInt(row?.current_durability??weapon.durability)-1n;
      if(remaining<=0n){await runtime.execute('DELETE FROM player_weapon_ownership WHERE player_id=? AND weapon_id=?',[playerId,weapon.id]);await runtime.execute('DELETE FROM user_weapon_durability WHERE user_id=? AND weapon_id=?',[playerId,weapon.id]);await equipment.switchToDefaultWeapon(playerId);broken=true;}
      else await runtime.execute('INSERT INTO user_weapon_durability(user_id,weapon_id,current_durability) VALUES (?,?,?) ON DUPLICATE KEY UPDATE current_durability=VALUES(current_durability)',[playerId,weapon.id,String(remaining)]);
    }
    let streak=correct?calculation.streak:0;
    if(correct&&hp===0n){streak=0;if(Number(boss.phase)===1){await bossState.transitionToPhase2(boss.id);boss.phase=2;hp=BigInt(boss.phase2_max_hp);phaseChanged=true;}else reward=await settleBossRewards({bossId:boss.id});}
    let next=null;if(!reward){next=question(playerId,chatId,boss,streak);await save(next);}else await runtime.execute('DELETE FROM user_attack_states WHERE user_id=?',[playerId]);
    return {question:next,consumedQuestion:q.questionId,correct,expired,correctResult:q.correctResult,damage:String(damage),hp:String(hp),energy:String(energy-1n),weaponName:weapon.name,broken,combo:calculation.combo,reduced:calculation.reduced,phaseChanged,participants:phaseChanged||reward?await bossState.getUsersWithDamage():[],reward,replayed:false};
  });}
  async function expireBossQuestion({playerId,questionId}){return runTransaction(async()=>{await lock();const boss=await latest(),q=await read(String(playerId));if(!boss||!q||q.questionId!==questionId||q.bossId!==String(boss.id)||q.phase!==Number(boss.phase)||now()<q.createdAt+q.timeLimit*1000)return null;if(BigInt(boss.phase1_hp||0)===0n&&BigInt(boss.phase2_hp||0)===0n)return null;const next=question(String(playerId),q.chatId,boss,0);await save(next);return {question:next,expired:true,energy:String(await bossState.getCurrentEnergy(String(playerId))),hp:String(Number(boss.phase)===1?boss.phase1_hp:boss.phase2_hp)};});}
  async function startBossEncounter({adminId,imageFile,hp,prizeType,prizeAmount,operationKey}){adminId=String(adminId);hp=String(integer(hp));const amount=integer(typeof prizeAmount==='string'?prizeAmount.replace(/\.0+$/,''):prizeAmount);if(hp==='0'||amount===0n)fail('BOSS_PRIZE_INVALID');if(!['balance','card_balance','df_balance',...itemFields].includes(prizeType))fail('BOSS_PRIZE_UNSUPPORTED');return event('start',{adminId,imageFile,hp,prizeType,prizeAmount:String(amount),operationKey},async()=>{
    await runtime.one('SELECT telegram_id FROM players WHERE telegram_id=? FOR UPDATE',[adminId]);const roles=await runtime.many('SELECT c.name FROM role_catalog c JOIN player_roles r ON r.role_id=c.id WHERE r.player_id=?',[adminId]);if(adminId!==mainAdmin&&!roles.some(row=>['Администратор','Тех администратор'].includes(row.name)))fail('BOSS_ADMIN_DENIED');
    const previous=await latest();if(previous){const receipt=await runtime.one('SELECT boss_id FROM boss_reward_batches WHERE boss_id=?',[previous.id]),historical=await runtime.one('SELECT was_defeated FROM boss_import_states WHERE boss_id=?',[previous.id]);if(BigInt(previous.phase1_hp||0)===0n&&BigInt(previous.phase2_hp||0)===0n&&!receipt&&!Number(historical?.was_defeated))fail('BOSS_REWARD_PENDING');await runtime.execute('INSERT INTO boss_damage_history(boss_id,damage_id,user_id,damage,timestamp) SELECT ?,id,user_id,damage,timestamp FROM boss_damage',[previous.id]);}
    await runtime.execute('DELETE FROM boss_damage');await bossState.reduceAttackPowerBy90Percent();const created=await bossState.addNewBoss('Математика',imageFile,hp,prizeType,String(amount));await runtime.execute('DELETE FROM user_attack_states');return {bossId:String(created.lastInsertRowid),hp,prizeType,prizeAmount:String(amount),changes:created.changes,replayed:false};
  });}
  async function getBossQuestion({playerId,questionId}){const row=await runtime.one('SELECT state_json FROM user_attack_states WHERE user_id=?',[String(playerId)]);try{const q=JSON.parse(row?.state_json);return q.questionId===questionId?q:null;}catch{return null;}}
  return {prepareBossAttack,attachBossQuestion,answerBossAttack,expireBossQuestion,startBossEncounter,getBossQuestion};
}
module.exports={createBossCombat};
