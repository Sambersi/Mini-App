'use strict';

const { createHash } = require('node:crypto');
const { withTransaction } = require('../db/transaction');
const { lockWallet, saveWallet } = require('../repositories/wallets');
const MAX = 9223372036854775807n;
function fail(code) { throw Object.assign(new Error(code), { code }); }
function integer(value) {
  if (typeof value === 'number' && !Number.isSafeInteger(value)) fail('AMOUNT_INVALID');
  if (!['string', 'bigint', 'number'].includes(typeof value) || !/^\d+$/.test(String(value))) fail('AMOUNT_INVALID');
  const amount = BigInt(value);
  if (amount > MAX) fail('AMOUNT_INVALID');
  return amount;
}
function wallet(value) {
  if (!value || typeof value.playerId !== 'string' || !/^[\x21-\x7e]{1,32}$/.test(value.playerId) ||
      !['PF', 'DF'].includes(value.asset) || !['main', 'card'].includes(value.bucket) ||
      (value.asset === 'DF' && value.bucket !== 'main')) fail('WALLET_INVALID');
  return { playerId: value.playerId, asset: value.asset, bucket: value.bucket };
}
function normalize(input) {
  if (!input || typeof input.operationKey !== 'string' || !/^[A-Za-z0-9:_-]{1,150}$/.test(input.operationKey)) fail('OPERATION_KEY_INVALID');
  const from = wallet(input.from), to = wallet(input.to);
  if (from.asset !== to.asset || JSON.stringify(from) === JSON.stringify(to)) fail('MOVEMENT_INVALID');
  const amount = input.amount === 'all' ? 'all' : String(integer(input.amount));
  if (amount === '0') fail('AMOUNT_INVALID');
  return { from, to, amount, destinationLimit: input.destinationLimit == null ? String(MAX) : String(integer(input.destinationLimit)) };
}

// Accounting primitive only. Command adapters must enforce registration, bans,
// card ownership, account limits and permissions before invoking it in runtime.
async function moveWalletFunds(pool, input) {
  const request = normalize(input);
  const key = input.operationKey;
  const hash = createHash('sha256').update(JSON.stringify(request)).digest('hex');
  return withTransaction(pool, async connection => {
    try {
      await connection.execute('INSERT INTO wallet_operations(operation_key,request_hash) VALUES (?,?)', [key, hash]);
    } catch (error) {
      if (error.code !== 'ER_DUP_ENTRY') throw error;
      const [[previous]] = await connection.execute('SELECT request_hash,result_json FROM wallet_operations WHERE operation_key=? FOR UPDATE', [key]);
      if (!previous || previous.request_hash !== hash) fail('OPERATION_KEY_CONFLICT');
      if (!previous.result_json) fail('OPERATION_INCOMPLETE');
      return JSON.parse(previous.result_json);
    }
    const ordered = [request.from, request.to].sort((a, b) => {
      const x = JSON.stringify(a), y = JSON.stringify(b);
      return x < y ? -1 : x > y ? 1 : 0;
    });
    const balances = new Map();
    for (const item of ordered) balances.set(JSON.stringify(item), await lockWallet(connection, item));
    const from = balances.get(JSON.stringify(request.from));
    const to = balances.get(JSON.stringify(request.to));
    const requested = request.amount === 'all' ? from : BigInt(request.amount);
    if (requested <= 0n || from < requested) fail('INSUFFICIENT_FUNDS');
    const room = BigInt(request.destinationLimit) - to;
    if (room <= 0n) fail('DESTINATION_LIMIT');
    const amount = requested < room ? requested : room;
    await saveWallet(connection, request.from, from - amount, -amount, 'move:' + key + ':debit');
    await saveWallet(connection, request.to, to + amount, amount, 'move:' + key + ':credit');
    const result = { amount: String(amount), fromBalance: String(from - amount), toBalance: String(to + amount), limited: amount < requested };
    await connection.execute('UPDATE wallet_operations SET result_json=? WHERE operation_key=?', [JSON.stringify(result), key]);
    return result;
  });
}

module.exports = { moveWalletFunds, normalize, integer };
