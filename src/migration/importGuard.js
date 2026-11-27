'use strict';
async function assertInactiveProjection(connection,runId){
  const [[control]]=await connection.execute('SELECT runtime_active,projection_run_id FROM runtime_control WHERE id=1');
  if(!control||Number(control.runtime_active)||control.projection_run_id!==runId)throw Object.assign(new Error('Matching inactive projection required'),{code:'MIGRATION_PROJECTION_INACTIVE_REQUIRED'});
  const [[counts]]=await connection.execute("SELECT (SELECT COUNT(*) FROM players WHERE source_run_id IS NULL OR source_run_id<>?) AS runtime_players,(SELECT COUNT(*) FROM wallet_entries WHERE source_run_id IS NULL OR entry_type<>'migration_opening') AS runtime_entries,(SELECT COUNT(*) FROM wallet_operations) AS operations,(SELECT COUNT(*) FROM telegram_payments) AS payments,(SELECT COUNT(*) FROM registration_completions) AS registrations,(SELECT COUNT(*) FROM inventory_entries) AS inventory_entries",[runId]);
  if(Object.values(counts).some(value=>BigInt(value)>0n))throw Object.assign(new Error('Projection contains runtime writes'),{code:'MIGRATION_RUNTIME_WRITES_EXIST'});
}
module.exports={assertInactiveProjection};
