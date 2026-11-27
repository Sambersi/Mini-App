'use strict';

async function lockWallet(connection, wallet) {
  const [[row]] = await connection.execute(
    'SELECT balance FROM wallets WHERE player_id=? AND asset=? AND bucket=? FOR UPDATE',
    [wallet.playerId, wallet.asset, wallet.bucket]);
  if (!row) throw Object.assign(new Error('Wallet is missing'), { code: 'WALLET_MISSING' });
  return BigInt(row.balance);
}

async function saveWallet(connection, wallet, balance, delta, operationKey) {
  const values = [wallet.playerId, wallet.asset, wallet.bucket];
  const [result] = await connection.execute(
    'UPDATE wallets SET balance=? WHERE player_id=? AND asset=? AND bucket=?', [String(balance), ...values]);
  if (result.affectedRows !== 1) throw Object.assign(new Error('Wallet update failed'), { code: 'WALLET_UPDATE_FAILED' });
  await connection.execute(
    'INSERT INTO wallet_entries(operation_key,player_id,asset,bucket,amount,entry_type,source_run_id) VALUES (?,?,?,?,?,?,NULL)',
    [operationKey, ...values, String(delta), 'movement']);
}

module.exports = { lockWallet, saveWallet };
