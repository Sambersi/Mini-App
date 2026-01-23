//bankHandler.js
const { Markup } = require('telegraf'); // Импортируем Markup для создания клавиатуры
const { cardInfoHandler } = require('../handlers/cardInfo'); // Импортируем cardInfoHandler
// Импортируем обработчики из нового модуля акций
const { handleNpfInfoShort, handleBuyShares, handleSellShares, handleShowChart } = require('./npfShares'); 

// Функция для обработки кнопки "Курс" - теперь вызывает краткую информацию об акциях
async function handleExchangeRate(ctx) {
  await handleNpfInfoShort(ctx); // Вызываем обработчик краткой информации об акциях
}

// Функция для обработки команды "Курс" - теперь вызывает краткую информацию об акциях
async function handleExchangeRateCommand(ctx) {
  await handleNpfInfoShort(ctx); // Вызываем обработчик краткой информации об акциях
}

// Функция для обработки кнопки "Финансы"
async function handleFinance(ctx) {
  await ctx.reply('Функционал финансов находится в разработке.');
}

// Функция для обработки кнопки "P2P"
async function handleP2P(ctx) {
  await ctx.reply('Функционал P2P находится в разработке.');
}

// Объект для хранения обработчиков действий
const actionHandlers = {
  'card': cardInfoHandler,
  'exchange_rate': handleExchangeRate, // Теперь вызывает handleNpfInfoShort
  'finance': handleFinance,
  'p2p': handleP2P,
};

// Основная функция для обработки команды "/банк"
async function bankHandler(ctx) {
  try {
    if (ctx.updateType === 'message') {
      // Отправляем приветственное сообщение с инлайн-клавиатурой
      const welcomeMessage = '🏦 Добро пожаловать в NPF BANK!\n\n💱 Наши услуги:';
      const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('Карта', 'card')],
        [Markup.button.callback('Курс', 'exchange_rate')], // Теперь вызывает handleNpfInfoShort
        [Markup.button.callback('Финансы', 'finance')],
        [Markup.button.callback('P2P', 'p2p')],
      ]);

      await ctx.reply(welcomeMessage, keyboard);
    } else if (ctx.updateType === 'callback_query') {
      // Обработка нажатия на кнопку
      const action = ctx.callbackQuery.data; // Получаем название действия
      console.log(`Получено нажатие на кнопку: ${action}`); // Логируем действие

      if (action in actionHandlers && typeof actionHandlers[action] === 'function') {
        await actionHandlers[action](ctx); // Вызываем соответствующий обработчик
        await ctx.answerCbQuery(); // Подтверждаем обработку нажатия
      } else {
        await ctx.reply('Произошла ошибка при обработке запроса.');
      }
    }
  } catch (error) {
    console.error('Ошибка при обработке команды "/банк":', error);
    await ctx.reply('Произошла ошибка. Попробуйте позже.');
  }
}

// Экспортируем функцию для использования в основном файле
module.exports = {
  bankHandler,
  handleExchangeRate, // Экспортируем обновлённую функцию для кнопки
  handleExchangeRateCommand, // Экспортируем функцию для команды
  handleFinance,
  handleP2P,
};