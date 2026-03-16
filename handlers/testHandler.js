// handlers/testHandler.js
const { Markup } = require('telegraf');
const path = require('path');
const fs = require('fs');

// Используем Map для хранения состояния: userId -> 'image' | 'text'
const userState = new Map();

// Путь к тестовой картинке (замените на свой файл)
// Убедитесь, что файл существует по этому пути относительно папки проекта
const TEST_IMAGE_PATH = path.join(__dirname, '../images', 'girl.jpg'); 

async function handleTestCommand(ctx) {
  const userId = ctx.from.id;

  // Сброс состояния
  userState.delete(userId);

  const messageText = `🔹 Тестовое сообщение.\nНажмите кнопку ниже, чтобы увидеть картинку.`;
  
  const keyboard = Markup.inlineKeyboard([
    Markup.button.callback('🔄 Показать картинку', 'test_button')
  ]);

  await ctx.reply(messageText, keyboard);
}

async function handleTestButton(ctx) {
  const userId = ctx.from.id;
  const currentState = userState.get(userId) || 'text';
  
  let newState;
  let messageCaption;
  let buttonText;
  let needToSendImage = false;
  let needToRemoveImage = false;

  if (currentState === 'text') {
    // ПЕРЕХОД К КАРТИНКЕ
    newState = 'image';
    messageCaption = `✅ <b>Картинка загружена!</b>\n\nЭто сообщение теперь содержит изображение и кнопку подтверждения.`;
    buttonText = '↩️ Вернуть текст';
    needToSendImage = true;
  } else {
    // ВОЗВРАТ К ТЕКСТУ
    newState = 'text';
    messageCaption = `🔹 Тестовое сообщение.\nНажмите кнопку ниже, чтобы увидеть картинку.`;
    buttonText = '🔄 Показать картинку';
    needToRemoveImage = true;
  }

  try {
    if (needToSendImage) {
      // Проверяем наличие файла
      if (!fs.existsSync(TEST_IMAGE_PATH)) {
        return ctx.answerCbQuery('❌ Ошибка: Файл картинки не найден на сервере!', { show_alert: true });
      }

      // Используем editMessageMedia для замены текста на фото
      await ctx.editMessageMedia(
        {
          type: 'photo',
          media: { source: TEST_IMAGE_PATH },
          caption: messageCaption,
          parse_mode: 'HTML'
        },
        Markup.inlineKeyboard([
          Markup.button.callback(buttonText, 'test_button'),
          Markup.button.callback('✅ Подтвердить', 'confirm_action')
        ])
      );
    } 
    else if (needToRemoveImage) {
      // Используем editMessageMedia для замены фото на текст (пустой медиа-группы не бывает, 
      // но мы можем отправить "пустую" картинку-заглушку или просто изменить текст, если бы это был альбом.
      // НО! Telegram НЕ позволяет заменить Фото на Текст через editMessageMedia напрямую.
      // РАБОЧЕЕ РЕШЕНИЕ: Удалить сообщение и отправить новое, ИЛИ использовать трюк.
      
      // Самый надежный способ без удаления: 
      // К сожалению, API Telegram строго запрещает менять тип медиа (Photo -> Text).
      // Единственный плавный вариант без удаления сообщения — это заменить текущее фото на ДРУГОЕ фото (например, черный квадрат),
      // либо удалить сообщение и отправить новое.
      
      // ВАРИАНТ А (Удаление и отправка нового - самый чистый):
      await ctx.deleteMessage();
      await ctx.reply(messageCaption, Markup.inlineKeyboard([
        Markup.button.callback(buttonText, 'test_button')
      ]));
      
      // Обновляем состояние (хотя сообщение уже новое, мапа нужна для логики внутри сессии, если нужно)
      userState.set(userId, newState);
      await ctx.answerCbQuery();
      return;
    }
    
    // Если мы отправили картинку, обновляем состояние
    if (needToSendImage) {
      userState.set(userId, newState);
    }

    await ctx.answerCbQuery();

  } catch (error) {
    console.error('Ошибка при редактировании медиа:', error);
    // Обработка ошибки 400, если сообщение слишком старое для редактирования
    if (error.description && error.description.includes('message can\'t be edited')) {
      await ctx.answerCbQuery('⚠️ Сообщение слишком старое для редактирования. Используйте команду /кнопка заново.', { show_alert: true });
    } else {
      await ctx.answerCbQuery('❌ Произошла ошибка.', { show_alert: true });
    }
  }
}

async function handleConfirmAction(ctx) {
  await ctx.answerCbQuery('✅ Действие подтверждено!', { show_alert: true });
  // Здесь можно добавить логику выдачи награды или перехода дальше
}

module.exports = {
  handleTestCommand,
  handleTestButton,
  handleConfirmAction
};