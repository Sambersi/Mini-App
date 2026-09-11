const { addMute, removeMute, isUserMuted, getMuteList } = require('../db');
const { getUserByNumericId, getUserStatuses, logModeration } = require('../db');
const { Telegraf } = require('telegraf');

// Функция для проверки, является ли пользователь главным администратором
function isMainAdmin(userId) {
  return process.env.MAIN_ADMIN === userId.toString();
}

// Функция для проверки, является ли пользователь "Тех администратор"
async function isTechAdmin(userId) {
  const statuses = await getUserStatuses(userId); // Получаем статусы пользователя
  return statuses.includes('Тех администратор'); // Проверяем наличие статуса
}

// Функция для проверки, является ли пользователь "Администратор"
async function isAdminRole(userId) {
  const statuses = await getUserStatuses(userId); // Получаем статусы пользователя
  return statuses.includes('Администратор'); // Проверяем наличие статуса
}

// Функция для проверки, является ли пользователь "Модератор"
async function isModerator(userId) {
  const statuses = await getUserStatuses(userId); // Получаем статусы пользователя
  return statuses.includes('Модератор'); // Проверяем наличие статуса
}

// Функция для получения названия чата
function getChatName(chatId) {
  const chatNames = {
    '-1002681608387': 'DICE',
    '-1002546508751': 'DOUBLE PLUSS'
  };
  return chatNames[chatId] || 'Неизвестный чат';
}

// Функция для проверки, является ли чат официальным для модераторов
function isOfficialChatForModerators(chatId) {
  const officialChats = ['-1002681608387', '-1002546508751']; // DICE и DOUBLE PLUSS
  return officialChats.includes(chatId.toString());
}

// Функция для проверки прав на мут для главного администратора
async function canMainAdminMute(targetUserId) {
  // Главный админ может мутить всех, кроме себя
  return !isMainAdmin(targetUserId);
}

// Функция для проверки прав на мут для тех администратора
async function canTechAdminMute(userId, targetUserId) {
  // Тех админ может мутить администраторов и модераторов, но не главного админа
  if (isMainAdmin(targetUserId)) {
    return false;
  }
  
  // Может мутить пользователей с защищенными статусами или обычных пользователей
  return true;
}

// Функция для проверки прав на мут для модератора
async function canModeratorMute(userId, targetUserId, chatId) {
  // Модераторы могут использовать мут только в официальных чатах
  if (!isOfficialChatForModerators(chatId)) {
    return false;
  }
  
  // Модератор не может мутить главного админа, тех админа и других модераторов
  if (isMainAdmin(targetUserId)) {
    return false;
  }
  
  if (await isTechAdmin(targetUserId)) {
    return false;
  }
  
  if (await isModerator(targetUserId) && targetUserId !== userId) {
    return false;
  }
  
  // Может мутить всех остальных, включая администраторов
  return true;
}

// Функция для проверки прав на мут
async function canMuteUser(userId, targetUserId, chatId) {
  userId = userId.toString();
  targetUserId = targetUserId.toString();
  chatId = chatId.toString();
  
  // Нельзя замутить самого себя
  if (userId === targetUserId) {
    return false;
  }
  
  // Главный админ может мутить в любом чате
  if (isMainAdmin(userId)) {
    return await canMainAdminMute(targetUserId);
  }
  
  // Тех администратор
  if (await isTechAdmin(userId)) {
    return await canTechAdminMute(userId, targetUserId);
  }
  
  // Модератор
  if (await isModerator(userId)) {
    return await canModeratorMute(userId, targetUserId, chatId);
  }
  
  // Остальные пользователи не имеют права мута
  return false;
}

// Функция для проверки защищенных статусов пользователя
async function isProtectedUser(userId) {
  try {
    const statuses = await getUserStatuses(userId);
    const protectedStatuses = ['Администратор', 'Тех администратор', 'Модератор'];
    return statuses.some(status => protectedStatuses.includes(status));
  } catch (error) {
    console.error('Ошибка при проверке защищенных статусов:', error);
    return false;
  }
}

// Функция для проверки прав бота в чате
async function checkBotPermissions(ctx) {
  try {
    const botMember = await ctx.telegram.getChatMember(ctx.chat.id, ctx.botInfo.id);
    return botMember.status === 'administrator' && botMember.can_restrict_members;
  } catch (error) {
    console.error('Ошибка при проверке прав бота:', error);
    return false;
  }
}

// Функция для проверки, является ли пользователь участником чата
async function isUserInChat(ctx, userId) {
  try {
    const chatMember = await ctx.telegram.getChatMember(ctx.chat.id, userId);
    return chatMember.status !== 'left' && chatMember.status !== 'kicked';
  } catch (error) {
    if (error.response && error.response.error_code === 400) {
      if (error.response.description.includes('PARTICIPANT_ID_INVALID')) {
        return false;
      }
    }
    throw error;
  }
}

async function muteUserHandler(ctx) {
  try {
    // Проверяем, что команда используется не в приватном чате
    if (ctx.chat.type === 'private') {
      return ctx.reply('❕ Эту команду можно использовать только в групповом чате.', {
        parse_mode: 'HTML',
      });
    }

    if (!ctx.message || !ctx.message.text || ctx.message.text.trim() === '') {
      console.warn('❕ Получено некорректное сообщение без текста.');
      return ctx.reply('❕ Некорректное сообщение. Команда должна содержать текст.');
    }

    const text = ctx.message.text.trim();
    const parts = text.split(/\s+/);
    if (parts.length < 3 || parts[0].toLowerCase() !== 'мут') {
      console.warn(`Сообщение "${text}" не является командой "мут".`);
      return ctx.reply('❕ Использование: мут [ID] [время_в_часах/мин] [причина].');
    }

    const senderId = ctx.from.id.toString();
    const chatId = ctx.chat.id.toString();

    const numericId = parseInt(parts[1], 10);
    let muteType = parts[2];
    const reason = parts.slice(3).join(' ') || 'Не указана';

    if (isNaN(numericId)) {
      console.warn(`Некорректный числовой ID пользователя: ${parts[1]}`);
      return ctx.reply('❕ Некорректный числовой ID пользователя. Использование: мут [ID] [время_в_часах/мин] [причина].');
    }

    const userToMute = await getUserByNumericId(numericId);
    if (!userToMute) {
      console.warn(`Пользователь с id=${numericId} не найден.`);
      return ctx.reply('❕ Пользователь с указанным id не найден.');
    }

    // Проверяем права на мут
    if (!(await canMuteUser(senderId, userToMute.id, chatId))) {
      console.warn(`Пользователь ${senderId} попытался замьютить пользователя ${userToMute.id} без прав или в неофициальном чате.`);
      if (await isModerator(senderId) && !isOfficialChatForModerators(chatId)) {
        return ctx.reply('❕ Модераторы могут использовать мут только в официальных чатах (DICE и DOUBLE PLUSS).');
      }
      return ctx.reply('❕ У вас нет прав для мута этого пользователя.');
    }

    // Проверяем, находится ли пользователь уже в муте в этом чате
    const isAlreadyMuted = await isUserMuted(userToMute.id, chatId);
    if (isAlreadyMuted) {
      return ctx.reply('❕ Пользователь уже замьючен в этом чате.');
    }

    // Проверяем, является ли пользователь участником чата
    const isUserInChatResult = await isUserInChat(ctx, userToMute.id);
    if (!isUserInChatResult) {
      return ctx.reply('❕ Пользователь не является участником этого чата.');
    }

    // Проверяем, является ли пользователь владельцем чата
    try {
      const chatMember = await ctx.telegram.getChatMember(chatId, userToMute.id);
      if (chatMember.status === 'creator') {
        return ctx.reply('❕ Невозможно замьютить владельца чата.');
      }
    } catch (error) {
      if (error.response && error.response.error_code === 400) {
        if (error.response.description.includes('PARTICIPANT_ID_INVALID')) {
          return ctx.reply('❕ Пользователь не является участником этого чата.');
        }
      }
      throw error;
    }

    // Проверяем права бота
    const hasBotPermissions = await checkBotPermissions(ctx);
    if (!hasBotPermissions) {
      return ctx.reply('❕ У бота недостаточно прав для выполнения этой команды. Бот должен быть администратором с правом ограничивать пользователей.');
    }

    let muteHours = null;
    let muteMinutes = null;

    if (muteType.toLowerCase() !== 'навсегда') {
      // Проверяем, указано ли слово "мин"
      const isMinutes = parts[3]?.toLowerCase() === 'мин';
      const parsedTime = parseFloat(muteType);

      if (isNaN(parsedTime) || parsedTime <= 0) {
        return ctx.reply('❕ Некорректное время мута. Использование: мут <id> [время_в_часах/мин] [причина].');
      }

      muteHours = isMinutes ? parsedTime / 60 : parsedTime; // Преобразуем минуты в часы
      muteMinutes = isMinutes ? parsedTime : parsedTime * 60; // Преобразуем часы в минуты
    }

    const mutedUntil = muteHours === null
      ? null // Если мут навсегда
      : Math.floor((Date.now() / 1000) + muteHours * 3600); // Время окончания мута в секундах

    // Добавляем пользователя в базу данных
    await addMute(userToMute.id, chatId, reason, mutedUntil);

    // Ограничиваем права пользователя в чате
    const permissions = {
      can_send_messages: false,
      can_send_media_messages: false,
      can_send_polls: false,
      can_send_other_messages: false,
      can_add_web_page_previews: false,
      can_change_info: false,
      can_invite_users: false,
      can_pin_messages: false,
    };

    const untilDate = muteHours === null ? 0 : Math.floor(Date.now() / 1000) + muteHours * 3600;
    
    try {
      await ctx.telegram.restrictChatMember(chatId, userToMute.id, permissions, untilDate);
    } catch (restrictError) {
      // Если не удалось ограничить пользователя, удаляем запись из базы данных
      await removeMute(userToMute.id, chatId);
      
      if (restrictError.response && restrictError.response_code === 400) {
        if (restrictError.response.description.includes('not enough rights')) {
          return ctx.reply('❕ У бота недостаточно прав для ограничения этого пользователя. Возможно, пользователь является администратором.');
        } else if (restrictError.response.description.includes('user is an administrator')) {
          return ctx.reply('❕ Невозможно замьютить администратора чата.');
        } else if (restrictError.response.description.includes('PARTICIPANT_ID_INVALID')) {
          return ctx.reply('❕ Пользователь не является участником этого чата.');
        }
      }
      
      throw restrictError; // Перебрасываем ошибку, если она другого типа
    }

    // === ЛОГ: мут в finance_log (только после успешного restrictChatMember) ===
    logModeration({
      adminId: senderId,
      targetUserId: userToMute.id,
      type: 'mute',
      chatId: chatId,
      chatTitle: ctx.chat?.title || null, 
      reason: reason,
      durationHours: muteHours,
      success: 1,
    });

    // Формируем сообщение администратору
    const username = userToMute.username || 'Неизвестный';
    const userLink = `<a href="tg://user?id=${userToMute.id}">${username}</a>`;
    const chatName = getChatName(chatId);
    const formattedTime = formatMuteTime(muteHours, muteMinutes); // Форматируем время мута
    const adminMessage = `
☑️ Пользователь ${userLink} успешно замьючен.
📕 Причина: ${reason}
⏳ Время мута: ${formattedTime}
📍 Чат: ${chatName}
    `.trim();

    await ctx.reply(adminMessage, { parse_mode: 'HTML' });

    // Отправляем сообщение замьюченному пользователю в ЛС
    const userMessage = `
🔇 Вы были замьючены модератором.
📕 Причина: ${reason}
⏳ Время мута: ${formattedTime}
📍 Чат: ${chatName}
${formattedTime !== 'Навсегда' ? '\n\n🆘 "Репорт" - в случае возникновения вопросов!' : ''}
    `.trim();

    await ctx.telegram.sendMessage(userToMute.id, userMessage, { parse_mode: 'HTML' }).catch((error) => {
      console.error(`Не удалось отправить сообщение пользователю ${userToMute.id}:`, error);
    });
  } catch (error) {
    console.error('Ошибка при выполнении команды "мут":', error);
    if (error.response && error.response.error_code === 400) {
      if (error.response.description.includes('not enough rights')) {
        return ctx.reply('❕ У бота недостаточно прав для выполнения этой команды. Бот должен быть администратором с правом ограничивать пользователей.');
      } else if (error.response.description.includes('PARTICIPANT_ID_INVALID')) {
        return ctx.reply('❕ Пользователь не является участником этого чата.');
      } else if (error.response.description.includes('user is an administrator')) {
        return ctx.reply('❕ Невозможно замьютить администратора чата.');
      }
    }
    await ctx.reply('Произошла ошибка. Попробуйте позже.');
  }
}

// Функция для форматирования времени мута
function formatMuteTime(hours, minutes) {
  if (hours === null) {
    return 'Навсегда';
  }

  if (hours < 1) {
    return `${Math.round(minutes)} минут`;
  }

  const hoursPart = Math.floor(hours);
  const minutesPart = Math.round((hours - Math.floor(hours)) * 60);

  if (minutesPart === 0) {
    return `${hoursPart} час${hoursPart > 1 ? 'а' : ''}`;
  }

  return `${hoursPart} час${hoursPart > 1 ? 'а' : ''} ${minutesPart} минут`;
}

async function unmuteUserHandler(ctx) {
  try {
    // ❕ Запрещаем использование в личных чатах
    if (ctx.chat.type === 'private') {
      return ctx.reply('❕ Эту команду можно использовать только в групповом чате.', {
        parse_mode: 'HTML',
      });
    }

    if (!ctx.message || !ctx.message.text || ctx.message.text.trim() === '') {
      console.warn('Получено некорректное сообщение без текста.');
      return ctx.reply('❕ Некорректное сообщение. Команда должна содержать текст.');
    }

    const text = ctx.message.text.trim();
    const parts = text.split(/\s+/);
    if (parts.length < 2 || parts[0].toLowerCase() !== 'размут') {
      console.warn(`Сообщение "${text}" не является командой "размут".`);
      return ctx.reply('❕ Использование: размут <numeric_id>.');
    }

    const senderId = ctx.from.id.toString();
    const chatId = ctx.chat.id.toString();

    const numericId = parseInt(parts[1], 10);
    if (isNaN(numericId)) {
      console.warn(`Некорректный числовой ID пользователя: ${parts[1]}`);
      return ctx.reply('❕ Некорректный числовой ID пользователя. Использование: размут <numeric_id>.');
    }

    const userToUnmute = await getUserByNumericId(numericId);
    if (!userToUnmute) {
      console.warn(`Пользователь с id=${numericId} не найден.`);
      return ctx.reply('❕ Пользователь с указанным id не найден.');
    }

    // Проверяем, находится ли пользователь в муте
    if (!(await isUserMuted(userToUnmute.id, chatId))) {
      return ctx.reply('❕ Пользователь не находится в муте в этом чате.');
    }

    // Проверяем права на размут
    if (!(await canMuteUser(senderId, userToUnmute.id, chatId))) {
      console.warn(`Пользователь ${senderId} попытался размьютить пользователя ${userToUnmute.id} без прав или в неофициальном чате.`);
      if (await isModerator(senderId) && !isOfficialChatForModerators(chatId)) {
        return ctx.reply('❕ Модераторы могут использовать размут только в официальных чатах (DICE и DOUBLE PLUSS).');
      }
      return ctx.reply('❕ У вас нет прав для размута этого пользователя.');
    }

    // Проверяем права бота
    const hasBotPermissions = await checkBotPermissions(ctx);
    if (!hasBotPermissions) {
      return ctx.reply('❕ У бота недостаточно прав для выполнения этой команды. Бот должен быть администратором с правом ограничивать пользователей.');
    }

    // Удаляем пользователя из базы данных
    await removeMute(userToUnmute.id, chatId);

    // Восстанавливаем права пользователя в чате
    const permissions = {
      can_send_messages: true,
      can_send_media_messages: true,
      can_send_polls: true,
      can_send_other_messages: true,
      can_add_web_page_previews: true,
      can_change_info: true,
      can_invite_users: true,
      can_pin_messages: true,
    };

    try {
      await ctx.telegram.restrictChatMember(chatId, userToUnmute.id, permissions);
    } catch (restrictError) {
      // Если не удалось восстановить права, добавляем запись обратно в базу данных
      await addMute(userToUnmute.id, chatId, 'Ошибка при размуте', null);
      
      if (restrictError.response && restrictError.response.error_code === 400) {
        if (restrictError.response.description.includes('not enough rights')) {
          return ctx.reply('❕ У бота недостаточно прав для восстановления прав этого пользователя.');
        } else if (restrictError.response.description.includes('PARTICIPANT_ID_INVALID')) {
          return ctx.reply('❕ Пользователь не является участником этого чата.');
        }
      }
      
      throw restrictError; // Перебрасываем ошибку, если она другого типа
    }

    // === ЛОГ: размут в finance_log (только после успешного restrictChatMember) ===
    logModeration({
      adminId: senderId,
      targetUserId: userToUnmute.id,
      type: 'unmute',
      chatId: chatId,
      chatTitle: ctx.chat?.title || null, // <--- ДОБАВЛЕНО: Название чата
      success: 1,
    });

    // Формируем сообщение администратору
    const username = userToUnmute.username || 'Неизвестный';
    const userLink = `<a href="tg://user?id=${userToUnmute.id}">${username}</a>`;
    const chatName = getChatName(chatId);
    const adminMessage = `
✅ С пользователя ${userLink} успешно был снят мут!
📍 Чат: ${chatName}
    `.trim();

    await ctx.reply(adminMessage, { parse_mode: 'HTML' });

    // Отправляем сообщение размьюченному пользователю в ЛС
    const userMessage = `✅ Вы были размьючены модератором.
📍 Чат: ${chatName}`;
    await ctx.telegram.sendMessage(userToUnmute.id, userMessage, { parse_mode: 'HTML' }).catch((error) => {
      console.error(`Не удалось отправить сообщение пользователю ${userToUnmute.id}:`, error);
    });

  } catch (error) {
    console.error('Ошибка при выполнении команды "размут":', error);
    if (error.response && error.response.error_code === 400) {
      if (error.response.description.includes('not enough rights')) {
        return ctx.reply('❕ У бота недостаточно прав для выполнения этой команды.');
      } else if (error.response.description.includes('PARTICIPANT_ID_INVALID')) {
        return ctx.reply('❕ Пользователь не является участником этого чата.');
      }
    }
    await ctx.reply('Произошла ошибка. Попробуйте позже.');
  }
}

async function listMutedPlayersHandler(ctx) {
  try {
    // Проверяем права администратора
    const senderId = ctx.from.id.toString();
    if (!(await isModerator(senderId) || await isTechAdmin(senderId) || isMainAdmin(senderId) || await isAdminRole(senderId))) {
      return ctx.reply('У вас нет прав для использования этой команды.');
    }

    // ❕ Запрещаем использование в личных сообщениях
    if (ctx.chat.type === 'private') {
      return ctx.reply('❕ Эту команду можно использовать только в групповом чате.', {
        parse_mode: 'HTML',
      });
    }

    const chatId = ctx.chat.id;

    const mutedPlayers = await getMuteList(chatId);
    if (mutedPlayers.length === 0) {
      return ctx.reply('❕ В данный момент нет замьюченных пользователей в этом чате.');
    }

    // Формируем список замьюченных
    const mutedList = mutedPlayers.map((player) => {
      const userLink = createUserLink(player.user_id, player.username);
      const reason = player.reason || 'Не указана';
      const mutedUntil = player.muted_until === null
        ? 'Навсегда'
        : new Date(player.muted_until * 1000).toLocaleString();
      return `• ${userLink} — Причина: ${reason}, До: ${mutedUntil}`;
    }).join('\n');

    const message = `
📋 <b>Список замьюченных пользователей в этом чате:</b>
${mutedList}
    `.trim();

    await ctx.reply(message, { parse_mode: 'HTML' });

  } catch (error) {
    console.error('Ошибка при выполнении команды "мутлист":', error);
    await ctx.reply('Произошла ошибка. Попробуйте позже.');
  }
}
  
  // Функция для создания гиперссылки на пользователя
  function createUserLink(userId, username) {
    const displayName = username || 'Неизвестный';
    return `<a href="tg://user?id=${userId}">${displayName}</a>`;
  }

  async function autoUnmuteUsers(bot) {
    try {
      // Получаем список всех активных мутов
      const allMutes = await getMuteList(); // Получаем муты из всех чатов
  
      for (const mute of allMutes) {
        const userId = mute.user_id;
        const chatId = mute.chat_id;
        const mutedUntil = mute.muted_until;
  
        // Проверяем, истёк ли срок мута
        if (mutedUntil !== null && mutedUntil <= Math.floor(Date.now() / 1000)) {
          // Снимаем мут
          await removeMute(userId, chatId);
  
          // Восстанавливаем права пользователя в чате
          const permissions = {
            can_send_messages: true,
            can_send_media_messages: true,
            can_send_polls: true,
            can_send_other_messages: true,
            can_add_web_page_previews: true,
            can_change_info: true,
            can_invite_users: true,
            can_pin_messages: true,
          };
  
          try {
            await bot.telegram.restrictChatMember(chatId, userId, permissions);
          } catch (restrictError) {
            console.error(`Не удалось восстановить права пользователя ${userId} при автоматическом размуте:`, restrictError);
            // Продолжаем выполнение, чтобы отправить уведомления
          }
  
          try {
            // Отправляем уведомление администраторам
            const username = mute.username || 'Неизвестный';
            const userLink = `<a href="tg://user?id=${userId}">${username}</a>`;
            const chatName = getChatName(chatId);
            const adminMessage = `
  ✅ По истечению срока с пользователя ${userLink} успешно был снят мут!
  📍 Чат: ${chatName}
          `.trim();
  
            await bot.telegram.sendMessage(chatId, adminMessage, { parse_mode: 'HTML' });
          } catch (sendError) {
            console.error(`Не удалось отправить уведомление в чат ${chatId}:`, sendError);
          }
  
          try {
            // Отправляем сообщение пользователю в ЛС
            const chatName = getChatName(chatId);
            const userMessage = `✅ Срок мута истёк, вы можете вновь писать в чат.
📍 Чат: ${chatName}`;
            await bot.telegram.sendMessage(userId, userMessage, { parse_mode: 'HTML' });
          } catch (sendError) {
            console.error(`Не удалось отправить сообщение пользователю ${userId}:`, sendError);
          }
        }
      }
    } catch (error) {
      console.error('Ошибка при автоматическом снятии мута:', error);
    }
  }

// Запуск автоматической проверки каждые 60 секунд
function startAutoUnmute(bot) {
  setInterval(() => autoUnmuteUsers(bot), 60000); // Проверка каждую минуту
}

module.exports = {
  muteUserHandler,
  unmuteUserHandler,
  listMutedPlayersHandler,
  startAutoUnmute,
  isModerator,
  isTechAdmin,
  isAdminRole,
  isMainAdmin,
  canMuteUser,
  isOfficialChatForModerators, // Добавляем в экспорт
  getChatName 
};