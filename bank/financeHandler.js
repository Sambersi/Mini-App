// bank/financeHandler.js
const { Markup } = require('telegraf');
const { cardInfoHandler } = require('../handlers/cardInfo');
const { handleCryptoCourses } = require('./cryptoCourses');

// Главный экран раздела «Финансы»
async function financeHandler(ctx) {
  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('💳 Карта', 'finance_open_card')],
    [Markup.button.callback('🏦 Банк', 'finance_open_bank')],
    [Markup.button.callback('🪙 Крипта', 'finance_open_crypto')],
    [Markup.button.callback('🖼 Рынок скинов', 'finance_open_skin_market')],
  ]);

  await ctx.reply('🏦 Финансы', keyboard);
}

// Кнопка: Карта
async function handleFinanceCardAction(ctx) {
  await ctx.answerCbQuery();
  await cardInfoHandler(ctx);
}

// Кнопка: Банк
async function handleFinanceBankAction(ctx) {
  await ctx.answerCbQuery();
  await ctx.reply(
    '🏦 Раздел «Банк» находится в разработке.\n' +
    'Позже здесь появятся кредиты и вклады.'
  );
}

// Кнопка: Крипта
async function handleFinanceCryptoAction(ctx) {
  await ctx.answerCbQuery();
  await handleCryptoCourses(ctx);
}

// Кнопка: Рынок скинов
async function handleFinanceSkinMarketAction(ctx) {
  await ctx.answerCbQuery();
  await ctx.reply(
    '🖼 Раздел «Рынок скинов» находится в разработке.'
  );
}

module.exports = {
  financeHandler,
  handleFinanceCardAction,
  handleFinanceBankAction,
  handleFinanceCryptoAction,
  handleFinanceSkinMarketAction,
};