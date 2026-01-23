const { 
  activateDoubleMode, 
  deactivateDoubleMode, 
  updateUserBalance, 
  isDoubleChat, 
  isDiceChat, 
  getActiveModeInChat 
} = require('../db');

// Обработка команды "активировать_дабл"
async function activateDoubleHandler(ctx) {
  try {
    // Проверяем, есть ли сообщение и текст в сообщении
    if (!ctx.message || !ctx.message.text || ctx.message.text.trim() === '') {
      console.warn('Получено некорректное сообщение без текста.');
      return ctx.reply('Некорректное сообщение. Команда должна содержать текст.');
    }

    // Извлекаем текст сообщения и нормализуем его
    const text = ctx.message.text.trim();
    const parts = text.split(/\s+/);

    // Проверяем, что первое слово — "активировать_дабл" (без учета регистра)
    if (parts.length < 1 || parts[0].toLowerCase() !== 'активировать_дабл') {
      console.warn(`Сообщение "${text}" не является командой "активировать_дабл".`);
      return;
    }

    // Проверяем, есть ли уже активный режим в чате
    const chatId = ctx.chat.id.toString();
    const activeMode = await getActiveModeInChat(chatId);
    if (activeMode) {
      console.warn(`В чате ${chatId} уже активен режим "${activeMode}".`);
      return ctx.reply(`В данном чате уже активен режим "${activeMode === 'double' ? 'дабл' : 'дайс'}".`);
    }

    // Проверяем баланс пользователя
    const userId = ctx.from.id.toString();
    const user = await getUserById(userId);

    if (!user) {
      console.warn(`Пользователь ${userId} не зарегистирован.`);
      return ctx.reply('Вы не зарегистированы. Используйте команду "/start" для регистрации.');
    }

    if (user.balance < 100000) {
      console.warn(`Пользователь ${userId} пытается активировать дабл без достаточного баланса.`);
      return ctx.reply('Для активации режима "дабл" требуется минимум 100к PF на балансе.');
    }

    // Активируем режим "дабл" и списываем стоимость
    await activateDoubleMode(chatId);
    await updateUserBalance(userId, -100000); // Списание 100к PF

    // Отправляем подтверждение
    const username = user.username || 'Неизвестный';
    const userLink = `<a href="tg://user?id=${userId}">${username}</a>`;
    ctx.reply(
      `${userLink}, режим "дабл" успешно активирован в этом чате. Списано 100к PF.`,
      { parse_mode: 'HTML' }
    );
  } catch (error) {
    console.error('Ошибка при выполнении команды "активировать_дабл":', error);
    ctx.reply('Произошла ошибка. Попробуйте позже.');
  }
}

// Обработка команды "деактивировать_дабл"
async function deactivateDoubleHandler(ctx) {
  try {
    // Проверяем, есть ли сообщение и текст в сообщении
    if (!ctx.message || !ctx.message.text || ctx.message.text.trim() === '') {
      console.warn('Получено некорректное сообщение без текста.');
      return ctx.reply('Некорректное сообщение. Команда должна содержать текст.');
    }

    // Извлекаем текст сообщения и нормализуем его
    const text = ctx.message.text.trim();
    const parts = text.split(/\s+/);

    // Проверяем, что первое слово — "деактивировать_дабл" (без учета регистра)
    if (parts.length < 1 || parts[0].toLowerCase() !== 'деактивировать_дабл') {
      console.warn(`Сообщение "${text}" не является командой "деактивировать_дабл".`);
      return;
    }

    // Проверяем, активен ли режим "дабл"
    const chatId = ctx.chat.id.toString();
    const activeMode = await getActiveModeInChat(chatId);
    if (activeMode !== 'double') {
      console.warn(`В чате ${chatId} режим "дабл" не активен.`);
      return ctx.reply(`Невозможно деактивировать режим "дабл". В данном чате активен режим "${activeMode === 'dice' ? 'дайс' : 'никакой'}".`);
    }

    // Деактивируем режим "дабл"
    await deactivateDoubleMode(chatId);

    // Отправляем подтверждение
    ctx.reply('Режим "дабл" успешно деактивирован в этом чате.');
  } catch (error) {
    console.error('Ошибка при выполнении команды "деактивировать_дабл":', error);
    ctx.reply('Произошла ошибка. Попробуйте позже.');
  }
}

module.exports = { activateDoubleHandler, deactivateDoubleHandler };