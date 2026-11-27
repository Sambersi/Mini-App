'use strict';
const {canonicalDecimal}=require('./projectPlayers');
const {parseSourceList,listFields}=require('./projectPlayerCollections');
function normalizeField(field,value){
  if([...listFields,'status_ids'].includes(field)){
    const parsed=parseSourceList(value);
    if(parsed.invalid!==undefined)return 'invalid:'+parsed.invalid;
    let tokens=parsed.tokens;
    if(field==='status_ids'){
      const seen=new Set();tokens=tokens.filter((token,i)=>{const key=String(parsed.values[i]);if(seen.has(key))return false;seen.add(key);return true;});
    }
    return JSON.stringify(tokens);
  }
  if(['is_registered','transfers_blocked','is_blocked'].includes(field))return String(Number(value)!==0&&value!==null?1:0);
  if(value===undefined)return '<missing>';
  if(value===null)return null;
  if(typeof value==='bigint'||typeof value==='number')return canonicalDecimal(value);
  return String(value);
}
async function verifyLegacyProfiles(db,api){
  let count=0,fields=0;
  const columns=db.prepare('PRAGMA table_info(users)').all();
  for(const source of db.prepare('SELECT * FROM users ORDER BY id').safeIntegers().iterate()){
    const target=await api.getUserById(String(source.id));
    if(!target)throw Object.assign(new Error('Projected profile missing'),{code:'PROFILE_MISSING'});
    for(const column of columns){
      const field=column.name;
      const numeric=/INT|BOOL|REAL|FLOAT|DOUBLE|NUM/i.test(column.type)&&!['is_registered','transfers_blocked','is_blocked'].includes(field);
      const normalize=value=>numeric?(value===null?null:value===undefined?'<missing>':canonicalDecimal(value)):normalizeField(field,value);
      const expected=normalize(source[field]),actual=normalize(target[field]);
      if(actual!==expected)throw Object.assign(new Error('Projected profile field mismatch'),{code:'PROFILE_FIELD_MISMATCH',details:{field,sourceType:column.type}});
      fields++;
    }
    count++;
  }
  return {profiles:count,fields};
}
module.exports={normalizeField,verifyLegacyProfiles};
