'use strict';

// All statements in work use this connection. Do not retry an ambiguous commit:
// callers may retry the same operation key, which the ledger deduplicates.
async function withTransaction(pool, work) {
  const connection = await pool.getConnection();
  let broken = false;
  let committing = false;
  try {
    await connection.beginTransaction();
    const result = await work(connection);
    committing = true;
    await connection.commit();
    return result;
  } catch (error) {
    broken = committing;
    try { await connection.rollback(); } catch (_) { broken = true; }
    throw error;
  } finally {
    if (broken) connection.destroy();
    else connection.release();
  }
}

async function withDeadlockRetry(work){
  for(let attempt=0;;attempt++){
    try{return await work();}catch(error){
      if(error.code!=='ER_LOCK_DEADLOCK'||attempt>=4)throw error;
      await new Promise(resolve=>setTimeout(resolve,10*(attempt+1)));
    }
  }
}
module.exports = { withTransaction, withDeadlockRetry };
