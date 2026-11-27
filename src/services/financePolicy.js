'use strict';

const CARD_LIMITS = [10000000,12000000,14000000,16000000,18000000,20000000,22000000,24000000,26000000,28000000,30000000,32000000,34000000,36000000,38000000,40000000,42000000,44000000,44000000,45000000];
const fail = code => { throw Object.assign(new Error(code), { code }); };
function cardLimit(level) { return BigInt(CARD_LIMITS[Number(level) - 1] || CARD_LIMITS[0]); }
// Effective old storage limits, rather than the larger instruction text. The
// old discrepancy could silently discard the excess after a full debit.
function mainLimit(level) {
  return level >= 20 ? 200000000n : level >= 15 ? 185000000n : level >= 10 ? 175000000n : 140000000n;
}
function parseAmount(text) {
  if (typeof text !== 'string') fail('AMOUNT_INVALID');
  const value = text.trim().toLowerCase();
  if (value === 'все' || value === 'всё') return 'all';
  const match = /^(\d+)(к*)$/.exec(value);
  if (!match || match[1].length > 19 || match[2].length > 6) fail('AMOUNT_INVALID');
  const amount = BigInt(match[1]) * 1000n ** BigInt(match[2].length);
  if (amount <= 0n || amount > 9223372036854775807n) fail('AMOUNT_INVALID');
  return String(amount);
}
function isBanned(ban, nowSeconds) {
  return !!ban && (!Number(ban.banned_until) || nowSeconds <= Number(ban.banned_until));
}
function financePolicy({ kind, sender, recipient, senderBan, recipientBan, nowSeconds, admin = false, totalBalance = 0n }) {
  if (!sender?.card_number) fail('CARD_REQUIRED');
  if (isBanned(senderBan, nowSeconds)) fail('SENDER_BANNED');
  if (kind === 'topup') return cardLimit(sender.account_level);
  if (kind === 'withdraw') return mainLimit(sender.account_level);
  if (kind !== 'transfer') fail('FINANCE_KIND_INVALID');
  if (!recipient?.card_number) fail('RECIPIENT_CARD_REQUIRED');
  if (sender.player_id === recipient.player_id) fail('SELF_TRANSFER');
  // sendHandler checks the sender flag before performTransfer, even for admins.
  if (sender.transfers_blocked) fail('SENDER_TRANSFERS_BLOCKED');
  if (recipient.transfers_blocked || recipient.account_blocked) fail('RECIPIENT_BLOCKED');
  if (isBanned(recipientBan, nowSeconds)) fail('RECIPIENT_BANNED');
  if (!admin && totalBalance >= BigInt(sender.transfer_ceiling)) fail('TRANSFER_CEILING');
  // Old updateCardBalance always applies this cap, including admins. Debit is
  // now reduced to match the credit instead of silently destroying the excess.
  return cardLimit(recipient.account_level);
}

module.exports = { cardLimit, mainLimit, parseAmount, isBanned, financePolicy };
