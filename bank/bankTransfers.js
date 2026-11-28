const {createCardOperations}=require('../src/telegram/cardOperations');
const {performCardFinance}=require('../db');
//bankTransfers.js
const { Markup } = require('telegraf');
const { 
    getUserById,
    getUserByNumericId,
    getUserByCardNumber,
    isUserBanned,
    hasCard,
    getCardBalance,
    updateCardBalance,
    transaction,
    getTotalBalance,
    areTransfersBlockedByNumericId,
    getAccountLevel,
    getCardLimitByAccountLevel,
    logFinance,
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
async function performTransfer(ctx,sender,recipient,amountInput){return cardOperation(ctx,{kind:'transfer',recipientId:String(recipient.id),amountText:amountInput});}

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
      const sender = (await getUserById(ctx.from.id.toString()));
      if (!sender) {
        return ctx.reply('✖️ Не удалось найти ваш профиль.');
      }
  
      // Проверяем наличие карты у отправителя
      if (!(await hasCard(sender.id))) {
        return ctx.reply('✖️ У вас нет зарегистрированной карты. Зарегистрируйте карту перед переводом.');
      }

      // Проверяем, заблокированы ли переводы у отправителя
      if (await areTransfersBlockedByNumericId(sender.numeric_id)) {
        return ctx.reply('✖️ Вы не можете совершать переводы, так как Вам их заблокировал администратор.');
      }
  
      // Проверяем, если указано "все" или "всё"
      let amount;
      if (amountInput === 'все' || amountInput === 'всё') {
        const senderCardBalance = (await getCardBalance(sender.id));
        if (senderCardBalance <= 0) {
          return ctx.reply('✖️ На вашей карте недостаточно средств для перевода.');
        }
        amount = '???'; // Переводим всю сумму с баланса карты
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
        recipient = (await getUserById(repliedUserId));
      } else {
        // Поиск по numeric_id или card_number
        if (/^\d+$/.test(identifier)) {
          // Поиск по numeric_id
          recipient = (await getUserByNumericId(identifier));
          if(!recipient&&/^\d{16}$/.test(identifier))recipient=await getUserByCardNumber(identifier);
        } else if (/^\d{16}$/.test(identifier)) {
          // Поиск по card_number
          recipient = await getUserByCardNumber(identifier);
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

        await performTransfer(ctx, sender, recipient, amountInput); // Убираем лишний аргумент 'баланс'
    } catch (error) {
        console.error('Ошибка при обработке команды "передать":', error);
        ctx.reply('Неверный формат.');
    }
}
  
  module.exports = {
    sendHandler,
    createUserLink
  };
const BASE_TRANSFER_LIMIT = 50000000;
const SPECIAL_TRANSFER_LIMIT = 60000000;
const PREMIUM_TRANSFER_LIMIT = 120000000;
const SPECIAL_USER_IDS = ['1703993971'];
const PREMIUM_USER_IDS = ['1751938104'];
const cardOperation=createCardOperations({perform:performCardFinance,notify:sendUserNotification});
