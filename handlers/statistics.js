const { getUserById, getMultiplierStats } = require('../db');
const { Markup } = require('telegraf');

// Ожидаемые доли = веса множителей (сумма весов = 100)
const EXPECTED_WEIGHTS = { x2: 46, x3: 30, x5: 20, GAME: 4 };
const MIN_EVENTS = 10; // минимум отметок, иначе "мало данных"

function formatNumber(number) {
  return number.toLocaleString('ru-RU');
}

function calcWinrate(wins, losses) {
  const total = wins + losses;
  if (total === 0) return '—';
  return `${((wins / total) * 100).toFixed(1)}%`;
}

// Раскладка по множителям: фактическая доля в % и индекс к ожидаемой доле
function buildMultiplierBreakdown(stats) {
  const total = Object.values(stats).reduce((s, c) => s + c, 0);
  if (total === 0) return { total: 0, lines: [], favorite: null };
  const lines = [];
  let favorite = null;
  for (const m of ['x2', 'x3', 'x5', 'GAME']) {
    const count = stats[m] || 0;
    const actualShare = (count / total) * 100;
    const expectedShare = EXPECTED_WEIGHTS[m];
    const index = expectedShare > 0 ? actualShare / expectedShare : 0;
    lines.push(`${m} — ${actualShare.toFixed(1)}% (индекс ${index.toFixed(2)})`);
    if (count > 0 && (!favorite || index > favorite.index)) favorite = { m, index };
  }
  return { total, lines, favorite };
}

async function statisticsHandler(ctx) {
  try {
    const userId = ctx.from.id.toString();
    const user = await getUserById(userId);
    if (!user) {
      return ctx.reply('Вы еще не зарегистрированы. Используйте команду /start для регистрации.');
    }

    const totalRounds = user.total_rounds || 0;
    const roundWins = user.round_wins || 0;
    const roundLosses = user.round_losses || 0;
    const bets = user.double_total_bets || 0;
    const betWins = user.double_wins || 0;
    const betLosses = user.double_losses || 0;
    const winnings = user.double_total_winnings || 0;
    const losses = user.double_total_losses || 0;
    const gameWins = user.game_wins || 0;
    const maxWin = user.max_win_amount || 0;
    const maxBet = user.max_bet_amount || 0;
    const curStreak = user.current_win_streak || 0;
    const bestStreak = user.best_win_streak || 0;
    const net = winnings - losses;

    const breakdown = buildMultiplierBreakdown(getMultiplierStats(userId));
    const favoriteLine = breakdown.total >= MIN_EVENTS && breakdown.favorite
      ? `${breakdown.favorite.m} (индекс ${breakdown.favorite.index.toFixed(2)})`
      : '— (мало ставок)';

    const statsMessage = `
📊 <b>Ваша статистика в Double Plus</b>

🎲 <b>Раунды:</b>
🏆 Всего: ${totalRounds}
✅ Выиграно: ${roundWins}
❌ Проиграно: ${roundLosses}
⚖️ Винрейт: ${calcWinrate(roundWins, roundLosses)}

🎯 <b>Ставки:</b>
🎲 Всего: ${bets}
✅ Выиграно: ${betWins}
❌ Проиграно: ${betLosses}
⚖️ Винрейт: ${calcWinrate(betWins, betLosses)}

❤️ <b>Любимый множитель:</b> ${favoriteLine}
${breakdown.total > 0 ? `Раскладка (факт. доля / индекс к весу):\n${breakdown.lines.join('\n')}` : ''}

🃏 <b>GAME:</b>
🏆 Поймано GAME (выиграно): ${gameWins}

🔥 <b>Серии побед (одиночные ставки):</b>
⚡ Текущая: ${curStreak}
🏅 Рекорд: ${bestStreak}

🏆 <b>Рекорды:</b>
💰 Макс. выигрыш за ставку: ${formatNumber(maxWin)} PF
💸 Макс. ставка: ${formatNumber(maxBet)} PF

💰 <b>Финансы:</b>
🏆 Выигрыши: ${formatNumber(winnings)} PF
💣 Проигрыши: ${formatNumber(losses)} PF
${net >= 0 ? '📈 Профит: <b>+' : '📉 Профит: <b>'}${formatNumber(net)} PF</b>
`.trim();

    return ctx.reply(statsMessage, { parse_mode: 'HTML' });
  } catch (error) {
    console.error('Ошибка при обработке команды /статистика:', error);
    return ctx.reply('Произошла ошибка при получении статистики.');
  }
}

async function showStatisticsMenu(ctx) {
  try {
    const message = `📊 <b>Меню статистики</b>\nВыберите интересующий раздел:`;
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('🎮 Игровая статистика', 'statistics_handler')],
      [Markup.button.callback('📈 Статистика донатов', 'donation_statistics')],
      [Markup.button.callback('⬅️ Назад', 'back_to_profile')]
    ]);
    await ctx.replyWithHTML(message, keyboard);
  } catch (error) {
    console.error('Ошибка при открытии меню статистики:', error);
    ctx.reply('Произошла ошибка. Попробуйте позже.');
  }
}

module.exports = { statisticsHandler, showStatisticsMenu };