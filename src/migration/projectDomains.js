'use strict';
const {createHash}=require('node:crypto');
const specs=require('./domainTables.json');
const {canonicalDecimal}=require('./projectPlayers');
const quote=value=>'`'+value+'`';
function canonicalRow(spec,row) {
  return JSON.stringify(spec.columns.map((column,i)=>{
    const value=row[i];
    if(value===null)return null;
    if(column.numericText) return ['Infinity','-Infinity'].includes(String(value)) ? 'nonfinite:'+String(value) : canonicalDecimal(value);
    if(column.type.startsWith('DECIMAL'))return canonicalDecimal(value);
    if(column.type==='BIGINT' && !/^-?\d+$/.test(String(value)))throw Object.assign(new Error('Noninteger domain value needs review'),{code:'DOMAIN_VALUE_TYPE',details:{table:spec.name,column:column.name}});
    return String(value);
  }));
}
function fingerprintSource(db,spec) {
  const hash=createHash('sha256');let count=0;
  for(const row of sourceRows(db,spec)){hash.update(canonicalRow(spec,row)+'\n');count++;}
  return {count,hash:hash.digest('hex')};
}
function sourceRows(db,spec) {
  const fields=spec.columns.map(c=>quote(c.name)).join(',');
  return db.prepare('SELECT '+fields+' FROM '+quote(spec.name)+' ORDER BY '+spec.primary.map(quote).join(',')).raw().safeIntegers().iterate();
}
async function fingerprintTarget(connection,spec) {
  if(spec.primary.length!==1)throw new Error('Composite domain key requires dedicated paging');
  const hash=createHash('sha256');let count=0,last=null;
  const fields=spec.columns.map(c=>quote(c.targetName||c.name)).join(','),key=quote(spec.primary[0]);
  const index=spec.columns.findIndex(c=>c.name===spec.primary[0]);
  for(;;){
    const [rows]=await connection.query({sql:'SELECT '+fields+' FROM '+quote(spec.name)+(last===null?'':' WHERE '+key+'>?')+' ORDER BY '+key+' LIMIT 2000',rowsAsArray:true},last===null?[]:[last]);
    for(const row of rows){hash.update(canonicalRow(spec,row)+'\n');count++;}
    if(!rows.length)break;
    last=rows[rows.length-1][index];
  }
  return {count,hash:hash.digest('hex')};
}
async function projectDomains(connection,db,runId,log=()=>{}) {
  const [[control]]=await connection.query('SELECT runtime_active,projection_run_id FROM runtime_control WHERE id=1');
  const [[ops]]=await connection.query('SELECT COUNT(*) AS n FROM wallet_operations');
  if(!control||control.runtime_active||control.projection_run_id!==runId||Number(ops.n))throw new Error('Domain import requires inactive matching projection without runtime writes');
  await connection.query("SET SESSION sql_mode=CONCAT_WS(',',@@sql_mode,'NO_AUTO_VALUE_ON_ZERO')");
  const report=[];
  for(const spec of specs){
    const columns=db.prepare('PRAGMA table_info('+quote(spec.name)+')').all().map(c=>c.name);
    if(JSON.stringify(columns)!==JSON.stringify(spec.columns.map(c=>c.name)))throw Object.assign(new Error('Domain schema differs from reviewed mapping'),{code:'DOMAIN_SCHEMA_CHANGED',details:{table:spec.name}});
    const expected=fingerprintSource(db,spec);
    const [[previous]]=await connection.query('SELECT source_count,source_hash,status FROM domain_import_tables WHERE run_id=? AND table_name=?',[runId,spec.name]);
    await connection.beginTransaction();
    try {
      if(previous){
        if(Number(previous.source_count)!==expected.count||previous.status!=='verified')throw new Error('Domain import checkpoint differs');
      } else {
        const [[existing]]=await connection.query('SELECT COUNT(*) AS n FROM '+quote(spec.name));
        if(Number(existing.n))throw Object.assign(new Error('Refusing to overwrite a nonempty domain table'),{code:'DOMAIN_TARGET_NOT_EMPTY'});
        const fields=spec.columns.map(c=>quote(c.targetName||c.name)).join(',');let batch=[];
        const flush=async()=>{if(batch.length){await connection.query('INSERT INTO '+quote(spec.name)+'('+fields+') VALUES ?',[batch]);batch=[];}};
        let bytes=0;
        for(const row of sourceRows(db,spec)){
          const values=row.map((v,i)=>v!==null&&(typeof v==='bigint'||spec.columns[i].numericText)?String(v):v);
          const size=Buffer.byteLength(JSON.stringify(values));
          if(size>4*1024*1024)throw new Error('Domain row exceeds safe packet size');
          if(bytes+size>256*1024){await flush();bytes=0;}
          batch.push(values);bytes+=size;
          if(batch.length>=250){await flush();bytes=0;}
        }
        await flush();
      }
      const actual=await fingerprintTarget(connection,spec);
      if(actual.count!==expected.count||actual.hash!==expected.hash)throw Object.assign(new Error('Domain table verification failed'),{code:'DOMAIN_CHECKSUM_MISMATCH',details:{table:spec.name}});
      if(!previous)await connection.query('INSERT INTO domain_import_tables(run_id,table_name,source_count,source_hash,target_hash,status) VALUES (?,?,?,?,?,?)',[runId,spec.name,expected.count,expected.hash,actual.hash,'verified']);
      else if(previous.source_hash!==expected.hash) {
        // A reviewed type migration can change canonical formatting. Refresh
        // only after a full source/target comparison, never as a skip shortcut.
        await connection.query('UPDATE domain_import_tables SET source_hash=?,target_hash=? WHERE run_id=? AND table_name=?',[expected.hash,actual.hash,runId,spec.name]);
      }
      await connection.commit();
      if(spec.columns.some(c=>c.autoIncrement)){
        const sequence=db.prepare('SELECT seq FROM sqlite_sequence WHERE name=?').safeIntegers().get(spec.name);
        if(sequence && sequence.seq>=0n)await connection.query('ALTER TABLE '+quote(spec.name)+' AUTO_INCREMENT='+String(sequence.seq+1n));
      }
      report.push({table:spec.name,rows:expected.count,hash:expected.hash});
      log({table:spec.name,rows:expected.count,status:'verified'});
    }catch(error){await connection.rollback();error.details={...error.details,table:spec.name};throw error;}
  }
  return {tables:report.length,rows:report.reduce((n,t)=>n+t.rows,0),details:report};
}
module.exports={canonicalRow,fingerprintSource,fingerprintTarget,projectDomains};
