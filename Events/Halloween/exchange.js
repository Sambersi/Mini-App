// Events/Halloween/exchange.js

const { getUserById, takeCandy, giveTickets, getTickets } = require('../../db');
const { Markup } = require('telegraf');

// Курс обмена: 1 билетик = 250 конфет
const CANDY_PER_TICKET = 250;

// Главное меню обмена
async function exchangeCandyToTickets(ctx) {
  const userId = ctx.from?.id?.toString();
  if (!userId) return;

  const user = getUserById(userId);
  if (!user) {
    return ctx.reply('❌ Вы не зарегистрированы. Используйте /start.');
  }

  const candy = user.candy || 0;
  const tickets = getTickets(userId);

  const maxTicketsFromCandy = Math.floor(candy / CANDY_PER_TICKET);

  // Добавлена кнопка "WINTER SHOP"
  const keyboard = Markup.inlineKeyboard([
    [
      { text: '🎫 Обменять 1 билетик', callback_data: 'exchange_one_ticket' },
      { text: '🔄 Обменять всё', callback_data: 'exchange_all_candy' }
    ],
    [{ text: '🎡 Вращать колесо', callback_data: 'halloween_fortune' }],
    [{ text: '❄️ WINTER SHOP', callback_data: 'candy_shop' }] // ← КНОПКА МАГАЗИНА
  ]);

  const text = `
🔄 <b>Обмен конфет на Tickets</b>

🍬 Конфеты: ${candy} шт.  
🎫 Tickets: ${tickets} шт.

🔁 Курс обмена: ${CANDY_PER_TICKET} конфет = 1 Ticket  
✅ Максимум можно обменять: ${maxTicketsFromCandy} Tickets
`.trim();

  if (ctx.callbackQuery) {
    await ctx.answerCbQuery();
    try {
      await ctx.editMessageText(text, {
        parse_mode: 'HTML',
        reply_markup: keyboard.reply_markup
      });
    } catch (error) {
      console.warn('[EXCHANGE] Ошибка редактирования сообщения:', error.message);
      await ctx.replyWithHTML(text, keyboard);
    }
  } else {
    await ctx.replyWithHTML(text, keyboard);
  }
}

// Обменять 1 билетик (10 конфет → 1 билетик)
async function exchangeOneTicket(ctx) {
  const userId = ctx.from?.id?.toString();
  if (!userId) return;

  const user = getUserById(userId);
  if (!user) {
    return ctx.answerCbQuery('❌ Вы не зарегистрированы.');
  }

  const candy = user.candy || 0;
  if (candy < CANDY_PER_TICKET) {
    return ctx.answerCbQuery(`❌ Недостаточно конфет. Нужно минимум ${CANDY_PER_TICKET}.`);
  }

  const takeResult = takeCandy(userId, CANDY_PER_TICKET);
  if (!takeResult.success) {
    return ctx.answerCbQuery(`❌ Не удалось списать конфеты: ${takeResult.message}`);
  }

  const giveResult = giveTickets(userId, 1);
  if (!giveResult.success) {
    takeCandy(userId, -CANDY_PER_TICKET);
    return ctx.answerCbQuery(`❌ Ошибка при выдаче билетика.`);
  }

  await ctx.answerCbQuery(`✅ Обмен выполнен: ${CANDY_PER_TICKET} 🍬 → 1 🎫`);
  await exchangeCandyToTickets(ctx);
}

// Обменять все конфеты
async function exchangeAllCandy(ctx) {
  const userId = ctx.from?.id?.toString();
  if (!userId) return;

  const user = getUserById(userId);
  if (!user) {
    return ctx.answerCbQuery('❌ Вы не зарегистрированы.');
  }

  const candy = user.candy || 0;
  if (candy < CANDY_PER_TICKET) {
    return ctx.answerCbQuery(`❌ Недостаточно конфет для обмена. Нужно минимум ${CANDY_PER_TICKET}.`);
  }

  const ticketsToGive = Math.floor(candy / CANDY_PER_TICKET);
  const candyToTake = ticketsToGive * CANDY_PER_TICKET;

  const takeResult = takeCandy(userId, candyToTake);
  if (!takeResult.success) {
    return ctx.answerCbQuery(`❌ Не удалось списать конфеты: ${takeResult.message}`);
  }

  const giveResult = giveTickets(userId, ticketsToGive);
  if (!giveResult.success) {
    takeCandy(userId, -candyToTake);
    return ctx.answerCbQuery(`❌ Ошибка при выдаче билетиков.`);
  }

  await ctx.answerCbQuery(`✅ Успешно обменяно: ${candyToTake} 🍬 → ${ticketsToGive} 🎫`);
  await exchangeCandyToTickets(ctx);
}

module.exports = {
  exchangeCandyToTickets,
  exchangeOneTicket,
  exchangeAllCandy,
};