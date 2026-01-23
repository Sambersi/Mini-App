const { 
  getUserById, 
  getUserStatuses, 
  updateUserBalance, 
  updateLastBonusTime,
  getUserLastPrivateBonusTime,
  giveCandy // <-- добавлена функция выдачи конфет
} = require('../db');

// Время ожидания между бонусами (в миллисекундах)
const PUBLIC_BONUS_COOLDOWN = 30 * 60 * 1000; // 30 минут для публичных чатов и Дайса
const PRIVATE_BONUS_COOLDOWN = 24 * 60 * 60 * 1000; // 24 часа для личных сообщений

// Базовые суммы бонусов (фиксированные)
// Ключи соответствуют названиям статусов из БД
const BASE_BONUSES = {
  'Тех администратор': 1000000, // Используем полное название из БД
  'Администратор': 7500,       // Используем полное название из БД
  'DIAMOND': 5000,
  'PLATINUM': 2500,
  'GOLD': 1250,
  'default': 750 // Игрок
};

// Множитель для бонуса в чате Дайс
const DICE_CHAT_BONUS_MULTIPLIER = 1.10; // +10%

// ID чата Дайс (берём из переменных окружения)
const DICE_CHAT_ID = process.env.DICE_CHAT_ID;
if (!DICE_CHAT_ID) {
  console.warn('[Бонус] Предупреждение: DICE_CHAT_ID не найден в .env файле. Бонусы в чате Дайс работать не будут.');
}

// Функция для создания гиперссылки на пользователя
function createUserLink(userId, username) {
  const displayName = username || 'Неизвестный';
  const escapedName = displayName.replace(/</g, '<').replace(/>/g, '>');
  return `<a href="tg://user?id=${userId}">${escapedName}</a>`;
}

// Функция для форматирования оставшегося времени
function formatRemainingTime(remainingTimeMs) {
  const totalSeconds = Math.ceil(remainingTimeMs / 1000);
  const days = Math.floor(totalSeconds / (24 * 60 * 60));
  const hours = Math.floor((totalSeconds % (24 * 60 * 60)) / (60 * 60));
  const minutes = Math.floor((totalSeconds % (60 * 60)) / 60);
  const seconds = totalSeconds % 60;

  const parts = [];
  if (days > 0) parts.push(`${days} дн.`);
  if (hours > 0) parts.push(`${hours} ч.`);
  if (minutes > 0) parts.push(`${minutes} мин.`);
  parts.push(`${seconds} сек.`);
  
  return parts.join(' ');
}

// Вспомогательная функция для генерации случайного числа в диапазоне [min, max]
function getRandomInt(min, max) {
  min = Math.ceil(min);
  max = Math.floor(max);
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Функция для определения бонуса, статуса и времени КД пользователя
async function calculateBonusAndCooldown(user, isPrivateChat, isDiceChat) {
  const statuses = await getUserStatuses(user.id);
  
  let baseBonusAmount = BASE_BONUSES.default;
  let statusName = 'Игрок';
  let displayStatusName = 'Игрок';
  let cooldown = isPrivateChat ? PRIVATE_BONUS_COOLDOWN : PUBLIC_BONUS_COOLDOWN;

  if (statuses.includes('Тех администратор')) {
    baseBonusAmount = BASE_BONUSES['Тех администратор'];
    statusName = 'Тех администратор';
    displayStatusName = 'Тех админ';
  } else if (statuses.includes('Администратор')) {
    baseBonusAmount = BASE_BONUSES['Администратор'];
    statusName = 'Администратор';
    displayStatusName = 'Админ';
  } else if (statuses.includes('DIAMOND')) {
    baseBonusAmount = BASE_BONUSES['DIAMOND'];
    statusName = 'DIAMOND';
    displayStatusName = 'DIAMOND';
  } else if (statuses.includes('PLATINUM')) {
    baseBonusAmount = BASE_BONUSES['PLATINUM'];
    statusName = 'PLATINUM';
    displayStatusName = 'PLATINUM';
  } else if (statuses.includes('GOLD')) {
    baseBonusAmount = BASE_BONUSES['GOLD'];
    statusName = 'GOLD';
    displayStatusName = 'GOLD';
  }

  let finalBonusAmount = baseBonusAmount;
  let isBoosted = false;

  if (isPrivateChat) {
    finalBonusAmount = getRandomInt(1000, 50000);
    isBoosted = false;
  } else if (isDiceChat && DICE_CHAT_ID) {
    if (typeof baseBonusAmount === 'number' && !isNaN(baseBonusAmount)) {
        finalBonusAmount = Math.floor(baseBonusAmount * DICE_CHAT_BONUS_MULTIPLIER);
    } else {
        console.error(`[Бонус] Ошибка: baseBonusAmount не является числом для пользователя ${user.id}`, baseBonusAmount);
        finalBonusAmount = BASE_BONUSES.default;
    }
    isBoosted = true;
  }

  let statusMessage = displayStatusName === 'Игрок' ? 'Бонус' : `<b>${displayStatusName}</b> бонус`;

  return { 
    bonusAmount: finalBonusAmount, 
    statusMessage, 
    cooldown,
    baseAmount: baseBonusAmount,
    isBoosted,
    isPrivate: isPrivateChat,
    statusName: displayStatusName
  };
}

// Обработка команды "бонус"
async function bonusHandler(ctx) {
  try {
    const userId = ctx.from.id.toString();
    const chatId = ctx.chat?.id?.toString();
    
    const isPrivateChat = ctx.chat?.type === 'private';
    const isDiceChat = DICE_CHAT_ID ? chatId === DICE_CHAT_ID : false;
    
    const user = await getUserById(userId);
    if (!user) {
      return ctx.reply('❕ Вы ещё не зарегистрированы. Используйте команду /start для регистрации.');
    }

    const currentTime = Date.now();
    
    let lastBonusTime = 0;
    let cooldown = 0;

    if (isPrivateChat) {
      lastBonusTime = await getUserLastPrivateBonusTime(userId);
      cooldown = PRIVATE_BONUS_COOLDOWN;
    } else {
      lastBonusTime = user.last_bonus_time || 0;
      cooldown = PUBLIC_BONUS_COOLDOWN;
    }

    if (currentTime - lastBonusTime < cooldown) {
      const remainingTimeMs = cooldown - (currentTime - lastBonusTime);
      const formattedTime = formatRemainingTime(remainingTimeMs);

      let cdMessage;
      if (isPrivateChat) {
        cdMessage = `⏳ Вы снова сможете получить <b>ежедневный</b> бонус через: ${formattedTime}`;
      } else {
        cdMessage = `⏳ Вы снова сможете получить бонус через: ${formattedTime}`;
      }
      
      return ctx.reply(cdMessage, { parse_mode: 'HTML' });
    }

    const calcResult = await calculateBonusAndCooldown(user, isPrivateChat, isDiceChat);
    
    if (calcResult.bonusAmount === undefined || calcResult.bonusAmount === null || isNaN(calcResult.bonusAmount)) {
        console.error('[Бонус] Ошибка: bonusAmount не определен или NaN', calcResult);
        return ctx.reply('❌ Произошла внутренняя ошибка при расчете бонуса. Попробуйте позже.');
    }

    const { bonusAmount, statusMessage, isBoosted, isPrivate } = calcResult;

    // === ВЫЧИСЛЕНИЕ КОЛИЧЕСТВА КОНФЕТ ===
    let candyAmount = 0;
    if (isPrivateChat) {
      // Ежедневный бонус в ЛС: от 2 до 42 конфет
      candyAmount = getRandomInt(2, 42);
    } else {
      // В публичных чатах: от 1 до 5 конфет
      candyAmount = getRandomInt(1, 5);
    }

    // === НАЧИСЛЕНИЕ PF ===
    try {
      await updateUserBalance(userId, bonusAmount);
    } catch (error) {
      console.error(`[Бонус] Ошибка при начислении бонуса пользователю ${userId}:`, error);
      return ctx.reply('❌ Произошла ошибка при начислении бонуса. Попробуйте позже.');
    }

    // === НАЧИСЛЕНИЕ КОНФЕТ ===
    try {
      giveCandy(userId, candyAmount); // Используем функцию из db.js
    } catch (error) {
      console.error(`[Бонус] Ошибка при начислении конфет пользователю ${userId}:`, error);
      // Не прерываем выполнение — бонус PF уже выдан
    }

    // === ОБНОВЛЕНИЕ ВРЕМЕНИ БОНУСА ===
    try {
      await updateLastBonusTime(userId, currentTime, isPrivateChat);
    } catch (error) {
      console.error(`[Бонус] Ошибка при обновлении времени бонуса для пользователя ${userId}:`, error);
    }

    // === ФОРМИРОВАНИЕ СООБЩЕНИЯ ===
    const username = user.username || 'Неизвестный';
    const userLink = createUserLink(userId, username);

    let successMessage;
    if (isPrivate) {
        const formattedAmount = typeof bonusAmount === 'number' && !isNaN(bonusAmount) ? 
                               bonusAmount.toLocaleString('ru-RU') : '0';
        successMessage = `💸 Ежедневный бонус в виде ${formattedAmount} PF начислен на ваш баланс!\n\n🍬 + ${candyAmount} конфет!`;
    } else {
        const formattedAmount = typeof bonusAmount === 'number' && !isNaN(bonusAmount) ? 
                               bonusAmount.toLocaleString('ru-RU') : '0';
        let bonusDetails = `${statusMessage}: +<b>${formattedAmount} PF</b>`;
        
        if (isBoosted && isDiceChat) {
            bonusDetails = `${statusMessage} (+10%): +<b>${formattedAmount} PF</b>\n\n🎲 Вы получаете 10% к бонусу, если забирать его в этом чате!`;
        }
        
        successMessage = `☑️ ${userLink}, вы получили:\n${bonusDetails}\n\n🍬 + ${candyAmount} конфет!`;
    }

    return ctx.reply(successMessage, { parse_mode: 'HTML' });
  } catch (error) {
    console.error('[Бонус] Ошибка при обработке запроса:', error);
    if (error.message && error.message.includes('баланс')) {
         return ctx.reply('❌ Ошибка при обновлении баланса. Свяжитесь с администратором.');
    }
    return ctx.reply('❌ Произошла ошибка при получении бонуса. Попробуйте позже.');
  }
}

module.exports = { bonusHandler };