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
  const inventory=createInventoryAdjustment(runtime,{reads,runTransaction});
  const equipment=createPlayerEquipment(runtime,reads,catalogs);
  const promoRedemption=createPromoRedemption(runtime,inventory,{runTransaction,now,random});
  return {...reads,...inventory,...createPartnerPromos(runtime,{now}),...promoRedemption,...createAccessControl(runtime,reads,{now}),...createOperationalState(runtime,{now}),...equipment,...createProfileViews(runtime,reads,{now}),...createPlayerStatistics(runtime,reads),...createPlayerSettings(runtime),...createPlayerStateWrites(runtime),...catalogs,...createGameRecords(runtime),...createChatModes(runtime),...registration,...payments,decidePartnerRequest:createPartnerDecision(runtime,{runTransaction,now}),purchaseCandy:createCandyPurchase(runtime,{inventory,equipment,runTransaction}),purchaseContainers:createContainerPurchase(runtime,inventory,{runTransaction}),performCardFinance:createCardFinance(executor,{runTransaction,now,mainAdmin:process.env.MAIN_ADMIN||''}),purchaseSkin:createSkinPurchase(executor,{runTransaction}),transaction:work=>runtime.transaction(work)};
}
function getApiCoverage(api){
  return {implemented:contract.functions.filter(key=>typeof api[key]==='function'),missing:contract.functions.filter(key=>typeof api[key]!=='function'),missingConstants:contract.constants.filter(key=>!Object.hasOwn(api,key))};
}
function assertApiComplete(api){
  const report=getApiCoverage(api);
  if(report.missing.length||report.missingConstants.length)throw Object.assign(new Error('MariaDB API migration is incomplete'),{code:'MYSQL_API_INCOMPLETE'});
}
module.exports={createMysqlApi,getApiCoverage,assertApiComplete};
