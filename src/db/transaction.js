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

module.exports = { withTransaction };
