const { 
  activateDiceMode, 
  deactivateDiceMode, 
  updateUserBalance, 
  isDoubleChat, 
  isDiceChat, 
  getActiveModeInChat,
  getUserById,
  getUserStatuses // Импортируем функцию для получения статусов пользователя
} = require('../db');

// Проверка прав администратора
async function checkAdminRights(userId) {
  const senderId = userId.toString();

  // Главный администратор
  const isMainAdmin = process.env.MAIN_ADMIN === senderId;

  // Получаем статусы пользователя
  const userStatuses = await getUserStatuses(senderId); // Возвращает массив статусов

  // Проверяем наличие статуса "Тех администратор"
  const isAdmin = userStatuses.includes('Тех администратор');

  return isMainAdmin || isAdmin;
}

// Обработка команды "активировать дайс"
async function activateDiceHandler(ctx) {
  try {
    // Проверяем, есть ли сообщение и текст в сообщении
    if (!ctx.message || !ctx.message.text || ctx.message.text.trim() === '') {
      console.warn('Получено некорректное сообщение без текста.');
      return ctx.reply('Некорректное сообщение. Команда должна содержать текст.');
    }

    // Извлекаем текст сообщения и нормализуем его
    const text = ctx.message.text.trim();
    const parts = text.split(/\s+/);

    // Проверяем, что первое слово — "активировать дайс" (без учета регистра)
    if (parts.length < 1 || parts[0].toLowerCase() !== 'активировать дайс') {
      console.warn(`Сообщение "${text}" не является командой "активировать дайс".`);
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

    if (user.balance < 50000) {
      console.warn(`Пользователь ${userId} пытается активировать дайс без достаточного баланса.`);
      return ctx.reply('Для активации режима "дайс" требуется минимум 50к PF на балансе.');
    }

    // Активируем режим "дайс" и списываем стоимость
    await activateDiceMode(chatId);
    await updateUserBalance(userId, -50000); // Списание 50к PF

    // Отправляем подтверждение
    const username = user.username || 'Неизвестный';
    const userLink = `<a href="tg://user?id=${userId}">${username}</a>`;
    ctx.reply(
      `${userLink}, режим "дайс" успешно активирован в этом чате. Списано 50к PF.`,
      { parse_mode: 'HTML' }
    );
  } catch (error) {
    console.error('Ошибка при выполнении команды "активировать дайс":', error);
    ctx.reply('Произошла ошибка. Попробуйте позже.');
  }
}

// Обработка команды "деактивировать дайс"
async function deactivateDiceHandler(ctx) {
  try {
    // Проверяем права администратора
    const senderId = ctx.from.id.toString();
    const hasAdminRights = await checkAdminRights(senderId);

    if (!hasAdminRights) {
      console.warn(`Пользователь ${senderId} попытался использовать команду "деактивировать дайс" без прав.`);
      return ctx.reply('У вас нет прав для использования этой команды.');
    }

    // Деактивируем режим "дайс"
    const chatId = ctx.chat.id.toString();
    await deactivateDiceMode(chatId);

    // Отправляем подтверждение
    ctx.reply('Режим "дайс" успешно деактивирован в этом чате.');
  } catch (error) {
    console.error('Ошибка при выполнении команды "деактивировать дайс":', error);
    ctx.reply('Произошла ошибка. Попробуйте позже.');
  }
}

module.exports = { activateDiceHandler, deactivateDiceHandler };