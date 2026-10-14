const dotenv = require('dotenv');

// Загружаем переменные окружения
dotenv.config();

// Функция для вывода выбора игровых режимов
async function gameModes(ctx) {
  try {
    const keyboard = [
      [{ text: 'Double Plus', callback_data: 'double_plus' }],
      [{ text: 'Dice', callback_data: 'dice' }],
      [{ text: 'Игровой автомат', callback_data: 'roulete' }]
    ];

    await ctx.reply('🕹 Выберите игровой режим:', {
      reply_markup: { inline_keyboard: keyboard }
    });
  } catch (error) {
    console.error('Ошибка при выводе игровых режимов:', error);
    await ctx.reply('Произошла ошибка. Попробуйте позже.');
  }
}
// Обработчик кнопки Double Plus
async function handleDoublePlusButton(ctx) {
    try {
      // Проверяем, является ли контекст callback_query
      if (!ctx.callbackQuery || !ctx.callbackQuery.id) return;
  
      // Подтверждаем получение запроса
      await ctx.answerCbQuery(); // Используем ctx.answerCbQuery()
  
      const doublePlusKeyboard = [
        [{ text: 'О режиме Double Plus', callback_data: 'about_double_plus' }],
        [{ text: 'Перейти к Double Plus', url: process.env.DOUBLE_PLUS_URL }],
        [{ text: 'Назад', callback_data: 'back_to_modes' }] // Добавляем кнопку Назад
      ];
  
      await ctx.editMessageText('☑️ Вы выбрали режим Double Plus:', {
        reply_markup: { inline_keyboard: doublePlusKeyboard }
      });
    } catch (error) {
      console.error('Ошибка при обработке кнопки Double Plus:', error);
      if (ctx.callbackQuery && ctx.callbackQuery.id) {
        await ctx.answerCbQuery('Произошла ошибка. Попробуйте позже.');
      }
    }
  }
  
  // Обработчик кнопки Dice
  async function handleDiceButton(ctx) {
    try {
      // Проверяем, является ли контекст callback_query
      if (!ctx.callbackQuery || !ctx.callbackQuery.id) return;
  
      // Подтверждаем получение запроса
      await ctx.answerCbQuery(); // Используем ctx.answerCbQuery()
  
      const diceKeyboard = [
        [{ text: 'О режиме Dice', callback_data: 'about_dice' }],
        [{ text: 'Перейти к Dice', url: process.env.DICE_URL }],
        [{ text: 'Назад', callback_data: 'back_to_modes' }] // Добавляем кнопку Назад
      ];
  
      await ctx.editMessageText('🎲 Вы выбрали режим Dice:', {
        reply_markup: { inline_keyboard: diceKeyboard }
      });
    } catch (error) {
      console.error('Ошибка при обработке кнопки Dice:', error);
      if (ctx.callbackQuery && ctx.callbackQuery.id) {
        await ctx.answerCbQuery('Произошла ошибка. Попробуйте позже.');
      }
    }
  }
  
  // Обработчик кнопки "О режиме Double Plus"
  async function handleAboutDoublePlusButton(ctx) {
    try {
      // Проверяем, является ли контекст callback_query
      if (!ctx.callbackQuery || !ctx.callbackQuery.id) return;
  
      // Подтверждаем получение запроса
      await ctx.answerCbQuery(); // Используем ctx.answerCbQuery()
  
      const infoUrl = process.env.DOUBLE_PLUS_INFO_URL; // Получаем ссылку из .env
  
      // Создаем клавиатуру с кнопкой "Назад"
      const backKeyboard = [
        [{ text: 'Назад', callback_data: 'double_plus' }] // Возвращаемся к Double Plus
      ];
  
      // Отправляем сообщение с ссылкой (используем Markdown для форматирования)
      await ctx.editMessageText(`📚 Дополнительная информация о режиме Double Plus:\n[Перейти к статье](${infoUrl})`, {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: backKeyboard } // Добавляем клавиатуру
      });
    } catch (error) {
      console.error('Ошибка при обработке кнопки "О режиме Double Plus":', error);
      if (ctx.callbackQuery && ctx.callbackQuery.id) {
        await ctx.answerCbQuery('Произошла ошибка. Попробуйте позже.');
      }
    }
  }
  
  // Обработчик кнопки "О режиме Dice"
  async function handleAboutDiceButton(ctx) {
    try {
      // Проверяем, является ли контекст callback_query
      if (!ctx.callbackQuery || !ctx.callbackQuery.id) return;
  
      // Подтверждаем получение запроса
      await ctx.answerCbQuery(); // Используем ctx.answerCbQuery()
  
      const infoUrl = process.env.DICE_INFO_URL; // Получаем ссылку из .env
  
      // Создаем клавиатуру с кнопкой "Назад"
      const backKeyboard = [
        [{ text: 'Назад', callback_data: 'dice' }] // Возвращаемся к Dice
      ];
  
      // Отправляем сообщение с ссылкой (используем Markdown для форматирования)
      await ctx.editMessageText(`📚 Дополнительная информация о режиме Dice:\n[Перейти к статье](${infoUrl})`, {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: backKeyboard } // Добавляем клавиатуру
      });
    } catch (error) {
      console.error('Ошибка при обработке кнопки "О режиме Dice":', error);
      if (ctx.callbackQuery && ctx.callbackQuery.id) {
        await ctx.answerCbQuery('Произошла ошибка. Попробуйте позже.');
      }
    }
  }
  
  // Обработчик кнопки "Назад" к выбору режимов
  async function handleBackToModesButton(ctx) {
    try {
      // Проверяем, является ли контекст callback_query
      if (!ctx.callbackQuery || !ctx.callbackQuery.id) return;
  
      // Подтверждаем получение запроса
      await ctx.answerCbQuery(); // Используем ctx.answerCbQuery()
  
      const keyboard = [
        [{ text: 'Double Plus', callback_data: 'double_plus' }],
        [{ text: 'Dice', callback_data: 'dice' }],
        [{ text: 'Игровой автомат', callback_data: 'roulete' }]
      ];
  
      // Возвращаем пользователя к выбору режимов
      await ctx.editMessageText('Выберите игровой режим:', {
        reply_markup: { inline_keyboard: keyboard }
      });
    } catch (error) {
      console.error('Ошибка при обработке кнопки "Назад":', error);
      if (ctx.callbackQuery && ctx.callbackQuery.id) {
        await ctx.answerCbQuery('Произошла ошибка. Попробуйте позже.');
      }
    }
  }

  module.exports = {
    gameModes,
    handleDoublePlusButton,
    handleDiceButton,
    handleAboutDoublePlusButton,
    handleAboutDiceButton,
    handleBackToModesButton
  };
  
