// Events/Halloween/candyShop.js

const { Markup } = require('telegraf');
const {
  getUserById,
  takeCandy,
  updateUserBalance,
  addPrefixToUser,
  decreaseContainerCount,
  updateUserSelectedSkin,
  giveCandy,
  getAllPrefixes
} = require('../../db');

// === Сообщение после выдачи префикса ===
const prefixMessages = {
  '🎄 SNOWMAN 🎄': `
🎁 Вы получили эксклюзивный префикс: <b>🎄 SNOWMAN 🎄</b>

❕Этот префикс доступен только в рамках новогоднего ивента, позже его никак нельзя будет получить!
`.trim()
};

// === Цены в конфетах (новогодние) ===
const PRICES = {
  pf: 100,                // 1 000 000 PF за 80 конфет
  fortuneTicket: 250,    // Билет в Колесо Фортуны
  card: 700,             // НОВОГОДНЯЯ карта
  prefix: 100,            // Префикс "🎄 SNOWMAN 🎄"
  containers: 80         // 2 GOLD контейнера
};

// === Главное меню магазина ===
async function candyShopMenu(ctx) {
  const userId = ctx.from?.id?.toString();
  if (!userId) return;

  const user = getUserById(userId);
  if (!user) {
    return ctx.reply('❌ Вы не зарегистрированы. Используйте /start.');
  }

  const candy = user.candy || 0;

  const text = `
❄️ <b>НОВОГОДНИЙ МАГАЗИН</b>

🎁 <b>Товары:</b>
1. 1 000 000 PF — ${PRICES.pf} 🍬
2. Ticket в Колесо Фортуны — ${PRICES.fortuneTicket} 🍬
3. НОВОГОДНЯЯ карта — ${PRICES.card} 🍬
4. Префикс "🎄 SNOWMAN 🎄" — ${PRICES.prefix} 🍬
5. 2 GOLD контейнера — ${PRICES.containers} 🍬

🍬 <b>Ваш баланс конфет:</b> ${candy} шт.
`.trim();

  const keyboard = Markup.inlineKeyboard([
    [{ text: '💰 Купить PF', callback_data: 'buy_pf_with_candy' }],
    [{ text: '🎡 Купить Ticket', callback_data: 'buy_fortune_ticket' }],
    [{ text: '🎁 Купить карту', callback_data: 'buy_new_year_card' }],
    [{ text: '⛄ Купить префикс', callback_data: 'buy_snowman_prefix' }],
    [{ text: '📦 Купить контейнеры', callback_data: 'buy_gold_containers' }]
  ]);

  if (ctx.callbackQuery) {
    await ctx.answerCbQuery();
    try {
      await ctx.editMessageText(text, {
        parse_mode: 'HTML',
        reply_markup: keyboard.reply_markup
      });
    } catch (err) {
      await ctx.replyWithHTML(text, keyboard);
    }
  } else {
    await ctx.replyWithHTML(text, keyboard);
  }
}

// === Покупка 1 000 000 PF за конфеты ===
async function buyPfWithCandy(ctx) {
  const userId = ctx.from?.id?.toString();
  if (!userId) return;

  const user = getUserById(userId);
  if (!user) return ctx.answerCbQuery('❌ Вы не зарегистрированы.');

  const candy = user.candy || 0;
  if (candy < PRICES.pf) {
    return ctx.answerCbQuery(`❌ Недостаточно конфет. Нужно ${PRICES.pf} 🍬.`);
  }

  const takeResult = takeCandy(userId, PRICES.pf);
  if (!takeResult.success) {
    return ctx.answerCbQuery(`❌ Ошибка: ${takeResult.message}`);
  }

  try {
    updateUserBalance(userId, 1000000);
  } catch (e) {
    giveCandy(userId, PRICES.pf);
    return ctx.answerCbQuery('❌ Не удалось выдать PF.');
  }

  await ctx.answerCbQuery(`☑️ Вы успешно купили 1 000 000 PF за ${PRICES.pf} конфет!`);
  await candyShopMenu(ctx);
}

// === Покупка билета в Колесо Фортуны ===
async function buyFortuneTicket(ctx) {
  const userId = ctx.from?.id?.toString();
  if (!userId) return;

  const user = getUserById(userId);
  if (!user) return ctx.answerCbQuery('❌ Вы не зарегистрированы.');

  const candy = user.candy || 0;
  if (candy < PRICES.fortuneTicket) {
    return ctx.answerCbQuery(`❌ Нужно ${PRICES.fortuneTicket} 🍬 для покупки билета.`);
  }

  const takeResult = takeCandy(userId, PRICES.fortuneTicket);
  if (!takeResult.success) {
    return ctx.answerCbQuery(`❌ Ошибка: ${takeResult.message}`);
  }

  await ctx.answerCbQuery(`☑️ Вы купили 🎡 Билет в Колесо Фортуны за ${PRICES.fortuneTicket} конфет!`);
  await candyShopMenu(ctx);
}

// === Покупка НОВОГОДНЕЙ карты (скина) ===
async function buyNewYearCard(ctx) {
  const userId = ctx.from?.id?.toString();
  if (!userId) return;

  const user = getUserById(userId);
  if (!user) return ctx.answerCbQuery('❌ Вы не зарегистрированы.');

  const candy = user.candy || 0;
  if (candy < PRICES.card) {
    return ctx.answerCbQuery(`❌ Нужно ${PRICES.card} 🍬 для покупки карты.`);
  }

  const takeResult = takeCandy(userId, PRICES.card);
  if (!takeResult.success) {
    return ctx.answerCbQuery(`❌ Ошибка: ${takeResult.message}`);
  }

  try {
    updateUserSelectedSkin(userId, 1001); // ← замените на реальный ID скина
  } catch (e) {
    giveCandy(userId, PRICES.card);
    return ctx.answerCbQuery('❌ Не удалось выдать НОВОГОДНЮЮ карту.');
  }

  await ctx.answerCbQuery(`☑️ Вы получили НОВОГОДНЮЮ карту за ${PRICES.card} конфет!`);
  await candyShopMenu(ctx);
}

// === Покупка префикса "🎄 SNOWMAN 🎄" ===
async function buySnowmanPrefix(ctx) {
  const userId = ctx.from?.id?.toString();
  if (!userId) return;

  const user = getUserById(userId);
  if (!user) return ctx.answerCbQuery('❌ Вы не зарегистрированы.');

  const candy = user.candy || 0;
  const PREFIX_NAME = '🎄 SNOWMAN 🎄';

  if (candy < PRICES.prefix) {
    return ctx.answerCbQuery(`❌ Нужно ${PRICES.prefix} 🍬 для покупки префикса.`);
  }

  // --- Проверка: есть ли уже префикс у пользователя ---
  let prefixIds = [];
  try {
    prefixIds = JSON.parse(user.prefix_ids || '[]');
  } catch (e) {
    prefixIds = [];
  }

  // --- Получаем ID префикса по названию ---
  const allPrefixes = getAllPrefixes();
  const prefixObj = allPrefixes.find(p => p.prefix === PREFIX_NAME);
  if (!prefixObj) {
    return ctx.answerCbQuery('❌ Префикс недоступен для покупки.');
  }

  const PREFIX_ID = prefixObj.id;

  if (prefixIds.includes(PREFIX_ID)) {
    return ctx.answerCbQuery('❌ У вас уже есть этот префикс. Покупка возможна только один раз.');
  }

  // --- Списание конфет ---
  const takeResult = takeCandy(userId, PRICES.prefix);
  if (!takeResult.success) {
    return ctx.answerCbQuery(`❌ Ошибка: ${takeResult.message}`);
  }

  // --- Выдача префикса ---
  const added = addPrefixToUser(userId, PREFIX_ID);
  if (!added) {
    giveCandy(userId, PRICES.prefix);
    return ctx.answerCbQuery('❌ Не удалось выдать префикс.');
  }

  // --- Уведомление + отдельное сообщение ---
  await ctx.answerCbQuery(`☑️ Вы получили префикс "${PREFIX_NAME}" за ${PRICES.prefix} конфет!`);

  try {
    const msgText = prefixMessages[PREFIX_NAME] || `🎉 Вам выдан префикс "${PREFIX_NAME}".`;
    await ctx.telegram.sendMessage(userId, msgText, { parse_mode: 'HTML' });
  } catch (e) {
    console.warn('Не удалось отправить сообщение о выдаче префикса:', e);
  }

  await candyShopMenu(ctx);
}

// === Покупка 2 GOLD контейнеров ===
async function buyGoldContainers(ctx) {
  const userId = ctx.from?.id?.toString();
  if (!userId) return;

  const user = getUserById(userId);
  if (!user) return ctx.answerCbQuery('❌ Вы не зарегистрированы.');

  const candy = user.candy || 0;
  if (candy < PRICES.containers) {
    return ctx.answerCbQuery(`❌ Нужно ${PRICES.containers} 🍬 для покупки 2 GOLD контейнеров.`);
  }

  const takeResult = takeCandy(userId, PRICES.containers);
  if (!takeResult.success) {
    return ctx.answerCbQuery(`❌ Ошибка: ${takeResult.message}`);
  }

  const result = decreaseContainerCount(userId, 3, -2);
  if (!result.success) {
    giveCandy(userId, PRICES.containers);
    return ctx.answerCbQuery(`❌ Ошибка при выдаче контейнеров: ${result.message}`);
  }

  await ctx.answerCbQuery(`☑️ Вы получили 2 GOLD контейнера за ${PRICES.containers} конфет!`);
  await candyShopMenu(ctx);
}

// === Экспорт всех функций ===
module.exports = {
  candyShopMenu,
  buyPfWithCandy,
  buyFortuneTicket,
  buyNewYearCard,
  buySnowmanPrefix,
  buyGoldContainers
};