//bankTransfers.js
const { Markup } = require('telegraf');
const { 
    getUserById,
    getUserByNumericId,
    isUserBanned,
    hasCard,
    getCardBalance,
    updateCardBalance,
    transaction,
    getTotalBalance,
    areTransfersBlockedByNumericId,
    getCardLevel, // Импортируем для получения уровня
    getCardLimitByLevel, 
  } = require('../db');
  const { createUserLink } = require('../utils/userLink'); // Импортируем функцию для создания ссылок
  
  // Импортируем функции для управления уведомлениями из addBalance.js
  const { 
    sendUserNotification,
    createNotificationKeyboard,
    handleNotificationButton,
    isAdmin
  } = require('../admin/addBalance');
  
  // Получаем ID чата для логов из переменных окружения
  const LOG_CHAT_T_ID = process.env.LOG_CHAT_T_ID;
  
  // Функция для парсинга суммы с учетом суффиксов "к"
  function parseAmountWithSuffix(amountInput, availableBalance) {
    // Преобразуем amountInput в строку, если это не строка
    if (typeof amountInput !== 'string') {
        amountInput = String(amountInput);
    }

    amountInput = amountInput.trim().toLowerCase();

    // Проверяем, если указано "всё" или "все"
    if (amountInput === 'все' || amountInput === 'всё') {
        return availableBalance; // Возвращаем всю доступную сумму
    }

    // Парсим обычную сумму с учетом суффиксов "к"
    const match = amountInput.match(/^(\d+)([к]*)$/i);
    if (!match) {
        throw new Error('Некорректный формат суммы.');
    }

    const [_, numberPart, kSuffix] = match;
    let baseAmount = parseFloat(numberPart.replace(',', '.')); // Учитываем возможность использования запятой вместо точки
    if (isNaN(baseAmount) || baseAmount <= 0) {
        throw new Error('Сумма должна быть положительным числом.');
    }

    // Для каждого символа "к" умножаем сумму на 1000
    for (let i = 0; i < kSuffix.length; i++) {
        baseAmount *= 1000;
    }

    return Math.floor(baseAmount); // Возвращаем целое число
}


// Функция для выполнения перевода
async function performTransfer(ctx, sender, recipient, amountInput) {
  try {
      const BASE_TRANSFER_LIMIT = 50000000; // Базовый лимит отправителя
      const SPECIAL_TRANSFER_LIMIT = 60000000; // Лимит для особых пользователей
      const PREMIUM_TRANSFER_LIMIT = 120000000; // Лимит для премиум пользователей

      // Проверяем права администратора у отправителя
      const isAdminSender = await isAdmin(ctx); // Используем ctx для проверки прав

      // Парсим сумму с учётом суффиксов "к" или ключевых слов "всё"/"все"
      const parsedAmount = parseAmountWithSuffix(amountInput, getCardBalance(sender.id));

      // Проверяем суммарный баланс отправителя (пропускаем для администраторов)
      if (!isAdminSender) {
          const senderTotalBalance = getTotalBalance(sender.id);

          // Устанавливаем лимит в зависимости от категории пользователя
          const SPECIAL_USER_IDS = ['1703993971']; // Пользователи с лимитом 60M
          const PREMIUM_USER_IDS = ['1751938104']; // Пользователи с лимитом 120M

          let effectiveLimit = BASE_TRANSFER_LIMIT; // Базовый лимит по умолчанию

          if (PREMIUM_USER_IDS.includes(sender.id)) {
              effectiveLimit = PREMIUM_TRANSFER_LIMIT; // 120M для премиум пользователей
          } else if (SPECIAL_USER_IDS.includes(sender.id)) {
              effectiveLimit = SPECIAL_TRANSFER_LIMIT; // 60M для особых пользователей
          }

          if (senderTotalBalance >= effectiveLimit) {
              return ctx.reply(`✖️ Вам недоступны переводы, так как ваш баланс достиг лимита в ${effectiveLimit.toLocaleString('ru-RU')} PF.`);
          }
      }

      // Проверка нахождения отправителя в ЧС
      if (await isUserBanned(sender.id)) {
          return ctx.reply('💢 Перевод невозможен, так как ваш аккаунт заблокирован.');
      }

      // Проверка нахождения получателя в ЧС
      if (await isUserBanned(recipient.id)) {
          return ctx.reply('📛 Перевод был прерван, данный игрок заблокирован!');
      }

      // Проверка наличия карты у отправителя
      if (!hasCard(sender.id)) {
          return ctx.reply('✖️ У вас нет зарегистрированной карты. Зарегистрируйте карту перед переводом.');
      }

      // Проверка наличия средств на карте отправителя
      const senderCardBalance = getCardBalance(sender.id);
      if (senderCardBalance < parsedAmount) {
          const message = `✖️ На вашей карте недостаточно средств для перевода.
💰 Требуется: ${parsedAmount.toLocaleString('ru-RU')} PF
💳 Доступно: ${senderCardBalance.toLocaleString('ru-RU')} PF`;
          // Добавляем кнопку "Пополнить"
          return ctx.replyWithHTML(message, Markup.inlineKeyboard([
              Markup.button.callback('💳 Пополнить карту', 'topup_card')
          ]));
      }

      // Проверка блокировки переводов отправителя (пропускаем для администраторов)
      if (!isAdminSender && await areTransfersBlockedByNumericId(sender.numeric_id)) {
          return ctx.reply('✖️ Вы не можете совершать переводы, так как они для Вас заблокированы.');
      }

      // Проверка блокировки переводов получателя
      if (await areTransfersBlockedByNumericId(recipient.numeric_id)) {
          return ctx.reply('✖️ Перевод невозможен, так как у получателя заблокированы переводы.');
      }

      // Проверка блокировки получателя
      if (recipient.is_blocked) {
          return ctx.reply('📛 Перевод был прерван, данный игрок заблокирован!');
      }

      // Проверка наличия карты у получателя
      if (!hasCard(recipient.id)) {
          return ctx.reply('✖️ Перевод прерван. У получателя нет зарегистрированной карты.');
      }

      // --- ИЗМЕНЕНИЕ: Получаем уровень и лимит карты получателя ---
      const recipientCardLevel = await getCardLevel(recipient.id);
      const MAX_CARD_BALANCE_LIMIT = getCardLimitByLevel(recipientCardLevel); // Динамический лимит

      // Проверка наличия места на карте получателя (пропускаем для администраторов)
      const recipientCardBalance = getCardBalance(recipient.id);
      let maxPossibleTransfer = MAX_CARD_BALANCE_LIMIT - recipientCardBalance;

      if (!isAdminSender && maxPossibleTransfer <= 0) {
          // Если лимит уже достигнут, отменяем операцию
          return ctx.reply(`⚠️ Баланс карты получателя достиг максимального лимита (${MAX_CARD_BALANCE_LIMIT.toLocaleString('ru-RU')} PF). Перевод невозможен.`);
      }

      // Корректируем сумму перевода до максимально возможной
      const transferAmount = isAdminSender ? parsedAmount : Math.min(parsedAmount, maxPossibleTransfer);

      if (!isAdminSender && transferAmount < parsedAmount) {
          // Предупреждаем отправителя о частичном переводе
          await ctx.reply(`ℹ️ Баланс карты получателя ограничен. \n• Максимально возможная сумма для перевода: ${transferAmount.toLocaleString('ru-RU')} PF.`);
      }

      // Выполняем перевод
      await transaction(async () => {
          // Снимаем средства с карты отправителя
          const senderUpdateResult = updateCardBalance(sender.id, -transferAmount);
          if (!senderUpdateResult) {
              throw new Error('Не удалось списать средства с карты отправителя.');
          }

          // Добавляем средства на карту получателя
          const recipientUpdateResult = updateCardBalance(recipient.id, transferAmount);
          if (!recipientUpdateResult) {
              throw new Error('Не удалось зачислить средства на карту получателя.');
          }
      });

      // Создаем гиперссылки для отправителя и получателя
      const senderLink = await createUserLink(sender.id);
      const recipientLink = await createUserLink(recipient.id);

      // Отправляем подтверждение отправителю
      if (transferAmount < parsedAmount) {
          // Если переведена только часть суммы
          await ctx.replyWithHTML(
              `☑️ Вы успешно перевели <b>${transferAmount.toLocaleString('ru-RU')} PF</b> игроку ${recipientLink}.\n` +
              `⚠️ Оставшаяся сумма (${(parsedAmount - transferAmount).toLocaleString('ru-RU')} PF) не была отправлена из-за ограничения лимита баланса карты.`
          );
      } else {
          // Если вся сумма переведена успешно
          await ctx.replyWithHTML(`☑️ Вы успешно перевели <b>${transferAmount.toLocaleString('ru-RU')} PF</b> игроку ${recipientLink}.`);
      }

      // Уведомляем получателя
      // --- ИЗМЕНЕНИЕ: Получаем обновленный баланс получателя ---
      const updatedRecipientCardBalance = getCardBalance(recipient.id);
      const userMessage = `
<b>📮 Новый перевод на карту!</b>
\n📨 Вам было переведено <b>${transferAmount.toLocaleString('ru-RU')} PF</b>, игроком ${senderLink}!
💳 Ваш текущий баланс карты: ${updatedRecipientCardBalance.toLocaleString('ru-RU')} PF.
\n🔕 Нажмите кнопку ниже, если не хотите получать уведомления.`.trim();

      await sendUserNotification(ctx, recipient.id, userMessage);

      // Логирование транзакций, если сумма больше или равна 10,000 PF
      if (transferAmount >= 50000 && LOG_CHAT_T_ID) {
          const logMessage = `
🔔 Новая транзакция:
• Отправитель: ${senderLink} (Tg ID: <code>${sender.id}</code>, ID: <code>${sender.numeric_id}</code>)
• Получатель: ${recipientLink} (Tg ID: <code>${recipient.id}</code>, ID: <code>${recipient.numeric_id}</code>)
• Сумма: <b>${transferAmount.toLocaleString('ru-RU')} PF</b>
`.trim();

          // Отправляем лог в чат для логов
          ctx.telegram.sendMessage(LOG_CHAT_T_ID, logMessage, { parse_mode: 'HTML' }).catch((error) => {
              console.error('Ошибка при отправке лога транзакции:', error);
          });
      }
  } catch (error) {
      console.error('Ошибка при выполнении перевода:', error);
      // Отправляем более конкретное сообщение об ошибке, если она произошла внутри транзакции
      if (error.message.includes('средств')) {
           ctx.reply(`❌ ${error.message}`);
      } else {
           ctx.reply('Произошла ошибка при выполнении перевода. Попробуйте позже.');
      }
  }
}

// Обработчик команды "передать"
async function sendHandler(ctx) {
    try {
      const text = ctx.message.text.trim();
      const parts = text.split(/\s+/);
  
      // Определяем, является ли команда ответом на сообщение
      const isReply = !!ctx.message.reply_to_message;
  
      // Проверка формата команды
      if ((!isReply && parts.length < 3) || (isReply && parts.length < 2)) {
        return ctx.reply(
          'Использование:\n' +
          '1) передать [id/card_number] [сумма/все]\n' +
          '2) Ответьте на сообщение игрока и напишите: передать [сумма/всё]'
        );
      }
  
      let identifier; // numeric_id или card_number
      let amountInput; // Ввод суммы с возможным суффиксом "к"
  
      if (isReply) {
        // Если команда является ответом на сообщение
        identifier = null; // Получатель будет определен из ответа
        amountInput = parts[1].toLowerCase(); // Сумма берется из второго параметра
      } else {
        // Если команда не является ответом
        identifier = parts[1]; // numeric_id или card_number
        amountInput = parts[2].toLowerCase(); // Сумма берется из третьего параметра
      }
  
      // Получаем отправителя
      const sender = getUserById(ctx.from.id.toString());
      if (!sender) {
        return ctx.reply('✖️ Не удалось найти ваш профиль.');
      }
  
      // Проверяем наличие карты у отправителя
      if (!hasCard(sender.id)) {
        return ctx.reply('✖️ У вас нет зарегистрированной карты. Зарегистрируйте карту перед переводом.');
      }

      // Проверяем, заблокированы ли переводы у отправителя
      if (await areTransfersBlockedByNumericId(sender.numeric_id)) {
        return ctx.reply('✖️ Вы не можете совершать переводы, так как Вам их заблокировал администратор.');
      }
  
      // Проверяем, если указано "все" или "всё"
      let amount;
      if (amountInput === 'все' || amountInput === 'всё') {
        const senderCardBalance = getCardBalance(sender.id);
        if (senderCardBalance <= 0) {
          return ctx.reply('✖️ На вашей карте недостаточно средств для перевода.');
        }
        amount = senderCardBalance; // Переводим всю сумму с баланса карты
      } else {
        // Парсим сумму с учетом суффикса "к"
        try {
          amount = parseAmountWithSuffix(amountInput);
        } catch (error) {
          return ctx.reply(`✖️ Ошибка: ${error.message}`);
        }
      }
  
      let recipient;
  
      // Определяем получателя
      if (isReply) {
        // Поиск по ответу на сообщение
        const repliedUserId = ctx.message.reply_to_message.from.id.toString();
        recipient = getUserById(repliedUserId);
      } else {
        // Поиск по numeric_id или card_number
        if (/^\d+$/.test(identifier)) {
          // Поиск по numeric_id
          recipient = getUserByNumericId(parseInt(identifier, 10));
        } else if (/^\d{16}$/.test(identifier)) {
          // Поиск по card_number
          recipient = getUserByCardNumber(identifier);
        }
      }
  
      // Проверка, найден ли получатель
      if (!recipient) {
        return ctx.reply('✖️ Игрок не найден.');
      }

      // Проверяем, заблокированы ли переводы у получателя
      if (await areTransfersBlockedByNumericId(recipient.numeric_id)) {
        return ctx.reply('✖️ Перевод невозможен, так как у получателя заблокированы переводы.');
      }
  
      // Проверка, что отправитель и получатель не один и тот же пользователь
      if (sender.id === recipient.id) {
        return ctx.reply('✖️ Вы не можете перевести деньги самому себе.');
      }
  
      // Создаем транзакцию
      ctx.reply(`💲 Вы начали процесс передачи PF с баланса...`);
  
        // Добавляем cooldown (1 секунда)
        await new Promise(resolve => setTimeout(resolve, 1000));

        await performTransfer(ctx, sender, recipient, amount); // Убираем лишний аргумент 'баланс'
    } catch (error) {
        console.error('Ошибка при обработке команды "передать":', error);
        ctx.reply('Неверный формат.');
    }
}
  
  module.exports = {
    sendHandler,
    createUserLink
  };