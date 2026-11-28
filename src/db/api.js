'use strict';
const contract=require('./legacyContract.json');
const {createLegacyReads}=require('../repositories/legacyReads');
const {createPlayerSettings}=require('../repositories/playerSettings');
const {createPlayerStateWrites}=require('../repositories/playerStateWrites');
const {createCatalogs}=require('../repositories/catalogs');
const {createGameRecords}=require('../repositories/gameRecords');
const {createChatModes}=require('../repositories/chatModes');
const {createPlayerRegistration}=require('../services/playerRegistration');
const {withDeadlockRetry}=require('./transaction');
const {createProfileViews}=require('../repositories/profileViews');
const {createPaymentInbox}=require('../services/paymentInbox');
const {createSkinPurchase}=require('../services/skinPurchase');
const {createPlayerStatistics}=require('../repositories/playerStatistics');
const {createCardFinance}=require('../services/cardFinance');
const {createAccessControl}=require('../repositories/accessControl');
const {createOperationalState}=require('../repositories/operationalState');
const {createPlayerEquipment}=require('../repositories/playerEquipment');
const {createInventoryAdjustment}=require('../services/inventoryAdjustment');
const {createContainerPurchase}=require('../services/containerPurchase');
const {createCandyPurchase}=require('../services/candyPurchase');
const {createPartnerPromos}=require('../repositories/partnerPromos');
const {createPromoRedemption}=require('../services/promoRedemption');
const {createPartnerDecision}=require('../services/partnerDecision');
const {createFinanceLogs}=require('../repositories/financeLogs');
const {createBossState}=require('../repositories/bossState');
const {createAttackUpgrade}=require('../services/attackUpgrade');
const {createWeaponPurchase}=require('../services/weaponPurchase');
const {createBossRewards}=require('../services/bossRewards');
const {createBossCombat}=require('../services/bossCombat');
const {createDoubleRounds}=require('../repositories/doubleRounds');
const {createDoubleBet}=require('../services/doubleBet');
const {createDiceBet}=require('../services/diceBet');
const {createReferrerBank}=require('../services/referrerBank');
const {createDoubleStatistics}=require('../services/doubleStatistics');
const {createDoubleSettlement}=require('../services/doubleSettlement');
const {createBossRewardDistribution}=require('../telegram/bossRewards');
function createMysqlApi(runtime,{now=()=>Date.now(),random=Math.random}={}){
  const executor={execute:(sql,params)=>runtime.currentExecutor().execute(sql,params)};
  const runTransaction=work=>{
    const run=()=>runtime.transaction(()=>work(runtime.currentExecutor()));
    return runtime.inTransaction?.()?run():withDeadlockRetry(run);
  };
  const registration=createPlayerRegistration(executor,{now,runTransaction});
  const payments=createPaymentInbox(executor,{now,runTransaction,inTransaction:()=>Boolean(runtime.inTransaction?.()),referralPercent:require('../../config').REFERRAL_DONATION_PERCENT_DF});
  const reads=createLegacyReads(runtime);
  const catalogs=createCatalogs(runtime);
  const profileViews=createProfileViews(runtime,reads,{now});
  const inventory=createInventoryAdjustment(runtime,{reads,runTransaction});
  const equipment=createPlayerEquipment(runtime,reads,catalogs);
  const bossState=createBossState(runtime,{now});
  const statistics=createPlayerStatistics(runtime,reads);
  const bank=createReferrerBank(runtime,profileViews,{runTransaction,now});
  const doubleStatistics=createDoubleStatistics(runtime,statistics,{runTransaction,now});
  const gameRecords=createGameRecords(runtime,{now});
  const operational=createOperationalState(runtime,{now});
  const settleBossRewards=createBossRewards(runtime,inventory,{runTransaction,now});
  const promoRedemption=createPromoRedemption(runtime,inventory,{runTransaction,now,random});
  return {...reads,...doubleStatistics,...bank,...createDoubleSettlement(runtime,{runTransaction,inventory,bank,views:profileViews,doubleStatistics,now,random}),...createDoubleRounds(runtime,{now}),placeDoubleBet:createDoubleBet(runtime,{runTransaction,now}),...bossState,...createBossCombat(runtime,bossState,equipment,{runTransaction,settleBossRewards,now}),settleBossRewards,distributePrizesToTopPlayers:createBossRewardDistribution({settle:settleBossRewards}),purchaseWeapon:createWeaponPurchase(runtime,equipment,{runTransaction,now}),purchaseAttackUpgrade:createAttackUpgrade(runtime,bossState,{runTransaction,now}),...inventory,...createPartnerPromos(runtime,{now}),...promoRedemption,...createAccessControl(runtime,reads,{now}),...operational,...createFinanceLogs(runtime,{now,cleanupOldMessageLogs:operational.cleanupOldMessageLogs}),...equipment,...profileViews,...statistics,...createPlayerSettings(runtime),...createPlayerStateWrites(runtime),...catalogs,...gameRecords,...createDiceBet(runtime,{records:gameRecords,runTransaction,now}),...createChatModes(runtime),...registration,...payments,decidePartnerRequest:createPartnerDecision(runtime,{runTransaction,now}),purchaseCandy:createCandyPurchase(runtime,{inventory,equipment,runTransaction}),purchaseContainers:createContainerPurchase(runtime,inventory,{runTransaction}),performCardFinance:createCardFinance(executor,{runTransaction,now,mainAdmin:process.env.MAIN_ADMIN||''}),purchaseSkin:createSkinPurchase(executor,{runTransaction}),transaction:work=>runtime.transaction(work)};
}
function getApiCoverage(api){
  return {implemented:contract.functions.filter(key=>typeof api[key]==='function'),missing:contract.functions.filter(key=>typeof api[key]!=='function'),missingConstants:contract.constants.filter(key=>!Object.hasOwn(api,key))};
}
function assertApiComplete(api){
  const report=getApiCoverage(api);
  if(report.missing.length||report.missingConstants.length)throw Object.assign(new Error('MariaDB API migration is incomplete'),{code:'MYSQL_API_INCOMPLETE'});
}
module.exports={createMysqlApi,getApiCoverage,assertApiComplete};
