// Events/fortuneWheel.js

const { Markup } = require('telegraf');
const {
  getUserById,
  getTickets,
  takeTickets,
  updateUserBalance,
  updateContainerCount,
  updateUserStatus,
  addPrefixToUser,
  getAllPrefixes,
  addSecretGift,
  getSkinIdByName,
  addSkinToUser
} = require('../db');
const path = require('path');

// === ГЛОБАЛЬНОЕ ХРАНИЛИЩЕ ===
const cooldowns = new Map();
const activeSpins = new Set();

// === СООБЩЕНИЯ ПОД ПРЕФИКС ===
const prefixMessages = {
  '🍀 FOTRUNA 🃏': `
🎁 Вы получили эксклюзивный префикс: <b>🍀 FOTRUNA 🃏</b>

Этот префикс доступен только тем, кто выиграл его в Колесе Фортуны!
Он будет отображаться перед вашим именем в топах и профиле.
`.trim()
};

// === КАРТЫ ИЗОБРАЖЕНИЙ ===
const prizeImageMap = {
  pf: 'pf.jpg',
  stars: 'stars.jpg',
  status: (prize) => {
    if (prize.name === 'Администратор') return 'admin.jpg';
    if (prize.name === 'DIAMOND') return 'diamond.jpg';
    return 'priz.jpg';
  },
  containers: 'cont.jpg',
  prefix: 'prefix.jpg',
  card: 'skin.jpg',
  secret: 'pumpkin.jpg' // ✅ Используем pumpkin.jpg для секретного приза (Хэллоуин)
};

function getImagePathForPrize(prize, imagesDir) {
  const imageName = typeof prizeImageMap[prize.type] === 'function'
    ? prizeImageMap[prize.type](prize)
    : prizeImageMap[prize.type] || 'priz.jpg';
  return path.join(imagesDir, imageName);
}

// === ПРИЗЫ ===
const PRIZES = [
  { title: '1 000 000 PF', weight: 50, type: 'pf', amount: 1000000 },
  { title: '50 ⭐️ звёзд', weight: 20, type: 'stars', amount: 5000 },
  { title: 'Админ статус', weight: 1, type: 'status', id: 1, name: 'Администратор' },
  { title: 'DIAMOND статус', weight: 2, type: 'status', id: 4, name: 'DIAMOND' },
  { title: 'Уникальная карта', weight: 5000, type: 'card', id: null },
  { title: '20 GOLD контейнеров', weight: 10, type: 'containers', amount: 20 },
  { title: 'Префикс "🍀 FOTRUNA 🃏"', weight: 2, type: 'prefix', name: '🍀 FOTRUNA 🃏' },
  { title: 'СЕКРЕТНЫЙ ПРИЗ 🔒', weight: 10, type: 'secret', id: null }, // ⚠️ Вес изменён с 100000 на 10 для реалистичности
];

function selectWeightedPrize(prizes) {
  const totalWeight = prizes.reduce((sum, p) => sum + p.weight, 0);
  let random = Math.random() * totalWeight;
  for (const prize of prizes) {
    random -= prize.weight;
    if (random <= 0) return prize;
  }
  return prizes[prizes.length - 1];
}

// === КЛАВИАТУРА ДЛЯ ПОВТОРНОГО ВРАЩЕНИЯ ===
function getSpinAgainKeyboard() {
  return Markup.inlineKeyboard([
    [{ text: '🎡 Вращать снова', callback_data: 'spin_fortune_wheel' }]
  ]);
}

// === ОСНОВНАЯ КЛАВИАТУРА КОЛЕСА ===
function getFortuneKeyboard() {
  return Markup.inlineKeyboard([
    [
      { text: '🎡 Вращать', callback_data: 'spin_fortune_wheel' },
      { text: '🎫 Получить билетики', callback_data: 'candy_exchange' }
    ]
  ]);
}

// === МЕНЮ КОЛЕСА ===
async function fortuneWheelHandler(ctx) {
  const userId = ctx.from?.id?.toString();
  if (!userId) return;

  const user = getUserById(userId);
  if (!user) {
    return ctx.reply('❌ Вы не зарегистрированы. Используйте /start.');
  }

  activeSpins.delete(userId);

  const tickets = getTickets(userId);
  const pfBalance = user.balance || 0;
  const cardBalance = user.card_balance || 0;
  const totalBalance = pfBalance + cardBalance;

  const text = `
🎡 <b>Колесо Фортуны</b>

💰 Общий баланс: ${totalBalance.toLocaleString('ru-RU')} PF  
  • Основной: ${pfBalance.toLocaleString('ru-RU')} PF  
  • На карте: ${cardBalance.toLocaleString('ru-RU')} PF

🎫 Tickets: ${tickets} шт.
`.trim();

  const imagesDir = path.join(__dirname, 'Halloween', 'imjs_fortune');
  const defaultImagePath = path.join(imagesDir, 'default.jpg');
  const keyboard = getFortuneKeyboard();

  try {
    if (ctx.callbackQuery) {
      await ctx.answerCbQuery();
      await ctx.editMessageMedia({
        type: 'photo',
        media: { source: defaultImagePath },
        caption: text,
        parse_mode: 'HTML',
        reply_markup: keyboard.reply_markup
      });
    } else {
      await ctx.replyWithPhoto(
        { source: defaultImagePath },
        { caption: text, parse_mode: 'HTML', ...keyboard }
      );
    }
  } catch (err) {
    console.error('[FORTUNE] Ошибка отправки default.jpg:', err);
    if (ctx.callbackQuery) {
      await ctx.answerCbQuery();
      await ctx.editMessageText(text, {
        parse_mode: 'HTML',
        reply_markup: keyboard.reply_markup
      });
    } else {
      await ctx.replyWithHTML(text, keyboard);
    }
  }
}

// === ВРАЩЕНИЕ КОЛЕСА ===
async function spinFortuneWheel(ctx) {
  const userId = ctx.from?.id?.toString();
  const username = ctx.from?.username || 'Неизвестный';
  const numericId = getUserById(userId)?.numeric_id || '—';

  // ✅ УДАЛЕНИЕ СООБЩЕНИЯ С КНОПКОЙ "ВРАЩАТЬ СНОВА", ЕСЛИ ОНО СУЩЕСТВУЕТ
  if (ctx.callbackQuery && ctx.callbackQuery.message) {
    try {
      await ctx.deleteMessage(); // Удаляет сообщение с кнопкой
    } catch (err) {
      // Игнорируем, если сообщение уже удалено или недоступно
    }

    try {
      await ctx.answerCbQuery();
    } catch (err) {
      // Игнорируем просроченные запросы
    }
  }

  if (!userId) {
    return ctx.reply('❌ Ошибка: пользователь не определён.');
  }

  if (activeSpins.has(userId)) {
    return ctx.reply('✅ Вращение уже запущено! Дождитесь результата.');
  }

  const now = Date.now();
  const lastSpin = cooldowns.get(userId);
  if (lastSpin && now - lastSpin < 15_000) {
    const remaining = Math.ceil((15_000 - (now - lastSpin)) / 1000);
    return ctx.reply(`⏳ Подождите ещё ${remaining} сек. перед следующим вращением.`);
  }

  const user = getUserById(userId);
  if (!user) {
    return ctx.reply('❌ Вы не зарегистрированы.');
  }

  const tickets = getTickets(userId);
  if (tickets < 1) {
    return ctx.reply('❌ Нужен хотя бы 1 🎫.');
  }

  const takeResult = takeTickets(userId, 1);
  if (!takeResult.success) {
    return ctx.reply(`❌ Ошибка: ${takeResult.message}`);
  }

  activeSpins.add(userId);
  cooldowns.set(userId, now);

  const imagesDir = path.join(__dirname, 'Halloween', 'imjs_fortune');
  const rotatingImagePath = path.join(imagesDir, 'rotating.jpg');

  let message;
  try {
    message = await ctx.replyWithPhoto(
      { source: rotatingImagePath },
      { caption: '🎡 <b>Колесо крутится...</b>', parse_mode: 'HTML' }
    );
  } catch (e) {
    activeSpins.delete(userId);
    return ctx.reply('❌ Не удалось начать вращение. Попробуйте позже.');
  }

  // === Анимация вращения ===
  const steps = 6;
  let baseDelay = 250;
  for (let i = 0; i < steps; i++) {
    if (!activeSpins.has(userId)) break;

    const fakePrize = PRIZES[Math.floor(Math.random() * PRIZES.length)];
    const fakeImagePath = getImagePathForPrize(fakePrize, imagesDir);
    const caption = `🎡 <b>Колесо крутится...</b>\n\n🔥 Сейчас выпадет:\n➡️ <code>${fakePrize.title}</code> ⬅️`;

    try {
      await ctx.telegram.editMessageMedia(
        ctx.chat.id,
        message.message_id,
        null,
        {
          type: 'photo',
          media: { source: fakeImagePath },
          caption: caption,
          parse_mode: 'HTML'
        }
      );
    } catch (e) {
      // ignore
    }
    const currentDelay = Math.max(50, baseDelay - i * 35);
    await new Promise(resolve => setTimeout(resolve, currentDelay));
  }

  // === ВЫДАЧА РЕАЛЬНОГО ПРИЗА ===
  const prize = selectWeightedPrize(PRIZES);
  let prizeMessage = '';
  let finalImagePath = null;
  let success = true;

  try {
    if (prize.type === 'pf') {
      await updateUserBalance(userId, prize.amount);
    } else if (prize.type === 'containers') {
      const res = updateContainerCount(userId, 3, prize.amount);
      if (!res.success) throw new Error(res.message);
    } else if (prize.type === 'status') {
      const res = await updateUserStatus(userId, prize.id);
      if (!res.success) throw new Error(res.message);
    } else if (prize.type === 'prefix') {
      const prefix = getAllPrefixes().find(p => p.prefix === prize.name);
      if (!prefix) throw new Error(`Префикс "${prize.name}" не найден`);
      const added = addPrefixToUser(userId, prefix.id);
      if (!added) throw new Error('Не удалось добавить префикс');
    } else if (prize.type === 'secret') {
      // === ВЫДАЧА ХЭЛЛОУИНСКОГО СКИНА ===
      const skinId = getSkinIdByName('Тыквенный спас');
      if (!skinId) {
        throw new Error('Скин "Тыквенный спас" не найден в базе.');
      }
      const skinResult = addSkinToUser(userId, skinId);
      if (!skinResult.success) {
        throw new Error(skinResult.message);
      }
      // addSecretGift НЕ вызывается — заменён на скин
    }

    const updatedUser = getUserById(userId);
    const updatedTickets = getTickets(userId);
    const pfBalance = updatedUser?.balance || 0;
    const goldContainers = updatedUser?.container_type_3 || 0;

    prizeMessage = `🎉 <b>ПОЗДРАВЛЯЕМ!</b>\n\n🎁 Вы выиграли: <b>${prize.title}</b>\n\n🎫 Ticket потрачен.`;
    prizeMessage += `\n\n🎫 <b>Tickets:</b> ${updatedTickets} шт.`;

    if (prize.type === 'pf') prizeMessage += `\n💰 <b>Баланс:</b> ${pfBalance.toLocaleString('ru-RU')} PF`;
    if (prize.type === 'containers') prizeMessage += `\n📦 <b>GOLD-контейнеры:</b> ${goldContainers} шт.`;
    if (prize.type === 'status') prizeMessage += `\n🏷 <b>Статус:</b> "${prize.name}" успешно присвоен!`;
    if (prize.type === 'prefix') prizeMessage += `\n🏷 <b>Префикс:</b> "${prize.name}" успешно выдан!`;
    if (prize.type === 'secret') prizeMessage += `\n🎃 Вам выдан хэллоуинский скин: <b>«Тыквенный спас»</b>!`;

    finalImagePath = getImagePathForPrize(prize, imagesDir);
  } catch (err) {
    console.error(`[FORTUNE] Ошибка выдачи приза ${prize.type} пользователю ${userId}:`, err);
    prizeMessage = `🎉 <b>ПОЗДРАВЛЯЕМ!</b>\n\n🎁 Вы выиграли: <b>${prize.title}</b>\n\n❌ Ошибка при выдаче приза.`;
    finalImagePath = path.join(imagesDir, 'priz.jpg');
    success = false;
  } finally {
    activeSpins.delete(userId);
  }

  // === ОТПРАВКА РЕЗУЛЬТАТА БЕЗ КНОПОК ===
  let resultMsg;
  try {
    resultMsg = await ctx.telegram.editMessageMedia(
      ctx.chat.id,
      message.message_id,
      null,
      {
        type: 'photo',
        media: { source: finalImagePath },
        caption: prizeMessage,
        parse_mode: 'HTML'
      }
    );
  } catch (e) {
    resultMsg = await ctx.replyWithPhoto(
      { source: finalImagePath },
      { caption: prizeMessage, parse_mode: 'HTML' }
    );
  }

  // === ОТПРАВКА КНОПКИ "ВРАЩАТЬ СНОВА" ===
  try {
    await ctx.reply('🔁 Хотите вращать ещё раз?', getSpinAgainKeyboard());
  } catch (e) {
    console.warn(`[FORTUNE] Не удалось отправить кнопку повтора для ${userId}`);
  }

  // === ДОП. СООБЩЕНИЕ О ПРЕФИКСЕ ===
  if (success && prize.type === 'prefix') {
    const msg = prefixMessages[prize.name] || `🎉 Вам выдан префикс "${prize.name}".`;
    try {
      await ctx.telegram.sendMessage(userId, msg, { parse_mode: 'HTML' });
    } catch (e) {
      console.warn(`[FORTUNE] Не удалось отправить сообщение о префиксе пользователю ${userId}`);
    }
  }

  // === ДОП. СООБЩЕНИЕ О ХЭЛЛОУИНСКОМ СКИНЕ ===
  if (success && prize.type === 'secret') {
    const skinImagePath = path.join(__dirname, 'Halloween', 'imjs_fortune', 'pumpkin.jpg');
    try {
      await ctx.telegram.sendPhoto(
        userId,
        { source: skinImagePath },
        {
          caption: '🎃 <b>Поздравляем!</b>\n\nВы выиграли эксклюзивный хэллоуинский скин:\n<b>«Тыквенный спас»</b>!\n\nОн уже добавлен в ваш инвентарь.',
          parse_mode: 'HTML'
        }
      );
    } catch (e) {
      console.warn(`[FORTUNE] Не удалось отправить сообщение о скине "Тыквенный спас" пользователю ${userId}`);
    }
  }

  console.log(`[FORTUNE] Вращение завершено: userId=${userId}, numericId=${numericId}, приз="${prize.title}"`);
}

module.exports = {
  fortuneWheelHandler,
  spinFortuneWheel
};