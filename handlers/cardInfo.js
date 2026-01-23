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
  getCardLevel,
  getUserBalance,
  updateUserBalance, // Импортируем вашу функцию
  updateCardLevel,  // Импортируем функцию обновления уровня
  transaction, 
  updateContainerCount
} = require('../db');
const { generateCardImage } = require('../generateCard');
const fs = require('fs');
const { Markup } = require('telegraf'); // Импортируем Markup для создания кнопок
const upgradeCardLevelCooldowns = {};
const UPGRADE_CARD_LEVEL_COOLDOWN_DURATION = 60 * 1000; // 1 минута в миллисекундах

// Функция для генерации случайного 16-значного номера карты
function generateCardNumber() {
  const digits = Array.from({ length: 16 }, () => Math.floor(Math.random() * 10));
  return digits.join('').replace(/(.{4})/g, '$1 ').trim(); // Добавляем пробелы каждые 4 символа
}

// Обработчик команды "карта"
async function cardInfoHandler(ctx) {
  try {
    const userId = ctx.from.id;

    // Проверяем, зарегистрирован ли пользователь
    let user = await getUserById(userId);
    if (!user) {
      // Если пользователь не зарегистирован, создаем новую запись
      // createUser(userId, ctx.from.first_name || 'Press Эфыч'); // Предполагается, что createUser доступна или импортирована
      // user = await getUserById(userId);
      return ctx.reply('❌ Ошибка: Пользователь не найден. Попробуйте перезапустить бота командой /start.');
    }

    // Получаем данные карты пользователя
    const cardDetails = await getCardDetails(userId);

    if (!cardDetails || !cardDetails.card_number) {
      // Если карта не зарегистирована, отправляем красиво оформленное сообщение с кнопкой
      const message = `
        🏦  <b>У вас нет зарегистрированной карты.</b>

      💳 Чтобы создать карту, используйте команду "зарегистрировать карту".

      • Нажмите на кнопку ниже, чтобы зарегистировать карту в один клик:
      `.trim();

      const keyboard = Markup.inlineKeyboard([
        Markup.button.callback('💳 Зарегистрировать карту', 'register_card'),
      ]);

      return ctx.replyWithHTML(message, keyboard);
    }

    // Получаем уровень карты
    const cardLevel = await getCardLevel(userId); // Предполагается, что такая функция есть в db.js

    // Генерируем изображение карты
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
    if (fs.existsSync(cardImagePath)) {
      const caption = `
🪪 <b>Данные вашей карты:</b>

👤 Имя владельца: ${user.username}
💳 Номер карты: <code>${cardDetails.card_number}</code>
📈 Уровень карты: ${cardLevel}
${skinInfo ? `${skinRarityEmoji} Скин: ${skinInfo.name}` : ''}
`.trim();

      // Создание клавиатуры для меню карты (3 ряда)
      function createCardMenuKeyboard() {
        return Markup.inlineKeyboard([
          [Markup.button.callback('💳 Управление картой', 'manage_card'), Markup.button.callback('🖼 Мои скины', 'my_skins')],
          [Markup.button.callback('🎨 Скин шоп', 'skin_shop'), Markup.button.callback('ℹ️ Инфо', 'card_info')],
          [Markup.button.callback('📈 Прокачка уровня', 'upgrade_card_level'), Markup.button.callback('❌ Закрыть меню', 'close_card_menu')],
        ]);
      }

      await ctx.replyWithPhoto(
        { source: cardImagePath },
        { caption, parse_mode: 'HTML', reply_markup: createCardMenuKeyboard().reply_markup }
      );
    } else {
      return ctx.reply('Не удалось сгенерировать изображение карты.');
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

    // Генерируем изображение карты
    const cardImagePath = await generateCardImage(userId, cardNumber);

    // Создаем инлайн-клавиатуру с кнопкой "карта"
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('💳 Перейти к карте', 'card')],
    ]);

    // Отправляем изображение и текстовые данные карты одним сообщением
    if (fs.existsSync(cardImagePath)) {
      const caption = `🎉 Ваша карта успешно создана!\n\nИмя владельца: ${user.username}\nНомер карты: <code>${cardNumber}</code>`;
      await ctx.replyWithPhoto(
        { source: cardImagePath },
        {
          caption,
          parse_mode: 'HTML',
          reply_markup: keyboard.reply_markup // Добавляем клавиатуру
        }
      );
    } else {
      return ctx.reply('Не удалось сгенерировать изображение карты.');
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

    // Генерируем изображение карты
    const cardImagePath = await generateCardImage(userId, cardNumber);

    // Создаем инлайн-клавиатуру с кнопкой "карта"
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('💳 Перейти к карте', 'card')],
    ]);

    // Отправляем изображение и текстовые данные карты одним сообщением
    if (fs.existsSync(cardImagePath)) {
      const caption = `🎉 Ваша карта успешно создана!\n\nИмя владельца: ${user.username}\nНомер карты: <code>${cardNumber}</code>`;
      await ctx.replyWithPhoto(
        { source: cardImagePath },
        {
          caption,
          parse_mode: 'HTML',
          reply_markup: keyboard.reply_markup // Добавляем клавиатуру
        }
      );
    } else {
      return ctx.reply('Не удалось сгенерировать изображение карты.');
    }
  } catch (error) {
    console.error('Ошибка при обработке действия регистрации карты:', error);
    await ctx.reply('Произошла ошибка при создании карты.');
  }
}

// Обработчик кнопки "Управление картой"
async function handleManageCardButton(ctx) {
  try {
    const commandsList = `
📋 <b>Список команд управления картой:</b>

- пополнить [сумма] - пополнить баланс карты
- снять [сумма] - снять деньги с карты
- передать/перевод [id/номер_карты] [сумма], либо ответом на сообщение игрока - перевести деньги другому пользователю
    `.trim();

    // Создаем клавиатуру с кнопками "Пополнить", "Снять" и "Назад"
    await ctx.replyWithHTML(commandsList, Markup.inlineKeyboard([
      [Markup.button.callback('💳 Пополнить', 'show_topup_instruction')],
      [Markup.button.callback('💸 Снять', 'show_withdraw_instruction')],
      [Markup.button.callback('🔙 Назад', 'back_to_card_menu')],
    ]));
  } catch (error) {
    console.error('Ошибка при обработке кнопки "Управление картой":', error);
    await ctx.reply('Произошла ошибка при получении списка команд.');
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
  } catch (error) {
    console.error('Ошибка при обработке кнопки "Инфо":', error);
    await ctx.reply('Произошла ошибка при получении информации о карте.');
  }
}

// Вспомогательные функции для работы с редкостью скинов
function getRarityEmoji(rarity) {
  const rarityEmojis = {
    ORDINARY: '🔵', // Обычная
    EPIC: '🟣',    // Эпическая
    LEGENDARY: '🟡' // Легендарная
  };
  return rarityEmojis[rarity] || '🔵'; // По умолчанию обычный смайлик
}

// Функция для форматирования чисел с разделителями тысяч
function formatNumber(number) {
  // Преобразуем число в строку и используем регулярное выражение для добавления точек
  return number.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

// --- ОСНОВНАЯ ФУНКЦИЯ ОБРАБОТЧИКА ПРОКАЧКИ УРОВНЯ ---

// Обработчик кнопки "Прокачка уровня"
async function handleUpgradeCardLevel(ctx) {
  try {
    const userId = ctx.from.id.toString();

    // 1. Получаем данные пользователя и карты
    const user = await getUserById(userId);
    if (!user) {
       await ctx.reply('❌ Ошибка: Пользователь не найден.');
       // Проверяем, доступен ли answerCbQuery (например, если это callback от кнопки)
       if (ctx.callbackQuery && typeof ctx.answerCbQuery === 'function') {
         await ctx.answerCbQuery(); 
       }
       return;
    }

    const currentLevel = await getCardLevel(userId);
    const userBalance = getUserBalance(userId, 'PF'); // Предполагается, что getUserBalance доступна

    // 2. Проверяем максимальный уровень
    if (currentLevel >= 20) {
      await ctx.reply('📈 Ваша карта уже максимального уровня (20).');
      // Проверяем, доступен ли answerCbQuery
      if (ctx.callbackQuery && typeof ctx.answerCbQuery === 'function') {
        await ctx.answerCbQuery(); 
      }
      return;
    }

    // 3. Получаем данные для следующего уровня
    const nextLevel = currentLevel + 1;
    const rewards = getLevelRewards();
    const costs = getLevelUpgradeCosts();

    const requiredBalance = costs[nextLevel];
    const rewardInfo = rewards[nextLevel];

    // 4. Формируем сообщение
    let message = `
📈 <b>Прокачка уровня карты</b>

Ваш текущий уровень: <b>${currentLevel}</b>
Следующий уровень: <b>${nextLevel}</b>

🎁 Награда за уровень: ${rewardInfo.reward}
💰 Стоимость повышения: <b>${formatNumber(requiredBalance)} PF</b>
`;

    // 5. Создаем клавиатуру
    const keyboardRows = [];

    // Первый ряд: кнопка "Повысить уровень"
    // Всегда показываем кнопку, но делаем её неактивной, если недостаточно средств
    const upgradeButtonText = userBalance >= requiredBalance
      ? `⬆️ Повысить уровень (${formatNumber(requiredBalance)} PF)`
      // Изменено: Более короткий текст для кнопки с ошибкой
      : `❌ Недостаточно средств`;
    const upgradeButtonAction = userBalance >= requiredBalance
      ? `upgrade_level_confirm_${nextLevel}`
      : 'noop'; // 'noop' - пустое действие, кнопка не будет реагировать

    keyboardRows.push([Markup.button.callback(upgradeButtonText, upgradeButtonAction)]);

    // Второй ряд: "Сетка прокачки" и "Назад"
    keyboardRows.push([
      Markup.button.callback('📊 Сетка прокачки', 'show_upgrade_grid'),
      Markup.button.callback('🔙 Назад', 'back_to_card_menu')
    ]);

    const keyboard = Markup.inlineKeyboard(keyboardRows);

    // 6. Отправляем сообщение
    await ctx.replyWithHTML(message, keyboard);
    
    // 7. Подтверждаем нажатие callback-кнопки, если это было callback-запрос
    // Проверяем, доступен ли answerCbQuery
    if (ctx.callbackQuery && typeof ctx.answerCbQuery === 'function') {
      await ctx.answerCbQuery(); 
    }

  } catch (error) {
    console.error('Ошибка при обработке прокачки уровня карты:', error);
    await ctx.reply('Произошла ошибка при попытке прокачки уровня карты.');
    // Проверяем, доступен ли answerCbQuery и при обработке ошибок
    if (ctx.callbackQuery && typeof ctx.answerCbQuery === 'function') {
      await ctx.answerCbQuery(); 
    }
  }
}


// --- ОБРАБОТЧИКИ ДЛЯ ДОПОЛНИТЕЛЬНЫХ КНОПОК ---

// Обработчик кнопки "Сетка прокачки"
async function handleShowUpgradeGrid(ctx) {
  try {
    const rewards = getLevelRewards();
    const costs = getLevelUpgradeCosts();

    let gridMessage = '📊 <b>Сетка прокачки карты:</b>\n\n';

    for (let level = 1; level <= 20; level++) {
      const reward = rewards[level];
      const cost = costs[level];
      const formattedCost = cost > 0 ? `${formatNumber(cost)} PF` : 'Бесплатно';

      gridMessage += `<b>Уровень ${level}:</b>\n`;
      gridMessage += `  💰 Стоимость: ${formattedCost}\n`;
      gridMessage += `  🎁 Награда: ${reward.reward}\n\n`;
    }

    const backButton = Markup.inlineKeyboard([
      [Markup.button.callback('🔙 Назад', 'upgrade_card_level')] // Возврат к меню прокачки
    ]);

    await ctx.replyWithHTML(gridMessage, backButton);
    await ctx.answerCbQuery(); // Подтверждаем нажатие
  } catch (error) {
    console.error('Ошибка при отображении сетки прокачки:', error);
    await ctx.reply('Произошла ошибка при отображении сетки прокачки.');
    await ctx.answerCbQuery(); // Подтверждаем нажатие даже при ошибке
  }
}

// Сетка призов за уровень
function getLevelRewards() {
  return {
    1: { limit: 10000000, reward: "Лимит карты до 10,000,000 PF" },
    2: { limit: 12000000, reward: "Лимит карты до 12,000,000 PF" },
    3: { limit: 14000000, reward: "Лимит карты до 14,000,000 PF" },
    4: { limit: 16000000, reward: "Лимит карты до 16,000,000 PF" },
    5: { limit: 18000000, reward: "Лимит карты до 18,000,000 PF + 10 Gold контейнеров" },
    6: { limit: 20000000, reward: "Лимит карты до 20,000,000 PF" },
    7: { limit: 22000000, reward: "Лимит карты до 22,000,000 PF" },
    8: { limit: 24000000, reward: "Лимит карты до 24,000,000 PF" },
    9: { limit: 26000000, reward: "Лимит карты до 26,000,000 PF" },
    10: { limit: 28000000, reward: "Лимит карты до 28,000,000 PF + Уникальный скин + Лимит баланса до 175,000,000 PF" },
    11: { limit: 30000000, reward: "Лимит карты до 30,000,000 PF" },
    12: { limit: 32000000, reward: "Лимит карты до 32,000,000 PF" },
    13: { limit: 34000000, reward: "Лимит карты до 34,000,000 PF" },
    14: { limit: 36000000, reward: "Лимит карты до 36,000,000 PF" },
    15: { limit: 38000000, reward: "Лимит карты до 38,000,000 PF + Повышение основного баланса до 185,000,000 PF" },
    16: { limit: 40000000, reward: "Лимит карты до 40,000,000 PF" },
    17: { limit: 42000000, reward: "Лимит карты до 42,000,000 PF" },
    18: { limit: 44000000, reward: "Лимит карты до 44,000,000 PF" },
    19: { limit: 44000000, reward: "Уникальный скин + 25 Gold контейнеров + Префикс (реализация позже)" }, // Лимит не меняется
    20: { limit: 45000000, reward: "Лимит карты до 45,000,000 PF + Основной баланс до 200,000,000 PF" },
  };
}

// Сетка стоимости уровней
function getLevelUpgradeCosts() {
  return {
    1: 0,       // Базовый уровень, бесплатно
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

async function performLevelUpgrade(ctx, targetLevel) {
  const userId = ctx.from.id.toString();

  try {
      // --- ПРОВЕРКА КУЛДАУНА ---
      const currentTime = Date.now();
      const lastUpgradeTime = upgradeCardLevelCooldowns[userId];

      if (lastUpgradeTime && (currentTime - lastUpgradeTime) < UPGRADE_CARD_LEVEL_COOLDOWN_DURATION) {
          const remainingTimeMs = UPGRADE_CARD_LEVEL_COOLDOWN_DURATION - (currentTime - lastUpgradeTime);
          const remainingSeconds = Math.ceil(remainingTimeMs / 1000);
          await ctx.reply(`⏳ Вы недавно повышали уровень карты. Попробуйте снова через ${remainingSeconds} секунд.`);
          // Проверяем, доступен ли answerCbQuery
          if (ctx.callbackQuery && typeof ctx.answerCbQuery === 'function') {
              await ctx.answerCbQuery();
          }
          return; // Прерываем выполнение функции
      }

      // --- ОСНОВНАЯ ЛОГИКА ПОВЫШЕНИЯ УРОВНЯ ---
      // 1. Получаем стоимость для целевого уровня
      const costs = getLevelUpgradeCosts();
      const requiredBalance = costs[targetLevel];

      // 2. Проверка корректности стоимости
      if (requiredBalance === undefined || requiredBalance === null || requiredBalance < 0) {
          throw new Error(`Некорректная стоимость для уровня ${targetLevel}`);
      }

      // 3. Начинаем транзакцию для обеспечения атомарности
      await transaction(async () => {
          // 4. Получаем актуальные данные пользователя и карты внутри транзакции
          const user = await getUserById(userId);
          if (!user) {
              throw new Error('Пользователь не найден.');
          }

          const currentLevel = await getCardLevel(userId);
          // Прямой вызов getUserBalance для получения баланса PF
          const userBalance = getUserBalance(userId, 'PF');

          // 5. Проверки внутри транзакции
          if (currentLevel >= targetLevel) {
              throw new Error('Карта уже имеет этот или более высокий уровень.');
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

          // 7. ПОВЫШЕНИЕ УРОВНЯ КАРТЫ
          const updateLevelResult = await updateCardLevel(userId, targetLevel);
          if (!updateLevelResult) {
              throw new Error('Ошибка при обновлении уровня карты в базе данных.');
          }
          console.log(`[INFO] Уровень карты пользователя ${userId} успешно обновлён до ${targetLevel}.`);

          // 8. Если мы дошли до этой точки без исключений, транзакция будет зафиксирована.
          console.log(`[INFO] Транзакция повышения уровня ${currentLevel} -> ${targetLevel} для пользователя ${userId} завершена успешно.`);
      });

      // --- ПОСЛЕ УСПЕШНОЙ ТРАНЗАКЦИИ ---
      // 9. Обновляем время последнего повышения уровня (только после успеха!)
      upgradeCardLevelCooldowns[userId] = currentTime;

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
      await ctx.replyWithHTML(`✅ Уровень вашей карты успешно повышен до <b>${targetLevel}</b>!${rewardMessage}`);
      // Проверяем, доступен ли answerCbQuery
      if (ctx.callbackQuery && typeof ctx.answerCbQuery === 'function') {
          await ctx.answerCbQuery();
      }

      // 12. Опционально: Отправляем уведомление в лог-чат или админу
      // const LOG_CHAT_ID = process.env.LOG_CHAT_ID;
      // if (LOG_CHAT_ID) {
      //   await ctx.telegram.sendMessage(LOG_CHAT_ID, `📈 Пользователь ${userId} повысил уровень карты до ${targetLevel}.${rewardMessage ? `\n${rewardMessage.replace(/<[^>]*>/g, '')}` : ''}`);
      // }

  } catch (error) {
      // --- ОБРАБОТКА ОШИБОК ---
      console.error(`[ERROR] Ошибка при повышении уровня карты для пользователя ${userId} до уровня ${targetLevel}:`, error);

      // Отправляем пользователю понятное сообщение об ошибке
      let userMessage = '❌ Ошибка при повышении уровня. Попробуйте позже.';

      if (error.message.includes('Недостаточно средств')) {
          userMessage = '❌ Недостаточно средств на основном балансе.';
      } else if (error.message.includes('уже имеет этот или более высокий уровень')) {
          userMessage = '❌ Карта уже имеет этот или более высокий уровень.';
      } else if (error.message.includes('Пользователь не найден')) {
          userMessage = '❌ Пользователь не найден.';
      } else if (error.message.includes('Ошибка при обновлении уровня карты')) {
          userMessage = '❌ Не удалось обновить уровень карты. Попробуйте позже.';
      } else if (error.message.includes('Ошибка при списании средств')) {
          userMessage = '❌ Не удалось списать средства. Попробуйте позже.';
      } else if (error.message.includes('Некорректная стоимость')) {
           userMessage = '❌ Ошибка: некорректная стоимость уровня.';
      }
      // Добавьте другие условия, если нужно.

      await ctx.reply(userMessage);
      // Проверяем, доступен ли answerCbQuery
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
  handleUpgradeCardLevel, // Экспортируем новую функцию
  handleShowUpgradeGrid,  // Экспортируем новую функцию
  getLevelRewards,
  getLevelUpgradeCosts,
  formatNumber,
  performLevelUpgrade,
};
