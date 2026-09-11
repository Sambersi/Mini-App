const { 
  getUserByNumericId, 
  getUserByAnyId,
  getUserByUsername,
  updateUserBalanceByNumericId,
  getUserStatuses,
  updateUserNotifications, 
  getUserNotificationSettings,
  logAdminItem // Импортируем новую функцию логирования
} = require('../db');

// Функция для проверки, является ли пользователь главным администратором
function isMainAdmin(userId) {
  return process.env.MAIN_ADMIN === userId.toString();
}

// Функция для проверки, является ли пользователь "Тех администратор"
async function isTechAdmin(userId) {
  const statuses = await getUserStatuses(userId);
  return statuses.includes('Тех администратор');
}

// Обновленная функция для проверки прав администратора
async function isAdmin(ctx) {
  const senderId = ctx.from.id.toString();
  return isMainAdmin(senderId) || (await isTechAdmin(senderId));
}

// Функция для парсинга суммы с учетом суффиксов "к"
function parseAmountWithSuffix(amountInput) {
  amountInput = amountInput.trim();
  const match = amountInput.match(/^(\d+)([к]*)$/i);
  if (!match) {
    throw new Error('Некорректный формат суммы.');
  }
  const [_, numberPart, kSuffix] = match;
  let baseAmount = parseFloat(numberPart.replace(',', '.'));
  if (isNaN(baseAmount) || baseAmount <= 0) {
    throw new Error('Сумма должна быть положительным числом.');
  }

  for (let i = 0; i < kSuffix.length; i++) {
    baseAmount *= 1000;
  }

  return Math.floor(baseAmount);
}

// Функция для поиска пользователя по numeric_id, telegram_id или никнейму
function resolveUser(identifier) {
  if (!identifier) return null;
  const cleanId = identifier.replace(/^@/, ''); // Убираем @, если есть
  
  let user = null;
  // Если строка состоит только из цифр, ищем по ID (numeric_id или telegram_id)
  if (/^\d+$/.test(cleanId)) {
    user = getUserByAnyId(cleanId);
  }
  
  // Если не нашли по ID или ввели никнейм, ищем по нику
  if (!user) {
    user = getUserByUsername(cleanId);
  }
  
  return user;
}

// Создаем клавиатуру с кнопкой отключения уведомлений
function createNotificationKeyboard(userId) {
  return {
    inline_keyboard: [[{
      text: '🔕 Отключить уведомления',
      callback_data: `disable_notifications:${userId}`
    }]]
  };
}

// Создаем клавиатуру с кнопкой включения уведомлений
function createEnableNotificationsKeyboard() {
  return {
    inline_keyboard: [[{
      text: '🔔 Включить уведомления',
      callback_data: 'enable_notifications'
    }]]
  };
}

// Обработчик нажатия на кнопку отключения уведомлений
async function handleNotificationButton(ctx) {
  try {
    const [action, userId] = ctx.callbackQuery.data.split(':');
    if (action !== 'disable_notifications') return;

    if (ctx.from.id.toString() !== userId) {
      return ctx.answerCbQuery('❌ Вы не можете изменять настройки других пользователей.');
    }
    
    await updateUserNotifications(userId, false);
    await ctx.editMessageReplyMarkup({});
    await ctx.reply(`
🔕 Вы успешно отключили уведомления о пополнениях, списаниях и переводах.

❕ Чтобы снова включить уведомления, используйте кнопку ниже (либо команду "уведы вкл"):
    `.trim(), {
      reply_markup: createEnableNotificationsKeyboard(),
      parse_mode: 'Markdown'
    });
  } catch (error) {
    console.error('Ошибка при отключении уведомлений:', error);
    await ctx.reply('Произошла ошибка при отключении уведомлений.');
  }
}

// Обработка команды "уведы выкл"
async function disableNotificationsHandler(ctx) {
  try {
    const userId = ctx.from.id.toString();
    const notificationSettings = await getUserNotificationSettings(userId);

    if (!notificationSettings?.enabled) {
      return ctx.reply('🔕 Уведомления уже отключены.');
    }

    await updateUserNotifications(userId, false);
    await ctx.reply(`
🔕 Уведомления успешно отключены.

Чтобы снова включить уведомления, используйте кнопку ниже:
    `.trim(), {
      reply_markup: createEnableNotificationsKeyboard(),
      parse_mode: 'Markdown'
    });
  } catch (error) {
    console.error('Ошибка при отключении уведомлений:', error);
    await ctx.reply('Произошла ошибка при отключении уведомлений.');
  }
}

// Обработчик нажатия на кнопку включения уведомлений
async function handleEnableNotificationsButton(ctx) {
  try {
    const userId = ctx.from.id.toString();
    await updateUserNotifications(userId, true);
    await ctx.editMessageReplyMarkup({});
    await ctx.reply('🔔 Уведомления успешно включены.');
  } catch (error) {
    console.error('Ошибка при включении уведомлений:', error);
    await ctx.reply('Произошла ошибка при включении уведомлений.');
  }
}

// Обработка команды "уведы вкл"
async function enableNotificationsHandler(ctx) {
  try {
    const userId = ctx.from.id.toString();
    await updateUserNotifications(userId, true);
    await ctx.reply('🔔 Уведомления успешно включены.');
  } catch (error) {
    console.error('Ошибка при включении уведомлений:', error);
    await ctx.reply('Произошла ошибка при включении уведомлений.');
  }
}

// Модифицированная функция отправки уведомления пользователю
async function sendUserNotification(ctx, userId, message) {
  try {
    const notificationSettings = await getUserNotificationSettings(userId);
    if (!notificationSettings?.enabled) {
      console.log(`[INFO] Уведомление для пользователя ${userId} не отправлено (уведомления отключены)`);
      return;
    }
    
    await ctx.telegram.sendMessage(userId, message, {
      reply_markup: createNotificationKeyboard(userId),
      parse_mode: 'HTML'
    });
  } catch (error) {
    console.error(`Не удалось отправить сообщение пользователю ${userId}:`, error);
  }
}

// Обработка команды "выдать"
async function addBalanceHandler(ctx) {
  try {
    if (!ctx.message || !ctx.message.text || ctx.message.text.trim() === '') {
      return ctx.reply('Некорректное сообщение. Команда должна содержать текст.');
    }

    const text = ctx.message.text.trim();
    const parts = text.split(/\s+/);

    if (parts.length !== 4 || parts[0].toLowerCase() !== 'выдать') {
      return ctx.reply('Использование: выдать [тип] [ID/Ник] [сумма]');
    }

    const type = parts[1].toLowerCase();
    const identifier = parts[2];
    const amountInput = parts[3];

    if (type !== 'пф') {
      return ctx.reply('Неподдерживаемый тип приза. Используйте "пф".');
    }

    let amount;
    try {
      amount = parseAmountWithSuffix(amountInput);
    } catch (error) {
      return ctx.reply(error.message);
    }

    if (amount <= 0) {
      return ctx.reply('Сумма должна быть положительной.');
    }

    if (!(await isAdmin(ctx))) {
      return ctx.reply('У вас нет прав для использования этой команды.');
    }

    const user = resolveUser(identifier);
    if (!user) {
      return ctx.reply('Пользователь с указанным ID или никнеймом не найден.');
    }

    const result = await updateUserBalanceByNumericId(user.numeric_id, amount);
    if (!result.success) {
      // Логируем неудачу в БД
      logAdminItem({
        adminId: ctx.from.id,
        targetUserId: user.id,
        direction: 'give',
        itemType: 'balance',
        amount: amount,
        comment: result.message || 'Ошибка обновления',
        success: false
      });
      return ctx.reply(result.message || 'Не удалось обновить баланс.');
    }

    const updatedUser = await getUserByNumericId(user.numeric_id);
    if (!updatedUser) {
      return ctx.reply('Произошла ошибка при получении обновленного баланса.');
    }
    const newBalance = updatedUser.balance;

    const username = user.username || 'Неизвестный';
    const userLink = `<a href="tg://user?id=${user.id}">${username}</a>`;

    const adminMessage = `
➕ Выдано ${amount.toLocaleString('ru-RU')} PF пользователю ${userLink}.
💰 Текущий баланс пользователя: ${newBalance.toLocaleString('ru-RU')} PF.
    `.trim();

    await ctx.reply(adminMessage, { parse_mode: 'HTML' });

    const userMessage = `
<b>📮 Пополнение баланса!</b>
\n📥 Ваш баланс был пополнен <b>АДМИНИСТРАТОРОМ</b> на сумму ${amount.toLocaleString('ru-RU')} PF.
💰 Ваш текущий баланс: ${newBalance.toLocaleString('ru-RU')} PF.
    `.trim();

    await sendUserNotification(ctx, user.id, userMessage); 

    // Логирование в новую систему логов (finance_log)
    logAdminItem({
      adminId: ctx.from.id,
      targetUserId: user.id,
      direction: 'give',
      itemType: 'balance',
      amount: amount,
      comment: 'Выдача PF',
      success: true
    });

    // Логирование выдачи администратором для указанных ID (старый лог в чат)
    const LOG_GIVE_CHAT_ID = process.env.LOG_GIVE_CHAT_ID; 
    const adminId = ctx.from.id.toString();
    const loggingAdminIds = ["6891998751", "1751938104", "1901352625"];
    
    if (loggingAdminIds.includes(adminId) && LOG_GIVE_CHAT_ID) {
      const logMessage = `
🔔 Новая выдача:
• Администратор: <a href="tg://user?id=${adminId}">${ctx.from.username || 'Неизвестный'}</a> (Tg ID: <code>${adminId}</code>)
• Получатель: <a href="tg://user?id=${user.id}">${user.username || 'Неизвестный'}</a> (Tg ID: <code>${user.id}</code>, ID: <code>${user.numeric_id}</code>)
• Тип: <code>PF</code>
• Количество: <b>${amount.toLocaleString('ru-RU')}</b>
`.trim();

      ctx.telegram.sendMessage(LOG_GIVE_CHAT_ID, logMessage, { parse_mode: 'HTML' })
        .catch((error) => {
          console.error('Ошибка при отправке лога выдачи:', error);
        });
    }
  } catch (error) {
    console.error('Ошибка при выполнении команды "выдать":', error);
    await ctx.reply('Произошла ошибка. Попробуйте позже.');
  }
}

// Обработка команды "забрать"
async function removeBalanceHandler(ctx) {
  try {
    if (!ctx.message || !ctx.message.text || ctx.message.text.trim() === '') {
      return ctx.reply('Некорректное сообщение. Команда должна содержать текст.');
    }

    const text = ctx.message.text.trim();
    const parts = text.split(/\s+/);

    if (parts.length !== 4 || parts[0].toLowerCase() !== 'забрать') {
      return ctx.reply('Использование: забрать [тип] [ID/Ник] [сумма]');
    }

    const type = parts[1].toLowerCase();
    const identifier = parts[2];
    const amountInput = parts[3];

    if (type !== 'пф') {
      return ctx.reply('Неподдерживаемый тип приза. Используйте "пф".');
    }

    let amount;
    try {
      amount = parseAmountWithSuffix(amountInput);
    } catch (error) {
      return ctx.reply(error.message);
    }

    if (amount <= 0) {
      return ctx.reply('Сумма должна быть положительной.');
    }

    if (!(await isAdmin(ctx))) {
      return ctx.reply('У вас нет прав для использования этой команды.');
    }

    const user = resolveUser(identifier);
    if (!user) {
      return ctx.reply('Пользователь с указанным ID или никнеймом не найден.');
    }

    if (user.balance < amount) {
      return ctx.reply('Недостаточно средств на балансе пользователя.');
    }

    const result = await updateUserBalanceByNumericId(user.numeric_id, -amount);
    if (!result.success) {
      // Логируем неудачу в БД
      logAdminItem({
        adminId: ctx.from.id,
        targetUserId: user.id,
        direction: 'take',
        itemType: 'balance',
        amount: amount,
        comment: result.message || 'Ошибка обновления',
        success: false
      });
      return ctx.reply(result.message || 'Не удалось обновить баланс.');
    }

    const updatedUser = await getUserByNumericId(user.numeric_id);
    if (!updatedUser) {
      return ctx.reply('Произошла ошибка при получении обновленного баланса.');
    }
    const newBalance = updatedUser.balance;

    const username = user.username || 'Неизвестный';
    const userLink = `<a href="tg://user?id=${user.id}">${username}</a>`;

    const adminMessage = `
➖ Списано ${amount.toLocaleString('ru-RU')} PF с баланса пользователя ${userLink}.
💰 Текущий баланс пользователя: ${newBalance.toLocaleString('ru-RU')} PF.
    `.trim();

    await ctx.reply(adminMessage, { parse_mode: 'HTML' });

    const userMessage = `
<b>📮 Списание баланса!</b>
\n📤 С вашего баланса было списано <b>АДМИНИСТРАТОРОМ</b> ${amount.toLocaleString('ru-RU')} PF.
💰 Ваш текущий баланс: ${newBalance.toLocaleString('ru-RU')} PF.
    `.trim();

    await sendUserNotification(ctx, user.id, userMessage); 

    // Логирование в новую систему логов (finance_log)
    logAdminItem({
      adminId: ctx.from.id,
      targetUserId: user.id,
      direction: 'take',
      itemType: 'balance',
      amount: amount,
      comment: 'Списание PF',
      success: true
    });
  } catch (error) {
    console.error('Ошибка при выполнении команды "забрать":', error);
    await ctx.reply('Произошла ошибка. Попробуйте позже.');
  }
}

module.exports = {
  addBalanceHandler,
  removeBalanceHandler,
  parseAmountWithSuffix,
  isAdmin,
  enableNotificationsHandler,
  handleNotificationButton,
  handleEnableNotificationsButton,
  sendUserNotification,
  createNotificationKeyboard,
  disableNotificationsHandler,
  isTechAdmin
};