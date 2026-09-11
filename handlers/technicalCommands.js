//technicalCommands.js
const { getUserById, giveItemToUser, getTopPlayersByCardBalance,
  blockTransfersByNumericId, updateUsername, isUserBanned, getBlacklistEntry,  getBossDamageByUserId,
  getUserWeapons, getCurrentWeaponDurability, getTopPlayersByBossDamage, getCurrentBoss, updateBossState, getTopPlayersByAttackPower,
  unblockTransfersByNumericId, subtractReferrals, toggleUserVisibilityInTop, isUserHiddenInTop, getTopReferrers, getCurrentEnergy, updateUserEnergy, isHyperlinkDisabled,
  areTransfersBlockedByNumericId, resetAccount, getTopPlayersByDfBalance, getTopPlayersByNpfShares, takeItemFromUser, getTopPlayersByContainers, getCardDetails, getDetailedTopPlayers, getDoubleStats, getReferralsByReferrerId, getTargetUserId, getFreeReservedNumericIds, updateNumericId, getUserStatuses, getUserByNumericId,   deleteUserAccount,
  getSkinById, updateSkinPrice, getPlayerBalanceInfoByNumericId, setPlayerBalanceByNumericId,
  giveTicketsAdmin, takeTicketsAdmin, getUserLogs} = require('../db');
const {
  getPlural
} = require('../handlers/referralSystem');
const { isForbiddenNickname } = require('../handlers/changeNickname');
const { Markup } = require('telegraf');

// Функция для проверки, является ли пользователь "Руководитель партнёрки"
async function isPartnerManager(userId) {
  const statuses = await getUserStatuses(userId);
  return statuses.includes('Руководитель партнёрки');
}

// Функция для проверки прав администратора
async function isAdmin2(userId) {
  const allowedStatuses = ['Администратор', 'Тех администратор', 'DIAMOND'];
  const userStatuses = await getUserStatuses(userId);
  return allowedStatuses.some(status => userStatuses.includes(status));
}

const { isAdmin, isTechAdmin, sendUserNotification } = require('../admin/addBalance'); // Из папки admin

// Функция для проверки, является ли пользователь главным администратором
function isMainAdmin(userId) {
  return process.env.MAIN_ADMIN === userId.toString();
}

// Функция для проверки наличия определенного статуса у пользователя
async function hasStatus(userId, requiredStatus) {
  const statuses = await getUserStatuses(userId); // Получаем статусы пользователя
  return statuses.includes(requiredStatus); // Проверяем наличие статуса
}

// Функция для проверки, имеет ли пользователь доступ к команде /prof
async function canAccessProfCommand(userId) {
  const allowedStatuses = ['Администратор', 'Тех администратор', 'DIAMOND', 'PLATINUM', 'Модератор' ];
  const userStatuses = await getUserStatuses(userId);
  return allowedStatuses.some(status => userStatuses.includes(status));
}

// Функция для проверки, имеет ли пользователь доступ к команде /prof
async function canAccessProfCommand2(userId) {
  const allowedStatuses = ['Администратор', 'Тех администратор', 'DIAMOND', 'PLATINUM', 'GOLD', 'Beto-tester', 'Модератор' ];
  const userStatuses = await getUserStatuses(userId);
  return allowedStatuses.some(status => userStatuses.includes(status));
}

// Функция для записи логов в консоль (вместо отправки в чат)
async function logAction(ctx, user, chatType, chatTitle, messageText) {
  try {
    const userId = ctx.from.id.toString();
    const username = ctx.from.username || 'Неизвестный'; // Текущий тег пользователя
    const numericId = user?.numeric_id || 'Не найден';
    const dbUsername = user?.username || 'Не указан'; // Ник из базы данных

    // Формируем текст лога
    const logMessage = `
📝 <b>Лог действия:</b>
├ Тип чата: ${chatType === 'private' ? 'Личный' : 'Публичный'}
${chatType !== 'private' ? `├ Название чата: ${chatTitle || 'Неизвестно'}` : ''}
├ Игрок: ${username} (ID: ${userId})
├ Ник из БД: ${dbUsername}
├ Numeric ID: ${numericId}
├ Сообщение: ${messageText}
    `.trim();

    // Логируем в консоль
    console.log(logMessage);

    // Если нужно, сохраняем логи в файл
    // fs.appendFileSync('logs.txt', `${new Date().toISOString()}: ${logMessage}\n`);
  } catch (error) {
    console.error('Ошибка при логировании:', error);
  }
}



// Обработчик для команды /id
async function idHandler(ctx) {
  try {
    const senderId = ctx.from.id.toString();

    // Проверяем, имеет ли пользователь доступ к команде /prof
    const hasAccess = await canAccessProfCommand2(senderId);
    if (!hasAccess) {
      return ctx.reply('❕ У вас нет прав для использования этой команды.');
    }

    const targetUser = getTargetUserId(ctx);
    if (!targetUser) {
      return ctx.reply('❕ Ответьте на сообщение пользователя.');
    }

    let user;
    if (targetUser.type === 'telegramId') {
      user = await getUserById(targetUser.value); // Поиск по Telegram ID
    } else if (targetUser.type === 'numericId') {
      user = await getUserByNumericId(targetUser.value); // Поиск по numeric_id
    }

    if (!user) {
      return ctx.reply('❕ Пользователь не найден.');
    }

    const numericId = user.numeric_id || 'Не найден';
    return ctx.replyWithHTML(`📝 <b>ID игрока:</b>  <code>${numericId}</code>`);
  } catch (error) {
    console.error('Ошибка при обработке команды /id:', error);
    return ctx.reply('Произошла ошибка. Попробуйте позже.');
  }
}

// Функция для создания корректной гиперссылки на пользователя
function createUserLink(userId, username) {
  const displayName = username || 'Игрок'; // Используем имя пользователя или "Игрок"
  return `<a href="tg://user?id=${userId}">${displayName}</a>`;
}

// Обработчик команды /prof
async function profHandler(ctx) {
  try {
    const senderId = ctx.from.id.toString();

    // 1. Проверка прав доступа
    const hasAccess = await canAccessProfCommand(senderId);
    if (!hasAccess) {
      return ctx.reply('❕ У вас нет прав для использования этой команды.');
    }

    // 2. Получение целевого пользователя
    const targetUser = getTargetUserId(ctx);
    if (!targetUser) {
      return ctx.reply('❌ Ответьте на сообщение пользователя или укажите его числовой ID.');
    }

    let user;
    if (targetUser.type === 'telegramId') {
      user = await getUserById(targetUser.value); // Поиск по Telegram ID
    } else if (targetUser.type === 'numericId') {
      user = await getUserByNumericId(targetUser.value); // Поиск по numeric_id
    }

    if (!user) {
      return ctx.reply('❌ Пользователь не найден.');
    }

    // 3. Проверяем, забанен ли пользователь
    const isBanned = await isUserBanned(user.id);
    let banInfo = '';
    if (isBanned) {
      const bannedDetails = await getBlacklistEntry(user.id);
      const banReason = bannedDetails?.reason || 'Причина не указана';
      
      let banExpiresInfo = 'Навсегда';
      if (bannedDetails?.banned_until) {
        const now = Date.now();
        const banExpiresMs = bannedDetails.banned_until * 1000;
        const timeDiffMs = banExpiresMs - now;
        
        if (timeDiffMs > 0) {
          // Рассчитываем дни, часы, минуты, секунды
          const days = Math.floor(timeDiffMs / (1000 * 60 * 60 * 24));
          const hours = Math.floor((timeDiffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
          const minutes = Math.floor((timeDiffMs % (1000 * 60 * 60)) / (1000 * 60));
          const seconds = Math.floor((timeDiffMs % (1000 * 60)) / 1000);
          
          const timeParts = [];
          if (days > 0) timeParts.push(`${days} дн.`);
          if (hours > 0) timeParts.push(`${hours} ч.`);
          if (minutes > 0) timeParts.push(`${minutes} мин.`);
          if (seconds > 0 && timeParts.length === 0) timeParts.push(`${seconds} сек.`);
          
          banExpiresInfo = timeParts.join(' ') || 'менее чем через минуту';
        } else {
          banExpiresInfo = 'Скоро'; // Если время уже прошло, но запись еще в БД
        }
      }
      
      banInfo = `
  📛 <b>Аккаунт заблокирован:</b>
     • Причина: ${banReason}
     • Разблокируется через: ${banExpiresInfo}
      `.trim();
    }

    // 4. Получение дополнительных данных пользователя
    const statuses = await getUserStatuses(user.id); // Список статусов
    const referrals = await getReferralsByReferrerId(user.id); // Список рефералов
    const referralsCount = referrals.length; // Количество рефералов
    const roundStats = await getDoubleStats(user.id); // Статистика раундов

    // Убедимся, что все необходимые поля существуют (если их нет, установим значения по умолчанию)
    const dfBalance = user.df_balance ?? 0;
    const npfShares = user.npf_shares ?? 0;
    const containerType1 = user.container_type_1 ?? 0;
    const containerType2 = user.container_type_2 ?? 0;
    const containerType3 = user.container_type_3 ?? 0;
    const cardBalance = user.card_balance ?? 0; // Новый баланс карты
    const numericId = user.numeric_id ?? 'Не найден'; // Используем numeric_id вместо Telegram ID
    const candyCount = user.candy ?? 0; // Количество конфет
    const ticketsCount = user.tickets ?? 0; // Количество билетиков — ✅ ДОБАВЛЕНО

    // Рассчитываем возраст аккаунта
    const accountAge = calculateAccountAge(user.registration_date);

    // Форматируем дату регистрации
    const registrationDateFormatted = formatDate(new Date(user.registration_date * 1000));

    // 5. Форматирование текста профиля
    const userLink = createUserLink(user.id, user.username); // Создаем гиперссылку
    const indent = '\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0'; // Отступы для красивого отображения

    let profileText = `
📊 Профиль игрока ${userLink}:

${indent}${banInfo}

${indent}🆔 Числовой ID: <code>${numericId}</code>

${indent}${statuses.length > 0 ? `🌟 Статус: ${statuses.join(' + ')}` : '🪪 Player'}

${indent}💰 Баланс:
${indent} • PF: ${(user.balance ?? 0).toLocaleString('ru-RU')}
${indent} • На карте: ${(cardBalance ?? 0).toLocaleString('ru-RU')} PF
${indent} • DF: ${(dfBalance ?? 0).toLocaleString('ru-RU')}

${indent}🍬 Конфеты: ${candyCount} шт
${indent}🎫 Tickets: ${ticketsCount} шт

${indent}💼 Акции NPF: ${(npfShares ?? 0)} шт

${indent}📦 Контейнеры:
${indent} • CLASSIC: ${(containerType1 ?? 0)}
${indent} • PREMIUM: ${(containerType2 ?? 0)}
${indent} • GOLD: ${(containerType3 ?? 0)}

${indent}👥 Рефералы: ${referralsCount || '0'}

${indent}📊 Статистика DOUBLE PLUS:
${indent} • Выиграно: ${(roundStats?.wins ?? 0)} раз
${indent} • Проиграно: ${(roundStats?.losses ?? 0)} раз

${indent}⏳ Дата регистрации: ${registrationDateFormatted}
${indent}🗓️ Возраст аккаунта: ${accountAge}

    `.trim();

    // Убираем лишние пустые строки
    profileText = profileText.replace(/\n\s*\n/g, '\n\n').trim();

    // 6. Отправка сообщения с профилем
    return ctx.replyWithHTML(profileText);

  } catch (error) {
    console.error('Ошибка при обработке команды /prof:', error);
    return ctx.reply('❌ Произошла ошибка. Попробуйте позже.');
  }
}


// Функция для расчета возраста аккаунта
function calculateAccountAge(registrationDate) {
  const now = Date.now();
  const diffMs = now - registrationDate * 1000; // Разница в миллисекундах
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24)); // Дни
  const diffMonths = Math.floor(diffDays / 30); // Месяцы
  const diffYears = Math.floor(diffMonths / 12); // Годы

  if (diffYears > 0) {
      return `${diffYears} лет ${diffMonths % 12} месяцев ${diffDays % 30} дней`;
  } else if (diffMonths > 0) {
      return `${diffMonths} месяцев ${diffDays % 30} дней`;
  } else {
      return `${diffDays} дней`;
  }
}

// Функция для форматирования даты в формат "дд мм гггг"
function formatDate(date) {
  const day = String(date.getDate()).padStart(2, '0'); // День с ведущим нулём
  const month = String(date.getMonth() + 1).padStart(2, '0'); // Месяц с ведущим нулём (месяцы начинаются с 0)
  const year = date.getFullYear(); // Год полностью
  return `${day}.${month}.${year}`;
}

// Функция для проверки прав на выполнение команды /delete
async function canDeleteAccount(senderId) {
  return isMainAdmin(senderId) || (await hasStatus(senderId, 'Тех администратор'));
}

// Обработчик для команды /delete
async function deleteHandler(ctx) {
  try {
    const senderId = ctx.from.id.toString();

    // Проверяем права на выполнение команды
    const canDelete = await canDeleteAccount(senderId);
    if (!canDelete) {
      return;
    }

    // Получаем ID целевого пользователя
    const targetUser = getTargetUserId(ctx);
    if (!targetUser) {
      return ctx.reply('✖️ Ответьте на сообщение пользователя или укажите его ID.');
    }

    let user;
    if (targetUser.type === 'telegramId') {
      user = await getUserById(targetUser.value); // Поиск по Telegram ID
    } else if (targetUser.type === 'numericId') {
      user = await getUserByNumericId(targetUser.value); // Поиск по numeric_id
    }

    if (!user) {
      return ctx.reply('✖️ Пользователь не найден.');
    }

    // Полностью удаляем аккаунт пользователя
    const deleteResult = deleteUserAccount(user.id);
    if (!deleteResult.success) {
      return ctx.reply('✖️ Произошла ошибка при удалении аккаунта.');
    }

    // Создаем гиперссылку на пользователя
    const userLink = createUserLink(user.id, user.username);

    // Отправляем подтверждение
    return ctx.replyWithHTML(`✅ Аккаунт игрока ${userLink} успешно удален.`);
  } catch (error) {
    console.error('Ошибка при обработке команды /delete:', error);
    return ctx.reply('✖️ Произошла ошибка. Попробуйте позже.');
  }
}

// Функция для проверки прав на выполнение команды /changeid
async function canChangeId(senderId) {
  return isMainAdmin(senderId) || (await hasStatus(senderId, 'Тех администратор'));
}

// Обработчик для команды /changeid
async function changeIdHandler(ctx) {
  try {
    const senderId = ctx.from.id.toString();

    // Проверяем права на выполнение команды
    const canChange = await canChangeId(senderId);
    if (!canChange) {
      return;
    }

    // Разбираем текст команды
    const text = ctx.message.text.trim();
    const parts = text.split(/\s+/);

    if (parts.length !== 3) {
      return ctx.reply('✖️ Неверный формат команды. Использование: /changeid <старый_numeric_id> <новый_numeric_id>.');
    }

    const oldNumericId = parseInt(parts[1], 10);
    const newNumericId = parseInt(parts[2], 10);

    if (isNaN(oldNumericId) || isNaN(newNumericId)) {
      return ctx.reply('✖️ Некорректные значения numeric_id. Использование: /changeid <старый_numeric_id> <новый_numeric_id>.');
    }

    // Проверяем существование пользователя с oldNumericId
    const user = await getUserByNumericId(oldNumericId);
    if (!user) {
      return ctx.reply('✖️ Пользователь с указанным старым numeric_id не найден.');
    }

    // Обновляем numeric_id
    const updateResult = updateNumericId(oldNumericId, newNumericId);
    if (!updateResult.success) {
      return ctx.reply(`✖️ ${updateResult.message}`);
    }

    // Создаем гиперссылку на пользователя
    const userLink = createUserLink(user.id, user.username);

    // Отправляем подтверждение
    return ctx.replyWithHTML(
      `✅ ID игрока ${userLink} успешно изменён с <code>${oldNumericId}</code> на <code>${newNumericId}</code>.`
    );
  } catch (error) {
    console.error('Ошибка при обработке команды /changeid:', error);
    return ctx.reply('✖️ Произошла ошибка. Попробуйте позже.');
  }
}


// Обработчик для команды /свободныеид
async function freeIdsHandler(ctx) {
  try {
    const senderId = ctx.from.id.toString();

    // Проверяем права на выполнение команды
    const canAccess = await canChangeId(senderId); // Используем ту же проверку, что и для /changeid
    if (!canAccess) {
      return; // Завершаем выполнение без отправки ответа, если нет прав
    }

    // Получаем список свободных зарезервированных numeric_id
    const freeReservedIds = getFreeReservedNumericIds();

    if (freeReservedIds.length === 0) {
      return ctx.reply('✖️ Нет свободных зарезервированных numeric_id.');
    }

    // Формируем текстовое представление списка свободных зарезервированных numeric_id
    const freeIdsText = freeReservedIds.join(', ');

    // Отправляем список свободных зарезервированных numeric_id
    return ctx.replyWithHTML(`✅ Список свободных зарезервированных id:\n<code>${freeIdsText}</code>`);
  } catch (error) {
    console.error('Ошибка при обработке команды /свободныеид:', error);
    return ctx.reply('✖️ Произошла ошибка. Попробуйте позже.');
  }
}


// Функция для формирования сообщения о топе игроков
function formatTopPlayersMessage(players) {
  if (!players || players.length === 0) {
      return "📊 Топ игроков пуст.";
  }

  let message = "🏆 <b>Топ 12 игроков:</b>\n";

  players.forEach((player, index) => {
      // Вычисляем общий баланс
      const totalBalance = (player.balance || 0) + (player.card_balance || 0);

      // Создаем ссылку на пользователя
      const userLink = player.disable_hyperlink
          ? player.username // Просто текстовый ник, если тег скрыт
          : `<a href="tg://user?id=${player.telegram_id}">${player.username}</a>`; // Гиперссылка, если тег включен

      // Формируем строку для игрока
      message += `\n#${index + 1} ▪️ Ник: ${userLink}
▫️ Игровой ID: <code>${player.numeric_id}</code>
▫️ Telegram ID: <code>${player.telegram_id}</code>
▫️ Баланс:
 • PF: <code>${(player.balance || 0).toLocaleString('ru-RU')}</code>
 • На карте: <code>${(player.card_balance || 0).toLocaleString('ru-RU')} PF</code>
 • Общий: <code>${totalBalance.toLocaleString('ru-RU')} PF</code>\n`;
  });

  return message.trim();
}

// Обработчик команды для просмотра топа игроков
async function detailedTopHandler(ctx) {
  try {
    const senderId = ctx.from.id.toString();

    // Проверяем права пользователя
    const hasAccess = await isAdmin(ctx);
    if (!hasAccess) {
      return ctx.reply("❌ У вас нет прав для использования этой команды.");
    }

    // Получаем топ игроков из базы данных
    const topPlayers = await getDetailedTopPlayers();

    // Формируем сообщение
    const message = formatTopPlayersMessage(topPlayers);

    // Отправляем сообщение
    return ctx.reply(message, { parse_mode: 'HTML' });
  } catch (error) {
    console.error("Ошибка при обработке команды /detailedtop:", error);
    return ctx.reply("❌ Произошла ошибка. Попробуйте позже.");
  }
}


// Обработчик команды для просмотра топа игроков
async function detailedTopHandler(ctx) {
  try {
    const senderId = ctx.from.id.toString();

    // Проверяем права пользователя
    const hasAccess = await isAdmin(ctx);
    if (!hasAccess) {
      return ctx.reply("❌ У вас нет прав для использования этой команды.");
    }

    // Получаем топ игроков из базы данных
    const topPlayers = await getDetailedTopPlayers();

    // Формируем сообщение
    const message = formatTopPlayersMessage(topPlayers);

    // Отправляем сообщение
    return ctx.reply(message, { parse_mode: 'HTML' });
  } catch (error) {
    console.error("Ошибка при обработке команды /detailedtop:", error);
    return ctx.reply("❌ Произошла ошибка. Попробуйте позже.");
  }
}

// Функция для формирования сообщения о топе игроков по контейнерам
function formatTopPlayersByContainersMessage(players) {
  if (!players || players.length === 0) {
    return "📊 Топ игроков по контейнерам пуст.";
  }

  let message = "🏆 <b>Топ игроков по контейнерам:</b>\n";
  players.forEach((player, index) => {
    const userLink = player.disable_hyperlink
      ? player.username // Просто текстовый ник, если тег скрыт
      : `<a href="tg://user?id=${player.telegram_id}">${player.username}</a>`; // Гиперссылка, если тег включен

    message += `
#${index + 1}
▫️ Numeric ID: <code>${player.numeric_id}</code>
▪️ Telegram ID: <code>${player.telegram_id}</code>
▪️ Ник: ${userLink}
▪️ Контейнеры: <code>${player.total_containers}</code>
`;
  });

  return message.trim();
}

// Обработчик команды для просмотра топа игроков по контейнерам
async function topContainersHandler(ctx) {
  try {
    const senderId = ctx.from.id.toString();

    // Проверяем права пользователя
    const hasAccess = await isAdmin(ctx);
    if (!hasAccess) {
      return ctx.reply("❌ У вас нет прав для использования этой команды.");
    }

    // Получаем топ игроков из базы данных
    const topPlayers = await getTopPlayersByContainers();

    // Формируем сообщение
    const message = formatTopPlayersByContainersMessage(topPlayers);

    // Отправляем сообщение
    return ctx.reply(message, { parse_mode: 'HTML' });
  } catch (error) {
    console.error("Ошибка при обработке команды /topcontainers:", error);
    return ctx.reply("❌ Произошла ошибка. Попробуйте позже.");
  }
}

// Функция для формирования сообщения о топе игроков по df_balance
function formatTopPlayersByDfBalanceMessage(players) {
  if (!players || players.length === 0) {
    return "📊 Топ игроков по DF пуст.";
  }

  let message = "🏆 <b>Топ игроков по DF:</b>\n";
  players.forEach((player, index) => {
    const userLink = player.disable_hyperlink
      ? player.username // Просто текстовый ник, если тег скрыт
      : `<a href="tg://user?id=${player.telegram_id}">${player.username}</a>`; // Гиперссылка, если тег включен

    message += `
#${index + 1}
▫️ Numeric ID: <code>${player.numeric_id}</code>
▪️ Telegram ID: <code>${player.telegram_id}</code>
▪️ Ник: ${userLink}
▪️ DF: <code>${player.df_balance}</code>
`;
  });

  return message.trim();
}

// Обработчик команды для просмотра топа игроков по df_balance
async function topDfBalanceHandler(ctx) {
  try {
    const senderId = ctx.from.id.toString();

    // Проверяем права пользователя
    const hasAccess = await isAdmin(ctx);
    if (!hasAccess) {
      return ctx.reply("❌ У вас нет прав для использования этой команды.");
    }

    // Получаем топ игроков из базы данных
    const topPlayers = await getTopPlayersByDfBalance();

    // Формируем сообщение
    const message = formatTopPlayersByDfBalanceMessage(topPlayers);

    // Отправляем сообщение
    return ctx.reply(message, { parse_mode: 'HTML' });
  } catch (error) {
    console.error("Ошибка при обработке команды /topdfbalance:", error);
    return ctx.reply("❌ Произошла ошибка. Попробуйте позже.");
  }
}


// Функция для формирования сообщения о топе игроков по npf_shares
function formatTopPlayersByNpfSharesMessage(players) {
  if (!players || players.length === 0) {
    return "📊 Топ игроков по NPF акциям пуст.";
  }

  let message = "🏆 <b>Топ игроков по NPF акциям:</b>\n";
  players.forEach((player, index) => {
    const userLink = player.disable_hyperlink
      ? player.username // Просто текстовый ник, если тег скрыт
      : `<a href="tg://user?id=${player.telegram_id}">${player.username}</a>`; // Гиперссылка, если тег включен

    message += `
#${index + 1}
▫️ Numeric ID: <code>${player.numeric_id}</code>
▪️ Telegram ID: <code>${player.telegram_id}</code>
▪️ Ник: ${userLink}
▪️ NPF акции: <code>${player.npf_shares}</code>
`;
  });

  return message.trim();
}

// Обработчик команды для просмотра топа игроков по npf_shares
async function topNpfSharesHandler(ctx) {
  try {
    const senderId = ctx.from.id.toString();

    // Проверяем права пользователя
    const hasAccess = await isAdmin(ctx);
    if (!hasAccess) {
      return ctx.reply("❌ У вас нет прав для использования этой команды.");
    }

    // Получаем топ игроков из базы данных
    const topPlayers = await getTopPlayersByNpfShares();

    // Формируем сообщение
    const message = formatTopPlayersByNpfSharesMessage(topPlayers);

    // Отправляем сообщение
    return ctx.reply(message, { parse_mode: 'HTML' });
  } catch (error) {
    console.error("Ошибка при обработке команды /topnpfshares:", error);
    return ctx.reply("❌ Произошла ошибка. Попробуйте позже.");
  }
}

// Функция для формирования сообщения о топе игроков по card_balance
function formatTopPlayersByCardBalanceMessage(players) {
  if (!players || players.length === 0) {
    return "📊 Топ игроков по балансу карты пуст.";
  }

  let message = "🏆 <b>Топ игроков по балансу карты:</b>\n";
  players.forEach((player, index) => {
    const userLink = player.disable_hyperlink
      ? player.username // Просто текстовый ник, если тег скрыт
      : `<a href="tg://user?id=${player.telegram_id}">${player.username}</a>`; // Гиперссылка, если тег включен

    message += `
#${index + 1}
▫️ Numeric ID: <code>${player.numeric_id}</code>
▪️ Telegram ID: <code>${player.telegram_id}</code>
▪️ Ник: ${userLink}
▪️ Баланс карты: <code>${player.card_balance}</code>
`;
  });

  return message.trim();
}

// Обработчик команды для просмотра топа игроков по card_balance
async function topCardBalanceHandler(ctx) {
  try {
    const senderId = ctx.from.id.toString();

    // Проверяем права пользователя
    const hasAccess = await isAdmin(ctx);
    if (!hasAccess) {
      return ctx.reply("❌ У вас нет прав для использования этой команды.");
    }

    // Получаем топ игроков из базы данных
    const topPlayers = await getTopPlayersByCardBalance();

    // Формируем сообщение
    const message = formatTopPlayersByCardBalanceMessage(topPlayers);

    // Отправляем сообщение
    return ctx.reply(message, { parse_mode: 'HTML' });
  } catch (error) {
    console.error("Ошибка при обработке команды /topcardbalance:", error);
    return ctx.reply("❌ Произошла ошибка. Попробуйте позже.");
  }
}

// Функция для обработки команды "take"
async function takeHandler(ctx) {
  try {
    // Проверка прав администратора или наличия статуса "Руководитель партнёрки"
    const isAdminUser = await isAdmin(ctx);
    const hasPartnerManagerStatus = await isPartnerManager(ctx.from.id);
    if (!isAdminUser && !hasPartnerManagerStatus) {
      return ctx.reply('❌ У вас нет прав для использования этой команды.');
    }

    // Парсим аргументы команды
    const args = ctx.message.text.split(' ').slice(1); // Убираем команду "забор"
    if (args.length !== 3) {
      return ctx.reply(
        'Использование: забор [id/telegram_id] [тип_предмета] [количество]\n' +
        'Доступные типы предметов:\n' +
        '• <code>balance</code> - PF (баланс)\n' +
        '• <code>df_balance</code> - DF (баланс)\n' +
        '• <code>npf_shares</code> - NPF акции\n' +
        '• <code>container_type_1</code> - Контейнеры типа 1\n' +
        '• <code>container_type_2</code> - Контейнеры типа 2\n' +
        '• <code>container_type_3</code> - Контейнеры типа 3\n' +
        '• <code>card_balance</code> - Баланс карты',
        { parse_mode: 'HTML' } // Указываем режим разметки HTML
      );
    }

    const [userId, itemType, amountStr] = args;
    const amount = parseInt(amountStr, 10);

    // Проверяем корректность количества
    if (isNaN(amount) || amount <= 0) {
      return ctx.reply('❌ Некорректное количество предметов. Укажите положительное число.');
    }

    // Вызываем функцию из базы данных
    const result = takeItemFromUser(userId, itemType, amount);

    // Если операция не удалась, отправляем ошибку
    if (!result.success) {
      return ctx.reply(`❌ ${result.message}`);
    }

    // Получаем пользователя для отправки уведомления
    const user = await getUserByNumericId(userId) || await getUserById(userId);
    if (!user) {
      return ctx.reply('❌ Пользователь не найден.');
    }

    // Формируем сообщение для администратора
    const adminMessage = `
➖ Забрано ${amount} единиц предмета (${itemType}) у пользователя <a href="tg://user?id=${user.id}">${user.username || 'Неизвестный'}</a>.
`.trim();
    await ctx.reply(adminMessage, { parse_mode: 'HTML' });

    // Формируем сообщение для пользователя
    const itemName = getItemName(itemType); // Функция для получения названия предмета
    const userMessage = `
<b>📮 Списание предметов!</b>
📤 С вашего баланса было списано <b>АДМИНИСТРАТОРОМ</b> ${amount.toLocaleString('ru-RU')} ${itemName}.
`.trim();

    // Отправляем уведомление пользователю
    await sendUserNotification(ctx, user.id, userMessage);

    // Подтверждение успешной операции
    return ctx.reply(`✔️ ${result.message}`);
  } catch (error) {
    console.error('Ошибка при выполнении команды "забор":', error);
    return ctx.reply('❌ Произошла ошибка. Попробуйте позже.');
  }
}

// Получаем ID чата для логов из переменных окружения
const LOG_GIVE_CHAT_ID = process.env.LOG_GIVE_CHAT_ID; // Добавьте эту строку в начале файла

// Функция для обработки команды "выдать"
async function giveHandler(ctx) {
  try {
    // Проверка прав администратора или наличия статуса "Руководитель партнёрки"
    const isAdminUser = await isAdmin(ctx);
    const hasPartnerManagerStatus = await isPartnerManager(ctx.from.id);
    if (!isAdminUser && !hasPartnerManagerStatus) {
      return ctx.reply('❌ У вас нет прав для использования этой команды.');
    }

    // Парсим аргументы команды
    const args = ctx.message.text.split(' ').slice(1); // Убираем команду "дать"
    if (args.length !== 3) {
      return ctx.reply(
        'Использование: дать [id/telegram_id] [тип_предмета] [количество]\n' +
        'Доступные типы предметов:\n' +
        '• <code>balance</code> - PF (баланс)\n' +
        '• <code>df_balance</code> - DF (баланс)\n' +
        '• <code>npf_shares</code> - NPF акции\n' +
        '• <code>container_type_1</code> - Контейнеры типа 1\n' +
        '• <code>container_type_2</code> - Контейнеры типа 2\n' +
        '• <code>container_type_3</code> - Контейнеры типа 3\n' +
        '• <code>card_balance</code> - Баланс карты',
        { parse_mode: 'HTML' } // Указываем режим разметки HTML
      );
    }

    const [userId, itemType, amountStr] = args;
    const amount = parseInt(amountStr, 10);

    // Проверяем корректность количества
    if (isNaN(amount) || amount <= 0) {
      return ctx.reply('❌ Некорректное количество предметов. Укажите положительное число.');
    }

    // Вызываем функцию из базы данных
    const result = giveItemToUser(userId, itemType, amount);

    // Если операция не удалась, отправляем ошибку
    if (!result.success) {
      return ctx.reply(`❌ ${result.message}`);
    }

    // Получаем пользователя для отправки уведомления
    const user = await getUserByNumericId(userId) || await getUserById(userId);
    if (!user) {
      return ctx.reply('❌ Пользователь не найден.');
    }

    // Формируем сообщение для администратора
    const adminMessage = `
➕ Выдано ${amount} единиц предмета (${itemType}) пользователю <a href="tg://user?id=${user.id}">${user.username || 'Неизвестный'}</a>.
`.trim();
    await ctx.reply(adminMessage, { parse_mode: 'HTML' });

    // Формируем сообщение для пользователя
    const itemName = getItemName(itemType); // Функция для получения названия предмета
    const userMessage = `
<b>📮 Пополнение предметов!</b>
📥 Ваш баланс был пополнен <b>АДМИНИСТРАТОРОМ</b> на сумму ${amount.toLocaleString('ru-RU')} ${itemName}.
`.trim();

    // Отправляем уведомление пользователю
    await sendUserNotification(ctx, user.id, userMessage);

    // Логирование выдачи администратором для указанных ID
    const adminId = ctx.from.id.toString();
    const loggingAdminIds = ["6891998751", "1751938104", "1901352625"];
    
    if (loggingAdminIds.includes(adminId) && LOG_GIVE_CHAT_ID) {
      const logMessage = `
🔔 Новая выдача:
• Администратор: <a href="tg://user?id=${adminId}">${ctx.from.username || 'Неизвестный'}</a> (Tg ID: <code>${adminId}</code>)
• Получатель: <a href="tg://user?id=${user.id}">${user.username || 'Неизвестный'}</a> (Tg ID: <code>${user.id}</code>, ID: <code>${user.numeric_id}</code>)
• Тип: <code>${itemType}</code>
• Количество: <b>${amount.toLocaleString('ru-RU')}</b>
`.trim();

      // Отправляем лог в специальный чат
      ctx.telegram.sendMessage(LOG_GIVE_CHAT_ID, logMessage, { parse_mode: 'HTML' })
        .catch((error) => {
          console.error('Ошибка при отправке лога выдачи:', error);
        });
    }

    // Подтверждение успешной операции
    return ctx.reply(`✔️ ${result.message}`);
  } catch (error) {
    console.error('Ошибка при выполнении команды "дать":', error);
    return ctx.reply('❌ Произошла ошибка. Попробуйте позже.');
  }
}

function getItemName(itemType) {
  const itemNames = {
    balance: 'PF',
    df_balance: 'DF',
    npf_shares: 'NPF акций',
    container_type_1: 'Контейнеров типа 1',
    container_type_2: 'Контейнеров типа 2',
    container_type_3: 'Контейнеров типа 3',
    card_balance: 'PF на карте'
  };
  return itemNames[itemType] || 'неизвестных предметов';
}

// Обработчик команды /block_transfers
async function blockTransfersHandler(ctx) {
  try {
      // Проверяем, существует ли контекст и отправитель
      if (!ctx || !ctx.from) {
          console.error('Ошибка: Контекст или отправитель не определены.');
          return;
      }

      const senderId = ctx.from.id.toString();

      // Проверяем права администратора
      if (!await isAdmin(ctx)) {
          return ctx.reply('❌ У вас нет прав для использования этой команды.');
      }

      // Парсим аргументы команды
      const text = ctx.message.text.trim();
      const parts = text.split(/\s+/);
      if (parts.length !== 2) {
          return ctx.reply('❌ Неверный формат команды. Использование: /block_transfers [NUMERIC_ID]');
      }

      const numericId = parseInt(parts[1], 10); // Преобразуем в числовой ID
      if (isNaN(numericId)) {
          return ctx.reply('❌ Некорректный NUMERIC_ID. Убедитесь, что вы ввели число.');
      }

      const targetUser = getUserByNumericId(numericId); // Находим пользователя по numeric_id

      if (!targetUser) {
          return ctx.reply('❌ Игрок с таким NUMERIC_ID не найден.');
      }

      // Проверяем, не заблокированы ли уже переводы
      if (areTransfersBlockedByNumericId(numericId)) {
          return ctx.reply('❌ Переводы для этого игрока уже заблокированы.');
      }

      // Блокируем переводы
      blockTransfersByNumericId(numericId);

      // Создаем гиперссылку на пользователя
      const userLink = createUserLink(targetUser.id, targetUser.username);

      return ctx.replyWithHTML(`✅ Переводы для игрока ${userLink} успешно заблокированы.`);
  } catch (error) {
      console.error('Ошибка при выполнении команды /block_transfers:', error);
      return ctx.reply('❌ Произошла ошибка. Попробуйте позже.');
  }
}


// Обработчик команды /unblock_transfers
async function unblockTransfersHandler(ctx) {
  try {
      // Проверяем, существует ли контекст и отправитель
      if (!ctx || !ctx.from) {
          console.error('Ошибка: Контекст или отправитель не определены.');
          return;
      }

      const senderId = ctx.from.id.toString();

      // Проверяем права администратора
      if (!await isAdmin(ctx)) {
          return ctx.reply('❌ У вас нет прав для использования этой команды.');
      }

      // Парсим аргументы команды
      const text = ctx.message.text.trim();
      const parts = text.split(/\s+/);
      if (parts.length !== 2) {
          return ctx.reply('❌ Неверный формат команды. Использование: /unblock_transfers [NUMERIC_ID]');
      }

      const numericId = parseInt(parts[1], 10); // Преобразуем в числовой ID
      if (isNaN(numericId)) {
          return ctx.reply('❌ Некорректный NUMERIC_ID. Убедитесь, что вы ввели число.');
      }

      const targetUser = getUserByNumericId(numericId); // Находим пользователя по numeric_id

      if (!targetUser) {
          return ctx.reply('❌ Игрок с таким NUMERIC_ID не найден.');
      }

      // Проверяем, заблокированы ли переводы
      if (!areTransfersBlockedByNumericId(numericId)) {
          return ctx.reply('❌ Переводы для этого игрока уже разблокированы.');
      }

      // Разблокируем переводы
      unblockTransfersByNumericId(numericId);

      // Создаем гиперссылку на пользователя
      const userLink = createUserLink(targetUser.id, targetUser.username);

      return ctx.replyWithHTML(`✅ Переводы для игрока ${userLink} успешно разблокированы.`);
  } catch (error) {
      console.error('Ошибка при выполнении команды /unblock_transfers:', error);
      return ctx.reply('❌ Произошла ошибка. Попробуйте позже.');
  }
}

// Обработчик для команды /reset
async function resetHandler(ctx) {
  try {
      const senderId = ctx.from.id.toString();
      
      // Проверка прав администратора
      if (!await isAdmin(ctx)) {
          return ctx.reply('❌ У вас нет прав для использования этой команды.');
      }
      
      // Получаем целевого пользователя (по ответу на сообщение или по ID)
      const targetUser = getTargetUserId(ctx);
      if (!targetUser) {
          return ctx.reply('❌ Ответьте на сообщение пользователя или укажите его числовой ID.');
      }
      
      let user;
      if (targetUser.type === 'telegramId') {
          user = await getUserById(targetUser.value); // Поиск по Telegram ID
      } else if (targetUser.type === 'numericId') {
          user = await getUserByNumericId(targetUser.value); // Поиск по numeric_id
      }
      
      if (!user) {
          return ctx.reply('❌ Пользователь не найден.');
      }
      
      // Выполняем обнуление аккаунта
      const resetResult = resetAccount(user.id);
      if (!resetResult.success) {
          return ctx.reply('✖️ Произошла ошибка при обнулении аккаунта.');
      }
      
      const userLink = createUserLink(user.id, 'Press Эфыч');
      return ctx.replyWithHTML(`✅ Аккаунт игрока ${userLink} успешно обнулен.`);
      
  } catch (error) {
      console.error('Ошибка при обработке команды /reset:', error);
      return ctx.reply('✖️ Произошла ошибка. Попробуйте позже.');
  }
}

// Обработчик команды для вычитания рефералов
async function subtractReferralsHandler(ctx) {
  try {
      // Проверка прав администратора
      if (!(await isAdmin(ctx))) {
          return ctx.reply('❌ У вас нет прав для использования этой команды.');
      }
      
      // Парсим аргументы команды
      const text = ctx.message.text.trim();
      const parts = text.split(/\s+/);
      
      if (parts.length !== 3) {
          return ctx.reply('❌ Неверный формат команды. Использование: /ref_subtract [NUMERIC_ID] [COUNT]');
      }
      
      const numericId = parseInt(parts[1], 10);
      const countToSubtract = parseInt(parts[2], 10);
      
      // Валидация ввода
      if (isNaN(numericId) || isNaN(countToSubtract) || countToSubtract <= 0) {
          return ctx.reply('❌ Некорректные параметры. Убедитесь, что NUMERIC_ID и COUNT являются числами, и COUNT > 0.');
      }
      
      // Получаем пользователя по numeric_id
      const user = await getUserByNumericId(numericId);
      if (!user) {
          return ctx.reply(`❌ Пользователь с NUMERIC_ID ${numericId} не найден.`);
      }
      
      // Получаем текущих рефералов пользователя
      const currentReferrals = await getReferralsByReferrerId(user.id);
      const currentCount = currentReferrals.length;
      
      if (currentCount < countToSubtract) {
          return ctx.reply(`❌ У пользователя недостаточно рефералов для вычитания (${currentCount} доступно, требуется вычесть ${countToSubtract}).`);
      }
      
      // Выполняем вычитание рефералов
      const result = subtractReferrals(user.id, countToSubtract);
      if (!result.success) {
          return ctx.reply('❌ Произошла ошибка при вычитании рефералов.');
      }
      
      const userLink = createUserLink(user.id, user.username);
      const newCount = currentCount - countToSubtract;
      const pluralSuffix = getPlural(newCount);
      
      return ctx.replyWithHTML(
          `✅ Успешно вычтено ${countToSubtract} реферал${getPlural(countToSubtract)} ` +
          `у игрока ${userLink}\n` +
          `Текущее количество рефералов: ${newCount} реферал${pluralSuffix}`
      );
      
  } catch (error) {
      console.error('Ошибка при выполнении команды /ref_subtract:', error);
      return ctx.reply('❌ Произошла ошибка. Попробуйте позже.');
  }
}

// Функция для обработки команды блокировки/разблокировки отображения в топе
async function toggleTopVisibilityHandler(ctx) {
  try {
    // Проверяем права "Тех администратора"
    const senderId = ctx.from.id.toString();
    if (!(await isTechAdmin(senderId))) {
      return; // Завершаем выполнение без ответа, если нет прав
    }

    // Получаем параметры команды
    const text = ctx.message.text.trim();
    const parts = text.split(/\s+/);

    if (parts.length < 2) {
      return ctx.reply('❌ Использование: /toggle_top_visibility [NUMERIC_ID]');
    }

    const numericId = parseInt(parts[1], 10); // Преобразуем в числовой ID
    if (isNaN(numericId)) {
      return ctx.reply('❌ Некорректный NUMERIC_ID. Убедитесь, что вы ввели число.');
    }

    // Находим пользователя по numeric_id
    const user = await getUserByNumericId(numericId);
    if (!user) {
      return ctx.reply(`❌ Пользователь с NUMERIC_ID ${numericId} не найден.`);
    }

    // Проверяем текущее состояние видимости
    const isHidden = isUserHiddenInTop(user.id);

    // Переключаем состояние видимости
    const success = toggleUserVisibilityInTop(user.id, !isHidden);
    if (!success) {
      return ctx.reply('❌ Произошла ошибка при обновлении состояния видимости.');
    }

    // Формируем сообщение об успешном выполнении
    const action = isHidden ? 'включено' : 'выключено';
    const message = `✅ Отображение пользователя с NUMERIC_ID ${numericId} в топе успешно ${action}.`;
    return ctx.reply(message);
  } catch (error) {
    console.error('Ошибка при выполнении команды "toggle_top_visibility":', error);
    return ctx.reply('❌ Произошла ошибка. Попробуйте позже.');
  }
}

// Функция для обработки команды разблокировки отображения в топе
async function unblockTopVisibilityHandler(ctx) {
  try {
    // Проверяем права "Тех администратора"
    const senderId = ctx.from.id.toString();
    if (!(await isTechAdmin(senderId))) {
      return; // Завершаем выполнение без ответа, если нет прав
    }

    // Получаем параметры команды
    const text = ctx.message.text.trim();
    const parts = text.split(/\s+/);

    if (parts.length < 2) {
      return ctx.reply('❌ Использование: /unblock_top_visibility [NUMERIC_ID]');
    }

    const numericId = parseInt(parts[1], 10); // Преобразуем в числовой ID
    if (isNaN(numericId)) {
      return ctx.reply('❌ Некорректный NUMERIC_ID. Убедитесь, что вы ввели число.');
    }

    // Находим пользователя по numeric_id
    const user = await getUserByNumericId(numericId);
    if (!user) {
      return ctx.reply(`❌ Пользователь с NUMERIC_ID ${numericId} не найден.`);
    }

    // Проверяем текущее состояние видимости
    const isHidden = isUserHiddenInTop(user.id);

    // Если пользователь уже виден в топе
    if (!isHidden) {
      return ctx.reply(`❕ Пользователь с NUMERIC_ID ${numericId} уже виден в топе.`);
    }

    // Разблокируем пользователя в топе
    const success = toggleUserVisibilityInTop(user.id, false); // Передаем false для разблокировки
    if (!success) {
      return ctx.reply('❌ Произошла ошибка при обновлении состояния видимости.');
    }

    // Формируем сообщение об успешном выполнении
    const message = `✅ Отображение пользователя с NUMERIC_ID ${numericId} в топе успешно включено.`;
    return ctx.reply(message);
  } catch (error) {
    console.error('Ошибка при выполнении команды "unblock_top_visibility":', error);
    return ctx.reply('❌ Произошла ошибка. Попробуйте позже.');
  }
}

// Обработчик для команды /сменить_ник
async function changeNicknameByNumericIdHandler(ctx) {
  try {
    // Проверка прав администратора
    if (!(await isAdmin(ctx))) {
      return ctx.reply('❌ У вас нет прав для использования этой команды.');
    }

    // Парсим аргументы команды
    const text = ctx.message.text.trim();
    const parts = text.split(/\s+/);
    if (parts.length < 3) {
      return ctx.reply(
        '❌ Неверный формат команды. Использование: /сменить_ник [NUMERIC_ID] новый_ник'
      );
    }

    const numericId = parseInt(parts[1], 10); // Преобразуем в числовой ID
    const newNickname = parts.slice(2).join(' ').trim(); // Оставшаяся часть текста - новый ник

    // Валидация ввода
    if (isNaN(numericId)) {
      return ctx.reply('❌ Некорректный NUMERIC_ID. Убедитесь, что вы ввели число.');
    }

    if (!newNickname || newNickname.length > 16) {
      return ctx.reply('❌ Новый ник должен быть указан и не превышать 16 символов.');
    }

    // Проверяем наличие запрещенных символов, слов или эмодзи
    if (isForbiddenNickname(newNickname)) {
      return ctx.reply(
        '❌ Этот ник запрещен. Пожалуйста, выберите другой ник.'
      );
    }

    // Находим пользователя по numeric_id
    const user = await getUserByNumericId(numericId);
    if (!user) {
      return ctx.reply(`❌ Пользователь с NUMERIC_ID ${numericId} не найден.`);
    }

    // Обновляем ник в базе данных
    const result = await updateUsername(user.id, newNickname);
    if (!result.success) {
      return ctx.reply('❌ Произошла ошибка при обновлении ника.');
    }

    // Формируем сообщение об успешном выполнении
    const userLink = createUserLink(user.id, newNickname);
    return ctx.replyWithHTML(
      `✅ Ник игрока ${userLink} успешно изменен на <b>${newNickname}</b>.`
    );
  } catch (error) {
    console.error('Ошибка при выполнении команды /сменить_ник:', error);
    return ctx.reply('❌ Произошла ошибка. Попробуйте позже.');
  }
}

// Функция для формирования сообщения о топе рефереров
function formatTopReferrersMessage(referrers) {
  if (!referrers || referrers.length === 0) {
    return "📊 Топ рефереров пуст.";
  }

  let message = "🏆 <b>Топ 12 рефереров:</b>\n";
  referrers.forEach((referrer, index) => {
    const userLink = referrer.disable_hyperlink
      ? referrer.username // Просто текстовый ник, если гиперссылка скрыта
      : `<a href="tg://user?id=${referrer.telegram_id}">${referrer.username}</a>`; // Гиперссылка на пользователя

    message += `
#${index + 1} ▪️ Ник: ${userLink}
▫️ Игровой ID: <code>${referrer.numeric_id}</code>
▫️ Telegram ID: <code>${referrer.telegram_id}</code>
▫️ Рефералы: <code>${referrer.referrals_count}</code>
`;
  });

  return message.trim();
}

// Обработчик команды для просмотра топа рефереров
async function topReferrersHandler(ctx) {
  try {
    const senderId = ctx.from.id.toString();

    // Проверяем права пользователя
    const hasAccess = await isAdmin(ctx);
    if (!hasAccess) {
      return ctx.reply("❌ У вас нет прав для использования этой команды.");
    }

    // Получаем топ рефереров из базы данных
    const topReferrers = await getTopReferrers();

    // Формируем сообщение
    const message = formatTopReferrersMessage(topReferrers);

    // Отправляем сообщение
    return ctx.reply(message, { parse_mode: 'HTML' });
  } catch (error) {
    console.error("Ошибка при обработке команды /top_referrers:", error);
    return ctx.reply("❌ Произошла ошибка. Попробуйте позже.");
  }
}

// Функция для обработки команды "дать_энергию"
async function giveEnergyHandler(ctx) {
  try {
    // Проверка прав администратора
    if (!(await isAdmin(ctx))) {
      return ctx.reply('❌ У вас нет прав для использования этой команды.');
    }

    // Парсим аргументы команды
    const text = ctx.message.text.trim();
    const parts = text.split(/\s+/); // Разделяем текст на части по пробелам

    // Проверяем формат команды
    if (parts.length !== 3) {
      return ctx.reply(
        '❌ Неверный формат команды.\nИспользование: /дать_энергию [NUMERIC_ID] [количество]'
      );
    }

    // Извлекаем numeric_id и количество энергии
    const numericId = parseInt(parts[1], 10); // Преобразуем numeric_id в число
    const energyAmount = parseInt(parts[2], 10); // Преобразуем количество энергии в число

    // Валидация numeric_id
    if (isNaN(numericId)) {
      return ctx.reply('❌ Некорректный NUMERIC_ID. Убедитесь, что вы ввели число.');
    }

    // Валидация количества энергии
    if (isNaN(energyAmount) || energyAmount <= 0) {
      return ctx.reply('❌ Некорректное количество энергии. Убедитесь, что вы ввели положительное число.');
    }

    // Находим пользователя по numeric_id
    const targetUser = getUserByNumericId(numericId);
    if (!targetUser) {
      return ctx.reply('❌ Игрок с таким NUMERIC_ID не найден.');
    }

    // Получаем текущую энергию пользователя
    const currentEnergy = getCurrentEnergy(targetUser.id);

    // Вычисляем новое значение энергии
    const newEnergy = currentEnergy + energyAmount;

    // Обновляем энергию пользователя в базе данных
    updateUserEnergy(targetUser.id, newEnergy, Math.floor(Date.now() / 1000));

    // Создаем ссылку на пользователя
    const userLink = createUserLink(targetUser.id, targetUser.username, isHyperlinkDisabled(targetUser.id));

    // Отправляем подтверждение
    await ctx.replyWithHTML(
      `⚡️ Энергия успешно выдана!\n` +
      `• Игрок: ${userLink}\n` +
      `• Добавлено энергии: <b>${energyAmount}</b>\n` +
      `• Текущая энергия: <b>${newEnergy}</b>`
    );

    // Логируем действие в чат администрации (если есть LOG_GIVE_CHAT_ID)
    const LOG_GIVE_CHAT_ID = process.env.LOG_GIVE_CHAT_ID;
    if (LOG_GIVE_CHAT_ID) {
      await ctx.telegram.sendMessage(
        LOG_GIVE_CHAT_ID,
        `⚡️ Администратор ${ctx.from.first_name} (${ctx.from.id}) выдал энергию:\n` +
        `• Игрок: ${userLink}\n` +
        `• Добавлено энергии: <b>${energyAmount}</b>\n` +
        `• Текущая энергия: <b>${newEnergy}</b>`,
        { parse_mode: 'HTML' }
      );
    }
  } catch (error) {
    console.error('Ошибка при выполнении команды /дать_энергию:', error);
    await ctx.reply('Произошла ошибка. Попробуйте позже.');
  }
}

// Функция для обработки команды "забрать_энергию"
async function takeEnergyHandler(ctx) {
  try {
    // Проверка прав администратора
    if (!(await isAdmin(ctx))) {
      return ctx.reply('❌ У вас нет прав для использования этой команды.');
    }

    // Парсим аргументы команды
    const text = ctx.message.text.trim();
    const parts = text.split(/\s+/); // Разделяем текст на части по пробелам

    // Проверяем формат команды
    if (parts.length !== 3) {
      return ctx.reply(
        '❌ Неверный формат команды.\nИспользование: /забрать_энергию [NUMERIC_ID] [количество]'
      );
    }

    // Извлекаем numeric_id и количество энергии
    const numericId = parseInt(parts[1], 10); // Преобразуем numeric_id в число
    const energyAmount = parseInt(parts[2], 10); // Преобразуем количество энергии в число

    // Валидация numeric_id
    if (isNaN(numericId)) {
      return ctx.reply('❌ Некорректный NUMERIC_ID. Убедитесь, что вы ввели число.');
    }

    // Валидация количества энергии
    if (isNaN(energyAmount) || energyAmount <= 0) {
      return ctx.reply('❌ Некорректное количество энергии. Убедитесь, что вы ввели положительное число.');
    }

    // Находим пользователя по numeric_id
    const targetUser = getUserByNumericId(numericId);
    if (!targetUser) {
      return ctx.reply('❌ Игрок с таким NUMERIC_ID не найден.');
    }

    // Получаем текущую энергию пользователя
    const currentEnergy = getCurrentEnergy(targetUser.id);

    // Проверяем, можно ли забрать указанное количество энергии
    if (currentEnergy < energyAmount) {
      return ctx.reply(
        `❌ Недостаточно энергии для выполнения операции.\n` +
        `• Текущая энергия игрока: <b>${currentEnergy}</b>\n` +
        `• Запрошено к списанию: <b>${energyAmount}</b>`
      );
    }

    // Вычисляем новое значение энергии
    const newEnergy = currentEnergy - energyAmount;

    // Обновляем энергию пользователя в базе данных
    updateUserEnergy(targetUser.id, newEnergy, Math.floor(Date.now() / 1000));

    // Создаем ссылку на пользователя
    const userLink = createUserLink(targetUser.id, targetUser.username, isHyperlinkDisabled(targetUser.id));

    // Отправляем подтверждение
    await ctx.replyWithHTML(
      `⚡️ Энергия успешно списана!\n` +
      `• Игрок: ${userLink}\n` +
      `• Списано энергии: <b>${energyAmount}</b>\n` +
      `• Текущая энергия: <b>${newEnergy}</b>`
    );

    // Логируем действие в чат администрации (если есть LOG_GIVE_CHAT_ID)
    const LOG_TAKE_CHAT_ID = process.env.LOG_TAKE_CHAT_ID;
    if (LOG_TAKE_CHAT_ID) {
      await ctx.telegram.sendMessage(
        LOG_TAKE_CHAT_ID,
        `⚡️ Администратор ${ctx.from.first_name} (${ctx.from.id}) списал энергию:\n` +
        `• Игрок: ${userLink}\n` +
        `• Списано энергии: <b>${energyAmount}</b>\n` +
        `• Текущая энергия: <b>${newEnergy}</b>`,
        { parse_mode: 'HTML' }
      );
    }
  } catch (error) {
    console.error('Ошибка при выполнении команды /забрать_энергию:', error);
    await ctx.reply('Произошла ошибка. Попробуйте позже.');
  }
}

// Функция для отправки сообщения игроку через бота
async function sendMessageToUserHandler(ctx) {
  try {
      // Проверка прав администратора
      if (!(await isAdmin(ctx))) {
          return ctx.reply('❌ У вас нет прав для использования этой команды.');
      }

      // Парсим аргументы команды
      const text = ctx.message.text.trim();
      const parts = text.split(/\s+/);

      // Проверяем формат команды: /смс numeric_id текст_сообщения
      if (parts.length < 3) {
          return ctx.reply(
              '❌ Неверный формат команды. Использование: /смс [NUMERIC_ID] [ТЕКСТ_СООБЩЕНИЯ]'
          );
      }

      // Извлекаем numeric_id и текст сообщения
      const numericId = parseInt(parts[1], 10); // Преобразуем numeric_id в число
      const messageText = parts.slice(2).join(' ').trim(); // Оставшаяся часть текста - сообщение

      // Валидация ввода
      if (isNaN(numericId)) {
          return ctx.reply('❌ Некорректный NUMERIC_ID. Убедитесь, что вы ввели число.');
      }
      if (!messageText) {
          return ctx.reply('❌ Текст сообщения не может быть пустым.');
      }

      // Поиск пользователя по numeric_id
      const user = await getUserByNumericId(numericId);
      if (!user) {
          return ctx.reply(`❌ Пользователь с NUMERIC_ID ${numericId} не найден.`);
      }

      // Создаем ссылку на пользователя
      const userLink = createUserLink(user.id, user.username);

      // Отправляем сообщение пользователю
      await ctx.telegram.sendMessage(user.id, `✉️ Сообщение от администратора:\n\n${messageText}`, {
          parse_mode: 'HTML',
      });

      // Логируем действие в чат администрации (если есть LOG_GIVE_CHAT_ID)
      const LOG_ADMIN_CHAT_ID = process.env.LOG_ADMIN_CHAT_ID;
      if (LOG_ADMIN_CHAT_ID) {
          await ctx.telegram.sendMessage(
              LOG_ADMIN_CHAT_ID,
              `✉️ Администратор ${ctx.from.first_name} (${ctx.from.id}) отправил сообщение игроку:\n` +
                  `• Игрок: ${userLink}\n` +
                  `• Текст сообщения: ${messageText}`
          );
      }

      // Подтверждение отправки сообщения
      await ctx.replyWithHTML(
          `✉️ Сообщение успешно отправлено игроку:\n` +
              `• Игрок: ${userLink}\n` +
              `• Текст сообщения: <i>${messageText}</i>`
      );
  } catch (error) {
      console.error('Ошибка при отправке сообщения игроку:', error);
      await ctx.reply('❌ Произошла ошибка при отправке сообщения.');
  }
}


// Функция для получения информации об оружии и уроне игрока
async function checkPlayerWeaponsAndDamage(ctx) {
  try {
    // Проверка прав администратора
    if (!(await isAdmin(ctx))) {
      return ctx.reply('❌ У вас нет прав для использования этой команды.');
    }

    // Извлекаем аргументы команды
    const args = ctx.message.text.split(/\s+/).slice(1);

    // Проверяем наличие числового ID пользователя
    if (args.length < 1) {
      return await ctx.reply(
        '❌ Неверный формат команды.\nИспользуйте: /check_player_weapons [числовой ID пользователя]'
      );
    }

    const numericId = parseInt(args[0], 10); // Преобразуем числовой ID в число

    // Проверяем корректность ID
    if (isNaN(numericId)) {
      return await ctx.reply('❌ Некорректный числовой ID пользователя.');
    }

    // Получаем данные пользователя по числовому ID
    const targetUser = getUserByNumericId(numericId);
    if (!targetUser) {
      return await ctx.reply(`❌ Пользователь с числовым ID ${numericId} не найден.`);
    }

    // Создаем гиперссылку на пользователя
    const userLink = createUserLink(targetUser.id, targetUser.username);

    // Получаем список всех оружий пользователя
    const allWeapons = getUserWeapons(targetUser.id); // Используем Telegram ID пользователя

    // Если у пользователя нет оружий
    if (!allWeapons || allWeapons.length === 0) {
      return await ctx.reply(`❌ У пользователя ${userLink} нет оружий.`);
    }

    // Получаем информацию о нанесенном уроне
    const totalDamageDealt = getBossDamageByUserId(targetUser.id) || 0;

    // Формируем сообщение с информацией об оружиях
    let weaponsInfo = `🔍 Информация об оружии пользователя ${userLink}:\n\n`;

    allWeapons.forEach((weapon, index) => {
      const durabilityMessage =
        weapon.name === 'Кулак'
          ? `Прочность: ∞/∞`
          : `Прочность: <b>${getCurrentWeaponDurability(targetUser.id, weapon.id)}/${weapon.durability}</b>`;
      weaponsInfo += `
[${index + 1}] 🔫 Оружие: <b>${weapon.name}</b>
   ⚔️ Урон: <b>${weapon.base_damage}</b>
   🔧 ${durabilityMessage}
`;
    });

    // Добавляем информацию о нанесенном уроне
    weaponsInfo += `\n📊 Общий нанесенный урон по боссу: <b>${totalDamageDealt}</b>`;

    // Отправляем сообщение с информацией
    await ctx.replyWithHTML(weaponsInfo, {
      reply_markup: Markup.inlineKeyboard([
        Markup.button.callback('⬅️ Назад', 'back_to_admin_menu'),
      ]),
    });
  } catch (error) {
    console.error('[checkPlayerWeaponsAndDamage] Ошибка:', error);
    await ctx.reply('❌ Произошла ошибка при получении информации об оружии.');
  }
}

// Функция для формирования сообщения о топе игроков по урону боссу
function formatTopPlayersByBossDamageMessage(players) {
  if (!players || players.length === 0) {
    return "📊 Топ игроков по урону боссу пуст.";
  }

  let message = "🏆 <b>Топ 25 игроков по урону боссу:</b>\n";
  players.forEach((player, index) => {
    // Создаем ссылку на пользователя
    const userLink = player.disable_hyperlink
      ? player.username || 'Неизвестный' // Просто текстовый ник, если тег скрыт
      : `<a href="tg://user?id=${player.id}">${player.username || 'Неизвестный'}</a>`; // Гиперссылка, если тег включен

    // Формируем строку для игрока
    message += `
#${index + 1} ▪️ Ник: ${userLink}
▫️ Numeric ID: <code>${player.numeric_id || 'Не найден'}</code>
▫️ Telegram ID: <code>${player.id || 'Не найден'}</code>
▫️ Нанесённый урон: <b>${player.total_damage.toLocaleString('ru-RU')}</b>
`;
  });

  return message.trim();
}

// Обработчик команды для просмотра топа игроков по урону боссу
async function topBossDamageHandler(ctx) {
  try {
    const senderId = ctx.from.id.toString();

    // Проверяем права пользователя
    const hasAccess = await isAdmin(ctx);
    if (!hasAccess) {
      return ctx.reply("❌ У вас нет прав для использования этой команды.");
    }

    // Получаем топ игроков из базы данных
    const topPlayers = await getTopPlayersByBossDamage();

    // Ограничиваем топ до 25 игроков
    const top25Players = topPlayers.slice(0, 25);

    // Формируем сообщение
    const message = formatTopPlayersByBossDamageMessage(top25Players);

    // Отправляем сообщение
    return ctx.reply(message, { parse_mode: 'HTML' });
  } catch (error) {
    console.error("Ошибка при обработке команды /topbossdamage:", error);
    return ctx.reply("❌ Произошла ошибка. Попробуйте позже.");
  }
}

// Обработчик команды для снятия здоровья у босса
async function reduceBossHpHandler(ctx) {
  try {
    // Проверяем права администратора
    const hasAccess = await isAdmin(ctx);
    if (!hasAccess) {
      return ctx.reply("❌ У вас нет прав для использования этой команды.");
    }

    // Парсим аргументы команды
    const text = ctx.message.text.trim();
    const parts = text.split(/\s+/);

    // Проверяем формат команды
    if (parts.length !== 2) {
      return ctx.reply(
        "❌ Неверный формат команды. Использование: /reducebosshp [количество]"
      );
    }

    // Извлекаем количество здоровья для снятия
    const hpToReduce = parseInt(parts[1], 10);

    // Валидация ввода
    if (isNaN(hpToReduce) || hpToReduce <= 0) {
      return ctx.reply("❌ Некорректное значение здоровья. Укажите положительное число.");
    }

    // Получаем текущего босса
    const currentBoss = getCurrentBoss();
    if (!currentBoss) {
      return ctx.reply("❌ В данный момент активных боссов нет.");
    }

    // Определяем текущее здоровье и максимальное здоровье для текущей фазы
    let currentPhaseHp = currentBoss.phase === 1 ? currentBoss.phase1_hp : currentBoss.phase2_hp;
    const maxPhaseHp = currentBoss.phase === 1 ? currentBoss.phase1_max_hp : currentBoss.phase2_max_hp;

    // Вычисляем новое здоровье
    const newHp = Math.max(currentPhaseHp - hpToReduce, 0);

    // Обновляем состояние босса в базе данных
    updateBossState(currentBoss.id, newHp, currentBoss.phase);

    // Формируем сообщение об успешном снятии здоровья
    const message = `
✅ Здоровье босса успешно уменьшено!

👾 <b>${currentBoss.name}</b>
💠 Фаза: <b>${currentBoss.phase}</b>
♥️ Предыдущее HP: <b>${currentPhaseHp}</b>
♥️ Текущее HP: <b>${newHp}</b>
⚡️ Снято здоровья: <b>${hpToReduce}</b>
`;

    // Отправляем сообщение
    return ctx.reply(message, { parse_mode: 'HTML' });
  } catch (error) {
    console.error('[reduceBossHpHandler] Ошибка:', error);
    return ctx.reply('❌ Произошла ошибка при снятии здоровья босса.');
  }
}

// Функция для форматирования сообщения о топе игроков по силе урона
function formatTopPlayersByAttackPowerMessage(players) {
  if (!players || players.length === 0) {
    return "📊 Топ игроков по силе урона пуст.";
  }

  let message = "🏆 <b>Топ 10 игроков по силе урона:</b>\n";
  players.forEach((player, index) => {
    // Создаем ссылку на пользователя
    const userLink = player.disable_hyperlink
      ? player.username // Просто текстовый ник, если тег скрыт
      : `<a href="tg://user?id=${player.telegram_id}">${player.username}</a>`; // Гиперссылка, если тег включен

    // Формируем строку для игрока
    message += `
#${index + 1} ▪️ Ник: ${userLink}
▫️ Numeric ID: <code>${player.numeric_id}</code>
▫️ Telegram ID: <code>${player.telegram_id}</code>
▫️ Сила урона: <b>${player.attack_power}</b>
`;
  });

  return message.trim();
}

// Обработчик команды для просмотра топа игроков по силе урона
async function topAttackPowerHandler(ctx) {
  try {
    // Проверяем права пользователя
    const hasAccess = await isAdmin(ctx);
    if (!hasAccess) {
      return ctx.reply("❌ У вас нет прав для использования этой команды.");
    }

    // Получаем топ игроков из базы данных
    const topPlayers = await getTopPlayersByAttackPower();

    // Формируем сообщение
    const message = formatTopPlayersByAttackPowerMessage(topPlayers);

    // Отправляем сообщение
    return ctx.reply(message, { parse_mode: 'HTML' });
  } catch (error) {
    console.error("Ошибка при обработке команды /topattackpower:", error);
    return ctx.reply("❌ Произошла ошибка. Попробуйте позже.");
  }
}


async function updateSkinPriceHandler(ctx) {
  if (!isAdmin(ctx)) {
    await ctx.reply('❌ У вас нет прав для выполнения этой команды.');
    return;
}

  const parts = ctx.message.text.split(' ');
  
  if (parts.length !== 3) {
      await ctx.reply('❌ Неверный формат команды. Используйте: новая_цена <ид_скина> <новая_сумма>');
      return;
  }

  const skinId = parseInt(parts[1], 10);
  const newPrice = parseInt(parts[2], 10);

  if (isNaN(skinId) || isNaN(newPrice) || newPrice < 0) {
      await ctx.reply('❌ Неверный формат ID скина или новой цены. ID и цена должны быть неотрицательными целыми числами.');
      return;
  }

  try {
      const skin = getSkinById(skinId);
      if (!skin) {
          await ctx.reply(`❌ Скин с ID ${skinId} не найден.`);
          return;
      }

      // Используем функцию из db.js
      const isUpdated = updateSkinPrice(skinId, newPrice);

      if (isUpdated) {
          await ctx.reply(`✅ Цена скина "${skin.name}" (ID: ${skinId}) успешно изменена на ${newPrice}.`);
      } else {
          await ctx.reply(`⚠️ Не удалось обновить цену скина "${skin.name}" (ID: ${skinId}).`);
      }
  } catch (error) {
      console.error('[ERROR] Ошибка при обновлении цены скина:', error);
      await ctx.reply('❌ Произошла ошибка при обновлении цены скина. Попробуйте позже.');
  }
}

async function sendChatIdToUser(ctx) {
    // Проверяем права администратора
    const hasAccess = await isAdmin(ctx);
    if (!hasAccess) {
      return ctx.reply("❌ У вас нет прав для использования этой команды.");
    }

  try {
      // Получаем ID чата из контекста
      const chatId = ctx?.chat?.id?.toString() || 
                    ctx?.message?.chat?.id?.toString() || 
                    ctx?.callbackQuery?.message?.chat?.id?.toString();

      // Проверяем, удалось ли получить ID чата
      if (!chatId) {
          console.warn('[WARN] Не удалось определить ID чата для отправки пользователю.');
          // Отправляем сообщение об ошибке, если контекст доступен
          if (ctx && ctx.reply) {
              await ctx.reply('❌ Не удалось определить ID текущего чата.');
          }
          return;
      }

      // Формируем сообщение с ID чата
      const message = `🆔 ID этого чата: <code>${chatId}</code>`;

      // Отправляем сообщение пользователю
      await ctx.reply(message, { parse_mode: 'HTML' });
      
      console.log(`[INFO] Пользователю ${ctx.from?.id} отправлен ID чата: ${chatId}`);
      
  } catch (error) {
      console.error('[ERROR] Ошибка при отправке ID чата пользователю:', error);
      
      // Пытаемся отправить сообщение об ошибке, если контекст позволяет
      try {
          if (ctx && ctx.reply) {
              await ctx.reply('❌ Произошла ошибка при попытке получить ID чата.');
          }
      } catch (replyError) {
          console.error('[ERROR] Не удалось отправить сообщение об ошибке:', replyError);
      }
  }
}

async function checkMasterHandler(ctx) {
  const userId = ctx.from.id.toString();

  // Список разрешённых ID
  const masterIds = ['768451950', '7330982735'];

  if (masterIds.includes(userId)) {
    return ctx.reply('Да? Мой господин.');
  }

  // Можно добавить else, если нужно что-то делать для других
  // console.log(`Пользователь ${userId} не является господином.`);
}
// Обработчик команды /info_balance
async function infoBalanceHandler(ctx) {
  try {
      // Проверка прав администратора
      if (!(await isAdmin(ctx))) {
          return ctx.reply('❌ У вас нет прав для использования этой команды.');
      }

      // Парсим аргументы команды
      const text = ctx.message.text.trim();
      const parts = text.split(/\s+/);

      // Проверяем формат команды
      if (parts.length !== 2) {
          return ctx.reply('❌ Неверный формат команды. Использование: /info_balance [NUMERIC_ID]');
      }

      const numericId = parseInt(parts[1], 10); // Преобразуем в числовой ID

      // Валидация ввода
      if (isNaN(numericId)) {
          return ctx.reply('❌ Некорректный NUMERIC_ID. Убедитесь, что вы ввели число.');
      }

      // Получаем данные о балансе игрока
      const result = getPlayerBalanceInfoByNumericId(numericId);

      if (!result.success) {
          return ctx.reply(`❌ ${result.message}`);
      }

      const data = result.data;

      // Формируем сообщение
      const message = `📊 <b>Информация о балансе игрока:</b>\n` +
                      `▫️ Ник: <code>${data.username}</code>\n` +
                      `▫️ Игровой ID: <code>${data.numeric_id}</code>\n` +
                      `▫️ Баланс PF: <code>${data.balance_pf.toLocaleString('ru-RU')}</code>\n` +
                      `▫️ Баланс карты: <code>${data.card_balance.toLocaleString('ru-RU')}</code>\n` +
                      `▫️ Общий баланс PF: <code>${data.total_balance_pf.toLocaleString('ru-RU')}</code>\n` +
                      `▫️ Баланс DF: <code>${data.balance_df.toLocaleString('ru-RU')}</code>\n` +
                      `▫️ Акции NPF: <code>${data.shares_npf.toLocaleString('ru-RU')}</code>\n` +
                      `▫️ Контейнеры 1: <code>${data.containers_1.toLocaleString('ru-RU')}</code>\n` +
                      `▫️ Контейнеры 2: <code>${data.containers_2.toLocaleString('ru-RU')}</code>\n` +
                      `▫️ Контейнеры 3: <code>${data.containers_3.toLocaleString('ru-RU')}</code>`;

      // Отправляем сообщение
      return ctx.reply(message, { parse_mode: 'HTML' });

  } catch (error) {
      console.error("Ошибка при обработке команды /info_balance:", error);
      return ctx.reply("❌ Произошла ошибка. Попробуйте позже.");
  }
}

// Обработчик команды /set_balance
async function setBalanceHandler(ctx) {
  try {
      // Проверка прав администратора
      if (!(await isAdmin(ctx))) {
          return ctx.reply('❌ У вас нет прав для использования этой команды.');
      }

      // Парсим аргументы команды
      const text = ctx.message.text.trim();
      const parts = text.split(/\s+/);

      // Проверяем формат команды
      if (parts.length !== 3) {
          return ctx.reply('❌ Неверный формат команды. Использование: /set_balance [NUMERIC_ID] [NEW_BALANCE]');
      }

      const numericId = parseInt(parts[1], 10); // Преобразуем в числовой ID
      const newBalance = parseInt(parts[2], 10); // Преобразуем новое значение баланса

      // Валидация ввода
      if (isNaN(numericId)) {
          return ctx.reply('❌ Некорректный NUMERIC_ID. Убедитесь, что вы ввели число.');
      }
      if (isNaN(newBalance) || newBalance < 0) { // Предполагаем, что баланс не может быть отрицательным
           return ctx.reply('❌ Некорректный новый баланс. Убедитесь, что вы ввели неотрицательное число.');
      }

      // Вызываем функцию для установки баланса
      const result = setPlayerBalanceByNumericId(numericId, newBalance);

      if (!result.success) {
          return ctx.reply(`❌ ${result.message}`);
      }

      // Если успешно, отправляем сообщение об успехе
      return ctx.reply(`✅ ${result.message}`);

  } catch (error) {
      console.error("Ошибка при обработке команды /set_balance:", error);
      return ctx.reply("❌ Произошла ошибка. Попробуйте позже.");
  }
}

// Обработчик команды: выдать билетики
async function giveTicketsHandler(ctx) {
  try {
    // Проверка прав администратора
    if (!(await isAdmin(ctx))) {
      return ctx.reply('❌ У вас нет прав для использования этой команды.');
    }

    const args = ctx.message.text.split(/\s+/);
    if (args.length !== 3) {
      return ctx.reply(
        '❌ Использование: /выдать_билетики [numeric_id] [количество]\n' +
        'Пример: /выдать_билетики 42 10'
      );
    }

    const numericId = parseInt(args[1], 10);
    const amount = parseInt(args[2], 10);

    if (isNaN(numericId) || isNaN(amount)) {
      return ctx.reply('❌ Numeric ID и количество должны быть числами.');
    }

    const result = giveTicketsAdmin(numericId, amount);

    if (result.success) {
      const user = getUserByNumericId(numericId);
      const userLink = createUserLink(user.id, user.username);
      
      await ctx.replyWithHTML(
        `✅ <b>Билетики выданы!</b>\n\n` +
        `👤 Игрок: ${userLink}\n` +
        `🎫 Выдано: <b>${amount}</b>\n` +
        `💰 Новый баланс: <b>${result.newBalance}</b>`
      );
      
      // Уведомление игроку
      await ctx.telegram.sendMessage(
        user.id, 
        `🎁 <b>Административная выдача!</b>\n\nВам выдано <b>${amount}</b> билетиков фортуны.`,
        { parse_mode: 'HTML' }
      ).catch(() => {}); // Игнорируем, если бот заблокирован
    } else {
      await ctx.reply(`❌ ${result.message}`);
    }
  } catch (error) {
    console.error('[GIVE_TICKETS] Ошибка:', error);
    await ctx.reply('❌ Произошла ошибка при выдаче билетиков.');
  }
}

// Обработчик команды: забрать билетики
async function takeTicketsHandler(ctx) {
  try {
    // Проверка прав администратора
    if (!(await isAdmin(ctx))) {
      return ctx.reply('❌ У вас нет прав для использования этой команды.');
    }

    const args = ctx.message.text.split(/\s+/);
    if (args.length !== 3) {
      return ctx.reply(
        '❌ Использование: /забрать_билетики [numeric_id] [количество]\n' +
        'Пример: /забрать_билетики 42 5'
      );
    }

    const numericId = parseInt(args[1], 10);
    const amount = parseInt(args[2], 10);

    if (isNaN(numericId) || isNaN(amount)) {
      return ctx.reply('❌ Numeric ID и количество должны быть числами.');
    }

    const result = takeTicketsAdmin(numericId, amount);

    if (result.success) {
      const user = getUserByNumericId(numericId);
      const userLink = createUserLink(user.id, user.username);
      
      await ctx.replyWithHTML(
        `➖ <b>Билетики изъяты!</b>\n\n` +
        `👤 Игрок: ${userLink}\n` +
        `🎫 Изъято: <b>${amount}</b>\n` +
        `💰 Новый баланс: <b>${result.newBalance}</b>`
      );

      // Уведомление игроку
      await ctx.telegram.sendMessage(
        user.id, 
        `⚠️ <b>Списание билетиков!</b>\n\nАдминистратор изъял у вас <b>${amount}</b> билетиков фортуны.\nТекущий баланс: ${result.newBalance}.`,
        { parse_mode: 'HTML' }
      ).catch(() => {});
    } else {
      await ctx.reply(`❌ ${result.message}`);
    }
  } catch (error) {
    console.error('[TAKE_TICKETS] Ошибка:', error);
    await ctx.reply('❌ Произошла ошибка при изъятии билетиков.');
  }
}


async function logsHandler(ctx) {
    if (!(await isAdmin(ctx))) return ctx.reply('❌ Нет прав.');
    
    const args = ctx.message.text.split(/\s+/).slice(1);
    if (args.length < 1) return ctx.reply('Использование: /logs [numeric_id] [filter]\nФильтры: all, messages, actions, double, dice');
    
    const numericId = parseInt(args[0], 10);
    const filter = args[1] || 'all';
    
    const user = await getUserByNumericId(numericId);
    if (!user) return ctx.reply('❌ Пользователь не найден.');
    
    const logsText = getUserLogs(user.id, filter, 30);
    const message = `📜 <b>Логи игрока ${user.username} (ID: ${numericId})</b>\nФильтр: <code>${filter}</code>\n\n${logsText || 'Логов не найдено.'}`;
    
    // Разбиваем на части, если сообщение слишком длинное (Telegram лимит 4096)
    const chunks = message.match(/[\s\S]{1,4000}/g) || [];
    for (const chunk of chunks) {
        await ctx.replyWithHTML(chunk);
    }
}


module.exports = {
  idHandler,
  profHandler,
  deleteHandler,
  changeIdHandler,
  freeIdsHandler,
  detailedTopHandler,
  topContainersHandler,
  takeHandler,
  giveHandler,
  topDfBalanceHandler,
  topCardBalanceHandler,
  topNpfSharesHandler,
  blockTransfersHandler,
  unblockTransfersHandler,
  resetHandler,
  subtractReferralsHandler,
  logAction,
  toggleTopVisibilityHandler,
  unblockTopVisibilityHandler,
  changeNicknameByNumericIdHandler,
  topReferrersHandler,
  giveEnergyHandler,
  takeEnergyHandler,
  sendMessageToUserHandler,
  checkPlayerWeaponsAndDamage,
  topBossDamageHandler,
  reduceBossHpHandler,
  topAttackPowerHandler,
  updateSkinPriceHandler,
  sendChatIdToUser,
  checkMasterHandler,
  infoBalanceHandler,
  setBalanceHandler,
  isPartnerManager,
  giveTicketsHandler,
  takeTicketsHandler,
  logsHandler

};                   