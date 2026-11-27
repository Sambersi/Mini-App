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
function createMysqlApi(runtime,{now=()=>Date.now()}={}){
  const executor={execute:(sql,params)=>runtime.currentExecutor().execute(sql,params)};
  const registration=createPlayerRegistration(executor,{now,runTransaction:work=>{
    const run=()=>runtime.transaction(()=>work(runtime.currentExecutor()));
    return runtime.inTransaction?.()?run():withDeadlockRetry(run);
  }});
  return {...createLegacyReads(runtime),...createPlayerSettings(runtime),...createPlayerStateWrites(runtime),...createCatalogs(runtime),...createGameRecords(runtime),...createChatModes(runtime),...registration,transaction:work=>runtime.transaction(work)};
}
function getApiCoverage(api){
  return {implemented:contract.functions.filter(key=>typeof api[key]==='function'),missing:contract.functions.filter(key=>typeof api[key]!=='function'),missingConstants:contract.constants.filter(key=>!Object.hasOwn(api,key))};
}
function assertApiComplete(api){
  const report=getApiCoverage(api);
  if(report.missing.length||report.missingConstants.length)throw Object.assign(new Error('MariaDB API migration is incomplete'),{code:'MYSQL_API_INCOMPLETE'});
}
module.exports={createMysqlApi,getApiCoverage,assertApiComplete};
