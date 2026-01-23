const { Markup } = require('telegraf');
const path = require('path');
const {
  getUserById,
  getSecretGifts,
  takeSecretGift,
  addSkinToUser, // Предполагается, что эта функция уже существует в db.js для добавления скина
  getAllSkins,   // Предполагается, что эта функция уже существует в db.js для получения всех скинов
} = require('../db');

// Путь к изображению запечатанной обёртки
const SECRET_GIFT_IMAGE_PATH = path.join(__dirname, 'Halloween', 'imjs_fortune', 'secret_gift_wrapped.jpg'); // Убедитесь, что изображение существует

// === МЕНЮ СЕКРЕТНЫХ ПАКЕТИКОВ ===
async function showSecretGiftMenu(ctx) {
  const userId = ctx.from?.id?.toString();
  if (!userId) {
    return ctx.reply('❌ Произошла ошибка. Попробуйте позже.');
  }

  const user = getUserById(userId);
  if (!user) {
    return ctx.reply('❌ Вы не зарегистрированы. Используйте /start.');
  }

  const secretGiftsCount = getSecretGifts(userId);

  let caption = `🎁 <b>Секретные Пакетики</b>\n\n`;
  caption += `У вас есть: <b>${secretGiftsCount}</b> 🎁 пакетиков.\n\n`;

  if (secretGiftsCount > 0) {
    caption += `Нажмите кнопку ниже, чтобы открыть один пакетик и получить случайный скин!`;
  } else {
    caption += `У вас нет пакетиков. Получите их, выиграв в Колесе Фортуны!`;
  }

  const keyboard = secretGiftsCount > 0
    ? Markup.inlineKeyboard([
        [{ text: '🔓 Открыть Пакетик', callback_data: 'open_secret_gift' }],
        [{ text: '🔚 Закрыть', callback_data: 'close_secret_gift_menu' }]
      ])
    : Markup.inlineKeyboard([
        [{ text: '🔚 Закрыть', callback_data: 'close_secret_gift_menu' }]
      ]);

  try {
    if (ctx.callbackQuery) {
      await ctx.answerCbQuery();
      await ctx.editMessageMedia({
        type: 'photo',
        media: { source: SECRET_GIFT_IMAGE_PATH },
        caption: caption,
        parse_mode: 'HTML',
        reply_markup: keyboard.reply_markup
      });
    } else {
      await ctx.replyWithPhoto(
        { source: SECRET_GIFT_IMAGE_PATH },
        { caption: caption, parse_mode: 'HTML', ...keyboard }
      );
    }
  } catch (err) {
    console.error('[SECRET GIFT] Ошибка отправки сообщения:', err);
    // Fallback: текст без картинки
    if (ctx.callbackQuery) {
      await ctx.answerCbQuery();
      await ctx.editMessageText(caption, {
        parse_mode: 'HTML',
        reply_markup: keyboard.reply_markup
      });
    } else {
      await ctx.replyWithHTML(caption, keyboard);
    }
  }
}

// === ОТКРЫТИЕ СЕКРЕТНОГО ПАКЕТИКА ===
async function openSecretGift(ctx) {
    const userId = ctx.from?.id?.toString();
    if (!userId) {
      console.warn('[SECRET GIFT] Попытка открытия без userId');
      return ctx.answerCbQuery('❌ Ошибка: пользователь не определён.');
    }
  
    // Проверяем наличие пакетика
    const secretGiftsCount = getSecretGifts(userId);
    if (secretGiftsCount <= 0) {
      console.warn(`[SECRET GIFT] Попытка открытия пакетика у пользователя ${userId}, но пакетиков нет (${secretGiftsCount})`);
      return ctx.answerCbQuery('❌ У вас нет пакетиков для открытия.');
    }
  
    // Списываем пакетик
    const takeResult = takeSecretGift(userId, 1);
    if (!takeResult.success) {
      console.error(`[SECRET GIFT] Ошибка списания пакетика у ${userId}: ${takeResult.message}`);
      return ctx.answerCbQuery(`❌ Ошибка: ${takeResult.message}`);
    }
  
    // Генерируем случайный скин (пока выбираем из существующих)
    const allSkins = getAllSkins(); // Предполагаем, что getAllSkins() возвращает массив объектов скинов
    if (!allSkins || allSkins.length === 0) {
      console.error(`[SECRET GIFT] Не найдено ни одного скина в базе.`);
      // Возвращаемся в меню
      await showSecretGiftMenu(ctx);
      return ctx.answerCbQuery('❌ Ошибка: не удалось найти скины для выдачи.');
    }
  
    const randomSkin = allSkins[Math.floor(Math.random() * allSkins.length)];
  
    // Выдаем скин пользователю
    const skinResult = addSkinToUser(userId, randomSkin.id); // Предполагаем, что addSkinToUser() принимает userId и skinId
    if (!skinResult.success) {
      console.error(`[SECRET GIFT] Ошибка выдачи скина "${randomSkin.title}" пользователю ${userId}: ${skinResult.message}`);
      // Возвращаемся в меню
      await showSecretGiftMenu(ctx);
      return ctx.answerCbQuery(`❌ Ошибка: ${skinResult.message}`);
    }
  
    // Подготавливаем сообщение с результатом
    const updatedSecretGiftsCount = getSecretGifts(userId);
    let resultCaption = `🎉 <b>ПОЗДРАВЛЯЕМ!</b>\n\n🎁 Вы открыли пакетик и получили:\n<b>${randomSkin.title}</b>\n\n`;
    resultCaption += `📦 У вас осталось: <b>${updatedSecretGiftsCount}</b> 🎁 пакетиков.`;
  
    // Используем изображение скина или дефолтное
    // Замена: используем file_name вместо image_path, так как это соответствует структуре БД
    const skinImagePath = randomSkin.file_name ? path.join(__dirname, '..', 'skins', randomSkin.file_name) : path.join(__dirname, 'Halloween', 'imjs_fortune', 'priz.jpg');
  
    try {
      // Редактируем текущее сообщение, заменяя изображение на изображение скина
      await ctx.telegram.editMessageMedia(
        ctx.chat.id,
        ctx.callbackQuery.message.message_id,
        null,
        {
          type: 'photo',
          media: { source: skinImagePath },
          caption: resultCaption,
          parse_mode: 'HTML'
        }
      );
    } catch (e) {
      console.error(`[SECRET GIFT] Ошибка редактирования медиа-сообщения:`, e);
      // Если редактирование не удалось, отправляем новое сообщение
      await ctx.replyWithPhoto(
        { source: skinImagePath },
        { caption: resultCaption, parse_mode: 'HTML' }
      );
    }
  
    // После небольшой паузы возвращаемся в меню
    setTimeout(async () => {
      try {
        await showSecretGiftMenu(ctx);
      } catch (e) {
        console.error('[SECRET GIFT] Ошибка при возврате в меню:', e);
      }
    }, 2000);
  }

// === ОБРАБОТЧИК КНОПКИ "ЗАКРЫТЬ" ===
async function closeSecretGiftMenu(ctx) {
  try {
    await ctx.deleteMessage();
  } catch (error) {
    console.error('Ошибка при удалении сообщения с меню пакетиков:', error);
    // Если удалить не удалось, просто отвечаем
    await ctx.answerCbQuery('Меню закрыто.');
  }
}

module.exports = {
  showSecretGiftMenu,
  openSecretGift,
  closeSecretGiftMenu
};