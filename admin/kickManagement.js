// admin/kickManagement.js

// Импортируем нужные функции из db.js
const {
  getUserByNumericId,
  getUserStatuses,
  getUserById, // Добавлено для получения информации о пользователе при кике
  recordAdminKickAction,      // Функция для записи действий кика
  getAdminKickActionsInRange, // Функция для получения истории киков
  getLastAdminKickActionTime, // Функция для получения времени последнего кика
  cleanupExpiredAdminKickActions, // Функция для очистки старых записей
  logModeration // Единый аудит-лог с человеческой формулировкой
} = require('../db'); // Убедитесь, что путь правильный

// Импортируем нужные функции из blacklistManagement.js для согласованности логики
const {
  isMainAdmin,
  isTechAdmin, // Предполагается, что isTechAdmin доступна глобально или импортируется
  isAdminRole, // Предполагается, что isAdminRole доступна глобально или импортируется
  isAdmin_ban, // Используем общую функцию проверки прав и контекста
  canAdminUseCommandsHere // Используем общую функцию проверки контекста
} = require('./blacklistManagement'); // Убедитесь, что путь правильный

// --- Конфигурация ---
// ID чатов, где обычные админы могут использовать команды
const ADMIN_COMMANDS_CHAT_IDS = ['-1002546508751', '-1002681608387', '-1002367191814'];
const KICK_LIMIT_PER_DAY = 2; // Лимит киков в сутки для обычных админов
const SPECIAL_ADMINS = ['6891998751', '1027168131']; // ID админов, подверженных лимитам

// --- Логика отслеживания действий кика ---

// Функция для очистки устаревших записей о киках (можно вызывать периодически)
// setInterval(cleanupExpiredAdminKickActions, 30 * 60 * 1000); // Каждые 30 минут

// --- Обновлённая функция проверки квоты на кик ---
async function canUserPerformKickAction(adminId) {
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
      const LIMIT = KICK_LIMIT_PER_DAY;
      const WINDOW_SIZE = 24 * 60 * 60; // 24 часа в секундах
      const now = Math.floor(Date.now() / 1000);

      // 1. Получаем время последнего действия кика
      const lastKickActionTime = getLastAdminKickActionTime(adminIdStr); // Предполагается, что эта функция реализована в db.js

      // 2. Если действий кика не было вообще, квота полная
      if (lastKickActionTime === null) {
         return { allowed: true, remaining: LIMIT };
      }

      // 3. Если последний кик был более 24ч назад, квота восстановлена
      if (now - lastKickActionTime > WINDOW_SIZE) {
         return { allowed: true, remaining: LIMIT };
      }

      // 4. Иначе, считаем кики за последние 24ч от ПОСЛЕДНЕГО кика
      const windowStart = lastKickActionTime - WINDOW_SIZE;
      const windowEnd = lastKickActionTime;

      const kickActions = getAdminKickActionsInRange(adminIdStr, windowStart, windowEnd); // Предполагается, что эта функция реализована в db.js
      const kickCount = kickActions.length;

      const remaining = LIMIT - kickCount;

      return { allowed: remaining > 0, remaining };
    }

    return { allowed: false, remaining: 0 };
  } catch (error) {
    console.error('[Кик] Ошибка при проверке прав на выполнение действия кика:', error);
    return { allowed: false, remaining: 0 };
  }
}

// --- Обновлённая функция для проверки контекста использования команд кика ---
// Используем общую функцию canAdminUseCommandsHere из blacklistManagement.js, но с обновлённым списком чатов
// Переопределяем локально для корректной работы с ADMIN_COMMANDS_CHAT_IDS
async function canAdminUseKickCommandsHere(ctx, adminId) {
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
        // Разрешено в ЛС или в указанных чатах
        if (!chatId || chatId === 'private' || ADMIN_COMMANDS_CHAT_IDS.includes(chatId)) {
            return true;
        } else {
            return false;
        }
    }

    return false; // Не админ
}

// --- Обновлённая функция проверки базовых прав и контекста для кика ---
async function isAdmin_kick(ctx) {
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
        return await canAdminUseKickCommandsHere(ctx, senderId);

    } catch (error) {
        console.error('[ERROR] Ошибка при проверке статусов администратора для кика:', error);
        return false;
    }
}

// --- Функция для проверки прав на кик ---
// Эта функция теперь используется внутри kickUserHandler после проверки базовых прав
async function canKickUser(userId, targetUserId, chatId) {
  userId = userId.toString();
  targetUserId = targetUserId.toString();
  chatId = chatId.toString();

  // Нельзя кикнуть самого себя
  if (userId === targetUserId) {
    return false;
  }

  // Главный админ может кикать в любом чате, кроме себя
  if (isMainAdmin(userId)) {
    return !(isMainAdmin(targetUserId)); // Не может кикнуть самого себя
  }

  const isUserSpecialAdmin = SPECIAL_ADMINS.includes(userId);
  const isTargetSpecialAdmin = SPECIAL_ADMINS.includes(targetUserId);

  // Тех администратор (кроме специальных)
  if ((await isTechAdmin(userId)) && !isUserSpecialAdmin) {
    // Не может кикнуть главного админа
    if (isMainAdmin(targetUserId)) {
      return false;
    }
    // Не может кикнуть специального админа
    if (isTargetSpecialAdmin) {
        return false;
    }
    // Может кикнуть любого другого пользователя
    return true;
  }

  // Специальный админ или обычный администратор
  if (isUserSpecialAdmin || (await isAdminRole(userId))) {
    // Не может кикнуть главного админа
    if (isMainAdmin(targetUserId)) {
      return false;
    }
    // Не может кикнуть другого тех. админа (включая специальных)
    if ((await isTechAdmin(targetUserId)) || isTargetSpecialAdmin) {
      return false;
    }
    // Не может кикнуть другого админа (включая себя)
    if (await isAdminRole(targetUserId)) {
      return false;
    }
    // Может кикнуть всех остальных
    return true;
  }

  // Остальные пользователи не имеют права кика
  return false;
}

async function kickUserHandler(ctx) {
  try {
    const senderId = ctx.from.id.toString();

    // 1. Проверка базовых прав и контекста (используем обновлённую функцию)
    if (!(await isAdmin_kick(ctx))) {
      // Определяем, почему нет доступа
      const statuses = await getUserStatuses(senderId).catch(() => []);
      const isRegularAdmin = statuses.includes('Администратор');
      const isTechOrMainAdmin = statuses.includes('Тех администратор') || isMainAdmin(senderId);
      const isSpecialAdmin = SPECIAL_ADMINS.includes(senderId);

      if ((isRegularAdmin || isSpecialAdmin) && !isTechOrMainAdmin && !isMainAdmin(senderId)) {
          const chatId = ctx?.chat?.id?.toString();
          if (chatId && chatId !== 'private' && !ADMIN_COMMANDS_CHAT_IDS.includes(chatId)) {
              return ctx.reply(`❕ Администраторы бота могут использовать команду "кик" только в официальных чатах.`);
          }
      }
      console.warn(`Пользователь ${senderId} попытался использовать команду "кик" без прав или в неправильном чате.`);
      // Не отправляем сообщение, если нет прав совсем
      return;
    }

    // Проверяем, что команда используется не в приватном чате
    if (ctx.chat.type === 'private') {
      return ctx.reply('❌ Эту команду можно использовать только в групповом чате.');
    }

    // Проверяем, что сообщение существует и содержит текст
    if (!ctx.message || !ctx.message.text) {
      return ctx.reply('❕ Некорректное сообщение. Команда должна содержать текст.');
    }

    const text = ctx.message.text.trim();
    const parts = text.split(/\s+/);

    if (parts.length < 2 || parts[0].toLowerCase() !== 'кик') {
      return ctx.reply('❕ Использование: кик [ID] [причина].');
    }

    // 2. Проверка квоты на действие кика
    const kickPermission = await canUserPerformKickAction(senderId);
    if (!kickPermission.allowed) {
      // Проверяем, является ли пользователь обычным админом или специальным админом
      const statuses = await getUserStatuses(senderId);
      const isSpecialAdmin = SPECIAL_ADMINS.includes(senderId);
      if (statuses.includes('Администратор') || isSpecialAdmin) {
         return ctx.reply(`❌ Вы исчерпали лимит действий (кик) на сегодня. Осталось: ${kickPermission.remaining}/${KICK_LIMIT_PER_DAY}`);
      } else {
         // Эта ветка маловероятна, так как права уже проверены выше
         console.warn(`Пользователь ${senderId} попытался использовать команду "кик" без прав (проверка квоты).`);
         return; // Просто выходим
      }
    }

    const numericId = parseInt(parts[1], 10);
    const reason = parts.slice(2).join(' ') || 'Не указана';

    if (isNaN(numericId)) {
      return ctx.reply('❕ Некорректный числовой ID пользователя. Использование: кик [ID] [причина].');
    }

    const userToKick = await getUserByNumericId(numericId);
    if (!userToKick) {
      return ctx.reply('❕ Пользователь с указанным id не найден.');
    }

    const chatId = ctx.chat.id.toString();

    // 3. Проверяем права на кик конкретного пользователя
    if (!(await canKickUser(senderId, userToKick.id, chatId))) {
      console.warn(`Пользователь ${senderId} попытался кикнуть пользователя ${userToKick.id} без прав.`);
      // Сообщения об ошибках уже обработаны в isAdmin_kick.
      const statuses = await getUserStatuses(senderId);
      const isSpecialAdmin = SPECIAL_ADMINS.includes(senderId);
      if ((statuses.includes('Администратор') || isSpecialAdmin) &&
          ((await isTechAdmin(userToKick.id)) || (SPECIAL_ADMINS.includes(userToKick.id.toString())) || await isAdminRole(userToKick.id) || isMainAdmin(userToKick.id))) {
          return ctx.reply('❕ Вы не можете кикать других администраторов или тех. админов.');
      }
      // Если это просто запрет, просто выходим без сообщения
      return;
    }

    // Проверяем, является ли пользователь владельцем чата (это действие может не сработать для владельца)
    // const chatMember = await ctx.telegram.getChatMember(ctx.chat.id, userToKick.id);
    // if (chatMember.status === 'creator') {
    //   return ctx.reply('❕ Невозможно кикнуть владельца чата.');
    // }

    // 4. Кикаем пользователя из чата (бан)
    await ctx.telegram.banChatMember(ctx.chat.id, userToKick.id);

    // 4.1. Единый аудит-лог кика
    logModeration({
      adminId: senderId,
      targetUserId: userToKick.id,
      type: 'kick',
      chatId,
      chatTitle: ctx.chat?.title || null, // ← НАЗВАНИЕ ЧАТА
      reason,
      success: 1,
    });

    // 5. Запись действия в лог (если это обычный админ или специальный админ)
    const statuses = await getUserStatuses(senderId);
    const isSpecialAdmin = SPECIAL_ADMINS.includes(senderId);
    if (kickPermission.remaining < Infinity && (statuses.includes('Администратор') || isSpecialAdmin)) {
       const recordResult = recordAdminKickAction(senderId, userToKick.id); // Предполагается, что эта функция реализована в db.js
       if (!recordResult.success) {
         console.error(`[Кик] Не удалось записать действие кика админа ${senderId} для пользователя ${userToKick.id}:`, recordResult.error);
       }
    }

    // 6. Формируем сообщение администратору
    const username = userToKick.username || 'Неизвестный';
    const userLink = `<a href="tg://user?id=${userToKick.id}">${username}</a>`;
    let adminMessage = `
⚠️ Пользователь ${userLink} успешно кикнут из чата.
🆔 Числовой ID: ${numericId}
📕 Причина: ${reason}
`;
    // Добавляем информацию о квоте только если пользователь подвержен лимитам
    if (kickPermission.remaining < Infinity) {
        adminMessage += `📊 Осталось действий (кик) сегодня: ${Math.max(0, kickPermission.remaining - 1)}/${KICK_LIMIT_PER_DAY}\n`;
    }
    adminMessage = adminMessage.trim();

    await ctx.reply(adminMessage, { parse_mode: 'HTML' });

    // 7. Отправляем сообщение кикнутому пользователю в ЛС
    const userMessage = `
⚠️ Вы были кикнуты модератором/администратором из чата.
📕 Причина: ${reason}
`.trim();

    await ctx.telegram.sendMessage(userToKick.id, userMessage, { parse_mode: 'HTML' }).catch((error) => {
      console.error(`Не удалось отправить сообщение пользователю ${userToKick.id}:`, error);
      // Можно добавить уведомление админу, что сообщение не доставлено
      ctx.reply(`⚠️ Сообщение пользователю ${userLink} не было доставлено (возможно, он заблокировал бота).`, { parse_mode: 'HTML' }).catch(console.error);
    });

  } catch (error) {
    console.error('Ошибка при выполнении команды "кик":', error);
    if (error.response && error.response.error_code === 400) {
      if (error.response.description.includes('not enough rights')) {
        return ctx.reply('❕ У бота недостаточно прав для выполнения этой команды. Бот должен быть администратором с правом блокировать пользователей.');
      } else if (error.response.description.includes('PARTICIPANT_ID_INVALID') || error.response.description.includes('user not found')) {
        return ctx.reply('❕ Пользователь не является участником этого чата или не найден.');
      } else if (error.response.description.includes('user is an administrator')) {
        return ctx.reply('❕ Невозможно кикнуть администратора чата.');
      }
    }
    await ctx.reply('Произошла ошибка. Попробуйте позже.');
  }
}

// Экспортируем функции
module.exports = {
  kickUserHandler,
  canKickUser,
  canUserPerformKickAction, // Экспортируем для тестирования или других нужд
  isAdmin_kick, // Экспортируем новую функцию проверки прав для кика
  canAdminUseKickCommandsHere, // Экспортируем для тестирования
  recordAdminKickAction, getAdminKickActionsInRange, getLastAdminKickActionTime, cleanupExpiredAdminKickActions,
};