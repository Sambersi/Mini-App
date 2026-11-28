'use strict';
function auditFilters(input){
  const clauses=[],params=[];const add=(sql,value)=>{clauses.push(sql);params.push(value);};
  for(const [key,op]of [['fromTs','>='],['toTs','<=']])if(input[key]!=null){if(!Number.isSafeInteger(input[key])||input[key]<0)throw new TypeError('Invalid log timestamp');add('f.ts'+op+'?',input[key]);}
  if(input.fromTs!=null&&input.toTs!=null&&input.fromTs>input.toTs)throw new TypeError('Invalid log period');
  for(const [key,column]of [['actorId','actor_user_id'],['targetId','target_user_id'],['chatId','chat_id'],['operationKey','operation_key'],['entityType','entity_type'],['entityId','entity_id']])if(input[key]!=null){if(typeof input[key]!=='string'||!input[key].length||input[key].length>191)throw new TypeError('Invalid log identifier');add('f.'+column+'=?',input[key]);}
  if(input.success!=null){if(typeof input.success!=='boolean')throw new TypeError('Invalid log success');add('f.success=?',input.success?1:0);}
  if(input.currencies!=null){if(!Array.isArray(input.currencies)||!input.currencies.length||input.currencies.length>20||input.currencies.some(value=>typeof value!=='string'||value.length>32))throw new TypeError('Invalid log currencies');clauses.push('f.currency IN ('+input.currencies.map(()=>'?').join(',')+')');params.push(...input.currencies);}
  for(const [key,op]of [['minAmount','>='],['maxAmount','<=']])if(input[key]!=null){if(typeof input[key]!=='string'||! /^-?\d{1,35}(?:\.\d{1,30})?$/.test(input[key]))throw new TypeError('Invalid log amount');add('f.amount'+op+'?',input[key]);}
  return {clauses,params};
}
function logCursor(cursor){if(!cursor)return null;if(!Number.isSafeInteger(cursor.ts)||cursor.ts<0||typeof cursor.id!=='string'||!/^\d+$/.test(cursor.id)||BigInt(cursor.id)>9223372036854775807n)throw new TypeError('Invalid log cursor');return cursor;}
module.exports={auditFilters,logCursor};
