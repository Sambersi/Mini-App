'use strict';
async function assertInactiveProjection(connection,runId){
  const [[control]]=await connection.execute('SELECT runtime_active,projection_run_id FROM runtime_control WHERE id=1');
  if(!control||Number(control.runtime_active)||control.projection_run_id!==runId)throw Object.assign(new Error('Matching inactive projection required'),{code:'MIGRATION_PROJECTION_INACTIVE_REQUIRED'});
  const [[counts]]=await connection.execute("SELECT (SELECT COUNT(*) FROM players WHERE source_run_id IS NULL OR source_run_id<>?) AS runtime_players,(SELECT COUNT(*) FROM wallet_entries WHERE source_run_id IS NULL OR entry_type<>'migration_opening') AS runtime_entries,(SELECT COUNT(*) FROM wallet_operations) AS operations,(SELECT COUNT(*) FROM telegram_payments) AS payments,(SELECT COUNT(*) FROM registration_completions) AS registrations,(SELECT COUNT(*) FROM inventory_entries) AS inventory_entries,(SELECT COUNT(*) FROM payment_inbox) AS payment_receipts",[runId]);
  if(Object.values(counts).some(value=>BigInt(value)>0n))throw Object.assign(new Error('Projection contains runtime writes'),{code:'MIGRATION_RUNTIME_WRITES_EXIST'});
  const [[inventory]]=await connection.execute('SELECT COUNT(*) AS n FROM inventory_operations');
  if(BigInt(inventory.n)>0n)throw Object.assign(new Error('Projection contains inventory operations'),{code:'MIGRATION_RUNTIME_WRITES_EXIST'});
  const [[promos]]=await connection.execute('SELECT COUNT(*) AS n FROM promo_redemptions');
  if(BigInt(promos.n)>0n)throw Object.assign(new Error('Projection contains promo redemptions'),{code:'MIGRATION_RUNTIME_WRITES_EXIST'});
  const [[bossRewards]]=await connection.execute('SELECT COUNT(*) AS n FROM boss_reward_batches');
  if(BigInt(bossRewards.n)>0n)throw Object.assign(new Error('Projection contains boss rewards'),{code:'MIGRATION_RUNTIME_WRITES_EXIST'});
  const [[decisions]]=await connection.execute('SELECT COUNT(*) AS n FROM partner_request_decisions');
  if(BigInt(decisions.n)>0n)throw Object.assign(new Error('Projection contains partner decisions'),{code:'MIGRATION_RUNTIME_WRITES_EXIST'});
}
module.exports={assertInactiveProjection};
