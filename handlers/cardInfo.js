// cardInfo.js
const {
  getUserById,
  getCardDetails,
  saveCardNumber,
  isCardNumberUnique,
  getSelectedSkinFileName,
  getSkinRarity,
  getSelectedSkin,
  getSkinById,
  getUserBalance,
  updateUserBalance,
  getAccountLevel,
  updateAccountLevel,
  transaction,
  updateContainerCount
} = require('../db');

const { generateCardImage } = require('../generateCard');
const fs = require('fs');
const { Markup } = require('telegraf');

const accountLevelCooldowns = {};
const ACCOUNT_LEVEL_COOLDOWN_DURATION = 60 * 1000; // 1 минута в миллисекундах

// Функция для генерации случайного 16-значного номера карты
function generateCardNumber() {
  const digits = Array.from({ length: 16 }, () => Math.floor(Math.random() * 10));
  return digits.join('').replace(/(.{4})/g, '$1 ').trim(); // Добавляем пробелы каждые 4 символа
}

// Создание клавиатуры меню карты
function createCardMenuKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('⚙️ Операции', 'manage_card'),
      Markup.button.callback('ℹ️ Инфо', 'card_info')
    ],
    [
      Markup.button.callback('🖼 Мои скины', 'my_skins'),
      Markup.button.callback('🎨 Скин шоп', 'skin_shop')
    ],
    [
      Markup.button.callback('💼 Меню финансов', 'finance_menu'),
      Markup.button.callback('❌ Закрыть', 'close_card_menu')
    ],
  ]);
}

// Обработчик команды "карта"
async function cardInfoHandler(ctx) {
  try {
    const userId = ctx.from.id;

    // Проверяем, зарегистрирован ли пользователь
    const user = await getUserById(userId);
    if (!user) {
      return ctx.reply('❌ Ошибка: Пользователь не найден. Попробуйте перезапустить бота командой /start.');
    }

    // Получаем данные карты пользователя
    const cardDetails = await getCardDetails(userId);

    if (!cardDetails || !cardDetails.card_number) {
      // Если карта не зарегистрирована, отправляем красиво оформленное сообщение с кнопкой
      const message = `
🏦 <b>У вас нет зарегистрированной карты.</b>

💳 Чтобы создать карту, используйте команду "зарегистрировать карту".

• Нажмите на кнопку ниже, чтобы зарегистрировать карту в один клик:
`.trim();

      const keyboard = Markup.inlineKeyboard([
        Markup.button.callback('💳 Зарегистрировать карту', 'register_card'),
      ]);

      return ctx.replyWithHTML(message, keyboard);
    }

    // Генерируем изображение карты (временный файл создаётся в os.tmpdir())
    const cardImagePath = await generateCardImage(userId, cardDetails.card_number);

    // Получаем информацию о текущем активном скине
    const skinId = await getSelectedSkin(userId); // Получаем ID активного скина
    let skinInfo = null;

    if (skinId) {
      const skinData = await getSkinById(skinId); // Получаем полные данные о скине
      if (skinData) {
        skinInfo = {
          name: skinData.name,
          rarity: skinData.rarity
        };
      }
    }

    const skinRarityEmoji = skinInfo ? getRarityEmoji(skinInfo.rarity) : null; // Получаем смайлик редкости

    // Отправляем изображение и текстовые данные карты одним сообщением
    try {
      if (fs.existsSync(cardImagePath)) {
        const caption = `
🪪 <b>Данные вашей карты:</b>

👤 Имя владельца: ${user.username}
💳 Номер карты: <code>${cardDetails.card_number}</code>
${skinInfo ? `${skinRarityEmoji} Скин: ${skinInfo.name}` : ''}
`.trim();

        await ctx.replyWithPhoto(
          { source: cardImagePath },
          {
            caption,
            parse_mode: 'HTML',
            reply_markup: createCardMenuKeyboard().reply_markup
          }
        );
      } else {
        return ctx.reply('Не удалось сгенерировать изображение карты.');
      }
    } finally {
      // Удаляем временный файл независимо от исхода отправки
      try {
        fs.unlinkSync(cardImagePath);
      } catch (e) {}
    }
  } catch (error) {
    console.error('Ошибка при получении данных карты:', error);
    await ctx.reply('Произошла ошибка при получении данных карты.');
  }
}

// Обработчик команды "зарегистрировать карту"
async function registerCardHandler(ctx) {
  try {
    const userId = ctx.from.id;

    // Проверяем, зарегистрирован ли пользователь
    const user = await getUserById(userId);
    if (!user) {
      return ctx.reply('Вы не зарегистрированы. Используйте команду "/start" для регистрации.');
    }

    // Проверяем, есть ли у пользователя уже зарегистрированная карта
    const existingCardDetails = await getCardDetails(userId);
    if (existingCardDetails && existingCardDetails.card_number) {
      return ctx.reply(
        'У вас уже есть зарегистрированная карта. Повторная регистрация невозможна.\n\n' +
        `Номер вашей карты: <code>${existingCardDetails.card_number}</code>`,
        { parse_mode: 'HTML' }
      );
    }

    // Генерация уникального номера карты
    let cardNumber;
    do {
      cardNumber = generateCardNumber();
    } while (!(await isCardNumberUnique(cardNumber)));

    // Сохраняем данные карты в базу данных
    await saveCardNumber(userId, cardNumber);

    // Генерируем изображение карты (временный файл создаётся в os.tmpdir())
    const cardImagePath = await generateCardImage(userId, cardNumber);

    // Создаем инлайн-клавиатуру с кнопкой перехода к карте
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('💳 Перейти к карте', 'finance_open_card')],
    ]);

    // Отправляем изображение и текстовые данные карты одним сообщением
    try {
      if (fs.existsSync(cardImagePath)) {
        const caption = `🎉 Ваша карта успешно создана!\n\nИмя владельца: ${user.username}\nНомер карты: <code>${cardNumber}</code>`;

        await ctx.replyWithPhoto(
          { source: cardImagePath },
          {
            caption,
            parse_mode: 'HTML',
            reply_markup: keyboard.reply_markup
          }
        );
      } else {
        return ctx.reply('Не удалось сгенерировать изображение карты.');
      }
    } finally {
      // Удаляем временный файл независимо от исхода отправки
      try {
        fs.unlinkSync(cardImagePath);
      } catch (e) {}
    }
  } catch (error) {
    console.error('Ошибка при регистрации карты:', error);
    await ctx.reply('Произошла ошибка при создании карты.');
  }
}

// Обработчик нажатия на кнопку "Зарегистрировать карту"
async function handleRegisterCardAction(ctx) {
  try {
    const userId = ctx.from.id;

    // Проверяем, зарегистрирован ли пользователь
    const user = await getUserById(userId);
    if (!user) {
      return ctx.reply('Вы не зарегистрированы. Используйте команду "/start" для регистрации.');
    }

    // Проверяем, есть ли у пользователя уже зарегистрированная карта
    const existingCardDetails = await getCardDetails(userId);
    if (existingCardDetails && existingCardDetails.card_number) {
      return ctx.reply(
        'У вас уже есть зарегистрированная карта. Повторная регистрация невозможна.\n\n' +
        `Номер вашей карты: <code>${existingCardDetails.card_number}</code>`,
        { parse_mode: 'HTML' }
      );
    }

    // Генерация уникального номера карты
    let cardNumber;
    do {
      cardNumber = generateCardNumber();
    } while (!(await isCardNumberUnique(cardNumber)));

    // Сохраняем данные карты в базу данных
    await saveCardNumber(userId, cardNumber);

    // Генерируем изображение карты (временный файл создаётся в os.tmpdir())
    const cardImagePath = await generateCardImage(userId, cardNumber);

    // Создаем инлайн-клавиатуру с кнопкой перехода к карте
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('💳 Перейти к карте', 'finance_open_card')],
    ]);

    // Отправляем изображение и текстовые данные карты одним сообщением
    try {
      if (fs.existsSync(cardImagePath)) {
        const caption = `🎉 Ваша карта успешно создана!\n\nИмя владельца: ${user.username}\nНомер карты: <code>${cardNumber}</code>`;

        await ctx.replyWithPhoto(
          { source: cardImagePath },
          {
            caption,
            parse_mode: 'HTML',
            reply_markup: keyboard.reply_markup
          }
        );
      } else {
        return ctx.reply('Не удалось сгенерировать изображение карты.');
      }
    } finally {
      // Удаляем временный файл независимо от исхода отправки
      try {
        fs.unlinkSync(cardImagePath);
      } catch (e) {}
    }
  } catch (error) {
    console.error('Ошибка при обработке действия регистрации карты:', error);
    await ctx.reply('Произошла ошибка при создании карты.');
  }
}

// Обработчик кнопки "Операции" / бывшая "Управление картой"
async function handleManageCardButton(ctx) {
  try {
    const commandsList = `
📋 <b>Операции по карте:</b>

- пополнить [сумма] - пополнить баланс карты
- снять [сумма] - снять деньги с карты
- передать/перевод [id/номер_карты] [сумма], либо ответом на сообщение игрока - перевести деньги другому пользователю
`.trim();

    await ctx.replyWithHTML(commandsList, Markup.inlineKeyboard([
      [Markup.button.callback('💳 Пополнить', 'show_topup_instruction')],
      [Markup.button.callback('💸 Снять', 'show_withdraw_instruction')],
      [Markup.button.callback('🔙 Назад', 'back_to_card_menu')],
    ]));

    if (ctx.callbackQuery && typeof ctx.answerCbQuery === 'function') {
      await ctx.answerCbQuery();
    }
  } catch (error) {
    console.error('Ошибка при обработке кнопки "Операции":', error);
    await ctx.reply('Произошла ошибка при получении списка операций.');

    if (ctx.callbackQuery && typeof ctx.answerCbQuery === 'function') {
      await ctx.answerCbQuery();
    }
  }
}

// Обработчик кнопки "Инфо"
async function handleCardInfoButton(ctx) {
  try {
    const infoMessage = `
ℹ️ <b>Информация о карте:</b>

Карта нужна для:
- Хранения игровых средств
- Возможности пользоваться игровыми режимами
- Переводов между игроками
- Использования функционала банка
`.trim();

    await ctx.replyWithHTML(infoMessage, Markup.inlineKeyboard([
      [Markup.button.callback('🔙 Назад', 'back_to_card_menu')],
    ]));

    if (ctx.callbackQuery && typeof ctx.answerCbQuery === 'function') {
      await ctx.answerCbQuery();
    }
  } catch (error) {
    console.error('Ошибка при обработке кнопки "Инфо":', error);
    await ctx.reply('Произошла ошибка при получении информации о карте.');

    if (ctx.callbackQuery && typeof ctx.answerCbQuery === 'function') {
      await ctx.answerCbQuery();
    }
  }
}

// Обработчик кнопки "Назад" в меню карты
async function handleBackToCardMenu(ctx) {
  try {
    if (ctx.callbackQuery && typeof ctx.answerCbQuery === 'function') {
      await ctx.answerCbQuery();
    }

    const messageId = ctx.callbackQuery?.message?.message_id;

    if (messageId) {
      try {
        await ctx.deleteMessage(messageId);
      } catch (deleteError) {
        console.error('[CARD] Не удалось удалить сообщение "Назад":', deleteError);
      }
    }

    await cardInfoHandler(ctx);
  } catch (error) {
    console.error('[CARD] Ошибка при возврате в меню карты:', error);
    await ctx.reply('Произошла ошибка при возврате в меню карты.');
  }
}

// Обработчик кнопки "Закрыть"
async function handleCloseCardMenu(ctx) {
  try {
    if (ctx.callbackQuery && typeof ctx.answerCbQuery === 'function') {
      await ctx.answerCbQuery();
    }

    const messageId = ctx.callbackQuery?.message?.message_id;

    if (messageId) {
      await ctx.deleteMessage(messageId);
    }
  } catch (error) {
    console.error('[CARD] Не удалось закрыть меню карты:', error);
  }
}

// Вспомогательные функции для работы с редкостью скинов
function getRarityEmoji(rarity) {
  const rarityEmojis = {
    ORDINARY: '🔵', // Обычная
    EPIC: '🟣',     // Эпическая
    LEGENDARY: '🟡' // Легендарная
  };

  return rarityEmojis[rarity] || '🔵'; // По умолчанию обычный смайлик
}

// Функция для форматирования чисел с разделителями тысяч
function formatNumber(number) {
  // Преобразуем число в строку и используем регулярное выражение для добавления точек
  return number.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

// --- ОСНОВНАЯ ФУНКЦИЯ ОБРАБОТЧИКА ПРОКАЧКИ УРОВНЯ АККАУНТА ---

// Обработчик прокачки уровня аккаунта
async function handleUpgradeAccountLevel(ctx) {
  try {
    const userId = ctx.from.id.toString();

    // 1. Получаем данные пользователя
    const user = await getUserById(userId);
    if (!user) {
      await ctx.reply('❌ Ошибка: Пользователь не найден.');

      if (ctx.callbackQuery && typeof ctx.answerCbQuery === 'function') {
        await ctx.answerCbQuery();
      }

      return;
    }

    const currentLevel = await getAccountLevel(userId);
    const userBalance = getUserBalance(userId, 'PF');

    // 2. Проверяем максимальный уровень
    if (currentLevel >= 20) {
      await ctx.reply('📈 Ваш аккаунт уже максимального уровня (20).');

      if (ctx.callbackQuery && typeof ctx.answerCbQuery === 'function') {
        await ctx.answerCbQuery();
      }

      return;
    }

    // 3. Получаем данные для следующего уровня
    const nextLevel = currentLevel + 1;
    const rewards = getAccountLevelRewards();
    const costs = getAccountLevelUpgradeCosts();

    const requiredBalance = costs[nextLevel];
    const rewardInfo = rewards[nextLevel];

    // 4. Формируем сообщение
    const message = `
📈 <b>Прокачка уровня аккаунта</b>

Ваш текущий уровень: <b>${currentLevel}</b>
Следующий уровень: <b>${nextLevel}</b>

🎁 Награда за уровень: ${rewardInfo.reward}
💰 Стоимость повышения: <b>${formatNumber(requiredBalance)} PF</b>
`.trim();

    // 5. Создаем клавиатуру
    const keyboardRows = [];

    // Первый ряд: кнопка "Повысить уровень"
    const upgradeButtonText = userBalance >= requiredBalance
      ? `⬆️ Повысить уровень (${formatNumber(requiredBalance)} PF)`
      : `❌ Недостаточно средств`;

    const upgradeButtonAction = userBalance >= requiredBalance
      ? `upgrade_level_confirm_${nextLevel}`
      : 'noop';

    keyboardRows.push([Markup.button.callback(upgradeButtonText, upgradeButtonAction)]);

    // Второй ряд: "Сетка прокачки" и "Назад"
    keyboardRows.push([
      Markup.button.callback('📊 Сетка прокачки', 'show_upgrade_grid'),
      Markup.button.callback('🔙 Назад', 'finance_menu')
    ]);

    const keyboard = Markup.inlineKeyboard(keyboardRows);

    // 6. Отправляем сообщение
    await ctx.replyWithHTML(message, keyboard);

    // 7. Подтверждаем нажатие callback-кнопки, если это было callback-запрос
    if (ctx.callbackQuery && typeof ctx.answerCbQuery === 'function') {
      await ctx.answerCbQuery();
    }
  } catch (error) {
    console.error('Ошибка при обработке прокачки уровня аккаунта:', error);
    await ctx.reply('Произошла ошибка при попытке прокачки уровня аккаунта.');

    if (ctx.callbackQuery && typeof ctx.answerCbQuery === 'function') {
      await ctx.answerCbQuery();
    }
  }
}

// --- ОБРАБОТЧИКИ ДЛЯ ДОПОЛНИТЕЛЬНЫХ КНОПОК ---

// Обработчик кнопки "Сетка прокачки"
async function handleShowAccountLevelGrid(ctx) {
  try {
    const rewards = getAccountLevelRewards();
    const costs = getAccountLevelUpgradeCosts();

    let gridMessage = '📊 <b>Сетка прокачки аккаунта:</b>\n\n';

    for (let level = 1; level <= 20; level++) {
      const reward = rewards[level];
      const cost = costs[level];
      const formattedCost = cost > 0 ? `${formatNumber(cost)} PF` : 'Бесплатно';

      gridMessage += `<b>Уровень ${level}:</b>\n`;
      gridMessage += `  💰 Стоимость: ${formattedCost}\n`;
      gridMessage += `  🎁 Награда: ${reward.reward}\n\n`;
    }

    const backButton = Markup.inlineKeyboard([
      [Markup.button.callback('🔙 Назад', 'upgrade_card_level')]
    ]);

    await ctx.replyWithHTML(gridMessage, backButton);

    if (ctx.callbackQuery && typeof ctx.answerCbQuery === 'function') {
      await ctx.answerCbQuery();
    }
  } catch (error) {
    console.error('Ошибка при отображении сетки прокачки:', error);
    await ctx.reply('Произошла ошибка при отображении сетки прокачки.');

    if (ctx.callbackQuery && typeof ctx.answerCbQuery === 'function') {
      await ctx.answerCbQuery();
    }
  }
}

// Сетка призов за уровень аккаунта
function getAccountLevelRewards() {
  return {
    1: { limit: 10000000, reward: "Лимит карты до 10,000,000 PF" },
    2: { limit: 12000000, reward: "Лимит карты до 12,000,000 PF" },
    3: { limit: 14000000, reward: "Лимит карты до 14,000,000 PF" },
    4: { limit: 16000000, reward: "Лимит карты до 16,000,000 PF" },
    5: { limit: 18000000, reward: "Лимит карты до 18,000,000 PF + 10 Gold контейнеров + доступ к Банку" },
    6: { limit: 20000000, reward: "Лимит карты до 20,000,000 PF" },
    7: { limit: 22000000, reward: "Лимит карты до 22,000,000 PF" },
    8: { limit: 24000000, reward: "Лимит карты до 24,000,000 PF" },
    9: { limit: 26000000, reward: "Лимит карты до 26,000,000 PF" },
    10: { limit: 28000000, reward: "Лимит карты до 28,000,000 PF + Уникальный скин + Лимит баланса до 175,000,000 PF + доступ к Крипте" },
    11: { limit: 30000000, reward: "Лимит карты до 30,000,000 PF" },
    12: { limit: 32000000, reward: "Лимит карты до 32,000,000 PF" },
    13: { limit: 34000000, reward: "Лимит карты до 34,000,000 PF" },
    14: { limit: 36000000, reward: "Лимит карты до 36,000,000 PF" },
    15: { limit: 38000000, reward: "Лимит карты до 38,000,000 PF + Повышение основного баланса до 185,000,000 PF + доступ к Рынку скинов" },
    16: { limit: 40000000, reward: "Лимит карты до 40,000,000 PF" },
    17: { limit: 42000000, reward: "Лимит карты до 42,000,000 PF" },
    18: { limit: 44000000, reward: "Лимит карты до 44,000,000 PF" },
    19: { limit: 44000000, reward: "Уникальный скин + 25 Gold контейнеров + Префикс (реализация позже)" },
    20: { limit: 45000000, reward: "Лимит карты до 45,000,000 PF + Основной баланс до 200,000,000 PF" },
  };
}

// Сетка стоимости уровней аккаунта
function getAccountLevelUpgradeCosts() {
  return {
    1: 0,
    2: 2000000,
    3: 4000000,
    4: 6000000,
    5: 7500000,
    6: 9500000,
    7: 11500000,
    8: 13500000,
    9: 15500000,
    10: 20000000,
    11: 22000000,
    12: 24000000,
    13: 26000000,
    14: 28000000,
    15: 35000000,
    16: 37000000,
    17: 39000000,
    18: 41000000,
    19: 47500000,
    20: 55000000,
  };
}

// Выполнение повышения уровня аккаунта
async function performAccountLevelUpgrade(ctx, targetLevel) {
  const userId = ctx.from.id.toString();

  try {
    // --- ПРОВЕРКА КУЛДАУНА ---
    const currentTime = Date.now();
    const lastUpgradeTime = accountLevelCooldowns[userId];

    if (lastUpgradeTime && (currentTime - lastUpgradeTime) < ACCOUNT_LEVEL_COOLDOWN_DURATION) {
      const remainingTimeMs = ACCOUNT_LEVEL_COOLDOWN_DURATION - (currentTime - lastUpgradeTime);
      const remainingSeconds = Math.ceil(remainingTimeMs / 1000);

      await ctx.reply(`⏳ Вы недавно повышали уровень аккаунта. Попробуйте снова через ${remainingSeconds} секунд.`);

      if (ctx.callbackQuery && typeof ctx.answerCbQuery === 'function') {
        await ctx.answerCbQuery();
      }

      return;
    }

    // --- ОСНОВНАЯ ЛОГИКА ПОВЫШЕНИЯ УРОВНЯ ---
    // 1. Получаем стоимость для целевого уровня
    const costs = getAccountLevelUpgradeCosts();
    const requiredBalance = costs[targetLevel];

    // 2. Проверка корректности стоимости
    if (requiredBalance === undefined || requiredBalance === null || requiredBalance < 0) {
      throw new Error(`Некорректная стоимость для уровня ${targetLevel}`);
    }

    // 3. Начинаем транзакцию для обеспечения атомарности
    await transaction(async () => {
      // 4. Получаем актуальные данные пользователя внутри транзакции
      const user = await getUserById(userId);
      if (!user) {
        throw new Error('Пользователь не найден.');
      }

      const currentLevel = await getAccountLevel(userId);
      const userBalance = getUserBalance(userId, 'PF');

      // 5. Проверки внутри транзакции
      if (currentLevel >= targetLevel) {
        throw new Error('Аккаунт уже имеет этот или более высокий уровень.');
      }

      if (userBalance < requiredBalance) {
        throw new Error('Недостаточно средств на основном балансе.');
      }

      // 6. СПИСАНИЕ СРЕДСТВ
      try {
        await updateUserBalance(userId, -requiredBalance);
        console.log(`[INFO] Средства списаны у пользователя ${userId}: ${requiredBalance} PF`);
      } catch (deductionError) {
        console.error(`[DB] Ошибка при списании средств у пользователя ${userId}:`, deductionError.message);
        throw new Error(`Ошибка при списании средств: ${deductionError.message}`);
      }

      // 7. ПОВЫШЕНИЕ УРОВНЯ АККАУНТА
      const updateLevelResult = await updateAccountLevel(userId, targetLevel);
      if (!updateLevelResult) {
        throw new Error('Ошибка при обновлении уровня аккаунта в базе данных.');
      }

      console.log(`[INFO] Уровень аккаунта пользователя ${userId} успешно обновлён до ${targetLevel}.`);

      // 8. Если мы дошли до этой точки без исключений, транзакция будет зафиксирована.
      console.log(`[INFO] Транзакция повышения уровня ${currentLevel} -> ${targetLevel} для пользователя ${userId} завершена успешно.`);
    });

    // --- ПОСЛЕ УСПЕШНОЙ ТРАНЗАКЦИИ ---
    // 9. Обновляем время последнего повышения уровня (только после успеха!)
    accountLevelCooldowns[userId] = currentTime;

    // 10. ПРОВЕРКА И ВЫДАЧА НАГРАД ЗА УРОВЕНЬ
    let rewardMessage = '';

    if (targetLevel === 5) {
      const containerResult = updateContainerCount(userId, 3, 10); // 10 контейнеров типа 3 (GOLD)

      if (containerResult.success) {
        rewardMessage += `\n🎁 Награда за уровень 5: <b>10 GOLD</b> контейнеров выдано!`;
        console.log(`[REWARD] Выдано 10 GOLD контейнеров пользователю ${userId} за уровень 5.`);
      } else {
        rewardMessage += `\n⚠️ Не удалось выдать награду за уровень 5: ${containerResult.message || 'Ошибка выдачи контейнеров.'}`;
        console.error(`[REWARD ERROR] Ошибка выдачи 10 GOLD контейнеров пользователю ${userId} за уровень 5:`, containerResult.message);
      }
    } else if (targetLevel === 19) {
      const containerResult = updateContainerCount(userId, 3, 25); // 25 контейнеров типа 3 (GOLD)

      if (containerResult.success) {
        rewardMessage += `\n🎁 Награда за уровень 19: <b>25 GOLD</b> контейнеров выдано!`;
        console.log(`[REWARD] Выдано 25 GOLD контейнеров пользователю ${userId} за уровень 19.`);
      } else {
        rewardMessage += `\n⚠️ Не удалось выдать награду за уровень 19: ${containerResult.message || 'Ошибка выдачи контейнеров.'}`;
        console.error(`[REWARD ERROR] Ошибка выдачи 25 GOLD контейнеров пользователю ${userId} за уровень 19:`, containerResult.message);
      }
    }

    // 11. Отправляем сообщение об успехе пользователю (включая награду)
    await ctx.replyWithHTML(`✅ Уровень вашего аккаунта успешно повышен до <b>${targetLevel}</b>!${rewardMessage}`);

    if (ctx.callbackQuery && typeof ctx.answerCbQuery === 'function') {
      await ctx.answerCbQuery();
    }
  } catch (error) {
    // --- ОБРАБОТКА ОШИБОК ---
    console.error(`[ERROR] Ошибка при повышении уровня аккаунта для пользователя ${userId} до уровня ${targetLevel}:`, error);

    let userMessage = '❌ Ошибка при повышении уровня. Попробуйте позже.';

    if (error.message.includes('Недостаточно средств')) {
      userMessage = '❌ Недостаточно средств на основном балансе.';
    } else if (error.message.includes('уже имеет этот или более высокий уровень')) {
      userMessage = '❌ Аккаунт уже имеет этот или более высокий уровень.';
    } else if (error.message.includes('Пользователь не найден')) {
      userMessage = '❌ Пользователь не найден.';
    } else if (error.message.includes('Ошибка при обновлении уровня аккаунта')) {
      userMessage = '❌ Не удалось обновить уровень аккаунта. Попробуйте позже.';
    } else if (error.message.includes('Ошибка при списании средств')) {
      userMessage = '❌ Не удалось списать средства. Попробуйте позже.';
    } else if (error.message.includes('Некорректная стоимость')) {
      userMessage = '❌ Ошибка: некорректная стоимость уровня.';
    }

    await ctx.reply(userMessage);

    if (ctx.callbackQuery && typeof ctx.answerCbQuery === 'function') {
      await ctx.answerCbQuery();
    }
  }
}

module.exports = {
  cardInfoHandler,
  registerCardHandler,
  handleRegisterCardAction,
  handleManageCardButton,
  handleCardInfoButton,
  handleBackToCardMenu,
  handleCloseCardMenu,

  handleUpgradeAccountLevel,
  handleShowAccountLevelGrid,
  performAccountLevelUpgrade,

  getAccountLevelRewards,
  getAccountLevelUpgradeCosts,

  formatNumber,

  // Совместимость со старыми именами, если bot.js ещё не полностью обновлён
  handleUpgradeCardLevel: handleUpgradeAccountLevel,
  handleShowUpgradeGrid: handleShowAccountLevelGrid,
  performLevelUpgrade: performAccountLevelUpgrade,
  getLevelRewards: getAccountLevelRewards,
  getLevelUpgradeCosts: getAccountLevelUpgradeCosts,
};