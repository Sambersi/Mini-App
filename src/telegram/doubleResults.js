'use strict';

const escapeHtml = value => String(value).replace(/[&<>]/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;',
})[character]);
const format = value => BigInt(value).toLocaleString('ru-RU');
const groupKey = row => JSON.stringify([row.chatId, row.playerId, row.multiplier]);

function buildDoubleResults({roundId, result, salt, finalMultipliers, outcomes, credits}) {
  const creditsByGroup = new Map(credits.map(credit => [groupKey(credit), credit]));
  const groups = new Map();
  for (const bet of outcomes) {
    const key = groupKey(bet);
    if (!groups.has(key)) groups.set(key, {bet, total: 0n, candies: []});
    const group = groups.get(key);
    group.total += BigInt(bet.amount);
    if (bet.candy) group.candies.push(bet.candy);
  }

  const chats = new Map();
  for (const [key, {bet, total, candies}] of groups) {
    const {chatId, playerId, username, multiplier, selected} = bet;
    if (!chats.has(chatId)) chats.set(chatId, ['<b>Итоговые результаты:</b>', '']);
    const lines = chats.get(chatId);
    const name = escapeHtml(username || 'Неизвестный');
    const player = /^\d+$/.test(playerId) ? `<a href="tg://user?id=${playerId}">${name}</a>` : name;
    const stake = `${player} ставка ${format(total)} PF на ${multiplier}`;
    const credit = creditsByGroup.get(key);
    if (!credit) {
      lines.push(`❌ ${stake} проиграла`);
      continue;
    }
    const choice = selected ? ` [${finalMultipliers[selected]}]` : '';
    lines.push(`✅ ${stake}${choice} → приз ${format(credit.gross)} PF`);
    if (BigInt(credit.burned) > 0n) {
      lines.push(`Начислено ${format(credit.credited)} PF · сверх лимита ${format(credit.burned)} PF`);
    }
    for (const candy of candies) lines.push(`🍬 +${candy} конфет`);
  }

  const image = result === 'GAME'
    ? `${finalMultipliers.left.slice(1)}l_${finalMultipliers.right.slice(1)}p.png`
    : `${result}.jpg`;
  return [...chats].map(([chatId, lines]) => {
    if (result === 'GAME') lines.push('', `<b>☑️ Результаты GAME:</b> L:${finalMultipliers.left} R:${finalMultipliers.right}`);
    lines.push('', `🔒 Хеш: ${escapeHtml(roundId)} | Проверка: ${result.replace('x', '')}|${escapeHtml(salt)}`);
    return {chatId, text: lines.join('\n'), image};
  });
}

module.exports = {buildDoubleResults};
