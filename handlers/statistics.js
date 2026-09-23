const { getUserById } = require('../db');
const { Markup } = require('telegraf');

// Обработка команды "статистика"
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
    const net = winnings - losses;

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

🃏 <b>GAME:</b>
🏆 Поймано GAME (выиграно): ${gameWins}

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

function formatNumber(number) {
  return number.toLocaleString('ru-RU');
}

// Винрейт по победным/проигрышным исходам
function calcWinrate(wins, losses) {
  const total = wins + losses;
  if (total === 0) return '—';
  return `${((wins / total) * 100).toFixed(1)}%`;
}

// Обработчик меню статистики — отдельное сообщение
async function showStatisticsMenu(ctx) {
  try {
    const message = `
📊 <b>Меню статистики</b>
Выберите интересующий раздел:
`;
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