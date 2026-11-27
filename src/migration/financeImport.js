'use strict';
const fs=require('node:fs'),path=require('node:path');
const {readMysqlConfig}=require('../db/mysql');
const {applyFoundation}=require('../db/migrate');
const {openSource}=require('./sqliteSource');
const {createImportSnapshot,validateRunId}=require('./stageTwo');
const {legacyCeilings,projectFinance}=require('./projectFinance');
const {projectPlayerState}=require('./projectPlayerState');
const {projectDomains}=require('./projectDomains');
const {projectPlayerCollections}=require('./projectPlayerCollections');
const {verifyLegacyProfiles}=require('./verifyLegacyProfiles');
async function runFinanceImport({rootDir,env=process.env,log=console.log}) {
  const runId=validateRunId(env.MYSQL_IMPORT_RUN_ID);
  const snapshot=await createImportSnapshot(rootDir,runId);
  const pool=require('mysql2/promise').createPool({...readMysqlConfig(env),connectionLimit:1});
  let connection,source,locked=false;
  try {
    connection=await pool.getConnection();
    const [[lock]]=await connection.query('SELECT GET_LOCK(?,0) AS acquired',['mybot-finance-import']);
    if(!Number(lock.acquired))throw new Error('Another finance importer is running');
    locked=true;
    await applyFoundation(connection);
    const [[run]]=await connection.query('SELECT status,snapshot_sha256 FROM migration_runs WHERE run_id=?',[runId]);
    if(run?.status!=='verified'||run.snapshot_sha256!==snapshot.sha256)throw new Error('Verified matching snapshot required');
    source=openSource(snapshot.file);
    fs.writeFileSync(path.join(snapshot.folder,'schema-manifest.json'),JSON.stringify(source.tables.map(table=>({name:table.name,...table.metadata})),null,2));
    const ceilings=legacyCeilings(fs.readFileSync(path.join(rootDir,'bank','bankTransfers.js'),'utf8'));
    const result=await projectFinance(connection,source.db,runId,ceilings);
    result.playerState=await projectPlayerState(connection,source.db,runId);
    result.domains=await projectDomains(connection,source.db,runId,event=>log('[DOMAIN IMPORT] '+JSON.stringify(event)));
    result.collections=await projectPlayerCollections(connection,source.db,runId);
    const {createDatabaseRuntime}=require('../db/runtime');
    const {createLegacyReads}=require('../repositories/legacyReads');
    // The importer already holds the sole pool connection. Readback borrows it
    // serially, with real transactions but without releasing the import lease.
    const borrowed={release(){},destroy:()=>connection.destroy()};
    for(const method of ['execute','query','beginTransaction','commit','rollback'])borrowed[method]=connection[method].bind(connection);
    const readbackPool={getConnection:async()=>borrowed,execute:borrowed.execute,query:borrowed.query};
    result.profileReadback=await verifyLegacyProfiles(source.db,createLegacyReads(createDatabaseRuntime(readbackPool)));
    fs.writeFileSync(path.join(snapshot.folder,'finance-report.json'),JSON.stringify(result,null,2));
    log('[FINANCE IMPORT] VERIFIED '+JSON.stringify({...result,domains:{tables:result.domains.tables,rows:result.domains.rows}}));
    return result;
  } catch(error) {
    fs.writeFileSync(path.join(snapshot.folder,'finance-failure.json'),JSON.stringify({code:error.code||'FINANCE_IMPORT_FAILED',message:error.message,details:error.details},null,2));
    throw error;
  } finally {
    if(source)source.close();
    try {if(connection){try{if(locked)await connection.query('SELECT RELEASE_LOCK(?)',['mybot-finance-import']);}finally{connection.release();}}}
    finally {await pool.end();}
  }
}
module.exports={runFinanceImport};
