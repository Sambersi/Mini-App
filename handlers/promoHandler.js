// promoHandler.js

const {
  createPromo,
  getAllPromos,
  deletePromoById,
  getPromoByName,
  hasUserActivatedPromo,
  recordPromoActivation,
  activatePromo,
  getPromoById,
  getUserStatuses,
  getUserById,
} = require('../db');
const { generatePromoImage } = require('./generatePromoImage');
const fs = require('fs');
const { createUserLink } = require('../bank/bankTransfers');

// === НОВЫЕ ТИПЫ ПРИЗОВ ===
const prizeTypeMapping = {
  конт: 'container_type_3',
  пф: 'balance',
  дф: 'df_balance',
  нпф: 'npf_shares',
  тикеты: 'tickets',      // Новый тип: билетики
  конфеты: 'candy',      // Новый тип: конфеты
};

const prizeTypeDisplay = {
  container_type_3: 'GOLD-контейнер',
  balance: 'PF',
  df_balance: 'DF',
  npf_shares: 'NPF-акция',
  tickets: 'Билетики',   // Отображение для "тикетов"
  candy: 'Конфеты',      // Отображение для "конфет"
};

// Глобальное хранилище для микросессий создания промокодов
const promoCreationSessions = {};

// Функция для проверки прав администратора (для внутреннего использования)
async function isAdminInternal(userId) {
  return process.env.MAIN_ADMIN === userId.toString() || (await getUserStatuses(userId)).includes('Тех администратор');
}

// Функция для получения имени статуса по ID
function getStatusNameById(id) {
  const allStatuses = [
    { id: 1, name: 'Администратор' },
    { id: 2, name: 'Тех админ' },
    { id: 3, name: 'Модератор' },
    { id: 4, name: 'DIAMOND' },
    { id: 5, name: 'PLATINUM' },
    { id: 6, name: 'GOLD' },
    { id: 7, name: 'Beto-tester' },
  ];

  const status = allStatuses.find(status => status.id === id);
  return status ? status.name : 'Неизвестный';
}

// Функция для очистки старых сессий (очищает сессии, неактивные более 10 минут)
setInterval(() => {
  const now = Date.now();
  for (const [userId, session] of Object.entries(promoCreationSessions)) {
    if (now - session.lastActivity > 10 * 60 * 1000) { // 10 минут
      delete promoCreationSessions[userId];
      console.log(`[PROMO SESSION] Сессия пользователя ${userId} удалена из-за неактивности.`);
    }
  }
}, 30000); // Проверяем каждые 30 секунд

// Функция для отправки сообщения с кнопками, проверяющая права администратора
async function sendPromoMenu(ctx, messageText, keyboard, userId = null) {
  if (!userId) userId = ctx.from.id.toString();

  // Проверка прав администратора
  if (!(await isAdminInternal(userId))) {
    await ctx.reply('❌ У вас нет прав для использования этой команды.');
    return false;
  }

  // Если это callback-запрос, используем editMessageText, иначе replyWithHTML
  if (ctx.updateType === 'callback_query') {
    try {
      await ctx.editMessageText(messageText, { reply_markup: keyboard, parse_mode: 'HTML' });
    } catch (error) {
      console.error('[PROMO MENU] Ошибка при редактировании сообщения:', error);
      // Если редактирование не удалось, отправляем новое сообщение
      await ctx.reply(messageText, { reply_markup: keyboard, parse_mode: 'HTML' });
    }
  } else {
    await ctx.reply(messageText, { reply_markup: keyboard, parse_mode: 'HTML' });
  }

  return true;
}

// Функция для создания клавиатуры выбора типа приза
function createPrizeTypeKeyboard() {
  return {
    inline_keyboard: [
      [{ text: 'GOLD-контейнер', callback_data: 'prize_type_cont' }],
      [{ text: 'PF', callback_data: 'prize_type_pf' }],
      [{ text: 'DF', callback_data: 'prize_type_df' }],
      [{ text: 'NPF-акция', callback_data: 'prize_type_npf' }],
      [{ text: 'Билетики', callback_data: 'prize_type_tickets' }],
      [{ text: 'Конфеты', callback_data: 'prize_type_candy' }],
      [{ text: 'Отмена', callback_data: 'promo_create_cancel' }]
    ]
  };
}

// Функция для создания клавиатуры выбора минимального статуса
function createMinStatusKeyboard() {
  return {
    inline_keyboard: [
      [{ text: 'Доступен всем', callback_data: 'min_status_0' }],
      [{ text: 'Администратор', callback_data: 'min_status_1' }],
      [{ text: 'Тех админ', callback_data: 'min_status_2' }],
      [{ text: 'Модератор', callback_data: 'min_status_3' }],
      [{ text: 'DIAMOND', callback_data: 'min_status_4' }],
      [{ text: 'PLATINUM', callback_data: 'min_status_5' }],
      [{ text: 'GOLD', callback_data: 'min_status_6' }],
      [{ text: 'Beto-tester', callback_data: 'min_status_7' }],
      [{ text: 'Назад', callback_data: 'promo_create_back_to_prize' }]
    ]
  };
}

// Функция для создания клавиатуры подтверждения
function createConfirmKeyboard() {
  return {
    inline_keyboard: [
      [{ text: '✅ Подтвердить', callback_data: 'promo_create_confirm' }],
      [{ text: '✏️ Изменить', callback_data: 'promo_create_edit' }],
      [{ text: '❌ Отмена', callback_data: 'promo_create_cancel' }]
    ]
  };
}

// Функция для формирования текста предварительного просмотра
function getPreviewText(sessionData) {
  const formattedPrizeType = prizeTypeDisplay[sessionData.prizeType] || sessionData.prizeType;
  const minStatusName = sessionData.minStatusId === 0 ? 'Доступен всем' : getStatusNameById(sessionData.minStatusId);

  return `
📌 <b>Предварительный просмотр промокода</b>

• <b>Название:</b> <code>${sessionData.name}</code>
• <b>Количество активаций:</b> <code>${sessionData.activations}</code>
• <b>Приз:</b> <code>${sessionData.prizeAmount} ${formattedPrizeType}</code>
• <b>Минимальный статус:</b> <code>${minStatusName}</code>

❗️ После подтверждения промокод будет создан.
`.trim();
}

// Обработка команды "создать" для запуска процесса создания промокода
async function createPromoHandler(ctx) {
  try {
    const text = ctx.message.text.trim();
    const parts = text.split(/\s+/);

    // Проверка прав администратора
    if (!(await isAdminInternal(ctx.from.id))) {
      return ctx.reply('❌ У вас нет прав для использования этой команды.');
    }

    // Инициализация сессии
    const userId = ctx.from.id.toString();
    promoCreationSessions[userId] = {
      step: 'waiting_name',
      lastActivity: Date.now(),
      data: {}
    };

    // Отправка сообщения с инструкцией и клавиатурой
    const messageText = `
📌 <b>Создание нового промокода</b>

Чтобы создать промокод, следуйте шагам:

1. Введите <b>название</b> промокода.
2. Укажите <b>количество активаций</b>.
3. Выберите <b>тип приза</b> с помощью кнопок ниже.
4. Укажите <b>количество приза</b>.
5. Выберите <b>минимальный статус</b> для активации.

❗️ Для отмены введите /cancel или нажмите кнопку "Отмена".
`;

    const keyboard = createPrizeTypeKeyboard(); // Начинаем с выбора типа приза, но сначала нужно имя
    await sendPromoMenu(ctx, messageText, keyboard, userId);

  } catch (error) {
    console.error('Ошибка при создании промокода:', error);
    await ctx.reply('Произошла ошибка. Попробуйте позже.');
  }
}

// Обработчик callback-запросов для создания промокода
async function handlePromoCreationCallback(ctx) {
  try {
    const userId = ctx.from.id.toString();

    // Проверка прав администратора
    if (!(await isAdminInternal(userId))) {
      await ctx.answerCbQuery('❌ У вас нет прав для использования этой функции.', { show_alert: true });
      return;
    }

    // Проверка наличия сессии
    if (!promoCreationSessions[userId]) {
      await ctx.answerCbQuery('❌ Сессия создания промокода не найдена. Начните заново с команды "создать".', { show_alert: true });
      return;
    }

    // Обновление времени последней активности
    promoCreationSessions[userId].lastActivity = Date.now();

    const callbackData = ctx.callbackQuery.data;

    // Обработка нажатия на кнопку "Отмена"
    if (callbackData === 'promo_create_cancel') {
      delete promoCreationSessions[userId];
      await ctx.editMessageText('❌ Создание промокода отменено.', { parse_mode: 'HTML' });
      return;
    }

    // Обработка нажатия на кнопку "Назад"
    if (callbackData === 'promo_create_back_to_prize') {
      promoCreationSessions[userId].step = 'waiting_prize_type';
      const messageText = 'Выберите тип приза:';
      const keyboard = createPrizeTypeKeyboard();
      await sendPromoMenu(ctx, messageText, keyboard, userId);
      return;
    }

    // Обработка нажатия на кнопку "Изменить"
    if (callbackData === 'promo_create_edit') {
      promoCreationSessions[userId].step = 'waiting_name';
      const messageText = 'Введите новое название промокода:';
      await sendPromoMenu(ctx, messageText, {}, userId);
      return;
    }

    // Обработка нажатия на кнопку "Подтвердить"
    if (callbackData === 'promo_create_confirm') {
      const sessionData = promoCreationSessions[userId].data;

      // Проверка корректности данных
      if (!sessionData.name || !sessionData.activations || !sessionData.prizeType || !sessionData.prizeAmount || typeof sessionData.minStatusId !== 'number') {
        await ctx.answerCbQuery('❌ Не все данные заполнены. Пожалуйста, заполните все поля.', { show_alert: true });
        return;
      }

      // Создание промокода
      const result = await createPromo(
        sessionData.name,
        sessionData.activations,
        sessionData.prizeType,
        sessionData.prizeAmount,
        ctx.from.id.toString(),
        sessionData.minStatusId
      );

      if (!result.success) {
        await ctx.answerCbQuery(result.message || 'Промокод с таким названием уже существует.', { show_alert: true });
        return;
      }

      // Генерация изображения
      const imageFilePath = await generatePromoImage(sessionData.name, sessionData.activations, sessionData.prizeAmount, sessionData.prizeType);
      const formattedPrizeType = prizeTypeDisplay[sessionData.prizeType] || sessionData.prizeType;

      const adminMessage = `Промокод успешно создан:
• Название: ${sessionData.name}
• Количество активаций: ${sessionData.activations}
• Приз: ${sessionData.prizeAmount} ${formattedPrizeType}
• Статус: ${sessionData.minStatusId === 0 ? 'Доступен всем' : getStatusNameById(sessionData.minStatusId)}`;

      await ctx.editMessageMedia({
        type: 'photo',
        media: { source: imageFilePath },
        caption: adminMessage
      });

      // Логирование создания промокода
      const LOG_GIVE_CHAT_ID = process.env.LOG_GIVE_CHAT_ID;
      const loggingAdminIds = ["6891998751", "1751938104", "1901352625"];

      if (loggingAdminIds.includes(userId) && LOG_GIVE_CHAT_ID) {
        const logMessage = `
🔔 Создан новый промокод:
• Администратор: <a href="tg://user?id=${userId}">${ctx.from.username || 'Неизвестный'}</a> (Tg ID: <code>${userId}</code>)
• Название: <code>${sessionData.name}</code>
• Количество активаций: <b>${sessionData.activations}</b>
• Приз: <b>${sessionData.prizeAmount} ${formattedPrizeType}</b>
• Статус: ${sessionData.minStatusId === 0 ? 'Доступен всем' : getStatusNameById(sessionData.minStatusId)}
`.trim();

        ctx.telegram.sendMessage(LOG_GIVE_CHAT_ID, logMessage, { parse_mode: 'HTML' })
          .catch((error) => {
            console.error('Ошибка при отправке лога создания промокода:', error);
          });
      }

      // Очистка сессии
      delete promoCreationSessions[userId];

      return;
    }

    // Обработка выбора типа приза
    if (callbackData.startsWith('prize_type_')) {
      const prizeTypeAlias = callbackData.replace('prize_type_', '');
      const prizeType = prizeTypeMapping[prizeTypeAlias];

      if (!prizeType) {
        await ctx.answerCbQuery('❌ Некорректный тип приза.', { show_alert: true });
        return;
      }

      promoCreationSessions[userId].step = 'waiting_prize_amount';
      promoCreationSessions[userId].data.prizeType = prizeType;

      const messageText = `Вы выбрали тип приза: <b>${prizeTypeDisplay[prizeType]}</b>\n\nВведите количество приза (например, 1000):`;
      await sendPromoMenu(ctx, messageText, {}, userId);
      return;
    }

    // Обработка выбора минимального статуса
    if (callbackData.startsWith('min_status_')) {
      const minStatusId = parseInt(callbackData.replace('min_status_', ''), 10);

      if (isNaN(minStatusId) || minStatusId < 0 || minStatusId > 7) {
        await ctx.answerCbQuery('❌ Некорректный ID статуса.', { show_alert: true });
        return;
      }

      promoCreationSessions[userId].step = 'preview';
      promoCreationSessions[userId].data.minStatusId = minStatusId;

      const previewText = getPreviewText(promoCreationSessions[userId].data);
      const keyboard = createConfirmKeyboard();
      await sendPromoMenu(ctx, previewText, keyboard, userId);
      return;
    }

  } catch (error) {
    console.error('Ошибка при обработке callback-запроса создания промокода:', error);
    await ctx.answerCbQuery('❌ Произошла ошибка. Попробуйте позже.', { show_alert: true });
  }
}

// Обработчик текстовых сообщений для создания промокода
async function handlePromoCreationText(ctx) {
  try {
    const userId = ctx.from.id.toString();

    // Проверка прав администратора
    if (!(await isAdminInternal(userId))) {
      return; // Игнорируем сообщение
    }

    // Проверка наличия сессии
    if (!promoCreationSessions[userId]) {
      return; // Игнорируем сообщение, если сессия не существует
    }

    // Обновление времени последней активности
    promoCreationSessions[userId].lastActivity = Date.now();

    const text = ctx.message.text.trim();
    const session = promoCreationSessions[userId];

    // Обработка команды отмены
    if (text.toLowerCase() === '/cancel') {
      delete promoCreationSessions[userId];
      await ctx.reply('❌ Создание промокода отменено.', { parse_mode: 'HTML' });
      return;
    }

    // Обработка шага ввода названия
    if (session.step === 'waiting_name') {
      if (text.length === 0) {
        await ctx.reply('❌ Название не может быть пустым. Пожалуйста, введите название промокода.');
        return;
      }

      session.step = 'waiting_activations';
      session.data.name = text;

      const messageText = `Название промокода: <code>${text}</code>\n\nВведите количество активаций (целое число больше 0):`;
      await ctx.reply(messageText, { parse_mode: 'HTML' });
      return;
    }

    // Обработка шага ввода количества активаций
    if (session.step === 'waiting_activations') {
      const activations = parseInt(text, 10);

      if (isNaN(activations) || activations <= 0) {
        await ctx.reply('❌ Количество активаций должно быть целым числом больше 0. Пожалуйста, введите корректное значение.');
        return;
      }

      session.step = 'waiting_prize_type';
      session.data.activations = activations;

      const messageText = `Количество активаций: <code>${activations}</code>\n\nВыберите тип приза с помощью кнопок ниже:`; 
      const keyboard = createPrizeTypeKeyboard();
      await ctx.reply(messageText, { reply_markup: keyboard, parse_mode: 'HTML' });
      return;
    }

    // Обработка шага ввода количества приза
    if (session.step === 'waiting_prize_amount') {
      const prizeAmount = parseFloat(text.replace(',', '.'));

      if (isNaN(prizeAmount) || prizeAmount <= 0) {
        await ctx.reply('❌ Количество приза должно быть положительным числом. Пожалуйста, введите корректное значение.');
        return;
      }

      session.step = 'waiting_min_status';
      session.data.prizeAmount = prizeAmount;

      const messageText = `Количество приза: <code>${prizeAmount}</code>\n\nВыберите минимальный статус для активации промокода с помощью кнопок ниже:`; 
      const keyboard = createMinStatusKeyboard();
      await ctx.reply(messageText, { reply_markup: keyboard, parse_mode: 'HTML' });
      return;
    }

  } catch (error) {
    console.error('Ошибка при обработке текстового сообщения создания промокода:', error);
    await ctx.reply('Произошла ошибка. Попробуйте позже.');
  }
}

// Обработка команды "удалить промо"
async function deletePromoHandler(ctx) {
  try {
    // Проверка прав администратора
    if (!(await isAdminInternal(ctx.from.id))) {
      return; // Завершаем выполнение без отправки ответа, если нет прав
    }

    const text = ctx.message.text.trim();
    const parts = text.split(/\s+/);

    if (parts.length !== 3 || !(parts[0].toLowerCase() === 'удалить' && parts[1] === 'промо')) {
      return ctx.reply('Использование: удалить промо <id_промо>');
    }

    const promoId = parseInt(parts[2], 10);

    if (isNaN(promoId)) {
      return ctx.reply('Некорректный ID промокода. Использование: удалить промо <id_промо>');
    }

    const promo = await getPromoById(promoId);
    if (!promo) {
      return ctx.reply('Промокод с указанным ID не найден.');
    }

    const result = await deletePromoById(promoId);
    if (!result.success) {
      return ctx.reply(result.message || 'Произошла ошибка при удалении промокода.');
    }

    const adminMessage = `Промокод "${promo.name}" (ID: ${promoId}) успешно удален.`;
    await ctx.reply(adminMessage);
  } catch (error) {
    console.error('Ошибка при выполнении команды "удалить промо":', error);
    await ctx.reply('Произошла ошибка. Попробуйте позже.');
  }
}

// Обработка команды "список промо"
async function listPromosHandler(ctx) {
  try {
    // Проверка прав администратора
    if (!(await isAdminInternal(ctx.from.id))) {
      return; // Завершаем выполнение без отправки ответа, если нет прав
    }

    const promos = await getAllPromos();
    if (!promos.length) {
      return ctx.reply('Список промокодов пуст.');
    }

    let response = '';
    for (const promo of promos) {
      const creatorLink = `<b><a href="tg://user?id=${promo.created_by}">${promo.created_by_username || 'Неизвестный'}</a></b>`;
      response += `• <b>ID</b>: ${promo.id}\n`;
      response += `  <b>Название</b>: ${promo.name}\n`;
      response += `  <b>Оставшиеся активации</b>: ${promo.activations_left}\n`;
      response += `  <b>Приз</b>: ${promo.prize_amount} ${promo.prize_type}\n`;
      response += `  <b>Создал</b>: ${creatorLink}\n\n`;
    }

    await ctx.reply(response, { parse_mode: 'HTML' });
  } catch (error) {
    console.error('Ошибка при получении списка промокодов:', error);
    await ctx.reply('Произошла ошибка. Попробуйте позже.');
  }
}

// Обработка команды "промо"
async function usePromoHandler(ctx) {
  try {
    const text = ctx.message.text.trim();
    const parts = text.split(/\s+/);

    // Проверяем формат команды
    if (parts.length !== 2 || parts[0].toLowerCase() !== 'промо') {
      return ctx.reply('❕ <b>Использование</b>: промо [название_промо]', { parse_mode: 'HTML' });
    }

    const promoName = parts[1];
    const promo = await getPromoByName(promoName);

    // Проверяем, существует ли промокод
    if (!promo) {
      return ctx.reply('❕ Промокод не найден.');
    }

    // Проверяем, остались ли активации
    if (promo.activations_left <= 0) {
      return ctx.reply('❕ Активации промокода исчерпаны.');
    }

    const userId = ctx.from.id.toString();

    // Проверяем, активировал ли пользователь этот промокод ранее
    if (await hasUserActivatedPromo(promo.id, userId)) {
      return ctx.reply('❕ Вы уже активировали этот промокод.');
    }

    // Проверяем минимальный статус
    if (promo.min_status_id > 0) {
      const userStatuses = await getUserStatuses(userId); // Получаем статусы пользователя
      const requiredStatusName = getStatusNameById(promo.min_status_id); // Получаем имя статуса по ID

      // Проверяем, есть ли у пользователя именно указанный статус
      if (!userStatuses.includes(requiredStatusName)) {
        return ctx.reply(`❕ У вас недостаточный статус для активации этого промо-кода. Требуется статус: ${requiredStatusName}.`);
      }
    }

    // Активируем промокод
    const activationResult = await activatePromo(promo.id, userId);

    if (!activationResult.success) {
      return ctx.reply(activationResult.message || '❕ Не удалось активировать промокод.');
    }

    // Записываем активацию промокода
    await recordPromoActivation(promo.id, userId);

    // Получаем обновленный промокод
    const updatedPromo = await getPromoById(promo.id);

    // Если активации закончились, удаляем промокод из базы данных
    if (updatedPromo.activations_left <= 0) {
      await deletePromoById(updatedPromo.id); // Удаляем промокод
      console.log(`Промокод "${promo.name}" удален из базы данных, так как активации исчерпаны.`);
    }

    // === ДОБАВЛЕНО: Шанс на выпадение конфет ===
    let candyAwardMessage = '';
    if (Math.random() < 0.15) { // 15% шанс
      const candyCount = Math.floor(Math.random() * 4) + 2; // от 2 до 5
      try {
        const { giveCandy } = require('../db'); // Импортируем функцию из db.js
        giveCandy(userId, candyCount);
        candyAwardMessage = `\n🍬 + ${candyCount} конфет бонусом!`;
      } catch (candyError) {
        console.error(`[usePromoHandler] Ошибка при выдаче конфет пользователю ${userId}:`, candyError);
      }
    }
    // === КОНЕЦ ДОБАВЛЕНИЯ ===

    // Определяем тип приза для отображения
    const prizeTypeAssociation = {
      balance: 'PF',
      df_balance: 'DF',
      npf_shares: 'NPF-акция',
      container_type_3: 'GOLD-контейнер',
      tickets: 'Билетиков',     // Отображение для "тикетов"
      candy: 'Конфет',         // Отображение для "конфет"
    };

    const formattedPrizeType = prizeTypeAssociation[promo.prize_type] || promo.prize_type;

    // Получаем данные пользователя для создания гиперссылки
    const user = await getUserById(userId); // Используем Telegram ID для поиска пользователя
    const userLink = await createUserLink(user.id, user.username || user.first_name); // Создаем гиперссылку

    // Формируем ответ пользователю
    const response = `
✅ ${userLink}, промо-код успешно активирован!
▫️ Приз: <code>${activationResult.prizeAmount} ${formattedPrizeType}</code>
▫️ Осталось активаций: <code>${updatedPromo.activations_left}</code>${candyAwardMessage}
`.trim();

    await ctx.reply(response, { parse_mode: 'HTML' });

    // Отправка уведомления в лог-чат
    const LOG_CHAT_PROMO_ID = process.env.LOG_CHAT_PROMO_ID; // ID чата для логов
    if (LOG_CHAT_PROMO_ID) {
      try {
        // Формируем сообщение для лог-чата
        const logMessage = `
🔔 <b>Активация промокода</b>
▫️ Игрок: ${userLink}
▫️ Telegram ID: <code>${user.id}</code>
▫️ Игровой ID: <code>${user.numeric_id || 'Неизвестный'}</code>
▫️ Промокод: <code>${promo.name}</code>
▫️ Осталось активаций: <code>${updatedPromo.activations_left}</code>
`.trim();

        // Отправляем сообщение в лог-чат
        await ctx.telegram.sendMessage(LOG_CHAT_PROMO_ID, logMessage, { parse_mode: 'HTML' });
      } catch (error) {
        console.error('Ошибка при отправке лога активации промокода:', error);
      }
    }
  } catch (error) {
    console.error('Ошибка при активации промокода:', error);
    await ctx.reply('Произошла ошибка. Попробуйте позже.');
  }
}

module.exports = {
  createPromoHandler,
  listPromosHandler,
  deletePromoHandler,
  usePromoHandler,
  handlePromoCreationCallback,
  handlePromoCreationText,
};