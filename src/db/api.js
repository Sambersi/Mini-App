'use strict';
const contract=require('./legacyContract.json');
const {createLegacyReads}=require('../repositories/legacyReads');
const {createPlayerSettings}=require('../repositories/playerSettings');
function createMysqlApi(runtime){
  return {...createLegacyReads(runtime),...createPlayerSettings(runtime),transaction:work=>runtime.transaction(work)};
}
function getApiCoverage(api){
  return {implemented:contract.functions.filter(key=>typeof api[key]==='function'),missing:contract.functions.filter(key=>typeof api[key]!=='function'),missingConstants:contract.constants.filter(key=>!Object.hasOwn(api,key))};
}
function assertApiComplete(api){
  const report=getApiCoverage(api);
  if(report.missing.length||report.missingConstants.length)throw Object.assign(new Error('MariaDB API migration is incomplete'),{code:'MYSQL_API_INCOMPLETE'});
}
module.exports={createMysqlApi,getApiCoverage,assertApiComplete};
