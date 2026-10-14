// handlers/cardInfo.js

const {
  getUserById,
  getCardDetails,
  saveCardNumber,
  isCardNumberUnique,
  getSelectedSkin,
  getSkinById,
} = require('../db');

const { generateCardImage } = require('../generateCard');
const fs = require('fs');
const { Markup } = require('telegraf');

// Функция для генерации случайного 16-значного номера карты
function generateCardNumber() {
  const digits = Array.from({ length: 16 }, () => Math.floor(Math.random() * 10));
  return digits.join('').replace(/(.{4})/g, '$1 ').trim();
}

// Вспомогательная функция для получения смайлика редкости скина
function getRarityEmoji(rarity) {
  const rarityEmojis = {
    ORDINARY: '🔵',
    EPIC: '🟣',
    LEGENDARY: '🟡',
    EXCLUSIVE: '⚫',
    'EXCLUSIVE+': '💎',
  };

  return rarityEmojis[rarity] || '🔵';
}

// Функция для форматирования чисел с разделителями тысяч
function formatNumber(number) {
  return Number(number || 0)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

// Безопасный ответ на callback-запрос
async function safeAnswerCbQuery(ctx, text) {
  if (!ctx.callbackQuery) return;

  try {
    await ctx.answerCbQuery(text);
  } catch (error) {
    console.warn('[CARD] Не удалось подтвердить callback:', error.message);
  }
}

// Безопасное удаление сообщения
async function safeDeleteMessage(ctx, messageId) {
  if (!messageId) return;

  try {
    await ctx.deleteMessage(messageId);
  } catch (error) {
    console.warn('[CARD] Не удалось удалить сообщение:', error.message);
  }
}

// Клавиатура меню карты: 2 колонки
// Колонка 1: Операции, Мои скины, Меню финансов
// Колонка 2: Инфо, Скин шоп, Закрыть
function createCardMenuKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('⚙️ Операции', 'manage_card'),
      Markup.button.callback('ℹ️ Инфо', 'card_info'),
    ],
    [
      Markup.button.callback('🖼 Мои скины', 'my_skins'),
      Markup.button.callback('🎨 Скин шоп', 'skin_shop'),
    ],
    [
      Markup.button.callback('💼 Меню финансов', 'finance_menu'),
      Markup.button.callback('❌ Закрыть', 'close_card_menu'),
    ],
  ]);
}

// Главное меню карты
async function cardInfoHandler(ctx) {
  try {
    const userId = ctx.from.id;

    const user = await getUserById(userId);
    if (!user) {
      return ctx.reply(
        '❌ Ошибка: Пользователь не найден. Попробуйте перезапустить бота командой /start.'
      );
    }

    const cardDetails = await getCardDetails(userId);

    if (!cardDetails || !cardDetails.card_number) {
      const message = `
🏦 <b>У вас нет зарегистрированной карты.</b>

💳 Чтобы создать карту, используйте кнопку ниже.
`.trim();

      const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('💳 Зарегистрировать карту', 'register_card')],
      ]);

      return ctx.replyWithHTML(message, keyboard);
    }

    const cardImagePath = await generateCardImage(userId, cardDetails.card_number);

    const skinId = await getSelectedSkin(userId);
    let skinInfo = null;

    if (skinId) {
      const skinData = await getSkinById(skinId);

      if (skinData) {
        skinInfo = {
          name: skinData.name,
          rarity: skinData.rarity,
        };
      }
    }

    const skinRarityEmoji = skinInfo ? getRarityEmoji(skinInfo.rarity) : null;

    try {
      if (!fs.existsSync(cardImagePath)) {
        return ctx.reply('❌ Не удалось сгенерировать изображение карты.');
      }

      const caption = `
🪪 <b>Данные вашей карты:</b>

👤 Имя владельца: ${user.username}
💳 Номер карты: <code>${cardDetails.card_number}</code>
${skinInfo ? `${skinRarityEmoji} Скин: ${skinInfo.name}` : ''}
`.trim();

      await ctx.replyWithPhoto(
        { source: cardImagePath },
        {
          caption,
          parse_mode: 'HTML',
          reply_markup: createCardMenuKeyboard().reply_markup,
        }
      );
    } finally {
      try {
        fs.unlinkSync(cardImagePath);
      } catch (error) {
        console.warn('[CARD] Не удалось удалить временный файл карты:', error.message);
      }
    }
  } catch (error) {
    console.error('[CARD] Ошибка при получении данных карты:', error);
    await ctx.reply('❌ Произошла ошибка при получении данных карты.');
  }
}

// Внутренняя функция создания карты
async function createCardForUser(ctx) {
  try {
    const userId = ctx.from.id;

    const user = await getUserById(userId);
    if (!user) {
      return ctx.reply('❌ Вы не зарегистрированы. Используйте команду /start для регистрации.');
    }

    const existingCardDetails = await getCardDetails(userId);

    if (existingCardDetails && existingCardDetails.card_number) {
      return ctx.replyWithHTML(
        `У вас уже есть зарегистрированная карта.\n\nНомер вашей карты: <code>${existingCardDetails.card_number}</code>`
      );
    }

    let cardNumber;

    do {
      cardNumber = generateCardNumber();
    } while (!(await isCardNumberUnique(cardNumber)));

    await saveCardNumber(userId, cardNumber);

    await ctx.reply('🎉 Ваша карта успешно создана!');

    // Сразу показываем меню карты
    await cardInfoHandler(ctx);
  } catch (error) {
    console.error('[CARD] Ошибка при создании карты:', error);
    await ctx.reply('❌ Произошла ошибка при создании карты.');
  }
}

// Обработчик команды "зарегистрировать карту"
async function registerCardHandler(ctx) {
  await createCardForUser(ctx);
}

// Обработчик нажатия на кнопку "Зарегистрировать карту"
async function handleRegisterCardAction(ctx) {
  await safeAnswerCbQuery(ctx);

  const messageId = ctx.callbackQuery?.message?.message_id;
  await safeDeleteMessage(ctx, messageId);

  await createCardForUser(ctx);
}

// Обработчик кнопки "Операции"
async function handleManageCardButton(ctx) {
  await safeAnswerCbQuery(ctx);

  try {
    const commandsList = `
📋 <b>Операции по карте:</b>

- пополнить [сумма] - пополнить баланс карты
- снять [сумма] - снять деньги с карты
- передать/перевод [id/номер_карты] [сумма], либо ответом на сообщение игрока - перевести деньги другому пользователю
`.trim();

    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('💳 Пополнить', 'show_topup_instruction')],
      [Markup.button.callback('💸 Снять', 'show_withdraw_instruction')],
      [Markup.button.callback('🔙 Назад', 'back_to_card_menu')],
    ]);

    await ctx.replyWithHTML(commandsList, keyboard);
  } catch (error) {
    console.error('[CARD] Ошибка при открытии операций:', error);
    await ctx.reply('❌ Произошла ошибка при получении списка операций.');
  }
}

// Обработчик кнопки "Инфо"
async function handleCardInfoButton(ctx) {
  await safeAnswerCbQuery(ctx);

  try {
    const infoMessage = `
ℹ️ <b>Информация о карте:</b>

Карта нужна для:
- хранения игровых средств
- использования игровых режимов
- переводов между игроками
- будущего функционала банка
`.trim();

    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('🔙 Назад', 'back_to_card_menu')],
    ]);

    await ctx.replyWithHTML(infoMessage, keyboard);
  } catch (error) {
    console.error('[CARD] Ошибка при открытии инфо:', error);
    await ctx.reply('❌ Произошла ошибка при получении информации о карте.');
  }
}

// Обработчик кнопки "Назад" в меню карты
async function handleBackToCardMenu(ctx) {
  await safeAnswerCbQuery(ctx);

  const messageId = ctx.callbackQuery?.message?.message_id;
  await safeDeleteMessage(ctx, messageId);

  await cardInfoHandler(ctx);
}

// Обработчик кнопки "Закрыть"
async function handleCloseCardMenu(ctx) {
  await safeAnswerCbQuery(ctx);

  const messageId = ctx.callbackQuery?.message?.message_id;
  await safeDeleteMessage(ctx, messageId);
}

module.exports = {
  cardInfoHandler,
  registerCardHandler,
  handleRegisterCardAction,
  handleManageCardButton,
  handleCardInfoButton,
  handleBackToCardMenu,
  handleCloseCardMenu,
  formatNumber,
};