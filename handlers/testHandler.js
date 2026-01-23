// handlers/testHandler.js
const { Markup } = require('telegraf');

const userClicked = new Set();
const extraMessageMap = new Map(); // userId → messageId второго сообщения

async function handleTestCommand(ctx) {
  const userId = ctx.from.id;

  // Сброс состояния
  userClicked.delete(userId);
  extraMessageMap.delete(userId);

  const messageText = `🔹 Тестовое сообщение.\nНажмите кнопку ниже.`;
  const keyboard = Markup.inlineKeyboard([
    Markup.button.callback('🔄 Нажми меня', 'test_button')
  ]);

  await ctx.reply(messageText, keyboard);
}

async function handleTestButton(ctx) {
  const userId = ctx.from.id;
  const chatId = ctx.chat.id;

  let messageText;
  let buttonText;
  let shouldSendOrEditExtra = false;
  let isNewClick = false;

  if (userClicked.has(userId)) {
    // Возврат к исходному состоянию
    messageText = `🔹 Тестовое сообщение.\nНажмите кнопку ниже.`;
    buttonText = '🔄 Нажми меня';
    userClicked.delete(userId);
    shouldSendOrEditExtra = true; // редактируем доп. сообщение
  } else {
    // Первое нажатие
    messageText = `✅ Кнопка нажата!\nСостояние изменено.`;
    buttonText = '↩️ Вернуть';
    userClicked.add(userId);
    isNewClick = true;
    shouldSendOrEditExtra = true; // отправляем доп. сообщение
  }

  // Редактируем исходное сообщение
  await ctx.editMessageText(messageText, {
    parse_mode: 'HTML',
    ...Markup.inlineKeyboard([
      Markup.button.callback(buttonText, 'test_button')
    ])
  });

  // Работа с дополнительным сообщением
  if (shouldSendOrEditExtra) {
    if (isNewClick) {
      // Отправляем новое дополнительное сообщение (без кнопки)
      const extraMsg = await ctx.reply(`📩 Это дополнительное сообщение.`);
      extraMessageMap.set(userId, extraMsg.message_id);
    } else {
      // Редактируем существующее дополнительное сообщение — добавляем кнопку
      const extraMsgId = extraMessageMap.get(userId);
      if (extraMsgId) {
        await ctx.telegram.editMessageText(
          chatId,
          extraMsgId,
          undefined,
          `📩 Это дополнительное сообщение. Кнопка добавлена!`,
          {
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([
              Markup.button.callback('✅ Подтвердить', 'confirm_action')
            ])
          }
        );
        // Опционально: удаляем из мапы, если больше не нужно
        // extraMessageMap.delete(userId);
      }
    }
  }

  await ctx.answerCbQuery();
}

// Опционально: обработчик для новой кнопки
async function handleConfirmAction(ctx) {
  await ctx.answerCbQuery('✅ Подтверждено!');
  // Дополнительная логика по необходимости
}

module.exports = {
  handleTestCommand,
  handleTestButton,
  handleConfirmAction
};