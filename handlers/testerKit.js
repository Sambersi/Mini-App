// testerKit.js
const {
    getUserById,
    updateUserBalance,
    updateUserDFBalance,
    updateLastBonusTime,
    addSkinToUser,
    updateUserStatus,
    getStatusByName,
    updateContainerCount,
  } = require('../db');
  
  // Время ожидания между выдачей наборов (в миллисекундах)
  const KIT_COOLDOWN = 10 * 60 * 1000; // 10 минут
  
  // Функция для создания гиперссылки на пользователя
  function createUserLink(userId, username) {
    const displayName = username || 'Неизвестный'; // Используем имя или "Неизвестный"
    return `<a href="tg://user?id=${userId}">${displayName}</a>`;
  }
  
  // Функция для форматирования оставшегося времени
  function formatRemainingTime(remainingTimeMs) {
    const remainingMinutes = Math.floor(remainingTimeMs / (60 * 1000)); // Оставшиеся минуты
    const remainingSeconds = Math.ceil((remainingTimeMs % (60 * 1000)) / 1000); // Оставшиеся секунды
    return `${remainingMinutes} мин. ${remainingSeconds} сек.`;
  }
  
  // Обработка команды "тестер"
  async function testerKitHandler(ctx) {
    try {
      const userId = ctx.from.id;
  
      // Проверяем тип чата
      const isPrivateChat = ctx.chat.type === 'private';
  
      // Получаем пользователя из базы данных
      const user = await getUserById(userId);
      if (!user) {
        return ctx.reply('❕ Вы ещё не зарегистрированы. Используйте команду /start для регистрации.');
      }
  
      const currentTime = Date.now();
      const lastBonusTime = user.last_bonus_time || 0;
  
      // Проверяем, прошло ли достаточно времени с момента последнего получения набора
      if (currentTime - lastBonusTime < KIT_COOLDOWN) {
        const remainingTimeMs = KIT_COOLDOWN - (currentTime - lastBonusTime);
        const formattedTime = formatRemainingTime(remainingTimeMs);
  
        if (isPrivateChat) {
          // В личном чате без гиперссылки
          return ctx.reply(`❕ Вы уже получили набор тестировщика. Попробуйте снова через ${formattedTime}`);
        } else {
          // В групповом чате с гиперссылкой
          const userLink = createUserLink(userId, user.username);
          return ctx.reply(
            `☑️ ${userLink}, вы уже получили набор тестировщика. Попробуйте снова через ${formattedTime}`,
            { parse_mode: 'HTML' }
          );
        }
      }
  
      // Начисляем награды
      await updateUserBalance(userId, 1000000); // +1.000.000 PF
      await updateUserDFBalance(userId, 100000, 'df_balance'); // +100.000 DF
  
      // Добавляем PLATINUM статус
      const platinumStatus = await getStatusByName('PLATINUM');
      if (platinumStatus) {
        await updateUserStatus(userId, platinumStatus.id);
      }
  
      // Добавляем контейнеры
      for (let i = 1; i <= 3; i++) {
        await updateContainerCount(userId, i, 42); // +42 каждого типа контейнера
      }
  
      // Обновляем время последнего получения набора
      await updateLastBonusTime(userId, currentTime);
  
      // Формируем сообщение в зависимости от типа чата
      const username = user.username || 'Неизвестный';
      const userLink = createUserLink(userId, username);
  
      const message = isPrivateChat
        ? `✅ Набор тестировщика выдан!\n\n+<b>1.000.000</b> PF\n+<b>100.000</b> DF\n+<b>PLATINUM STATUS</b>\n+<b>42</b> всех видов контейнера\n\nСообщить об найденном баге - РЕПОСТ [текст]`
        : `✅ ${userLink}, Набор тестировщика выдан!\n\n+<b>1.000.000</b> PF\n+<b>100.000</b> DF\n+<b>PLATINUM STATUS</b>\n+<b>42</b> всех видов контейнера\n\nСообщить об найденном баге - РЕПОСТ [текст]`;
  
      return ctx.reply(message, { parse_mode: 'HTML' });
    } catch (error) {
      console.error('Ошибка при обработке запроса:', error);
      return ctx.reply('Произошла ошибка. Попробуйте позже.');
    }
  }
  
  module.exports = { testerKitHandler };