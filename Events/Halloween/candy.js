//candy.js

const { getUserById, giveCandy, takeCandy } = require('../../db');
const { Markup } = require('telegraf');
const { candyShopMenu } = require('./candyShop');

// Команда "конфеты"
async function candyHandler(ctx) {
    const userId = ctx.from?.id?.toString();
    if (!userId) return;
  
    const user = await getUserById(userId);
    if (!user) {
      return ctx.reply('❌ Вы не зарегистрированы. Используйте /start.');
    }
  
    const candyCount = user.candy || 0;
  
    const infoText = `
  <b>🍬 WINTER EVENT, акция "Конфеты"</b>
  
  <i>🍭  Собирай конфеты, играя в бота, борись за лидирующие места в топе и обменивай конфеты на приятные предложения!</i>
  
  <b>❓ Как получить конфеты?</b>
  • <b>Выигрывай в DOUBLE PLUS!</b> 20% шанс того, что при победе, вы получите от 1 до 6 конфет! Чем больше ставка, тем выше шанс выпадения! ( мин. ставка 100к )
  • <b>Выигрывай в режиме DICE!</b> 20% шанс того, что при победе, вы получите от 1 до 6 конфет! Чем больше ставка, тем выше шанс выпадения! ( мин. ставка 100к )
  • <b>За приглашенного реферал!</b> Вы получите 25 конфет!
  • <b>Забрав бонус в наших чатах,</b> вы получите от 1 до 5 конфет!
  • <b>Забрав ЕЖЕДНЕВНЫЙ бонус, в лс бота,</b> вы получите от 2 до 42 конфет!
  • <b>При активации промо-кода!</b> 15% шанс того, что вы получите от 2 до 5 конфет!
  
  <b>🍬 Ваши конфеты:</b> ${candyCount} шт.
  
  <b>🎄 Окончание ивента: 12 января!</b>
  `.trim();
  
    const keyboard = Markup.inlineKeyboard([
      [
        { text: '❄️ WINTER SHOP (Магазин)', callback_data: 'candy_shop' },
        { text: '🍬 Топ конфет', callback_data: 'candy_top' }
      ]
    ]);
  
    await ctx.replyWithHTML(infoText, keyboard);
  }
  
  async function newYearShopHandler(ctx) {
     await candyShopMenu(ctx);
  }

// Обработчик кнопки "Топ по конфетам"
async function candyTopHandler(ctx) {
  try {
    const { getAllUsers, isHyperlinkDisabled } = require('../../db');
    const users = getAllUsers();

    const topUsers = users
      .filter(u => (u.candy || 0) > 0)
      .sort((a, b) => (b.candy || 0) - (a.candy || 0))
      .slice(0, 10);

    if (topUsers.length === 0) {
      return ctx.answerCbQuery('Никто пока не получил конфеты 😢');
    }

    let topText = '🏆 <b>Топ-10 по конфетам:</b>\n\n';
    topUsers.forEach((u, i) => {
      const username = u.username || 'Неизвестный';
      const candy = u.candy || 0;
      const disableHyperlink = isHyperlinkDisabled(u.id);
      const userLink = disableHyperlink
        ? username
        : `<a href="tg://user?id=${u.id}">${username}</a>`;
      topText += `${i + 1}. ${userLink} — ${candy} 🍬\n`;
    });

    // === ЕДИНАЯ КЛАВИАТУРА С ТРЕМЯ КНОПКАМИ ===
    const keyboard = {
      inline_keyboard: [
        [{ text: '⭐️ Топ донатеров', callback_data: 'top_donators' }],
        [{ text: '👥 Топ рефералов', callback_data: 'top_referrals' }],
        [{ text: '🍬 Топ по конфетам', callback_data: 'candy_top' }],
      ],
    };

    await ctx.answerCbQuery();
    await ctx.replyWithHTML(topText, { reply_markup: keyboard });
  } catch (error) {
    console.error('[CANDY TOP] Ошибка:', error);
    await ctx.answerCbQuery('Произошла ошибка при загрузке топа.');
  }
}

module.exports = {
  candyHandler,
  candyTopHandler,
  newYearShopHandler,
};