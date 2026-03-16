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
  getSkinIdByName,
  addSkinToUser
} = require('../db');
const path = require('path');
const fs = require('fs');

// === ГЛОБАЛЬНОЕ ХРАНИЛИЩЕ ===
const cooldowns = new Map();
const activeSpins = new Set();

// === КОНСТАНТЫ ===
const SPIN_COOLDOWN_MS = 10_000; // 10 секунд кулдаун

// === СООБЩЕНИЯ ПОД ПРЕФИКС ===
const prefixMessages = {
  '🍀 FOTRUNA 🃏': `
🎁 <b>ЭКСКЛЮЗИВНЫЙ ПРЕФИКС!</b>

Вы получили уникальный префикс: <b>🍀 FOTRUNA 🃏</b>
Он будет отображаться перед вашим именем в топах и профиле.
Поздравляем с удачей!
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
  secret: 'pumpkin.jpg'
};

function getImagePathForPrize(prize, imagesDir) {
  const imageName = typeof prizeImageMap[prize.type] === 'function'
    ? prizeImageMap[prize.type](prize)
    : prizeImageMap[prize.type] || 'priz.jpg';
  
  const fullPath = path.join(imagesDir, imageName);
  
  if (!fs.existsSync(fullPath)) {
    console.warn(`[FORTUNE] Файл не найден: ${fullPath}, используем заглушку.`);
    return path.join(imagesDir, 'priz.jpg');
  }
  return fullPath;
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
  { title: 'СЕКРЕТНЫЙ ПРИЗ 🔒', weight: 10, type: 'secret', id: null },
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

// === КЛАВИАТУРЫ ===
// Клавиатура с кнопкой вращения (если есть билеты)
function getFortuneKeyboard(hasTickets) {
  const buttons = [];
  
  if (hasTickets) {
    buttons.push([
      { text: '🎡 Вращать', callback_data: 'spin_fortune_wheel' },
      { text: '🎫 Обменник', callback_data: 'candy_exchange' }
    ]);
  } else {
    // Если билетов нет, показываем только обменник
    buttons.push([
      { text: '🎫 Обменник (нет билетов)', callback_data: 'candy_exchange' }
    ]);
  }

  return Markup.inlineKeyboard(buttons);
}

// Клавиатура повторного вращения (только если есть билеты)
function getSpinAgainKeyboard(hasTickets) {
  if (!hasTickets) {
    return Markup.inlineKeyboard([
      [{ text: '❌ Нет билетов', callback_data: 'no_tickets_info' }]
    ]);
  }
  
  return Markup.inlineKeyboard([
    [{ text: '🎡 Вращать снова', callback_data: 'spin_fortune_wheel' }]
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
  const hasTickets = tickets > 0;

  let text = `
🎡 <b>Колесо Фортуны</b>

💰 Общий баланс: ${totalBalance.toLocaleString('ru-RU')} PF  
  • Основной: ${pfBalance.toLocaleString('ru-RU')} PF  
  • На карте: ${cardBalance.toLocaleString('ru-RU')} PF

🎫 Tickets: ${tickets} шт.
`.trim();

  if (!hasTickets) {
    text += '\n\n⚠️ <b>У вас нет билетов!</b>\nПосетите обменник, чтобы получить их.';
  }

  const imagesDir = path.join(__dirname, 'Halloween', 'imjs_fortune');
  const defaultImagePath = path.join(imagesDir, 'default.jpg');
  const keyboard = getFortuneKeyboard(hasTickets);

  try {
    if (!fs.existsSync(defaultImagePath)) {
      throw new Error('Фон не найден');
    }

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
    console.error('[FORTUNE] Ошибка отправки меню:', err);
    const fallbackMsg = ctx.callbackQuery 
      ? ctx.editMessageText(text, { parse_mode: 'HTML', ...keyboard })
      : ctx.replyWithHTML(text, keyboard);
    
    fallbackMsg.catch(e => console.error('[FORTUNE] Фоллбэк тоже не сработал:', e));
  }
}

// === ВРАЩЕНИЕ КОЛЕСА ===
async function spinFortuneWheel(ctx) {
  const userId = ctx.from?.id?.toString();
  const numericId = getUserById(userId)?.numeric_id || '—';
  const chatId = ctx.chat?.id;

  console.log(`[FORTUNE] Начало вращения для userId=${userId}, chatId=${chatId}`);

  // 1. Проверки
  if (!userId) return ctx.reply('❌ Ошибка пользователя.');
  
  if (activeSpins.has(userId)) {
    return ctx.answerCbQuery('⏳ Вращение уже идет!', { show_alert: true });
  }

  const now = Date.now();
  const lastSpin = cooldowns.get(userId);
  // ИЗМЕНЕНО: Кулдаун 10 секунд
  if (lastSpin && now - lastSpin < SPIN_COOLDOWN_MS) {
    const remaining = Math.ceil((SPIN_COOLDOWN_MS - (now - lastSpin)) / 1000);
    return ctx.answerCbQuery(`⏳ Ждите ещё ${remaining} сек.`, { show_alert: true });
  }

  const user = getUserById(userId);
  if (!user) return ctx.reply('❌ Вы не зарегистрированы.');

  const tickets = getTickets(userId);
  
  // ИЗМЕНЕНО: Проверка билетов перед запуском
  if (tickets < 1) {
    // Если билетов нет, удаляем сообщение с кнопкой (если это callback) и пишем ошибку
    if (ctx.callbackQuery && ctx.callbackQuery.message) {
        try {
            await ctx.editMessageText(
                `🎡 <b>Колесо Фортуны</b>\n\n⚠️ <b>У вас закончились билеты!</b>\n\n🎫 Текущий баланс: 0 шт.\nПосетите обменник, чтобы пополнить запас.`,
                { 
                    parse_mode: 'HTML',
                    reply_markup: getFortuneKeyboard(false).reply_markup 
                }
            );
        } catch (e) { /* Игнорируем ошибки редактирования */ }
    }
    return ctx.answerCbQuery('❌ Нет билетов! Используйте обменник.', { show_alert: true });
  }

  // 2. Списание билета
  const takeResult = takeTickets(userId, 1);
  if (!takeResult.success) {
    return ctx.answerCbQuery(`❌ ${takeResult.message}`, { show_alert: true });
  }

  activeSpins.add(userId);
  cooldowns.set(userId, now);

  // 3. Подготовка
  const imagesDir = path.join(__dirname, 'Halloween', 'imjs_fortune');
  const rotatingImagePath = path.join(imagesDir, 'rotating.jpg');
  const startImage = fs.existsSync(rotatingImagePath) ? rotatingImagePath : path.join(imagesDir, 'default.jpg');

  let message;
  try {
    message = await ctx.replyWithPhoto(
      { source: startImage },
      { caption: '🎡 <b>Колесо запускается...</b>', parse_mode: 'HTML' }
    );
    console.log(`[FORTUNE] Сообщение анимации отправлено. MessageID: ${message.message_id}`);
  } catch (e) {
    activeSpins.delete(userId);
    console.error('[FORTUNE] Ошибка отправки начального сообщения:', e);
    return ctx.reply('❌ Ошибка запуска колеса.');
  }

  // 4. Анимация
  const steps = 8;
  let delay = 100;
  
  for (let i = 0; i < steps; i++) {
    if (!activeSpins.has(userId)) break;

    if (i < 4) delay = 100;
    else if (i < 6) delay = 300;
    else delay = 600;

    const fakePrize = PRIZES[Math.floor(Math.random() * PRIZES.length)];
    const fakeImagePath = getImagePathForPrize(fakePrize, imagesDir);
    
    const caption = i === steps - 1 
      ? '🎡 <b>Выпадает...</b>' 
      : `🎡 <b>Колесо крутится...</b>\n\n🔥 Сейчас может выпасть:\n➡️ <code>${fakePrize.title}</code>`;

    try {
      await ctx.telegram.editMessageMedia(
        chatId,
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
      // Игнорируем ошибки анимации
    }
    
    await new Promise(resolve => setTimeout(resolve, delay));
  }

  // 5. ВЫДАЧА ПРИЗА
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
      const skinId = getSkinIdByName('Тыквенный спас');
      if (!skinId) throw new Error('Скин "Тыквенный спас" не найден в базе.');
      const skinResult = addSkinToUser(userId, skinId);
      if (!skinResult.success) throw new Error(skinResult.message);
    }

    const updatedUser = getUserById(userId);
    const updatedTickets = getTickets(userId);
    const pfBalance = updatedUser?.balance || 0;
    const goldContainers = updatedUser?.container_type_3 || 0;
    
    // Проверяем наличие билетов после вращения для кнопки
    const hasTicketsLeft = updatedTickets > 0;

    prizeMessage = `🎉 <b>ПОЗДРАВЛЯЕМ!</b>\n\n🎁 Вы выиграли: <b>${prize.title}</b>\n\n🎫 Ticket потрачен.`;
    prizeMessage += `\n\n🎫 <b>Tickets:</b> ${updatedTickets} шт.`;

    if (prize.type === 'pf') prizeMessage += `\n💰 <b>Баланс:</b> ${pfBalance.toLocaleString('ru-RU')} PF`;
    if (prize.type === 'containers') prizeMessage += `\n📦 <b>GOLD-контейнеры:</b> ${goldContainers} шт.`;
    if (prize.type === 'status') prizeMessage += `\n🏷 <b>Статус:</b> "${prize.name}" успешно присвоен!`;
    if (prize.type === 'prefix') prizeMessage += `\n🏷 <b>Префикс:</b> "${prize.name}" успешно выдан!`;
    if (prize.type === 'secret') prizeMessage += `\n🎃 Вам выдан хэллоуинский скин: <b>«Тыквенный спас»</b>!`;

    finalImagePath = getImagePathForPrize(prize, imagesDir);

    // 6. ФИНАЛЬНОЕ ОБНОВЛЕНИЕ
    // Шаг 6.1: Обновляем сообщение с результатом
    try {
      await ctx.telegram.editMessageMedia(
        chatId,
        message.message_id,
        null,
        {
          type: 'photo',
          media: { source: finalImagePath },
          caption: prizeMessage,
          parse_mode: 'HTML'
        }
      );
      console.log(`[FORTUNE] Результат отображен в сообщении ${message.message_id}`);
    } catch (e) {
      console.warn(`[FORTUNE] Не удалось обновить результат: ${e.message}`);
      await ctx.replyWithPhoto({ source: finalImagePath }, { caption: prizeMessage, parse_mode: 'HTML' });
    }

    // Шаг 6.2: Отправляем КНОПКУ отдельным сообщением (с проверкой билетов)
    try {
      if (hasTicketsLeft) {
        await ctx.reply(
          '🔁 <b>Желаете испытать удачу ещё раз?</b>', 
          { 
            parse_mode: 'HTML',
            ...getSpinAgainKeyboard(true) 
          }
        );
      } else {
        await ctx.reply(
          '⚠️ <b>У вас закончились билеты!</b>\nПосетите обменник, чтобы получить новые.', 
          { 
            parse_mode: 'HTML',
            ...getSpinAgainKeyboard(false) 
          }
        );
      }
      console.log(`[FORTUNE] Кнопка отправлена. Билетов осталось: ${updatedTickets}`);
    } catch (e) {
      console.error('[FORTUNE] Не удалось отправить кнопку повтора:', e);
    }

  } catch (err) {
    console.error(`[FORTUNE] Ошибка выдачи приза ${prize.type}:`, err);
    prizeMessage = `🎉 <b>ПОЗДРАВЛЯЕМ!</b>\n\n🎁 Вы выиграли: <b>${prize.title}</b>\n\n⚠️ <i>Ошибка выдачи. Обратитесь к админу.</i>`;
    finalImagePath = path.join(imagesDir, 'priz.jpg');
    success = false;
    
    // Даже при ошибке показываем актуальное состояние билетов
    const currentTickets = getTickets(userId);
    try {
        await ctx.reply(
            currentTickets > 0 
                ? '🔁 <b>Желаете испытать удачу ещё раз?</b>' 
                : '⚠️ <b>У вас закончились билеты!</b>', 
            { 
                parse_mode: 'HTML',
                ...getSpinAgainKeyboard(currentTickets > 0) 
            }
        );
    } catch (e) {}
  } finally {
    activeSpins.delete(userId);
  }

  // 7. ДОП. УВЕДОМЛЕНИЯ В ЛС
  if (success) {
    try {
      if (prize.type === 'prefix') {
        const msg = prefixMessages[prize.name] || `🎉 Вам выдан префикс "${prize.name}".`;
        await ctx.telegram.sendMessage(userId, msg, { parse_mode: 'HTML' });
      }
      
      if (prize.type === 'secret') {
        const skinImagePath = path.join(__dirname, 'Halloween', 'imjs_fortune', 'pumpkin.jpg');
        if (fs.existsSync(skinImagePath)) {
          await ctx.telegram.sendPhoto(
            userId,
            { source: skinImagePath },
            {
              caption: '🎃 <b>ЭКСКЛЮЗИВ!</b>\n\nВы выиграли редкий хэллоуинский скин:\n<b>«Тыквенный спас»</b>!\n\nПроверьте его в разделе "Мои скины".',
              parse_mode: 'HTML'
            }
          );
        }
      }
    } catch (e) {
      // Игнорируем ошибки ЛС
    }
  }

  console.log(`[FORTUNE] Итог: userId=${userId}, приз="${prize.title}", успех=${success}`);
}

module.exports = {
  fortuneWheelHandler,
  spinFortuneWheel
};