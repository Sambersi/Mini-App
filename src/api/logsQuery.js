'use strict';
function parseFinanceFilters(query){
  const result={};for(const key of ['actorId','targetId','chatId','operationKey','entityType','entityId','minAmount','maxAmount'])if(query[key]!=null){if(typeof query[key]!=='string')throw new TypeError('Invalid log query');result[key]=query[key];}
  for(const key of ['fromTs','toTs'])if(query[key]!=null){if(typeof query[key]!=='string'||!/^\d+$/.test(query[key]))throw new TypeError('Invalid log time');result[key]=Number(query[key]);}
  if(query.success!=null){if(!['true','false'].includes(query.success))throw new TypeError('Invalid log success');result.success=query.success==='true';}
  if(query.currencies!=null){if(typeof query.currencies!=='string')throw new TypeError('Invalid log currencies');result.currencies=query.currencies.split(',');}
  if(query.pagination==='cursor'){result.pagination='cursor';if(query.cursorTs!=null||query.cursorId!=null)result.cursor={ts:Number(query.cursorTs),id:query.cursorId};}
  if(query.includeAuditMetadata==='true')result.includeAuditMetadata=true;
  return result;
}
module.exports={parseFinanceFilters};
