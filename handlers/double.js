//handlers\double.js
const { Markup } = require('telegraf');
const { doubleGame } = require('../games/doubleGame');
const { logError } = require('../utils/errorHandler');
const {
  getUserById,
  isDoubleChat,
  saveBet, // Новая функция для сохранения ставок
  getBetsByRoundId, // Новая функция для получения ставок по roundId
  getActiveChatIdsByRoundHash, // Функция для получения активных чатов
} = require('../db');

// Объект для хранения времени последних ставок
const lastBetTimes = {};

// Функция для создания гиперссылки на пользователя
function createUserLink(userId, username) {
  const displayName = username || 'Неизвестный';
  return `<a href="tg://user?id=${userId}">${displayName}</a>`;
}

// Улучшенная функция для парсинга суммы ставки
function parseBetAmount(input, kSuffix, userBalance) {
  input = input.trim().toLowerCase();
  if (input === 'всё' || input === 'все') {
    return userBalance; // Если указано "всё" или "все", возвращаем весь баланс
  }

  const numberPart = parseFloat(input.replace(/[^0-9.]/g, ''));
  if (isNaN(numberPart) || numberPart <= 0) {
    throw new Error('❕ Некорректная сумма ставки.\nСумма должна быть положительной.');
  }

  let baseAmount = Math.floor(numberPart);

  const kCount = (kSuffix.match(/к/g) || []).length;
  for (let i = 0; i < kCount; i++) {
    baseAmount *= 1000;
  }

  return baseAmount;
}

async function doubleHandler(ctx) {
  try {
    const chatId = ctx.chat.id;
    const lowerText = ctx.message.text.trim().toLowerCase();

    // Проверяем, активирован ли режим Double в чате
    if (!(await isDoubleChat(chatId))) {
      return ctx.reply('❕ Режим Double не активирован в этом чате.');
    }

    // Если нет глобального раунда, начинаем новый
    if (!doubleGame.globalRound || Date.now() >= doubleGame.globalRound.endTime) {
      doubleGame.startGlobalRound(ctx.bot, chatId);
    }

    // Команда "банк"
    if (lowerText === 'банк') {
      if (!doubleGame.globalRound?.hash) {
        return ctx.reply('❕ Раунд ещё не начат. Попробуйте позже.');
      }

      const hash = doubleGame.globalRound.hash;

      // Получаем ставки из базы данных для текущего чата
      const betsFromDatabase = await getBetsByRoundId(hash);
      const chatBets = betsFromDatabase.filter(bet => bet.chat_id === chatId.toString());

      // Если нет ставок в текущем чате
      if (!chatBets || chatBets.length === 0) {
        const remainingTime = Math.max(0, Math.ceil((doubleGame.globalRound.endTime - Date.now()) / 1000));
        return ctx.reply(`▪️ В этом раунде пока нет ставок в текущем чате.\n\n⏳ До конца раунда: ${remainingTime} сек.\n🔒 Хеш игры: ${hash}`);
      }

      // Группируем ставки по пользователям и множителям
      const groupedBets = {};
      let totalBank = 0;

      for (const bet of chatBets) {
        const key = `${bet.user_id}_${bet.multiplier}`;
        if (!groupedBets[key]) {
          const userFromDb = await getUserById(bet.user_id);
          groupedBets[key] = {
            userId: bet.user_id,
            username: userFromDb?.username || 'Неизвестный',
            multiplier: bet.multiplier,
            totalAmount: 0,
          };
        }
        groupedBets[key].totalAmount += bet.amount;
        totalBank += bet.amount;
      }

      // Преобразуем объект в массив и сортируем по множителю (в порядке x2, x3, x5, GAME)
      const sortedBets = Object.values(groupedBets).sort((a, b) => {
        const order = { 'x2': 1, 'x3': 2, 'x5': 3, 'GAME': 4 };
        return order[a.multiplier] - order[b.multiplier];
      });

      // Формируем сообщение
      let message = `▫️ Текущие ставки в чате: ${totalBank.toLocaleString('ru-RU')} PF\n\n`;

      for (const bet of sortedBets) {
        const userLink = createUserLink(bet.userId, bet.username);
        message += `${userLink} - ${bet.totalAmount.toLocaleString('ru-RU')} PF на ${bet.multiplier}\n`;
      }

      const remainingTime = Math.max(0, Math.ceil((doubleGame.globalRound.endTime - Date.now()) / 1000));
      message += `\n🔒 Хеш игры: ${hash}\n`;
      message += `⏳ До конца раунда: ${remainingTime} сек.`;

      return ctx.reply(message, { parse_mode: 'HTML' });
    }

    // Обработка команд без суммы (например, "2", "игра", "х2")
    const matchWithoutAmount = lowerText.match(/^([235]|игра|game|х2|х3|х5)$/i);
    if (matchWithoutAmount) {
      const rawMultiplier = matchWithoutAmount[1];
      const multiplier = rawMultiplier.toLowerCase() === 'игра' || rawMultiplier.toLowerCase() === 'game'
        ? 'GAME'
        : `x${rawMultiplier.replace(/х/gi, '')}`;

      return handleMultiplierCommand(ctx, multiplier);
    }

    // Обработка ставок с суммой
    const matchWithAmount = lowerText.match(/^([235]|игра|game)\s+(всё|все|[\d\w]+)([к]*)$/i);
    if (!matchWithAmount) {
      return ctx.reply('❕ Некорректный формат сообщения.\nПример: "5 1" или "игра всё".');
    }

    const [, rawMultiplier, amountInput, kSuffix] = matchWithAmount;
    const multiplier = rawMultiplier.toLowerCase() === 'игра' || rawMultiplier.toLowerCase() === 'game'
      ? 'GAME'
      : `x${rawMultiplier}`;

    const userId = ctx.from.id;
    const userFromDb = await getUserById(userId.toString());
    const username = userFromDb?.username || 'Неизвестный';
    const userBalance = userFromDb.balance || 0;

    // Проверка cooldown
    const cooldownKey = `${userId}_${multiplier}`;
    const currentTime = Date.now();
    const lastBetTime = lastBetTimes[cooldownKey];

    if (lastBetTime && currentTime - lastBetTime < 1000) {
      return ctx.reply('❌ Не флудите, попробуйте еще раз через пару секунд!');
    }

    // Проверяем время окончания приема ставок
    const remainingTimeForBets =
      doubleGame.globalRound.result === 'GAME'
        ? doubleGame.globalRound.endTime - 20 * 1000
        : doubleGame.globalRound.endTime - 5 * 1000;

    if (currentTime >= remainingTimeForBets) {
      return ctx.reply('⏳ Ставки больше не принимаются. Формируются итоги игры.');
    }

    let finalAmount;
    try {
      finalAmount = parseBetAmount(amountInput, kSuffix, userBalance);
    } catch (error) {
      return ctx.reply(error.message);
    }

    if (finalAmount < 1) {
      return ctx.reply('❕ Минимальная ставка — 1 PF.');
    }

    if (finalAmount > userBalance) {
      return ctx.reply('❕ У вас недостаточно средств для этой ставки.');
    }

    const userLink = createUserLink(userId, username);

    // Сохраняем время последней ставки
    lastBetTimes[cooldownKey] = currentTime;

    // Сохраняем ставку в базу данных с указанием chatId
    await saveBet(doubleGame.globalRound.hash, userId, username, multiplier, finalAmount, chatId);

    // Обрабатываем ставку через DoubleGame
const betResult = await doubleGame.handleBet(userId, username, multiplier, finalAmount, chatId, ctx.chat.title);

    if (betResult.success) {
      console.log(
        `[Ставка] Сохранена ставка: Пользователь: ${userId}, Чат: ${chatId}, Множитель: ${multiplier}, Сумма: ${finalAmount}`
      );
      return ctx.reply(`✔️ ${userLink}, ваша ставка ${finalAmount.toLocaleString('ru-RU')} PF на ${multiplier} принята.`, { parse_mode: 'HTML' });
    } else {
      console.error(
        `[Ставка] Не удалось сохранить ставку: Пользователь: ${userId}, Чат: ${chatId}, Множитель: ${multiplier}, Сумма: ${finalAmount}`
      );
      return ctx.reply(
        `❕ ${betResult.message || 'Не удалось принять ставку. Проверьте баланс или время раунда.'}`,
        { parse_mode: 'HTML' }
      );
    }
  } catch (error) {
    // Логируем ошибку
    logError(error);

    // Обрабатываем ошибку 429 (слишком много запросов)
    if (error.response && error.response.error_code === 429) {
      const retryAfter = error.response.parameters?.retry_after || 0;
      return ctx.reply(`❕ Слишком много запросов. Пожалуйста, попробуйте снова через ${retryAfter} секунд.`);
    }

    // Для всех остальных ошибок отправляем стандартное сообщение
    return ctx.reply('❌ Произошла ошибка. Попробуйте позже.', { parse_mode: 'HTML' });
  }
}

async function handleMultiplierCommand(ctx, multiplier) {
  try {
    // Получаем ID чата
    const chatId = ctx.chat.id.toString();

    // Проверяем, активирован ли режим "дабл" в чате
    const isDoubleChatEnabled = await isDoubleChat(chatId);

    // Если режим "дабл" не активирован, просто прерываем выполнение
    if (!isDoubleChatEnabled) {
      console.log('[handleMultiplierCommand] Режим "дабл" не активирован.');
      return; // Прерываем выполнение без ответа пользователю
    }

    // Если режим "дабл" активирован, продолжаем выполнение команды
    const userId = ctx.from.id;
    const userFromDb = await getUserById(userId.toString());
    const username = userFromDb?.username || 'Неизвестный';

    // Создаем гиперссылку для пользователя
    const userLink = `[${username}](tg://user?id=${userId})`;

    // Проверка cooldown
    const cooldownKey = `${userId}_${multiplier}`;
    const currentTime = Date.now();
    const lastBetTime = lastBetTimes[cooldownKey];

    // Устанавливаем минимальное время между ставками (например, 1 секунда)
    const cooldownDuration = 1000;

    if (lastBetTime && currentTime - lastBetTime < cooldownDuration) {
      return ctx.reply('❌ Не флудите, попробуйте еще раз через пару секунд!');
    }

    // Сохраняем время последней ставки
    lastBetTimes[cooldownKey] = currentTime;

    // Получаем баланс пользователя
    const userBalance = userFromDb.balance || 0;

    // Если баланс равен нулю, отправляем сообщение и завершаем выполнение
    if (userBalance <= 0) {
      // Отправляем отдельное сообщение с гиперссылкой
      await ctx.reply(`${userLink}, ваш баланс равен 0 PF. Ставки невозможны.`, { parse_mode: 'Markdown' });
      return;
    }

    // Предлагаемые значения для кнопок
    const suggestedAmounts = [
      Math.floor(userBalance * 0.1) || 1, // 10% от баланса (минимум 1 PF)
      Math.floor(userBalance * 0.5) || 1, // 50% от баланса (минимум 1 PF)
      userBalance, // Полный баланс
    ];

    // Фильтруем значения, чтобы исключить нулевые суммы
    const validAmounts = suggestedAmounts.filter(amount => amount > 0);

    // Если нет допустимых сумм, отправляем сообщение и завершаем выполнение
    if (validAmounts.length === 0) {
      return ctx.reply(`${userLink}, недостаточно средств для формирования ставок.`);
    }

    // Создаем клавиатуру с кнопками
    const keyboard = Markup.inlineKeyboard(
      validAmounts.map(amount =>
        Markup.button.callback(
          `${multiplier} ${amount.toLocaleString('ru-RU')}`, // Текст на кнопке
          `bet_${multiplier}_${amount}` // Callback_data
        )
      ).reduce((rows, button, index) => {
        // Разделяем кнопки на строки по 2 кнопки в каждой
        if (index % 2 === 0) rows.push([button]);
        else rows[rows.length - 1].push(button);
        return rows;
      }, [])
    );

    // Отправляем сообщение с кнопками
    const messageText = `🎲 ${userLink}, выберите сумму ставки на ${multiplier} или введите команду вручную:\nПример: ${multiplier.toLowerCase()} [сумма]`;

    // Убедитесь, что reply_markup передается как объект
    return ctx.reply(messageText, {
      parse_mode: 'Markdown', // Используем Markdown
      reply_markup: keyboard.reply_markup // Убедитесь, что это объект
    });
  } catch (error) {
    console.error('[handleMultiplierCommand] Ошибка при отправке сообщения:', error);
    return ctx.reply('Произошла ошибка. Попробуйте позже.', { parse_mode: 'Markdown' });
  }
}

module.exports = { doubleHandler, parseBetAmount, handleMultiplierCommand, lastBetTimes };