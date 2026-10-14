// bank/financeHandler.js
const { Markup } = require('telegraf');
const { cardInfoHandler } = require('../handlers/cardInfo');
const { handleCryptoCourses } = require('./cryptoCourses');
const { getAccountLevel } = require('../db');

const FINANCE_ACCESS_LEVEL = {
  card: 0,
  bank: 5,
  crypto: 10,
  skinMarket: 15,
};

async function getUserAccountLevel(ctx) {
  try {
    const userId = ctx.from?.id?.toString();
    if (!userId) return 0;

    return await getAccountLevel(userId);
  } catch (error) {
    console.error('[FINANCE] Ошибка получения уровня аккаунта:', error);
    return 0;
  }
}

async function requireAccountLevel(ctx, minLevel, featureName) {
  const level = await getUserAccountLevel(ctx);

  if (level < minLevel) {
    await ctx.reply(
      `🔒 ${featureName} открывается с ${minLevel} уровня.\n` +
      `Ваш текущий уровень: ${level}.`
    );
    return false;
  }

  return true;
}

async function financeHandler(ctx) {
  const level = await getUserAccountLevel(ctx);

  const rows = [
    [Markup.button.callback('💳 Карта', 'finance_open_card')],
  ];

  if (level >= FINANCE_ACCESS_LEVEL.bank) {
    rows.push([Markup.button.callback('🏦 Банк', 'finance_open_bank')]);
  }

  if (level >= FINANCE_ACCESS_LEVEL.crypto) {
    rows.push([Markup.button.callback('🪙 Крипта', 'finance_open_crypto')]);
  }

  if (level >= FINANCE_ACCESS_LEVEL.skinMarket) {
    rows.push([Markup.button.callback('🖼 Рынок скинов', 'finance_open_skin_market')]);
  }

  await ctx.reply(
    `🏦 Финансы\n` +
    `Ваш уровень: ${level}\n\n` +
    `💳 Карта — с 0 уровня\n` +
    `🏦 Банк — с 5 уровня\n` +
    `🪙 Крипта — с 10 уровня\n` +
    `🖼 Рынок скинов — с 15 уровня`,
    Markup.inlineKeyboard(rows)
  );
}

async function handleFinanceCardAction(ctx) {
  await cardInfoHandler(ctx);
}

async function handleFinanceBankAction(ctx) {
  const allowed = await requireAccountLevel(ctx, FINANCE_ACCESS_LEVEL.bank, 'Банк');
  if (!allowed) return;

  await ctx.reply(
    '🏦 Раздел «Банк» находится в разработке.\n' +
    'Позже здесь появятся кредиты и вклады.'
  );
}

async function handleFinanceCryptoAction(ctx) {
  const allowed = await requireAccountLevel(ctx, FINANCE_ACCESS_LEVEL.crypto, 'Крипта');
  if (!allowed) return;

  await handleCryptoCourses(ctx);
}

async function handleFinanceSkinMarketAction(ctx) {
  const allowed = await requireAccountLevel(ctx, FINANCE_ACCESS_LEVEL.skinMarket, 'Рынок скинов');
  if (!allowed) return;

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
  FINANCE_ACCESS_LEVEL,
};