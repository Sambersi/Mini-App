'use strict';

const { moveWalletFunds } = require('./walletMovement');
const { parseAmount, financePolicy } = require('./financePolicy');
const { lockControls, getBan, techAdmin, lockTotal } = require('../repositories/financeControls');

// Call only with authenticated Telegram IDs. MAIN_ADMIN comes from server
// configuration, never request data. Replies/notifications happen after commit.
function createCardFinance(pool, { mainAdmin = '', now = () => Date.now(), runTransaction } = {}) {
  return async function cardFinance({ kind, playerId, recipientId = playerId, amountText, operationKey }) {
    if (!['topup', 'withdraw', 'transfer'].includes(kind)) throw Object.assign(new Error('Invalid operation'), { code: 'FINANCE_KIND_INVALID' });
    if (kind !== 'transfer') recipientId = playerId;
    const bucket = kind === 'topup' ? 'main' : 'card';
    const targetBucket = kind === 'withdraw' ? 'main' : 'card';
    return moveWalletFunds(pool, { operationKey, amount: parseAmount(amountText),
      from: { playerId, asset: 'PF', bucket }, to: { playerId: recipientId, asset: 'PF', bucket: targetBucket } },
    async connection => {
      const controls = await lockControls(connection, [playerId, recipientId]);
      const sender = controls.get(playerId), recipient = controls.get(recipientId);
      const admin = playerId === mainAdmin || await techAdmin(connection, playerId);
      return financePolicy({ kind, sender, recipient, admin, totalBalance: kind === 'transfer' ? await lockTotal(connection, playerId) : 0n,
        senderBan: await getBan(connection, playerId), recipientBan: kind === 'transfer' ? await getBan(connection, recipientId) : null,
        nowSeconds: now() / 1000 });
    },{runTransaction,afterMove:kind==='transfer'?async(connection,result)=>{
      await connection.execute('INSERT INTO finance_log(ts,type,actor_user_id,target_user_id,amount,currency,ref,success) VALUES (?,?,?,?,?,?,?,1)',[now(),'transfer',playerId,recipientId,result.amount,'PF_CARD',operationKey]);
    }:null});
  };
}
module.exports = { createCardFinance };
