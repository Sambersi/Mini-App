const { getUserById, updateUsername, updateUserBalance } = require('../db'); // Импортируем функцию updateUserBalance

// Функция для создания гиперссылки на пользователя
function createUserLink(userId, username) {
  const displayName = username || 'Неизвестный';
  return `<a href="tg://user?id=${userId}">${displayName}</a>`;
}

// Регулярное выражение для поиска запрещенных символов
const forbiddenSymbolsRegex = /[\[\]<>@]/;

// Регулярное выражение для поиска арабских символов
const arabicSymbolsRegex = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;

// Запрещенные слова и их производные (в разных регистрах)
const forbiddenWords = [
  'слава украине',
  'украина',
  'ukraine',
  'україна',
  'slava ukraine',
  'героям слава',
  'glory to ukraine',
  'glory to heroes'
];

// Преобразуем массив запрещенных слов в регулярное выражение (с учетом регистра)
const forbiddenWordsRegex = new RegExp(
  forbiddenWords.map(word => word.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')).join('|'),
  'gi'
);

// Регулярное выражение для поиска эмодзи флагов (региональные индикаторы)
const flagEmojiRegex = /\p{RI}\p{RI}/gu;

// Функция для проверки ника на наличие запрещенных элементов
function isForbiddenNickname(nickname) {
  // Проверяем наличие запрещенных символов
  if (forbiddenSymbolsRegex.test(nickname)) {
    return true;
  }

  // Проверяем наличие арабских символов
  if (arabicSymbolsRegex.test(nickname)) {
    return true;
  }

  // Проверяем наличие запрещенных слов
  if (forbiddenWordsRegex.test(nickname)) {
    return true;
  }

  // Проверяем наличие эмодзи флагов
  if (flagEmojiRegex.test(nickname)) {
    return true;
  }

  // Явная проверка на флаг России (дополнительная мера предосторожности)
  if (/\u{1F1F7}\u{1F1FA}/gu.test(nickname)) {
    return true;
  }

  return false;
}

// Функция для обработки команды "ник" и "!ник новый_ник"
async function changeNicknameHandler(ctx) {
  try {
    const text = ctx.message.text.trim();
    const isPrivateChat = ctx.chat.type === 'private';

    // Обработка команды "ник" (без нового ника)
    if (text === 'ник') {
      const userId = ctx.from.id.toString();
      const userFromDb = await getUserById(userId);

      if (!userFromDb) {
        return ctx.reply('❕ Вы не зарегистрированы. Используйте команду /start для регистрации.');
      }

      const currentNickname = userFromDb.username || 'Не установлено';
      const message = `
Чтобы сменить ник, напишите:\n <code>!ник</code> [ваш_новый_ник]

💰 Стоимость смены ника: <b>75 000 PF</b>
👤 Ваш нынешний ник: <b>${currentNickname}</b>
`.trim();

      if (isPrivateChat) {
        // В личном чате без гиперссылки
        return ctx.reply(message, { parse_mode: 'HTML' });
      } else {
        // В групповом чате с гиперссылкой
        const username = userFromDb?.username || 'Неизвестный';
        const userLink = createUserLink(userId, username);
        return ctx.reply(`❕ ${userLink}, ${message}`, { parse_mode: 'HTML' });
      }
    }

    // Обработка команды "!ник новый_ник"
    const match = text.match(/^!ник\s+(.+)$/);
    if (!match) {
      return; // Игнорируем сообщения, которые не соответствуют формату
    }

    const newNickname = match[1].trim(); // Извлекаем новый ник

    // Проверяем длину ника (ограничение до 16 символов)
    if (newNickname.length > 16) {
      return ctx.reply('❕ Ник не должен превышать 16 символов.');
    }

    // Проверяем, является ли ник запрещенным
    if (isForbiddenNickname(newNickname)) {
      return ctx.reply(
        '❌ Этот ник запрещен. Пожалуйста, выберите другой ник.'
      );
    }

    // Получаем ID пользователя
    const userId = ctx.from.id.toString();

    // Получаем данные пользователя из базы данных
    const user = await getUserById(userId);
    if (!user) {
      return ctx.reply('❕ Вы не зарегистрированы. Используйте команду /start для регистрации.');
    }

    // Проверяем баланс пользователя
    const userBalance = user.balance || 0;
    const nicknameChangeCost = 75000; // Стоимость смены ника

    if (userBalance < nicknameChangeCost) {
      return ctx.reply(`❌ Недостаточно средств.\n• Стоимость смены ника: <b>${nicknameChangeCost} PF</b>.`, { parse_mode: 'HTML' });
    }

    try {
      // Обновляем ник в базе данных
      const result = await updateUsername(userId, newNickname); // Используем функцию updateUsername
      if (!result.success) {
        return ctx.reply(result.message || 'Произошла ошибка при обновлении ника.');
      }

      // Списываем средства за смену ника
      await updateUserBalance(userId, -nicknameChangeCost);

      // Формируем сообщение в зависимости от типа чата
      if (isPrivateChat) {
        // В личном чате без гиперссылки
        ctx.reply(`✅ Ваш новый ник: <b>${newNickname}</b>\n💰 Списано: <b>${nicknameChangeCost} PF</b>`, { parse_mode: 'HTML' });
      } else {
        // В групповом чате с гиперссылкой
        const userLink = createUserLink(userId, newNickname);
        ctx.reply(`✅ ${userLink}, ваш новый ник: <b>${newNickname}</b>\n💰 Списано: <b>${nicknameChangeCost} PF</b>`, { parse_mode: 'HTML' });
      }
    } catch (error) {
      console.error('Ошибка при смене ника:', error);
      ctx.reply('Произошла ошибка. Попробуйте позже.');
    }
  } catch (error) {
    console.error('Ошибка при обработке команды "ник":', error);
    ctx.reply('Произошла ошибка. Попробуйте позже.');
  }
}

module.exports = { changeNicknameHandler, isForbiddenNickname };