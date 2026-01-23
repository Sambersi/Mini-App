// bank/bankTechCommands.js

const fs = require('fs');
const path = require('path');
const { Markup } = require('telegraf');

// Импорт функций из db.js (ваша база данных)
const {
  getNpfStats,
  getUserById,
  // ... другие импорты из db.js, если нужны для тех команд
} = require('../db');

// Импорт функций из основного модуля акций
const { getCurrentCourse, calculateNpfCourse } = require('./npfShares');

// Импорт функции проверки прав "Тех администратора" из основного файла бота
// Путь к файлу может отличаться, уточните его
const { isTechAdmin } = require('../admin/adminPanel');

// Функция для получения детальной информации о курсе (только для "Тех администратора")
async function handleNpfTechInfo(ctx) {
  try {
    const senderId = ctx.from.id.toString();

    // Проверяем права "Тех администратора"
    if (!(await isTechAdmin(senderId))) {
      console.warn(`Пользователь ${senderId} попытался использовать команду "npf_tech_info" без прав.`);
      return; // Завершаем выполнение без отправки ответа, если нет прав
    }

    const stats = getNpfStats();
    const currentCourseValue = getCurrentCourse();
    const calculatedCourse = calculateNpfCourse(); // Рассчитываем заново

    const message = `
🔧 Техническая информация об акциях NPF:
• Текущий курс (из памяти): <b>${currentCourseValue.toLocaleString('ru-RU')} PF</b>
• Рассчитанный курс (по формуле): <b>${calculatedCourse.toLocaleString('ru-RU')} PF</b>
• Разница: <b>${(calculatedCourse - currentCourseValue).toLocaleString('ru-RU')} PF</b>

📈 Детали для расчета:
• Общий баланс на картах: ${stats.total_card_pf.toLocaleString('ru-RU')} PF
• Количество держателей карт: ${stats.total_cardholders}
• Общее количество акций в обращении: ${stats.total_shares}
`;

    await ctx.replyWithHTML(message);

  } catch (error) {
    console.error('Ошибка при обработке команды "/npf_tech_info":', error);
    // Не отправляем сообщение обычному пользователю
    if (await isTechAdmin(ctx.from.id.toString())) {
         await ctx.reply('Произошла ошибка при получении технической информации об акциях.');
    }
  }
}

// Функция для принудительного обновления курса (только для "Тех администратора")
async function handleForceUpdateCourse(ctx) {
  try {
    const senderId = ctx.from.id.toString();

    // Проверяем права "Тех администратора"
    if (!(await isTechAdmin(senderId))) {
      console.warn(`Пользователь ${senderId} попытался использовать команду "force_update_course" без прав.`);
      return; // Завершаем выполнение без отправки ответа, если нет прав
    }

    const newCourse = calculateNpfCourse();
    const change = newCourse - getCurrentCourse();

    // Обновляем глобальные переменные
    const lastCourse = getCurrentCourse();
    // currentCourse обновляется внутри calculateNpfCourse или нужно обновить вручную
    // Для этого нужно либо сделать currentCourse глобальной переменной в этом файле,
    // либо экспортировать setter из npfShares.js.
    // Пока просто рассчитаем и покажем, но не обновим глобальное состояние.
    // Это может быть не идеально, если обновление курса происходит в другом месте одновременно.
    // Лучше всего обновлять глобальное состояние через функцию в npfShares.js.

    // Временное решение - просто рассчитать и показать
    const message = `
🔄 Курс NPF был принудительно рассчитан:
• Рассчитанный курс: <b>${newCourse.toLocaleString('ru-RU')} PF</b>
• Предыдущий курс (из памяти): <b>${lastCourse.toLocaleString('ru-RU')} PF</b>
• Изменение: <b>${change.toLocaleString('ru-RU')} PF</b>
(Глобальное состояние курса не обновлено принудительно этим действием)
`;

    await ctx.replyWithHTML(message);

  } catch (error) {
    console.error('Ошибка при принудительном обновлении курса:', error);
    // Не отправляем сообщение обычному пользователю
    if (await isTechAdmin(ctx.from.id.toString())) {
         await ctx.reply('Произошла ошибка при принудительном обновлении курса.');
    }
  }
}

module.exports = {
  handleNpfTechInfo,
  handleForceUpdateCourse,
};