const {createCardOperations}=require('../src/telegram/cardOperations');
const {performCardFinance}=require('../db');
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
  getAccountLevel,
  getCardLimitByAccountLevel,
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
async function performCardTopUp(ctx,userId,amountInput){return cardOperation(ctx,{kind:'topup',amountText:amountInput});}

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
        const userBalance = (await getUserBalance(userId, 'PF')); // Получаем основной баланс
        const cardBalance = (await getCardBalance(userId)); // Получаем баланс карты
        
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
        const cardBalance = (await getCardBalance(userId)); // Получаем баланс карты
        
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
      const userBalance = (await getUserBalance(userId, 'PF')); // Получаем основной баланс
  
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
async function performCardWithdrawal(ctx,userId,amountInput){return cardOperation(ctx,{kind:'withdraw',amountText:amountInput});}

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
      const cardBalance = (await getCardBalance(userId)); // Получаем баланс карты
  
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

const cardOperation=createCardOperations({perform:performCardFinance});
