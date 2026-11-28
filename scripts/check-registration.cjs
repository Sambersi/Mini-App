'use strict';
const assert=require('node:assert/strict');
const {testConfig}=require('./check-wallets.cjs');
const {applyFoundation}=require('../src/db/migrate');
const {createPlayerRegistration,RESERVED_NUMERIC_IDS}=require('../src/services/playerRegistration');
const {createSessionsRepository}=require('../src/repositories/sessions');
const {createDatabaseRuntime}=require('../src/db/runtime');
const {createLegacyReads}=require('../src/repositories/legacyReads');
const {createMysqlApi}=require('../src/db/api');
const {groups}=require('../src/db/playerFields');
const {assertInactiveProjection}=require('../src/migration/importGuard');
async function runRegistrationChecks(env=process.env){
  const pool=require('mysql2/promise').createPool(testConfig(env));
  const timestamp=1000000000000,referrer='900000031';let checks=0,seeded=false;
  const runtime=createDatabaseRuntime(pool);
  const service=createMysqlApi(runtime,{now:()=>timestamp});
  const sessions=createSessionsRepository(pool,{now:()=>timestamp});
  const reads=createLegacyReads(createDatabaseRuntime(pool));
  const one=async(sql,params=[])=>{const [[row]]=await pool.execute(sql,params);return row;};
  const profile=id=>reads.getUserById(id);
  const create=(id,ref=null)=>service.createUserOrUpdate({id,first_name:'Fixture',referrer_id:ref});
  const proof=(ref=null,extra={})=>({registrationInProgress:true,captchaPending:false,captchaVerifiedAt:timestamp-1,policyAccepted:true,startedAt:timestamp,referralCode:ref,...extra});
  const prepare=async(id,ref=null,extra={})=>{await create(id,ref);await sessions.saveRegistrationSession(id,proof(ref,extra));};
  try{
    const connection=await pool.getConnection();try{await applyFoundation(connection);}finally{connection.release();}
    assert.equal(Number((await one('SELECT COUNT(*) AS n FROM players')).n),0,'Checks database must have no players');
    seeded=true;
    await create(referrer);
    await pool.execute('UPDATE runtime_control SET projection_run_id=? WHERE id=1',['fixture_projection']);
    const guardConnection=await pool.getConnection();
    try{await assert.rejects(assertInactiveProjection(guardConnection,'fixture_projection'),{code:'MIGRATION_RUNTIME_WRITES_EXIST'});checks++;}finally{guardConnection.release();}
    const first=await profile(referrer);assert.equal(first.numeric_id,12);assert.equal(first.balance,0);assert.equal(first.active_weapon,'1');assert.equal(first.energy,0);assert.equal(first.notifications_enabled,1);assert.equal(first.card_level,null);assert.equal(first.referral_bonus_amount,10000);checks++;
    await pool.execute('UPDATE wallets SET balance=777 WHERE player_id=? AND asset=? AND bucket=?',[referrer,'PF','main']);
    await service.createUserOrUpdate({id:referrer,first_name:'<Fixture>@',balance:999999,referral_bonus_amount:999});
    const updated=await profile(referrer);assert.equal(updated.balance,777);assert.equal(updated.numeric_id,12);assert.equal(updated.username,'Fixture');assert.equal(updated.referral_bonus_amount,10000);checks++;
    const ids=Array.from({length:20},(_,i)=>String(900000100+i));
    await Promise.all(ids.map(id=>create(id)));
    const numericIds=(await pool.execute('SELECT numeric_id FROM players'))[0].map(row=>Number(row.numeric_id));
    assert.equal(new Set(numericIds).size,21);assert.ok(numericIds.every(id=>!RESERVED_NUMERIC_IDS.includes(id)));checks++;
    await prepare('900000032',referrer);
    const completed=await Promise.all(Array.from({length:20},()=>service.completePlayerRegistration('900000032')));
    assert.equal(completed.filter(r=>!r.alreadyRegistered).length,1);assert.ok(completed.every(r=>r.newUserPf==='5000'));
    let player=await profile('900000032'),inviter=await profile(referrer);
    assert.equal(player.balance,5000);assert.equal(player.fortune_tickets,1);assert.equal(inviter.balance,10777);assert.equal(inviter.fortune_tickets,1);assert.equal(inviter.candy,25);
    assert.equal(Number((await one('SELECT COUNT(*) AS n FROM inventory_entries')).n),3);assert.deepEqual(await sessions.getRegistrationSession('900000032'),{});checks++;
    await pool.execute('INSERT INTO role_catalog(id,name,priority) VALUES (999992,?,0)',['Partner']);
    await pool.execute('INSERT INTO player_roles(player_id,role_id) VALUES (?,999992)',[referrer]);
    await prepare('900000033',referrer);
    const partner=await service.completePlayerRegistration('900000033');
    assert.equal(partner.partner,true);assert.equal(partner.referrerPf,'20000');assert.equal(partner.referrerTickets,'2');assert.equal(partner.candy,'25');checks++;
    await prepare('900000034','missing_referrer');
    assert.equal((await profile('900000034')).referrer_id,'missing_referrer');
    const invalid=await service.completePlayerRegistration('900000034');assert.equal(invalid.referrerId,null);assert.equal((await profile('900000034')).balance,0);assert.equal((await profile('900000034')).referrer_id,'missing_referrer');checks++;
    await prepare('900000035','900000035');assert.equal((await service.completePlayerRegistration('900000035')).referrerId,null);checks++;
    await prepare('900000036',referrer,{captchaPending:true});
    await assert.rejects(service.completePlayerRegistration('900000036'),{code:'REGISTRATION_PROOF_REQUIRED'});assert.equal((await profile('900000036')).is_registered,0);checks++;
    await sessions.saveRegistrationSession('900000036',proof(referrer,{startedAt:timestamp-86400001}));
    await assert.rejects(service.completePlayerRegistration('900000036'),{code:'REGISTRATION_EXPIRED'});checks++;
    await sessions.saveRegistrationSession('900000036',proof(referrer,{captchaLockedUntil:timestamp+1}));
    await assert.rejects(service.completePlayerRegistration('900000036'),{code:'REGISTRATION_CAPTCHA_LOCKED'});checks++;
    await sessions.saveRegistrationSession('900000036',proof(referrer));
    const beforeFailure=await profile(referrer);
    await pool.execute('INSERT INTO inventory_entries(operation_key,player_id,item_code,amount,entry_type) VALUES (?,?,?,?,?)',['registration:900000036:900000036:ticket','900000036','fortune_tickets',0,'fixture']);
    await assert.rejects(service.completePlayerRegistration('900000036'),{code:'ER_DUP_ENTRY'});
    player=await profile('900000036');inviter=await profile(referrer);
    assert.equal(player.is_registered,0);assert.equal(player.balance,0);assert.equal(player.fortune_tickets,0);assert.equal(inviter.balance,beforeFailure.balance);assert.equal(inviter.candy,beforeFailure.candy);assert.ok((await sessions.getRegistrationSession('900000036')).registrationInProgress);
    assert.equal(Number((await one('SELECT COUNT(*) AS n FROM registration_completions WHERE player_id=?',['900000036'])).n),0);checks++;
    await pool.execute('DELETE FROM inventory_entries WHERE operation_key=?',['registration:900000036:900000036:ticket']);
    assert.equal((await service.completePlayerRegistration('900000036')).newUserPf,'5000');checks++;
    await pool.execute('UPDATE wallets SET balance=140000001 WHERE player_id=? AND asset=? AND bucket=?',[referrer,'PF','main']);
    await prepare('900000037',referrer);const capped=await service.completePlayerRegistration('900000037');
    assert.equal(capped.referrerPf,'0');assert.equal((await profile(referrer)).balance,140000001);checks++;
    await create('900000038');await pool.execute('UPDATE players SET registered=1 WHERE telegram_id=?',['900000038']);
    assert.equal((await service.completePlayerRegistration('900000038')).alreadyRegistered,true);assert.equal((await profile('900000038')).balance,0);checks++;
    // New completions with the same inviter serialize all inventory increments.
    inviter=await profile(referrer);
    for(const id of ids)await sessions.saveRegistrationSession(id,proof(referrer));
    const concurrent=await Promise.all(ids.map(id=>service.completePlayerRegistration(id)));
    assert.ok(concurrent.every(result=>!result.alreadyRegistered));
    const after=await profile(referrer);assert.equal(after.fortune_tickets,inviter.fortune_tickets+40);assert.equal(after.candy,inviter.candy+500);assert.equal(after.balance,140000001);checks++;
    // A real SQL error after wallet creation must remove the whole new profile.
    const brokenPool={getConnection:async()=>{
      const c=await pool.getConnection();return new Proxy(c,{get(target,key){if(key==='execute')return(sql,args)=>sql.startsWith('INSERT INTO player_statistics')?target.execute('SELECT missing_registration_fixture_column'):target.execute(sql,args);const value=target[key];return typeof value==='function'?value.bind(target):value;}});
    }};
    await assert.rejects(createPlayerRegistration(brokenPool,{now:()=>timestamp}).createUserOrUpdate({id:'900000039',first_name:'Fixture'}),{code:'ER_BAD_FIELD_ERROR'});
    assert.equal(await profile('900000039'),null);assert.equal(Number((await one('SELECT COUNT(*) AS n FROM wallets WHERE player_id=?',['900000039'])).n),0);checks++;
    // Even an administrative reset cannot grant an existing receipt twice.
    await pool.execute('UPDATE players SET registered=0 WHERE telegram_id=?',['900000032']);
    await assert.rejects(service.completePlayerRegistration('900000032'),{code:'REGISTRATION_PROOF_REQUIRED'});checks++;
    await sessions.saveRegistrationSession('900000032',proof(referrer));
    assert.equal((await service.completePlayerRegistration('900000032')).alreadyRegistered,true);assert.equal((await profile('900000032')).balance,5000);checks++;
    const invoice={playerId:'900000032',currency:'XTR',chargeId:'fixture_inbox',stars:10,invoicePayload:'10_stars'};
    const paid=await service.processTelegramPayment(invoice);assert.equal(paid.reward,'100');assert.equal(paid.replayed,false);checks++;
    const duplicates=await Promise.all(Array.from({length:20},()=>service.processTelegramPayment(invoice)));
    assert.ok(duplicates.every(result=>result.replayed));assert.equal((await profile('900000032')).df_balance,100);checks++;
    await assert.rejects(service.processTelegramPayment({...invoice,stars:11,invoicePayload:'11_stars'}),{code:'PAYMENT_CHARGE_CONFLICT'});checks++;
    const failed={...invoice,chargeId:'fixture_inbox_sql'};
    const hash=require('node:crypto').createHash('sha256').update(failed.chargeId).digest('hex');
    await pool.execute('INSERT INTO wallet_entries(operation_key,player_id,asset,bucket,amount,entry_type,source_run_id) VALUES (?,?,?,?,0,?,NULL)',['payment:'+hash+':payer',invoice.playerId,'DF','main','fixture']);
    await assert.rejects(service.processTelegramPayment(failed),{code:'ER_DUP_ENTRY'});
    assert.equal((await profile(invoice.playerId)).df_balance,100);
    assert.equal((await one('SELECT state FROM payment_inbox WHERE charge_hash=?',[hash])).state,'pending');checks++;
    await pool.execute('DELETE FROM wallet_entries WHERE operation_key=?',['payment:'+hash+':payer']);
    assert.deepEqual(await service.recoverTelegramPayments(),{processed:1,failed:0});
    const recoveredProfile=await profile(invoice.playerId);
    assert.equal(recoveredProfile.df_balance,200);assert.equal(recoveredProfile.total_donated_stars,20);assert.equal(JSON.parse(recoveredProfile.donations_history).length,2);assert.equal((await profile(referrer)).df_balance,30);
    assert.deepEqual(await service.recoverTelegramPayments(),{processed:0,failed:0});checks++;
    // A payment whose profile disappeared remains durable until restoration.
    await assert.rejects(service.processTelegramPayment({...invoice,playerId:'900000040',chargeId:'fixture_missing_player'}));
    await create('900000040');assert.deepEqual(await service.recoverTelegramPayments(),{processed:1,failed:0});assert.equal((await profile('900000040')).df_balance,100);checks++;
    await assert.rejects(runtime.transaction(()=>service.processTelegramPayment({...invoice,chargeId:'fixture_outer_transaction'})),{code:'PAYMENT_RECEIVE_REQUIRES_OUTER_COMMIT'});checks++;
    await service.updateWinStreak(referrer,true);await service.updateWinStreak(referrer,true);
    let stats=await one('SELECT current_win_streak,best_win_streak FROM player_statistics WHERE player_id=?',[referrer]);
    assert.equal(Number(stats.current_win_streak),2);assert.equal(Number(stats.best_win_streak),2);checks++;
    await service.updateWinStreak(referrer,false);stats=await one('SELECT current_win_streak,best_win_streak FROM player_statistics WHERE player_id=?',[referrer]);assert.equal(Number(stats.current_win_streak),0);assert.equal(Number(stats.best_win_streak),2);checks++;
    await Promise.all(Array.from({length:20},()=>service.incrementMultiplierCount(referrer,'x2')));assert.equal((await service.getMultiplierStats(referrer)).x2,20);checks++;
    await service.updateMaxWinIfGreater(referrer,10);await service.updateMaxWinIfGreater(referrer,5);assert.equal(Number((await one('SELECT max_win_amount FROM player_statistics WHERE player_id=?',[referrer])).max_win_amount),10);checks++;
    await service.addToBlacklist('900099999','fixture',null);assert.equal(await service.isUserBanned('900099999'),true);await service.removeFromBlacklist('900099999');assert.equal(await service.isUserBanned('900099999'),false);checks++;
    await service.addToBlacklist(referrer,'expired',timestamp/1000-1);assert.equal(await service.isUserBanned(referrer),false);await service.removeFromBlacklist(referrer);checks++;
    await service.addMute(referrer,'-900000001','fixture',timestamp/1000+1);assert.ok(await service.isUserMuted(referrer,'-900000001'));await service.removeMute(referrer,'-900000001');checks++;
    await service.addMute(referrer,'-900000001','expired',timestamp/1000-1);assert.equal(await service.isUserMuted(referrer,'-900000001'),false);assert.equal((await service.getUserMutesPm(referrer)).length,0);checks++;
    assert.equal((await service.createStatus('FixtureRole',5)).success,true);assert.equal((await service.createStatus('FixtureRole',5)).success,false);checks++;
    const fixtureRole=await service.getStatusByName('FixtureRole');
    await Promise.all(Array.from({length:20},()=>service.updateUserStatus(referrer,fixtureRole.id)));assert.equal((await service.getUserStatusIds(referrer)).filter(id=>String(id)===String(fixtureRole.id)).length,1);checks++;
    assert.equal((await service.getUsersByStatuses(['FixtureRole'])).length,1);assert.equal((await service.getUsersByStatus('FixtureRole')).length,1);checks++;
    assert.equal((await service.removeUserStatus(referrer,fixtureRole.id)).success,true);assert.equal((await service.removeUserStatus(referrer,fixtureRole.id)).success,false);checks++;
    await service.recordAdminAction(referrer,'fixture','900000032');assert.equal(await service.getLastAdminActionTime(referrer),timestamp/1000);assert.equal((await service.getAdminActionsInRange(referrer)).length,1);checks++;
    await service.recordAdminKickAction(referrer,'900000032');assert.equal(await service.getLastAdminKickActionTime(referrer),timestamp/1000);assert.equal((await service.getAdminKickActionsInRange(referrer)).length,1);checks++;
    await service.logMessage(referrer,'private',referrer,null,'x'.repeat(1100),true);const messages=await service.getUserMessageLog(referrer);assert.equal(messages.length,1);assert.equal(messages[0].message_text.length,1024);assert.equal(messages[0].is_command,1);checks++;
    await service.saveAttackState(referrer,JSON.stringify({answer:2}),1);await service.updateAttackMessageId(referrer,2);const attack=await service.getAttackState(referrer);assert.equal(attack.message_id,2);assert.equal(JSON.parse(attack.correct_button_index).answer,2);await service.deleteAttackState(referrer);assert.equal(await service.getAttackState(referrer),undefined);checks++;
    const auction={prize:'Fixture',minBet:10,minStep:1,highestBid:20,highestBidder:{userId:referrer},participants:[referrer],bids:[{userId:referrer,telegramId:referrer,amount:20}],isFinished:false};
    await service.saveAuctionState(auction);let savedAuction=await service.getAuctionState();assert.equal(savedAuction.isFinished,false);assert.equal(savedAuction.highestBid,20);assert.deepEqual(savedAuction.bids,auction.bids);await service.saveAuctionState({...auction,isFinished:true});assert.equal((await service.getAuctionState()).isFinished,true);checks++;
    assert.equal(await service.hasUnansweredReports(referrer),false);checks++;
    assert.equal((await service.cleanupExpiredAdminActions()).deletedCount,0);assert.equal((await service.cleanupExpiredAdminKickActions()).deletedCount,0);assert.equal((await service.cleanupOldMessageLogs()).deletedCount,0);checks++;
    return {checks,concurrentRequests:20,isolatedDatabase:true};
  }finally{
    try{if(seeded){
      for(const table of ['payment_inbox','telegram_payments','player_donation_events','finance_log','registration_completions','inventory_entries','wallet_entries','player_referral_intents','player_referrals','player_roles',...Object.keys(groups),'inventory_balances','wallets','player_cards'])await pool.query('DELETE FROM '+table);
      await pool.execute('DELETE FROM role_catalog WHERE id=999992');
      await pool.execute('DELETE FROM role_catalog WHERE name=?',['FixtureRole']);
      await pool.query('DELETE FROM player_bans');await pool.query('DELETE FROM mutes');
      for(const table of ['auction','user_attack_states','message_log','daily_admin_actions','daily_admin_kick_actions'])await pool.query('DELETE FROM '+table);
      await pool.query('DELETE FROM registration_sessions');await pool.query('DELETE FROM players');
      await pool.query('UPDATE runtime_control SET projection_run_id=NULL WHERE id=1');
    }}finally{await pool.end();}
  }
}
module.exports={runRegistrationChecks};
if(require.main===module){require('dotenv').config();runRegistrationChecks().then(result=>console.log('[REGISTRATION CHECKS] VERIFIED '+JSON.stringify(result))).catch(error=>{console.log('[REGISTRATION CHECKS] FAILED '+JSON.stringify(require('../src/db/mysql').safeMysqlError(error)));process.exitCode=1;});}
