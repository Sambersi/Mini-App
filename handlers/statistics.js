const { getUserById } = require('../db');
const { Markup } = require('telegraf');

// Обработка команды /статистика
async function statisticsHandler(ctx) {
  try {
    const userId = ctx.from.id.toString();
    const user = await getUserById(userId);

    if (!user) {
      return ctx.reply('Вы еще не зарегистрированы. Используйте команду /start для регистрации.');
    }

    const statsMessage = `
📊 Ваша детальная статистика в Double Plus:

🎲 Статистика раундов:
   🏆 Общее количество раундов: ${user.total_rounds || 0}
   ✅ Выиграно раундов: ${user.round_wins || 0}
   ❌ Проиграно раундов: ${user.round_losses || 0}

🎯 Статистика ставок:
   🎲 Общее количество ставок: ${user.double_total_bets || 0}
   ✅ Выиграно ставок: ${user.double_wins || 0}
   ❌ Проиграно ставок: ${user.double_losses || 0}

💰 Финансовая статистика:
   🏆 Общая сумма выигрышей: ${formatNumber(user.double_total_winnings || 0)} PF
   💣 Общая сумма проигрышей: ${formatNumber(user.double_total_losses || 0)} PF

⚖️ Процентное соотношение выигрышей к общим результатам: ${calculateWinRatio(
      user.double_total_winnings,
      user.double_total_losses
    )}
`.trim();

    return ctx.reply(statsMessage, { parse_mode: 'HTML' });
  } catch (error) {
    console.error('Ошибка при обработке команды /статистика:', error);
    return ctx.reply('Произошла ошибка при получении статистики.');
  }
}

// Форматирование чисел с разделением на разряды
function formatNumber(number) {
  return number.toLocaleString('ru-RU');
}

// Расчет процентного соотношения выигрышей
function calculateWinRatio(winnings, losses) {
  const total = winnings + losses;
  if (total === 0) return 'Недостаточно данных';
  const ratio = (winnings / total) * 100;
  return `${ratio.toFixed(2)}%`;
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

    // Отправляем новое сообщение с меню статистики
    await ctx.replyWithHTML(message, keyboard);
  } catch (error) {
    console.error('Ошибка при открытии меню статистики:', error);
    ctx.reply('Произошла ошибка. Попробуйте позже.');
  }
}

module.exports = { statisticsHandler, showStatisticsMenu };