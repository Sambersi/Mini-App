const {createCandyCheckout}=require('../../src/telegram/candyCheckout');
// Events/Halloween/candyShop.js

const { Markup } = require('telegraf');
const {
  getUserById,
  purchaseCandy,
} = require('../../db');

// === Сообщение после выдачи префикса ===
const prefixMessages = {
  '🎄 SNOWMAN 🎄': `
🎁 Вы получили эксклюзивный префикс: <b>🎄 SNOWMAN 🎄</b>

❕Этот префикс доступен только в рамках новогоднего ивента, позже его никак нельзя будет получить!
`.trim()
};

// === Цены в конфетах (новогодние) ===
const {prices:PRICES}=require('../../src/services/candyPurchase');

// === Главное меню магазина ===
async function candyShopMenu(ctx) {
  const userId = ctx.from?.id?.toString();
  if (!userId) return;

  const user = (await getUserById(userId));
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
const buyPfWithCandy=createCandyCheckout({sku:'pf',purchase:purchaseCandy,menu:candyShopMenu,prefixMessage:Object.values(prefixMessages)[0]});

// === Покупка билета в Колесо Фортуны ===
const buyFortuneTicket=createCandyCheckout({sku:'fortuneTicket',purchase:purchaseCandy,menu:candyShopMenu,prefixMessage:Object.values(prefixMessages)[0]});

// === Покупка НОВОГОДНЕЙ карты (скина) ===
const buyNewYearCard=createCandyCheckout({sku:'card',purchase:purchaseCandy,menu:candyShopMenu,prefixMessage:Object.values(prefixMessages)[0]});

// === Покупка префикса "🎄 SNOWMAN 🎄" ===
const buySnowmanPrefix=createCandyCheckout({sku:'prefix',purchase:purchaseCandy,menu:candyShopMenu,prefixMessage:Object.values(prefixMessages)[0]});

// === Покупка 2 GOLD контейнеров ===
const buyGoldContainers=createCandyCheckout({sku:'containers',purchase:purchaseCandy,menu:candyShopMenu,prefixMessage:Object.values(prefixMessages)[0]});

// === Экспорт всех функций ===
module.exports = {
  candyShopMenu,
  buyPfWithCandy,
  buyFortuneTicket,
  buyNewYearCard,
  buySnowmanPrefix,
  buyGoldContainers
};
