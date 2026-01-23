const { Markup } = require('telegraf');
const {
  getUserEnergyData,
  updateUserEnergy,
  isHyperlinkDisabled,
  getUserById,
  getStatusById,
  getMaxEnergyByStatus,
    restoreEnergy,
    getCurrentEnergy,

} = require('../db');

function getTimeUntilNextEnergyRestore(userId) {
  const user = getUserById(userId);
  if (!user || user.energy === null || user.last_energy_restore === null) {
    console.error(`[DEBUG] getTimeUntilNextEnergyRestore: Некорректные данные для userId=${userId}: energy=${user?.energy}, lastEnergyRestore=${user?.last_energy_restore}`);
    return null;
  }

  const maxEnergy = getMaxEnergyByStatus(userId); // Получаем максимальное значение энергии
  const now = Math.floor(Date.now() / 1000); // Текущее время в секундах
  const timeSinceLastRestore = now - user.last_energy_restore; // Время с последнего восстановления
  const energyToRestore = Math.floor(timeSinceLastRestore / 300); // 300 секунд = 5 минут

  const newEnergy = Math.min(user.energy + energyToRestore, maxEnergy); // Учитываем максимальное значение
  const nextRestoreTime = user.last_energy_restore + (Math.ceil((newEnergy - user.energy) / 1) + 1) * 300;

  console.log(`[DEBUG] getTimeUntilNextEnergyRestore: userId=${userId}, currentEnergy=${user.energy}, maxEnergy=${maxEnergy}, nextRestoreTime=${nextRestoreTime}`);

  return {
    currentEnergy: newEnergy,
    nextRestoreTime: nextRestoreTime,
    maxEnergy: maxEnergy, // Добавляем максимальную энергию в результат
  };
}

// Функция для создания ссылки на пользователя с учетом анонимности
function createUserLink(userId, username, disableHyperlink) {
  const escapedUsername = username
    ? username.replace(/([<>&"'])/g, (match) => {
        const escapeMap = {
          '<': '<',
          '>': '>',
          '&': '&amp;',
          '"': '&quot;',
          "'": '&#39;',
        };
        return escapeMap[match];
      })
    : 'Неизвестный';

  if (disableHyperlink) {
    return escapedUsername;
  }

  return `<a href="tg://user?id=${userId}">${escapedUsername}</a>`;
}

// Функция для вывода информации об энергии
async function showEnergyInfo(ctx) {
  try {
    const userId = ctx.from.id.toString();

    // Получаем данные пользователя из базы данных
    const user = getUserById(userId);
    if (!user) {
      return await ctx.reply('❌ Пользователь не найден.');
    }

    // Получаем статус пользователя
    const userStatus = getStatusById(user.status_id);
    const maxEnergy = userStatus?.max_energy || 10; // Максимальная энергия по статусу (по умолчанию 10)

    // Формируем обращение к пользователю
    const usernameFromDB = user.username || 'Неизвестный';
    const userLink = createUserLink(userId, usernameFromDB, isHyperlinkDisabled(userId));

    // Создаем сообщение с информацией об энергии
    const message = `
      ℹ️ ${userLink}, <b>информация об энергии:</b>

      ⚡️ Энергия восстанавливается каждые 5 минут.
      🔋 Максимальное количество энергии: <b>${maxEnergy} единиц</b>.

      ◽️ <b>Примечание:</b>
      - Имея статус, можно повысить максимальное кол-во энергии:
        • GOLD - 20 ед
        • PLATINUM - 30 ед
        • DIAMOND - 40 ед
        • Администратор - 50 ед
      - Имея любой статус, энергия будет восстанавливаться быстрее.
    `.trim();

    // Создаем клавиатуру с кнопкой "Закрыть"
    const keyboard = {
      inline_keyboard: [
        [{ text: 'Закрыть', callback_data: 'close_energy_info' }],
      ],
    };

    // Отправляем сообщение с информацией об энергии
    await ctx.replyWithHTML(`${message}`, { reply_markup: keyboard });
  } catch (error) {
    console.error('[showEnergyInfo] Ошибка:', error);
    await ctx.reply('Произошла ошибка при выводе информации об энергии.');
  }
}

async function energyHandler(ctx) {
  try {
    const userId = ctx.from.id.toString();

    // Получаем данные пользователя из базы данных
    const user = await getUserById(userId);
    if (!user) {
      return await ctx.reply('❌ Пользователь не найден.');
    }

    // Получаем максимальную энергию для пользователя
    const maxEnergy = await getMaxEnergyByStatus(userId);

    // Формируем обращение к пользователю
    const usernameFromDB = user.username || 'Неизвестный';
    const userLink = createUserLink(userId, usernameFromDB, isHyperlinkDisabled(userId));

    // Получаем информацию о времени восстановления энергии
    const energyInfo = await getTimeUntilNextEnergyRestore(userId);
    if (!energyInfo) {
      return await ctx.reply(`❌ ${userLink}, не удалось получить информацию о вашей энергии.`);
    }

    const { currentEnergy, nextRestoreTime } = energyInfo;
    const now = Math.floor(Date.now() / 1000);

    // Если энергия уже максимальная
    if (currentEnergy >= maxEnergy) {
      return await ctx.replyWithHTML(
        `⚡️ ${userLink}, ваша энергия максимально заполнена: <b>${currentEnergy}/${maxEnergy}</b>`
      );
    }

    // Время до следующего восстановления энергии
    const timeLeft = Math.max(nextRestoreTime - now, 0);
    const minutes = Math.floor(timeLeft / 60);
    const seconds = timeLeft % 60;

    // Защита от NaN
    if (isNaN(minutes) || isNaN(seconds)) {
      console.error(`[DEBUG] energyHandler: Некорректное время восстановления для userId=${userId}: minutes=${minutes}, seconds=${seconds}`);
      return await ctx.reply(`❌ ${userLink}, не удалось рассчитать время восстановления энергии.`);
    }

    // Создаем клавиатуру с кнопками
    const keyboard = {
      inline_keyboard: [
        [{ text: 'ℹ️ Информация об энергии', callback_data: 'show_energy_info' }],
        [{ text: 'Закрыть', callback_data: 'close_energy_info' }],
      ],
    };

    // Отправляем сообщение с информацией об энергии и кнопками
    await ctx.replyWithHTML(
      `⚡️ ${userLink}, ваша текущая энергия: <b>${currentEnergy}/${maxEnergy}</b>\n` +
      `⏳ Следующая энергия восстановится через: <b>${minutes} мин ${seconds} сек</b>`,
      { reply_markup: keyboard }
    );
  } catch (error) {
    console.error('Ошибка при получении информации о энергии:', error);
    await ctx.reply('Произошла ошибка при получении информации о энергии.');
  }
}

module.exports = {
  energyHandler,
  getTimeUntilNextEnergyRestore,
  showEnergyInfo,
};