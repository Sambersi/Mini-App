// admin/blacklistManagement.js
// Импортируем нужные функции из db.js, включая новые
const { 
  addToBlacklist,
  removeFromBlacklist,
  getBlacklist,
  isUserBanned,
  getUserById,
  getUserByNumericId,
  getUserStatuses,
  recordAdminAction,     
  getAdminActionsInRange, 
  getLastAdminActionTime, 
  cleanupExpiredAdminActions 
} = require('../db'); // Убедитесь, что путь правильный

// --- Конфигурация ---
const ADMIN_COMMANDS_CHAT_ID = '-1002660290164'; // ID чата, где обычные админы могут использовать команды
const SPECIAL_ADMINS = ['6891998751', '1027168131', "1751938104", "1901352625"]; // ID админов, подверженных лимитам
const ACTION_LIMIT_PER_DAY = 2; // Лимит действий (бан/разбан) в сутки

// --- Логика отслеживания действий ---

// Функция для очистки устаревших записей (можно вызывать периодически извне или внутри этого модуля)
// Уже экспортируется из db.js, можно вызвать оттуда. Если нужно локально:
// setInterval(cleanupExpiredAdminActions, 30 * 60 * 1000); // Каждые 30 минут

// --- Обновлённая функция проверки квоты ---
async function canUserPerformAction(adminId) {
  try {
    const adminIdStr = adminId.toString();
    // Главный админ без ограничений
    if (isMainAdmin(adminIdStr)) {
      return { allowed: true, remaining: Infinity };
    }

    const statuses = await getUserStatuses(adminIdStr);
    
    // Проверяем, является ли пользователь специальным админом с лимитами
    const isSpecialAdmin = SPECIAL_ADMINS.includes(adminIdStr);

    // Тех администраторы (кроме специальных) без ограничений
    if (statuses.includes('Тех администратор') && !isSpecialAdmin) {
      return { allowed: true, remaining: Infinity };
    }

    // Обычные администраторы и специальные админы имеют лимит
    if (statuses.includes('Администратор') || isSpecialAdmin) {
      const LIMIT = ACTION_LIMIT_PER_DAY;
      const WINDOW_SIZE = 24 * 60 * 60; // 24 часа в секундах
      const now = Math.floor(Date.now() / 1000);

      // 1. Получаем время последнего действия
      const lastActionTime = getLastAdminActionTime(adminIdStr);

      // 2. Если действий не было вообще, квота полная
      if (lastActionTime === null) {
         return { allowed: true, remaining: LIMIT };
      }

      // 3. Если последнее действие было более 24ч назад, квота восстановлена
      if (now - lastActionTime > WINDOW_SIZE) {
         return { allowed: true, remaining: LIMIT };
      }

      // 4. Иначе, считаем действия за последние 24ч от ПОСЛЕДНЕГО действия
      const windowStart = lastActionTime - WINDOW_SIZE;
      const windowEnd = lastActionTime;
      
      const actions = getAdminActionsInRange(adminIdStr, windowStart, windowEnd);
      const actionCount = actions.length;

      const remaining = LIMIT - actionCount;
      
      return { allowed: remaining > 0, remaining };
    }

    return { allowed: false, remaining: 0 };
  } catch (error) {
    console.error('[ЧС] Ошибка при проверке прав на выполнение действия:', error);
    return { allowed: false, remaining: 0 };
  }
}

// --- Новая функция для проверки контекста использования команд ---
async function canAdminUseCommandsHere(ctx, adminId) {
    const adminIdStr = adminId.toString();
    // Главный админ и тех. админ (включая специальных) всегда могут
    if (isMainAdmin(adminIdStr)) {
        return true;
    }
    const statuses = await getUserStatuses(adminIdStr);
    const isSpecialAdmin = SPECIAL_ADMINS.includes(adminIdStr);
    if (statuses.includes('Тех администратор') || isSpecialAdmin) {
        return true;
    }

    // Для обычных администраторов проверяем чат
    if (statuses.includes('Администратор')) {
        const chatId = ctx?.chat?.id?.toString();
        // Разрешено в ЛС или в указанном чате
        if (!chatId || chatId === 'private' || chatId === ADMIN_COMMANDS_CHAT_ID) {
            return true;
        } else {
            return false;
        }
    }

    return false; // Не админ
}

// --- Существующая логика (с небольшими изменениями для интеграции) ---

function isMainAdmin(userId) {
  return process.env.MAIN_ADMIN === userId.toString();
}

// Обновленная функция для проверки "Тех администратора"
async function isTechAdmin(userId) {
    const userIdStr = userId.toString();
    // Специальные админы не считаются тех. админами в этом контексте
    if (SPECIAL_ADMINS.includes(userIdStr)) {
        return false;
    }
    const statuses = await getUserStatuses(userIdStr);
    return statuses.includes('Тех администратор');
}

// Обновленная функция для проверки "Администратора"
async function isAdminRole(userId) {
    const userIdStr = userId.toString();
    // Специальные админы не считаются обычными админами в этом контексте
    if (SPECIAL_ADMINS.includes(userIdStr)) {
        return false;
    }
    const statuses = await getUserStatuses(userIdStr);
    return statuses.includes('Администратор');
}

// Обновленная функция для проверки базовых прав администратора
async function isAdmin_ban(ctx) {
    const senderId = ctx.from.id.toString();

    if (isMainAdmin(senderId)) {
        return true;
    }

    try {
        const statuses = await getUserStatuses(senderId);
        // Проверяем базовое наличие статуса админа
        const hasAdminStatus = statuses.includes('Тех администратор') || statuses.includes('Администратор');
        const isSpecialAdmin = SPECIAL_ADMINS.includes(senderId);
        if (!hasAdminStatus && !isSpecialAdmin) {
            return false;
        }
        
        // Если есть статус или это специальный админ, проверяем контекст
        return await canAdminUseCommandsHere(ctx, senderId);
        
    } catch (error) {
        console.error('[ERROR] Ошибка при проверке статусов администратора:', error);
        return false;
    }
}

async function banUserHandler(ctx) {
  try {
    const senderId = ctx.from.id.toString();
    
    // 1. Проверка базовых прав и контекста
    if (!(await isAdmin_ban(ctx))) {
      // Определяем, почему нет доступа
      const statuses = await getUserStatuses(senderId).catch(() => []);
      const isRegularAdmin = statuses.includes('Администратор');
      const isTechOrMainAdmin = statuses.includes('Тех администратор') || isMainAdmin(senderId);
      const isSpecialAdmin = SPECIAL_ADMINS.includes(senderId);
      
      if ((isRegularAdmin || isSpecialAdmin) && !isTechOrMainAdmin && !isMainAdmin(senderId)) {
          const chatId = ctx?.chat?.id?.toString();
          if (chatId && chatId !== 'private' && chatId !== ADMIN_COMMANDS_CHAT_ID) {
              return ctx.reply(`❕ Обычные администраторы могут использовать команду "бан" только в ЛС бота или в чате с ID ${ADMIN_COMMANDS_CHAT_ID}.`);
          }
      }
      console.warn(`Пользователь ${senderId} попытался использовать команду "бан" без прав или в неправильном чате.`);
      return ctx.reply('❕ У вас нет прав для использования этой команды в этом чате.');
    }

    // 2. Проверка структуры сообщения
    if (!ctx.message || !ctx.message.text || ctx.message.text.trim() === '') {
      console.warn('❕ Получено некорректное сообщение без текста.');
      return ctx.reply('❕ Некорректное сообщение. Команда должна содержать текст.');
    }

    const text = ctx.message.text.trim();
    const parts = text.split(/\s+/);

    if (parts.length < 2 || parts[0].toLowerCase() !== 'бан') {
      console.warn(`Сообщение "${text}" не является командой "бан".`);
      return ctx.reply('❕ Использование: бан <id> [время_в_часах] или "навсегда"\nПричина может быть указана в новой строке.');
    }

    // 3. Проверка квоты на действие
    const actionPermission = await canUserPerformAction(senderId);
    if (!actionPermission.allowed) {
      // Проверяем, является ли пользователь обычным админом или специальным админом
      const statuses = await getUserStatuses(senderId);
      const isSpecialAdmin = SPECIAL_ADMINS.includes(senderId);
      if (statuses.includes('Администратор') || isSpecialAdmin) {
         return ctx.reply(`❌ Вы исчерпали лимит действий (бан/разбан) на сегодня. Осталось: ${actionPermission.remaining}/${ACTION_LIMIT_PER_DAY}`);
      } else {
         // Эта ветка маловероятна, так как права уже проверены выше, но оставим для полноты
         console.warn(`Пользователь ${senderId} попытался использовать команду "бан" без прав (проверка квоты).`);
         return ctx.reply('❕ У вас нет прав для использования этой команды.');
      }
    }

    // 4. Парсинг аргументов
    const numericId = parseInt(parts[1], 10);
    let banType = parts[2];

    if (isNaN(numericId)) {
      console.warn(`Некорректный аргумент id=${numericId}`);
      return ctx.reply('❕ Некорректный числовой ID пользователя. Использование: бан <numeric_id> [время_в_часах] или "навсегда".');
    }

    // 5. Поиск пользователя
    const userToBan = await getUserByNumericId(numericId);
    if (!userToBan) {
      console.warn(`Пользователь с id=${numericId} не найден.`);
      return ctx.reply('❕ Пользователь с указанным id не найден.');
    }

    // 6. Проверки на возможность бана
    if (await isUserBanned(userToBan.id)) {
      console.warn(`Пользователь с id=${numericId} уже находится в чёрном списке.`);
      return ctx.reply('❕ Пользователь уже заблокирован.');
    }

    if (isMainAdmin(userToBan.id)) {
      console.warn(`Попытка забанить главного администратора.`);
      return ctx.reply('❕ Невозможно забанить главного администратора.');
    }

    const targetUserIdStr = userToBan.id.toString();
    const isTargetSpecialAdmin = SPECIAL_ADMINS.includes(targetUserIdStr);
    const isSenderSpecialAdmin = SPECIAL_ADMINS.includes(senderId);

    // Проверка для специальных админов
    if (isSenderSpecialAdmin) {
        // Специальный админ не может банить главного админа
        if (isMainAdmin(targetUserIdStr)) {
            console.warn(`Попытка специального админа ${senderId} забанить главного администратора.`);
            return ctx.reply('❕ Вы не можете банить главного администратора.');
        }
        // Специальный админ не может банить других тех. админов
        if (await isTechAdmin(targetUserIdStr)) {
            console.warn(`Попытка специального админа ${senderId} забанить тех. администратора ${targetUserIdStr}.`);
            return ctx.reply('❕ Вы не можете банить других тех. администраторов.');
        }
    }

    const isTargetTechAdmin = await isTechAdmin(targetUserIdStr);
    if (isTargetTechAdmin) {
      console.warn(`Попытка забанить технического администратора.`);
      return ctx.reply('❕ Невозможно забанить технического администратора.');
    }

    const isTargetAdmin = await isAdminRole(targetUserIdStr);
    const isSenderAdminRole = await isAdminRole(senderId);
    const isSenderTechAdmin = await isTechAdmin(senderId);

    // Проверка для обычных админов
    if (isTargetAdmin && isSenderAdminRole && !isSenderTechAdmin) {
      console.warn(`Попытка обычного админа ${senderId} забанить другого админа ${targetUserIdStr}.`);
      return ctx.reply('❕ Обычные администраторы не могут банить других администраторов.');
    }
    
    // Проверка для специальных админов
    if (isTargetAdmin && isSenderSpecialAdmin) {
      console.warn(`Попытка специального админа ${senderId} забанить обычного админа ${targetUserIdStr}.`);
      return ctx.reply('❕ Вы не можете банить других администраторов.');
    }

    // 7. Парсинг времени бана
    let banHours = null;
    if (banType && banType.toLowerCase() !== 'навсегда') {
      banHours = parseFloat(banType);
      if (isNaN(banHours) || banHours <= 0) {
        console.warn(`Некорректное время бана: banHours=${banHours}`);
        return ctx.reply('❕ Некорректное время бана. Использование: бан <id> [время_в_часах] или "навсегда".');
      }
    }

    // 8. Парсинг причины
    let reason = text.split('\n')[1]?.trim();
    if (!reason) {
      reason = parts.slice(3).join(' ');
    }
    if (!reason) {
      reason = 'Не указано';
    }

    // 9. Вычисление времени окончания бана
    const banUntil = banHours === null 
      ? null
      : Math.floor((Date.now() / 1000) + banHours * 3600);

    // 10. Добавление в черный список
    await addToBlacklist(userToBan.id, reason, banUntil);

    // 11. Запись действия в лог (если это обычный админ или специальный админ)
    const senderStatuses = await getUserStatuses(senderId);
    const isSenderSpecialAdminForLogging = SPECIAL_ADMINS.includes(senderId);
    if (actionPermission.remaining < Infinity && (senderStatuses.includes('Администратор') || isSenderSpecialAdminForLogging)) {
       const recordResult = recordAdminAction(senderId, 'ban', userToBan.id);
       if (!recordResult.success) {
         console.error(`[ЧС] Не удалось записать действие бана админа ${senderId} для пользователя ${userToBan.id}:`, recordResult.error);
       }
    }

    // 12. Формирование и отправка сообщений
    const username = userToBan.username || 'Неизвестный';
    const userLink = `<a href="tg://user?id=${userToBan.id}">${username}</a>`;
    let adminMessage = `
☑️ Пользователь ${userLink} успешно заблокирован.
🆔 Числовой ID: ${numericId}
🗒 Причина: ${reason}
${banUntil === null ? '⏳ Время бана: Навсегда' : `⏳ Время бана: ${banHours} часов`}
`;
    // Добавляем информацию о квоте только если пользователь подвержен лимитам
    if (actionPermission.remaining < Infinity) {
        adminMessage += `\n📊 Осталось действий(бан/разбан) сегодня: ${Math.max(0, actionPermission.remaining - 1)}/${ACTION_LIMIT_PER_DAY}`;
    }
    adminMessage = adminMessage.trim();

    console.log(adminMessage);
    await ctx.reply(adminMessage, { parse_mode: 'HTML' });

    const userMessage = `
📛 <b>Вы были забанены администратором.</b>
📕 <b>Причина:</b> ${reason}
${banUntil === null 
  ? '⏳ <b>Время бана:</b> Навсегда' 
  : `⏳ <b>Время бана:</b> ${banHours} часов\n\n🆘 <b>"Репорт [текст вопроса]"</b> - в случае возникновения вопросов!`}
`.trim();

    await ctx.telegram.sendMessage(userToBan.id, userMessage, { parse_mode: 'HTML' }).catch((error) => {
      console.error(`Не удалось отправить сообщение пользователю ${userToBan.id}:`, error);
    });

  } catch (error) {
    console.error('Ошибка при выполнении команды "бан":', error);
    await ctx.reply('❕ Произошла ошибка. Попробуйте позже.');
  }
}

async function unbanUserHandler(ctx) {
  try {
    const senderId = ctx.from.id.toString();
    
    // 1. Проверка базовых прав и контекста
    if (!(await isAdmin_ban(ctx))) {
      // Определяем, почему нет доступа
      const statuses = await getUserStatuses(senderId).catch(() => []);
      const isRegularAdmin = statuses.includes('Администратор');
      const isTechOrMainAdmin = statuses.includes('Тех администратор') || isMainAdmin(senderId);
      const isSpecialAdmin = SPECIAL_ADMINS.includes(senderId);
      
      if ((isRegularAdmin || isSpecialAdmin) && !isTechOrMainAdmin && !isMainAdmin(senderId)) {
          const chatId = ctx?.chat?.id?.toString();
          if (chatId && chatId !== 'private' && chatId !== ADMIN_COMMANDS_CHAT_ID) {
              return ctx.reply(`❕ Обычные администраторы могут использовать команду "разбан" только в ЛС бота или в чате с ID ${ADMIN_COMMANDS_CHAT_ID}.`);
          }
      }
      console.warn(`Пользователь ${senderId} попытался использовать команду "разбан" без прав или в неправильном чате.`);
      return ctx.reply('❕ У вас нет прав для использования этой команды в этом чате.');
    }

    // 2. Проверка структуры сообщения
    if (!ctx.message || !ctx.message.text || ctx.message.text.trim() === '') {
      console.warn('Получено некорректное сообщение без текста.');
      return ctx.reply('❕ Некорректное сообщение. Команда должна содержать текст.');
    }

    const text = ctx.message.text.trim();
    const parts = text.split(/\s+/);

    if (parts.length < 2 || parts[0].toLowerCase() !== 'разбан') {
      console.warn(`Сообщение "${text}" не является командой "разбан".`);
      return ctx.reply('❕ Использование: разбан <id>');
    }

    // 3. Парсинг аргументов
    const numericId = parseInt(parts[1], 10);

    if (isNaN(numericId)) {
      console.warn(`Некорректный аргумент id=${numericId}`);
      return ctx.reply('❕ Некорректный числовой ID. Использование: разбан <id>');
    }

    // 4. Проверка квоты на действие
    const actionPermission = await canUserPerformAction(senderId);
    if (!actionPermission.allowed) {
      // Проверяем, является ли пользователь обычным админом или специальным админом
      const statuses = await getUserStatuses(senderId);
      const isSpecialAdmin = SPECIAL_ADMINS.includes(senderId);
      if (statuses.includes('Администратор') || isSpecialAdmin) {
         return ctx.reply(`❌ Вы исчерпали лимит действий (бан/разбан) на сегодня. Осталось: ${actionPermission.remaining}/${ACTION_LIMIT_PER_DAY}`);
      } else {
         console.warn(`Пользователь ${senderId} попытался использовать команду "разбан" без прав (проверка квоты).`);
         return ctx.reply('❕ У вас нет прав для использования этой команды.');
      }
    }

    // 5. Поиск пользователя
    const userToUnban = await getUserByNumericId(numericId);

    if (!userToUnban) {
      console.warn(`Пользователь с id=${numericId} не найден.`);
      return ctx.reply('❕ Пользователь с указанным id не найден.');
    }

    // 6. Проверка, находится ли в ЧС
    if (!(await isUserBanned(userToUnban.id))) {
      console.warn(`Пользователь с id=${numericId} не находится в черном списке.`);
      return ctx.reply('❕ Пользователь не находится в черном списке.');
    }

    // 7. Удаление из черного списка
    await removeFromBlacklist(userToUnban.id);

    // 8. Запись действия в лог (если это обычный админ или специальный админ)
    const senderStatuses = await getUserStatuses(senderId);
    const isSenderSpecialAdminForLogging = SPECIAL_ADMINS.includes(senderId);
    if (actionPermission.remaining < Infinity && (senderStatuses.includes('Администратор') || isSenderSpecialAdminForLogging)) {
       const recordResult = recordAdminAction(senderId, 'unban', userToUnban.id);
       if (!recordResult.success) {
         console.error(`[ЧС] Не удалось записать действие разбана админа ${senderId} для пользователя ${userToUnban.id}:`, recordResult.error);
       }
    }

    // 9. Формирование и отправка сообщений
    const username = userToUnban.username || 'Неизвестный';
    const userLink = `<a href="tg://user?id=${userToUnban.id}">${username}</a>`;
    let adminMessage = `✅ Пользователь ${userLink} успешно разблокирован.`;
    // Добавляем информацию о квоте только если пользователь подвержен лимитам
    if (actionPermission.remaining < Infinity) {
        adminMessage += `\n📊 Осталось действий(бан/разбан) сегодня: ${Math.max(0, actionPermission.remaining - 1)}/${ACTION_LIMIT_PER_DAY}`;
    }
    adminMessage = adminMessage.trim();

    console.log(adminMessage);
    await ctx.reply(adminMessage, { parse_mode: 'HTML' });

    const userMessage = '✅ <b>Вы были разблокированы администратором.</b>\n\n🆘 <b>Если у Вас остались вопросы по поводу блокировки — используйте "Репорт".</b>';

    await ctx.telegram.sendMessage(userToUnban.id, userMessage, {
      parse_mode: 'HTML'
    }).catch((error) => {
      console.error(`Не удалось отправить сообщение пользователю ${userToUnban.id}:`, error);
    });

  } catch (error) {
    console.error('Ошибка при выполнении команды "разбан":', error);
    await ctx.reply('Произошла ошибка. Попробуйте позже.');
  }
}

// Обработка команды "чс" (без изменений в логике, кроме isAdmin_ban)
async function listBannedPlayersHandler(ctx) {
  try {
    // Проверка прав и контекста
    if (!(await isAdmin_ban(ctx))) {
      const senderId = ctx.from.id.toString();
      const statuses = await getUserStatuses(senderId).catch(() => []);
      const isRegularAdmin = statuses.includes('Администратор');
      const isTechOrMainAdmin = statuses.includes('Тех администратор') || isMainAdmin(senderId);
      const isSpecialAdmin = SPECIAL_ADMINS.includes(senderId);
      
      if ((isRegularAdmin || isSpecialAdmin) && !isTechOrMainAdmin && !isMainAdmin(senderId)) {
          const chatId = ctx?.chat?.id?.toString();
          if (chatId && chatId !== 'private' && chatId !== ADMIN_COMMANDS_CHAT_ID) {
              // Можно не отправлять сообщение для команды "чс", просто игнорировать
              console.log(`[ЧС] Обычный админ ${senderId} попытался использовать "чс" в чате ${chatId}. Доступ запрещен.`);
              return; // Просто выходим, не отправляя сообщение об ошибке
          }
      }
      // Если нет прав совсем
      console.log(`[ЧС] Пользователь ${senderId} попытался использовать "чс" без прав.`);
      return; // Просто выходим
    }

    const blacklist = await getBlacklist();

    if (!blacklist.length) {
      return ctx.reply('Черный список пуст.');
    }

    let response = '';

    for (const banned of blacklist) {
      const user = await getUserById(banned.user_id);
      if (!user) {
        response += `• <b>Неизвестно</b> | Числовой ID: ${banned.user_id} (удален) | Причина: ${
          banned.reason || 'Не указана'
        } | До: ${banned.banned_until ? new Date(banned.banned_until * 1000).toLocaleString() : 'Навсегда'}\n`;
        continue;
      }

      const username = user?.username || 'Неизвестно';
      const numericId = user?.numeric_id;
      const userLink = `<a href="tg://user?id=${user.id}">${username}</a>`;

      const banExpiresAt = banned.banned_until 
        ? new Date(banned.banned_until * 1000).toLocaleString() 
        : 'Навсегда';

      response += `• ${userLink} | Числовой ID: ${numericId} | Причина: ${banned.reason || 'Не указана'} | До: ${banExpiresAt}\n`;
    }

    await ctx.reply(response, { parse_mode: 'HTML' });
  } catch (error) {
    console.error('Ошибка при выполнении команды "чс":', error);
    await ctx.reply('Произошла ошибка. Попробуйте позже.');
  }
}

// Функция для автоматического разбана пользователей (без изменений)
function startAutoUnban(bot) {
  setInterval(async () => {
    try {
      const blacklist = await getBlacklist();
      const currentTime = Math.floor(Date.now() / 1000);

      for (const bannedUser of blacklist) {
        const userId = bannedUser.user_id;
        const banExpiresAt = bannedUser.banned_until;

        if (banExpiresAt && currentTime > banExpiresAt) {
          await removeFromBlacklist(userId);

          try {
            await bot.telegram.sendMessage(
              userId,
              '⏳Время блокировки истекло, и ваш аккаунт был разблокирован!'
            );
          } catch (error) {
            console.error(`Не удалось отправить сообщение пользователю ${userId}:`, error);
          }
        }
      }
    } catch (error) {
      console.error('Ошибка при выполнении автоматического разбана:', error);
    }
  }, 60000); // Проверяем каждую минуту
}

// Экспортируем функции
module.exports = {
  banUserHandler,
  unbanUserHandler,
  listBannedPlayersHandler,
  startAutoUnban,
  isAdmin_ban,
  isMainAdmin,
  isTechAdmin,
  isAdminRole,
  canUserPerformAction,
  canAdminUseCommandsHere // Экспортируем для тестирования или других нужд
};
