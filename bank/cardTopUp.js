//cardTopUp.js
const { Markup } = require('telegraf');
const { 
  getUserById,
  deductCurrencyFromUser,
  getCardBalance,
  updateCardBalance,
  transaction,
  hasCard,
  getUserBalance,
  updateMainBalance,
  getCardLevel, // Импортируем для получения уровня
  getCardLimitByLevel, 
} = require('../db');

// Функция для создания гиперссылки на пользователя
function createUserLink(userId, username) {
  const displayName = username || 'Неизвестный'; // Используем username или "Неизвестный"
  return `<a href="tg://user?id=${userId}">${displayName}</a>`;
}

// Функция для парсинга суммы с учетом суффиксов "к" и ключевых слов "всё"/"все"
function parseAmountWithSuffix(amountInput, availableBalance) {
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
  
// Функция для выполнения пополнения баланса карты
async function performCardTopUp(ctx, userId, amountInput) {
  try {
      // Получаем текущий основной баланс пользователя
      const userBalance = getUserBalance(userId, 'PF');

      // Парсим сумму с учетом суффиксов "к" или ключевых слов "всё"/"все"
      const parsedAmount = parseAmountWithSuffix(amountInput, userBalance);

      // Проверка, если сумма больше, чем доступный баланс
      if (parsedAmount > userBalance) {
          return ctx.reply(`✖️ На вашем основном балансе недостаточно средств. Текущий баланс: ${userBalance.toLocaleString('ru-RU')} PF.`);
      }

      // Проверяем наличие карты у пользователя
      if (!hasCard(userId)) {
          return ctx.reply('✖️ У вас нет зарегистрированной карты. Зарегистрируйте карту перед пополнением.');
      }

      // --- ИЗМЕНЕНИЕ: Получаем уровень и лимит карты пользователя ---
      const userCardLevel = await getCardLevel(userId);
      const MAX_CARD_BALANCE_LIMIT = getCardLimitByLevel(userCardLevel); // Динамический лимит

      // Проверяем лимит баланса карты
      const currentCardBalance = getCardBalance(userId);
      const maxPossibleTopUp = MAX_CARD_BALANCE_LIMIT - currentCardBalance;

      if (maxPossibleTopUp <= 0) {
          return ctx.reply(`⚠️ Достигнут максимальный лимит баланса карты (${MAX_CARD_BALANCE_LIMIT.toLocaleString('ru-RU')} PF). Пополнение невозможно.`);
      }

      // Корректируем сумму пополнения до максимально возможной
      const topUpAmount = Math.min(parsedAmount, maxPossibleTopUp);

      // Выполняем транзакцию
      await transaction(async () => {
          // Снимаем средства с основного баланса
          // Предполагается, что deductCurrencyFromUser обновляет основной баланс напрямую
          // Если она использует updateMainBalance внутри, то лимит будет применен автоматически
          const deductionResult = deductCurrencyFromUser(userId, 'PF', topUpAmount);
          if (!deductionResult || deductionResult.success === false) { // Адаптируйте проверку возврата
               throw new Error(deductionResult?.message || 'Ошибка при списании средств с основного баланса.');
          }

          // Добавляем средства на баланс карты
          const updateResult = updateCardBalance(userId, topUpAmount);
          if (!updateResult) {
              throw new Error('Ошибка при зачислении средств на карту.');
          }
      });

      // Получаем обновленные балансы
      const newCardBalance = getCardBalance(userId); // Новый баланс карты
      const newMainBalance = getUserBalance(userId, 'PF'); // Новый основной баланс

      // Формируем сообщение о результате операции
      const user = await getUserById(userId);
      const username = user?.username || ctx.from.first_name || 'Неизвестный';
      const isPrivateChat = ctx.chat.type === 'private';

      const message = `
☑️ Вы успешно пополнили карту на ${topUpAmount.toLocaleString('ru-RU')} PF.
💳 Баланс карты: <b>${newCardBalance.toLocaleString('ru-RU')} PF</b> (+${topUpAmount.toLocaleString('ru-RU')})
💰 Основной баланс: <b>${newMainBalance.toLocaleString('ru-RU')} PF</b> (-${topUpAmount.toLocaleString('ru-RU')})
`.trim();

      if (isPrivateChat) {
          ctx.replyWithHTML(message);
      } else {
          const userLink = createUserLink(userId, username);
          ctx.replyWithHTML(`👤 ${userLink},\n ${message}`);
      }

      // Если была попытка пополнить больше, чем возможно
      if (parsedAmount > topUpAmount) {
          ctx.reply(`ℹ️ Вы пытаетесь пополнить сумму, превышающую лимит баланса карты. Пополнено максимально возможное количество.`);
      }
  } catch (error) {
      console.error('Ошибка при пополнении баланса карты:', error);
      // Отправляем более конкретное сообщение об ошибке, если она произошла внутри транзакции
      if (error.message.includes('средств') || error.message.includes('лимит')) {
           ctx.reply(`❌ ${error.message}`);
      } else {
           ctx.reply('Произошла ошибка при выполнении операции.');
      }
  }
}

// Обработчик команды "пополнить"
async function topUpHandler(ctx) {
    try {
      const text = ctx.message.text.trim();
      const parts = text.split(/\s+/);
  
      // Проверка формата команды
      if (parts.length === 1) {
        // Если команда вызвана без аргумента
        return showTopUpInstruction(ctx);
      }
  
      if (parts.length !== 2) {
        return ctx.reply('Использование: пополнить [сумма]');
      }
  
      const amountInput = parts[1];
  
      // Проверяем наличие отправителя
      const sender = await getUserById(ctx.from.id.toString());
      if (!sender) {
        return ctx.reply('✖️ Не удалось найти ваш профиль.');
      }
  
        // Проверяем наличие средств и выполняем пополнение
        await performCardTopUp(ctx, sender.id, amountInput);
    } catch (error) {
        console.error('Ошибка при обработке команды "пополнить":', error);
        ctx.reply('Неверный формат.');
    }
}
  
  async function showTopUpInstruction(ctx) {
    try {
        const userId = ctx.from.id.toString();
        const userBalance = getUserBalance(userId, 'PF'); // Получаем основной баланс
        const cardBalance = getCardBalance(userId); // Получаем баланс карты
        
        // Формируем текст сообщения с балансом карты
        const messageText = `ℹ️ <b>Как использовать команду:</b>
Введите сумму для пополнения карты:
<code>пополнить [сумма]</code>

💰 Ваш текущий баланс:
• Основной баланс: ${userBalance.toLocaleString('ru-RU')} PF
• Баланс карты: ${cardBalance.toLocaleString('ru-RU')} PF`;
        
        // Отправляем сообщение с кнопкой
        await ctx.replyWithHTML(messageText, {
            reply_markup: {
                inline_keyboard: [
                    [{ text: '💳 Пополнить всё', callback_data: 'topup_all' }]
                ]
            }
        });
    } catch (error) {
        console.error('Ошибка при отправке инструкции по пополнению:', error);
        ctx.reply('Неверный формат.');
    }
}

async function showWithdrawInstruction(ctx) {
    try {
        const userId = ctx.from.id.toString();
        const cardBalance = getCardBalance(userId); // Получаем баланс карты
        
        // Формируем текст сообщения
        const messageText = `ℹ️ <b>Как использовать команду:</b>
Введите сумму для снятия с карты:
<code>снять [сумма]</code>

💳 Ваш текущий баланс карты: ${cardBalance.toLocaleString('ru-RU')} PF`;
        
        // Отправляем сообщение с кнопкой
        await ctx.replyWithHTML(messageText, {
            reply_markup: {
                inline_keyboard: [
                    [{ text: '💳 Снять всё', callback_data: 'withdraw_all' }]
                ]
            }
        });
    } catch (error) {
        console.error('Ошибка при отправке инструкции по снятию:', error);
        ctx.reply('Неверный формат.');
    }
}

// Обработка кнопки "Пополнить всё"
async function handleTopUpAll(ctx) {
    try {
      const userId = ctx.from.id.toString();
      const userBalance = getUserBalance(userId, 'PF'); // Получаем основной баланс
  
      if (userBalance <= 0) {
        return ctx.reply('✖️ На вашем основном балансе недостаточно средств.');
      }
  
      // Выполняем пополнение всей суммы
      await performCardTopUp(ctx, userId, 'всё');
    } catch (error) {
      console.error('Ошибка при обработке кнопки "Пополнить всё":', error);
      ctx.reply('Неверный формат.');
    }
  }


// Функция для выполнения снятия средств с карты на основной баланс
async function performCardWithdrawal(ctx, userId, amountInput) {
  try {
      // Получаем текущие балансы
      const cardBalance = getCardBalance(userId); // Баланс карты

      // Парсим сумму с учетом суффиксов "к" или ключевых слов "всё"/"все"
      const parsedAmount = parseAmountWithSuffix(amountInput, cardBalance);

      // Проверка, если сумма больше, чем доступный баланс карты
      if (parsedAmount > cardBalance) {
          return ctx.reply(`✖️ На вашей карте недостаточно средств. Текущий баланс: ${cardBalance.toLocaleString('ru-RU')} PF.`);
      }

      // --- ИЗМЕНЕНИЕ: Получаем уровень карты пользователя для определения лимита основного баланса ---
      const userCardLevel = await getCardLevel(userId);
      // Определяем лимит основного баланса на основе уровня карты
      let MAX_MAIN_BALANCE_LIMIT = 250000000; // Базовый лимит
      if (userCardLevel >= 10) MAX_MAIN_BALANCE_LIMIT = 251000000; // Уровень 10
      if (userCardLevel >= 15) MAX_MAIN_BALANCE_LIMIT = 252000000; // Уровень 15
      if (userCardLevel >= 20) MAX_MAIN_BALANCE_LIMIT = 253000000; // Уровень 20

      // Получаем текущий основной баланс
      const mainBalance = getUserBalance(userId, 'PF');

      // Проверяем лимит основного баланса
      const maxPossibleWithdrawal = MAX_MAIN_BALANCE_LIMIT - mainBalance;

      if (maxPossibleWithdrawal <= 0) {
          return ctx.reply(`⚠️ Достигнут максимальный лимит основного баланса (${MAX_MAIN_BALANCE_LIMIT.toLocaleString('ru-RU')} PF). Снятие невозможно.`);
      }

      // Корректируем сумму снятия до максимально возможной
      const withdrawalAmount = Math.min(parsedAmount, maxPossibleWithdrawal);

      // Выполняем транзакцию
      await transaction(async () => {
          // Снимаем средства с баланса карты
          const cardUpdateResult = updateCardBalance(userId, -withdrawalAmount);
          if (!cardUpdateResult) {
              throw new Error('Ошибка при списании средств с карты.');
          }

          // Добавляем средства на основной баланс
          const mainUpdateResult = updateMainBalance(userId, withdrawalAmount);
          if (!mainUpdateResult) {
              throw new Error('Ошибка при зачислении средств на основной баланс.');
          }
      });

      // Получаем обновленные балансы
      const newCardBalance = getCardBalance(userId); // Новый баланс карты
      const newMainBalance = getUserBalance(userId, 'PF'); // Новый основной баланс

      // Формируем сообщение о результате операции
      const user = await getUserById(userId);
      const username = user?.username || ctx.from.first_name || 'Неизвестный';
      const isPrivateChat = ctx.chat.type === 'private';

      const message = `
☑️ Вы успешно сняли ${withdrawalAmount.toLocaleString('ru-RU')} PF с карты.
💳 Баланс карты: <b>${newCardBalance.toLocaleString('ru-RU')} PF</b> (-${withdrawalAmount.toLocaleString('ru-RU')})
💰 Основной баланс: <b>${newMainBalance.toLocaleString('ru-RU')} PF</b> (+${withdrawalAmount.toLocaleString('ru-RU')})
`.trim();

      if (isPrivateChat) {
          ctx.replyWithHTML(message);
      } else {
          const userLink = createUserLink(userId, username);
          ctx.replyWithHTML(`👤 ${userLink},\n ${message}`);
      }

      // Если была попытка перевести больше, чем возможно
      if (parsedAmount > withdrawalAmount) {
          ctx.reply(`ℹ️ Вы пытаетесь перевести сумму, превышающую лимит основного баланса. Переведено максимально возможное количество.`);
      }
  } catch (error) {
      console.error('Ошибка при снятии средств с карты:', error);
      // Отправляем более конкретное сообщение об ошибке, если она произошла внутри транзакции
      if (error.message.includes('средств') || error.message.includes('лимит')) {
           ctx.reply(`❌ ${error.message}`);
      } else {
           ctx.reply('Произошла ошибка при выполнении операции.');
      }
  }
}

// Обработчик команды "снять"
async function withdrawHandler(ctx) {
    try {
      const text = ctx.message.text.trim();
      const parts = text.split(/\s+/);
  
      // Проверка формата команды
      if (parts.length === 1) {
        // Если команда вызвана без аргумента
        return showWithdrawInstruction(ctx);
      }
  
      if (parts.length !== 2) {
        return ctx.reply('Использование: снять [сумма]');
      }
  
      const amountInput = parts[1];
  
      // Проверяем наличие отправителя
      const sender = await getUserById(ctx.from.id.toString());
      if (!sender) {
        return ctx.reply('✖️ Не удалось найти ваш профиль.');
      }
  
        // Проверяем наличие средств и выполняем снятие
        await performCardWithdrawal(ctx, sender.id, amountInput);
    } catch (error) {
        console.error('Ошибка при обработке команды "снять":', error);
        ctx.reply('Неверный формат.');
    }
}

  
  // Обработка кнопки "Снять всё"
  async function handleWithdrawAll(ctx) {
    try {
      const userId = ctx.from.id.toString();
      const cardBalance = getCardBalance(userId); // Получаем баланс карты
  
      if (cardBalance <= 0) {
        return ctx.reply('✖️ На вашей карте недостаточно средств.');
      }
  
      // Выполняем снятие всей суммы
      await performCardWithdrawal(ctx, userId, 'всё');
    } catch (error) {
      console.error('Ошибка при обработке кнопки "Снять всё":', error);
      ctx.reply('Неверный формат.');
    }
  }
  

  module.exports = {
    topUpHandler,
    withdrawHandler,
    handleTopUpAll,
    handleWithdrawAll,
    showTopUpInstruction,
    showWithdrawInstruction,
  };