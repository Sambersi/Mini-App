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
function createMysqlApi(runtime,{now=()=>Date.now()}={}){
  const executor={execute:(sql,params)=>runtime.currentExecutor().execute(sql,params)};
  const runTransaction=work=>{
    const run=()=>runtime.transaction(()=>work(runtime.currentExecutor()));
    return runtime.inTransaction?.()?run():withDeadlockRetry(run);
  };
  const registration=createPlayerRegistration(executor,{now,runTransaction});
  const payments=createPaymentInbox(executor,{now,runTransaction,inTransaction:()=>Boolean(runtime.inTransaction?.()),referralPercent:require('../../config').REFERRAL_DONATION_PERCENT_DF});
  const reads=createLegacyReads(runtime);
  return {...reads,...createProfileViews(runtime,reads,{now}),...createPlayerStatistics(runtime,reads),...createPlayerSettings(runtime),...createPlayerStateWrites(runtime),...createCatalogs(runtime),...createGameRecords(runtime),...createChatModes(runtime),...registration,...payments,purchaseSkin:createSkinPurchase(executor,{runTransaction}),transaction:work=>runtime.transaction(work)};
}
function getApiCoverage(api){
  return {implemented:contract.functions.filter(key=>typeof api[key]==='function'),missing:contract.functions.filter(key=>typeof api[key]!=='function'),missingConstants:contract.constants.filter(key=>!Object.hasOwn(api,key))};
}
function assertApiComplete(api){
  const report=getApiCoverage(api);
  if(report.missing.length||report.missingConstants.length)throw Object.assign(new Error('MariaDB API migration is incomplete'),{code:'MYSQL_API_INCOMPLETE'});
}
module.exports={createMysqlApi,getApiCoverage,assertApiComplete};
