const db = require('../db');
const { getUserStatuses, createSpecialPrefix, getAllSpecialPrefixes, getUserByNumericId, deleteSpecialPrefix, assignSpecialPrefixToUser, removeSpecialPrefixFromUser } = require('../db');
// Функция для проверки, является ли пользователь "Тех администратор"
async function isTechAdmin(userId) {
  const statuses = await getUserStatuses(userId); // Получаем статусы пользователя
  return statuses.includes('Тех администратор'); // Проверяем наличие статуса
}
const { isAdmin } = require('../admin/addBalance');
// Функция для показа всех доступных префиксов
async function listAllPrefixes(ctx) {
  try {
    const userId = ctx.from.id.toString();

    // Проверяем права "Тех администратора"
    if (!(await isTechAdmin(userId))) {
      return; // Завершаем выполнение без отправки сообщения
    }

    // Получаем список всех префиксов
    const prefixes = db.getAllPrefixes(); // Обычные префиксы
    const specialPrefixes = db.getAllSpecialPrefixes(); // Специальные префиксы

    // Формируем сообщение со списком префиксов
    let message = '📋 <b>Доступные префиксы:</b>\n';

    // Добавляем обычные префиксы
    if (prefixes.length > 0) {
      message += '🔹 <b>Обычные префиксы:</b>\n';
      prefixes.forEach((prefix, index) => {
        message += `${index + 1}. ${prefix.prefix} (ID: ${prefix.id})\n`;
      });
    } else {
      message += '🔹 Нет доступных обычных префиксов.\n';
    }

    // Добавляем специальные префиксы
    if (specialPrefixes.length > 0) {
      message += '\n🔸 <b>Специальные префиксы:</b>\n';
      specialPrefixes.forEach((prefix, index) => {
        message += `${index + 1}. ${prefix.prefix} (ID: ${prefix.id})\n`;
      });
    } else {
      message += '\n🔸 Нет доступных специальных префиксов.\n';
    }

    await ctx.replyWithHTML(message);
  } catch (error) {
    console.error('[PREFIXES] Ошибка при получении списка префиксов:', error);
    await ctx.reply('❌ Произошла ошибка. Попробуйте позже.');
  }
}

// Функция для выдачи префикса пользователю
async function assignPrefix(ctx, parts) {
  try {
    if (parts.length !== 4) {
      return ctx.reply('❌ Использование: выдать префикс <ID игрока> <ID префикса>');
    }

    const targetUserId = parseInt(parts[2], 10); // ID игрока
    const prefixId = parseInt(parts[3], 10); // ID префикса

    if (isNaN(targetUserId)) {
      return ctx.reply('❌ Некорректный ID игрока.');
    }
    if (isNaN(prefixId)) {
      return ctx.reply('❌ Некорректный ID префикса.');
    }

    const user = db.getUserByNumericId(targetUserId);
    if (!user) {
      return ctx.reply(`❌ Пользователь с numeric_id ${targetUserId} не найден.`);
    }

    const prefix = db.getPrefixById(prefixId);
    if (!prefix) {
      return ctx.reply(`❌ Префикс с ID ${prefixId} не найден.`);
    }

    const userPrefixes = JSON.parse(user.prefix_ids || '[]');
    if (userPrefixes.includes(prefixId)) {
      return ctx.reply(`❌ У пользователя уже есть префикс "${prefix.prefix}".`);
    }

    userPrefixes.push(prefixId);
    db.updateUserFieldByNumericId(targetUserId, 'prefix_ids', JSON.stringify(userPrefixes));

    await ctx.replyWithHTML(
      `✅ Префикс "<b>${prefix.prefix}</b>" успешно выдан пользователю с id ${targetUserId}.`
    );
  } catch (error) {
    console.error('[PREFIXES] Ошибка при выдаче префикса:', error);
    await ctx.reply('❌ Произошла ошибка. Попробуйте позже.');
  }
}

// Функция для забирания префикса у пользователя
async function removePrefix(ctx, parts) {
  try {
    if (parts.length !== 4) {
      return ctx.reply('❌ Использование: забрать префикс <ID игрока> <ID префикса>');
    }

    const targetUserId = parseInt(parts[2], 10); // ID игрока
    const prefixId = parseInt(parts[3], 10); // ID префикса

    if (isNaN(targetUserId)) {
      return ctx.reply('❌ Некорректный ID игрока.');
    }
    if (isNaN(prefixId)) {
      return ctx.reply('❌ Некорректный ID префикса.');
    }

    const user = db.getUserByNumericId(targetUserId);
    if (!user) {
      return ctx.reply(`❌ Пользователь с numeric_id ${targetUserId} не найден.`);
    }

    const prefix = db.getPrefixById(prefixId);
    if (!prefix) {
      return ctx.reply(`❌ Префикс с ID ${prefixId} не найден.`);
    }

    const userPrefixes = JSON.parse(user.prefix_ids || '[]');
    if (!userPrefixes.includes(prefixId)) {
      return ctx.reply(`❌ У пользователя нет префикса "${prefix.prefix}".`);
    }

    const updatedPrefixes = userPrefixes.filter(id => id !== prefixId);
    db.updateUserFieldByNumericId(targetUserId, 'prefix_ids', JSON.stringify(updatedPrefixes));

    // Если удаляемый префикс был активным, обнуляем active_prefix_id
    if (user.active_prefix_id === prefixId) {
      db.updateUserFieldByNumericId(targetUserId, 'active_prefix_id', null);
    }

    await ctx.replyWithHTML(
      `✅ Префикс "<b>${prefix.prefix}</b>" успешно забран у пользователя с numeric_id ${targetUserId}.`
    );
  } catch (error) {
    console.error('[PREFIXES] Ошибка при забирании префикса:', error);
    await ctx.reply('❌ Произошла ошибка. Попробуйте позже.');
  }
}

// Функция для показа префиксов пользователя
async function listUserPrefixes(ctx) {
  try {
    const userId = ctx.from.id; // ID текущего пользователя

    // Получаем пользователя из базы данных
    let user = db.getUserById(userId);
    if (!user) {
      // Если пользователь не найден, создаем его
      db.createUserOrUpdate({
        id: userId,
        first_name: ctx.from.first_name || 'Unknown',
      });
      user = db.getUserById(userId); // Получаем созданного пользователя
    }

    // Получаем список обычных и специальных префиксов пользователя
    const userPrefixes = JSON.parse(user.prefix_ids || '[]');
    const userSpecialPrefixes = JSON.parse(user.special_prefix_ids || '[]');

    // Получаем все доступные префиксы из обеих таблиц
    const allPrefixes = db.getAllPrefixes(); // Обычные префиксы
    const allSpecialPrefixes = db.getAllSpecialPrefixes(); // Специальные префиксы

    const activePrefixId = user.active_prefix_id;

    // Формируем сообщение со списком префиксов
    let message = '📋 <b>Ваши префиксы:</b>\n';

    // Добавляем обычные префиксы
    if (userPrefixes.length > 0) {
      message += '\n🔹 <b>Обычные префиксы:</b>\n';
      userPrefixes.forEach((prefixId) => {
        const prefix = allPrefixes.find(p => p.id === prefixId);
        if (prefix) {
          const isActive = prefixId === activePrefixId ? ' (активный)' : '';
          message += `- ${prefix.prefix} (ID: ${prefix.id})${isActive}\n`;
        }
      });
    } else {
      message += '\n🔹 У вас нет обычных префиксов.\n';
    }

    // Добавляем специальные префиксы
    if (userSpecialPrefixes.length > 0) {
      message += '\n\n🔸 <b>Специальные префиксы:</b>\n';
      userSpecialPrefixes.forEach((prefixId) => {
        const prefix = allSpecialPrefixes.find(p => p.id === prefixId);
        if (prefix) {
          const isActive = prefixId === activePrefixId ? ' (активный)' : '';
          message += `- ${prefix.prefix} (ID: ${prefix.id})${isActive}`;
        }
      });
    } else {
      message += '\n\n🔸 У вас нет специальных префиксов.\n';
    }

    // Добавляем информацию об установке активного префикса
    message += `\n\nℹ️ Чтобы установить активный префикс, используйте команду:\n<code>установить префикс</code> [ID префикса]`;
    message += `\nℹ️ Чтобы убрать активный префикс, используйте команду:\n<code>установить префикс 0</code>`;

    await ctx.replyWithHTML(message);
  } catch (error) {
    console.error('[PREFIXES] Ошибка при получении префиксов пользователя:', error);
    await ctx.reply('❌ Произошла ошибка. Попробуйте позже.');
  }
}

// Функция для установки активного префикса
async function setActivePrefix(ctx, parts) {
  try {
    // Проверяем корректность использования команды
    if (parts.length !== 3) {
      return ctx.reply('❌ Использование: установить префикс <ID префикса>');
    }

    const prefixId = parseInt(parts[2], 10); // ID префикса
    const userId = ctx.from.id; // Telegram ID текущего пользователя

    // Проверяем, что ID префикса является числом
    if (isNaN(prefixId)) {
      return ctx.reply('❌ Некорректный ID префикса.');
    }

    // Получаем данные пользователя по Telegram ID
    const user = db.getUserById(userId);
    if (!user) {
      return ctx.reply('❌ Ваш профиль не найден.');
    }

    // Если префикс равен 0, убираем активный префикс
    if (prefixId === 0) {
      db.updateUserFieldByNumericId(user.numeric_id, 'active_prefix_id', null);
      return ctx.replyWithHTML(`✅ Активный префикс успешно удален.`);
    }

    // Проверяем существование префикса в базе данных
    const allPrefixes = db.getAllPrefixes(); // Обычные префиксы
    const allSpecialPrefixes = db.getAllSpecialPrefixes(); // Специальные префиксы
    const prefix = allPrefixes.find(p => p.id === prefixId) || allSpecialPrefixes.find(p => p.id === prefixId);

    if (!prefix) {
      return ctx.reply('❌ Префикс с таким ID не существует.');
    }

    // Проверяем, есть ли префикс у пользователя
    const userPrefixes = JSON.parse(user.prefix_ids || '[]'); // Обычные префиксы
    const userSpecialPrefixes = JSON.parse(user.special_prefix_ids || '[]'); // Специальные префиксы

    if (![...userPrefixes, ...userSpecialPrefixes].includes(prefixId)) {
      return ctx.reply('❌ У вас нет такого префикса.');
    }

    // Устанавливаем активный префикс
    db.updateUserFieldByNumericId(user.numeric_id, 'active_prefix_id', prefixId);

    // Отправляем подтверждение пользователю
    await ctx.replyWithHTML(`✅ Префикс "<b>${prefix.prefix}</b>" успешно установлен как активный.`);
  } catch (error) {
    console.error('[PREFIXES] Ошибка при установке активного префикса:', error);
    await ctx.reply('❌ Произошла ошибка. Попробуйте позже.');
  }
}

async function createSpecialPrefixCommand(ctx) {
  try {
    const userId = ctx.from.id.toString();

    // Лог: Пользователь, который вызвал команду
    console.log(`[LOG] Пользователь вызвал команду создать_префикс. ID: ${userId}`);

    // Проверяем права "Тех администратора"
    if (!(await isTechAdmin(userId))) {
      console.log(`[LOG] Пользователь с ID ${userId} не является техническим администратором.`);
      return ctx.reply('❌ У вас нет прав для использования этой команды.');
    }

    // Получаем текст сообщения пользователя
    const messageText = ctx.message?.text || '';
    console.log(`[LOG] Текст сообщения: ${messageText}`); // Лог: Полный текст сообщения

    if (!messageText) {
      console.log('[LOG] Сообщение пустое или отсутствует.');
      return ctx.reply('❌ Некорректное сообщение. Команда должна содержать текст.');
    }

    // Разбиваем текст сообщения на части
    const parts = messageText.split(/\s+/); // Разделяем по пробелам
    if (parts.length < 2) {
      console.log('[LOG] Не указан текст префикса.');
      return ctx.reply('❌ Использование: создать_префикс [текст]');
    }

    // Извлекаем текст префикса (все части после первой)
    const prefix = parts.slice(1).join(' ').trim(); // Объединяем все части после команды
    console.log(`[LOG] Извлечённый текст префикса: "${prefix}"`); // Лог: Извлечённый текст префикса

    if (!prefix) {
      console.log('[LOG] Текст префикса пустой.');
      return ctx.reply('❌ Текст префикса не может быть пустым.');
    }

    // Создаём специальный префикс
    console.log(`[LOG] Попытка создания префикса "${prefix}" пользователем с ID ${userId}`);
    const result = createSpecialPrefix(prefix, userId);

    console.log(`[LOG] Результат создания префикса:`, result); // Лог: Результат операции
    await ctx.reply(result.message);
  } catch (error) {
    console.error('[SPECIAL_PREFIX] Ошибка при создании префикса:', error);
    console.log(`[LOG] Стек ошибки:`, error.stack); // Лог: Подробная информация об ошибке
    await ctx.reply('❌ Произошла ошибка. Попробуйте позже.');
  }
}


// Функция для выдачи специального префикса пользователю
async function assignSpecialPrefix(ctx) {
  try {
    const text = ctx.message.text.trim();
    const parts = text.split(/\s+/);

    if (parts.length !== 3) {
      return ctx.reply('❌ Использование: выдать_спец_префикс (numeric_id) (id_prefix)');
    }

    const numericId = parseInt(parts[1], 10); // Numeric ID пользователя
    const prefixId = parseInt(parts[2], 10); // ID префикса

    if (isNaN(numericId) || isNaN(prefixId)) {
      return ctx.reply('❌ Некорректные параметры. Убедитесь, что numeric_id и id_prefix являются числами.');
    }

    // Проверяем права администратора
    if (!(await isTechAdmin(ctx.from.id))) {
      return ctx.reply('❌ У вас нет прав для использования этой команды.');
    }

    // Выдаём префикс
    const result = await assignSpecialPrefixToUser(numericId, prefixId);
    return ctx.reply(result.success ? `✅ Префикс с ID ${prefixId} успешно выдан.` : result.message);
  } catch (error) {
    console.error('[ASSIGN_SPECIAL_PREFIX_HANDLER] Ошибка:', error);
    return ctx.reply('❌ Произошла ошибка. Попробуйте позже.');
  }
}

async function removeSpecialPrefix(ctx) {
  try {
    const text = ctx.message.text.trim();
    const parts = text.split(/\s+/);

    if (parts.length !== 3) {
      return ctx.reply('❌ Использование: забрать_спец_префикс (numeric_id) (id_prefix)');
    }

    const numericId = parseInt(parts[1], 10); // Numeric ID пользователя
    const prefixId = parseInt(parts[2], 10); // ID префикса

    if (isNaN(numericId) || isNaN(prefixId)) {
      return ctx.reply('❌ Некорректные параметры. Убедитесь, что numeric_id и id_prefix являются числами.');
    }

    // Проверяем права администратора
    if (!(await isTechAdmin(ctx.from.id))) {
      return ctx.reply('❌ У вас нет прав для использования этой команды.');
    }

    // Забираем префикс
    const result = await removeSpecialPrefixFromUser(numericId, prefixId);

    // Формируем сообщение пользователю
    if (result.success) {
      return ctx.reply(`✅ Префикс с ID ${prefixId} успешно забран.`);
    } else {
      return ctx.reply(result.message);
    }
  } catch (error) {
    console.error('[REMOVE_SPECIAL_PREFIX_HANDLER] Ошибка:', error);
    return ctx.reply('❌ Произошла ошибка. Попробуйте позже.');
  }
}

module.exports = {
  listAllPrefixes,
  assignPrefix,
  removePrefix,
  listUserPrefixes,
  setActivePrefix,
  createSpecialPrefixCommand,
  assignSpecialPrefix,
  removeSpecialPrefix
};


