'use strict';
const fs=require('node:fs'),path=require('node:path');
const {readMysqlConfig}=require('../db/mysql');
const {applyFoundation}=require('../db/migrate');
const {openSource}=require('./sqliteSource');
const {createImportSnapshot,validateRunId}=require('./stageTwo');
const {legacyCeilings,projectFinance}=require('./projectFinance');
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
    const ceilings=legacyCeilings(fs.readFileSync(path.join(rootDir,'bank','bankTransfers.js'),'utf8'));
    const result=await projectFinance(connection,source.db,runId,ceilings);
    fs.writeFileSync(path.join(snapshot.folder,'finance-report.json'),JSON.stringify(result,null,2));
    log('[FINANCE IMPORT] VERIFIED '+JSON.stringify(result));
    return result;
  } finally {
    if(source)source.close();
    try {if(connection){try{if(locked)await connection.query('SELECT RELEASE_LOCK(?)',['mybot-finance-import']);}finally{connection.release();}}}
    finally {await pool.end();}
  }
}
module.exports={runFinanceImport};
