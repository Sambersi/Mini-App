'use strict';
const {AsyncLocalStorage}=require('node:async_hooks');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {readMysqlConfig}=require('./mysql');
const {withTransaction}=require('./transaction');
function createDatabaseRuntime(pool){
  const context=new AsyncLocalStorage();let savepoint=0;
  const connection=()=>context.getStore()?.connection||pool;
  return {
    async initialize(){
      // Runtime never creates tables or patches schema while importing modules.
      const [versions]=await pool.query('SELECT version,checksum FROM schema_migrations');
      const directory=path.join(__dirname,'migrations');
      const files=fs.readdirSync(directory).filter(f=>/^\d+-.*\.sql$/.test(f)).sort();
      if(versions.length!==files.length)throw Object.assign(new Error('Runtime schema version mismatch'),{code:'RUNTIME_SCHEMA_VERSION'});
      for(const file of files){
        const sql=fs.readFileSync(path.join(directory,file),'utf8').replace(/\r\n/g,'\n');
        const hash=crypto.createHash('sha256').update(sql).digest('hex');
        if(!versions.some(row=>Number(row.version)===Number(file.match(/^\d+/)[0])&&row.checksum===hash))throw Object.assign(new Error('Runtime schema checksum mismatch'),{code:'RUNTIME_SCHEMA_CHECKSUM'});
      }
      const [[row]]=await pool.query('SELECT runtime_active FROM runtime_control WHERE id=1');
      if(Number(row?.runtime_active)!==1)throw Object.assign(new Error('Target database is not activated'),{code:'RUNTIME_NOT_ACTIVE'});
    },
    async one(sql,params=[]){const [rows]=await connection().execute(sql,params);return rows[0];},
    async many(sql,params=[]){const [rows]=await connection().execute(sql,params);return rows;},
    async execute(sql,params=[]){const [result]=await connection().execute(sql,params);return {changes:result.affectedRows,lastInsertRowid:result.insertId};},
    async transaction(work){
      const active=context.getStore();
      if(active){
        const name='nested_'+(++savepoint);
        await active.connection.query('SAVEPOINT '+name);
        try{const value=await work();await active.connection.query('RELEASE SAVEPOINT '+name);return value;}
        catch(error){await active.connection.query('ROLLBACK TO SAVEPOINT '+name);await active.connection.query('RELEASE SAVEPOINT '+name);throw error;}
      }
      return withTransaction(pool,c=>context.run({connection:c},work));
    },
    currentExecutor(){return connection();},
    inTransaction(){return Boolean(context.getStore());},
    async close(){await pool.end();},
  };
}
function openDatabaseRuntime(env=process.env){return createDatabaseRuntime(require('mysql2/promise').createPool(readMysqlConfig(env)));}
module.exports={createDatabaseRuntime,openDatabaseRuntime};
