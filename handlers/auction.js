//auction.js
const { Markup } = require('telegraf');
const {
  getUserBalances,
  updateUserBalance,
  getUserById,
  getAuctionState,
  saveAuctionState,
} = require('../db');

const fs = require('fs');
const path = require('path');

// Функция для создания гиперссылки на пользователя
function createUserLink(userId) {
  if (!userId) return 'Неизвестный';
  const user = getUserById(userId);
  if (!user) return 'Неизвестный';
  const username = user.username || 'Без имени';
  const displayName = username.replace(/</g, '<').replace(/>/g, '>');
  return `<a href="tg://user?id=${userId}">${displayName}</a>`;
}

// Функция для экспорта ставок последнего аукциона в файл
async function exportAuctionBids(ctx) {
  try {
    const currentAuction = getAuctionState();
    if (!currentAuction) {
      return await ctx.reply('❌ Аукцион еще не запущен или данные отсутствуют.');
    }

    const bids = currentAuction.bids;
    if (!Array.isArray(bids) || bids.length === 0) {
      return await ctx.reply('❌ Нет данных о ставках для экспорта.');
    }

    let fileContent = `Список ставок за последний аукцион:\n\n`;
    bids.forEach((bid, index) => {
      const user = getUserById(bid.userId);
      const username = user?.username || 'Неизвестный';
      const numericId = user?.numeric_id || 'Неизвестно';
      fileContent += `${index + 1}. ${username} [ID: ${numericId}] - ${bid.amount} PF\n`;
    });

    const fileName = `auction_bids_${Date.now()}.txt`;
    const filePath = path.join(__dirname, fileName);
    fs.writeFileSync(filePath, fileContent);

    await ctx.replyWithDocument({
      source: filePath,
      filename: fileName,
    });

    fs.unlinkSync(filePath);
    console.log(`[LOG] Файл со ставками успешно отправлен.`);
  } catch (error) {
    console.error('Ошибка при экспорте ставок аукциона:', error);
    await ctx.reply('Произошла ошибка при экспорте ставок. Попробуйте позже.');
  }
}

// Инициализация состояния аукциона
let currentAuction = getAuctionState() || {
  prize: 'секрет',
  minBet: 1000,
  minStep: 500,
  highestBid: null,
  highestBidder: null,
  participants: [],
  bids: [],
  isFinished: false,
};

// Если аукцион не завершен, сохраняем его состояние при запуске
if (!currentAuction.isFinished) {
  saveAuctionState(currentAuction);
}

// Функция завершения аукциона
async function endAuction(ctx) {
  try {
    currentAuction = getAuctionState() || {
      prize: 'секрет',
      minBet: 1000,
      minStep: 500,
      highestBid: null,
      highestBidder: null,
      participants: [],
      bids: [],
      isFinished: false,
    };

    if (currentAuction.isFinished) {
      return await ctx.reply('❌ Аукцион уже завершен.', { parse_mode: 'HTML' });
    }

    let message = '';
    let totalAuctionBets = 0;

    const maxBidEntry = currentAuction.bids.reduce((max, bid) => {
      totalAuctionBets += bid.amount;
      return bid.amount > (max?.amount || 0) ? bid : max;
    }, null);

    if (maxBidEntry) {
      const winnerId = maxBidEntry.userId;
      const winnerLink = createUserLink(winnerId);
      const winnerUser = getUserById(winnerId);
      const numericId = winnerUser?.numeric_id || 'Неизвестно';

      const winnerTotalBets = currentAuction.bids
        .filter(bid => bid.userId === winnerId)
        .reduce((sum, bid) => sum + bid.amount, 0);

      message += `🎉 Аукцион завершен!\n`;
      message += `🎁 Лот: ${currentAuction.prize}\n`;
      message += `👑 Победитель: ${winnerLink} [ID: ${numericId}]\n`;
      message += `💰 Сумма затраченных ставок победителем: ${winnerTotalBets} PF\n`;
      message += `📈 Общая сумма всех ставок аукциона: ${totalAuctionBets} PF\n`;

      // Получаем последние 2 ставки (которые не возвращаются)
      const lastTwoBids = [...currentAuction.bids].reverse().slice(0, 2);
      const noRefundUserIds = new Set(lastTwoBids.map(bid => bid.userId));

      // Возвращаем средства всем участникам, кроме двух последних
      for (const participant of currentAuction.participants) {
        if (!noRefundUserIds.has(participant.userId)) {
          const totalBets = currentAuction.bids
            .filter(bid => bid.userId === participant.userId)
            .reduce((sum, bid) => sum + bid.amount, 0);
          if (totalBets > 0) {
            updateUserBalance(participant.userId, totalBets);
            console.log(`[LOG] Возвращено ${totalBets} PF пользователю ID:${participant.userId}`);
          }
        }
      }
    } else {
      message += `❌ Аукцион завершен без победителя.\n`;
      message += `🎁 Лот: ${currentAuction.prize}\n`;
      message += `ℹ️ Никто не сделал ставок или условия не были выполнены.\n`;

      // Возвращаем все средства участникам
      for (const participant of currentAuction.participants) {
        const totalBets = currentAuction.bids
          .filter(bid => bid.userId === participant.userId)
          .reduce((sum, bid) => sum + bid.amount, 0);
        if (totalBets > 0) {
          updateUserBalance(participant.userId, totalBets);
          console.log(`[LOG] Возвращено ${totalBets} PF пользователю ID:${participant.userId}`);
        }
      }
    }

    currentAuction.isFinished = true;
    saveAuctionState(currentAuction);

    await ctx.reply(message, { parse_mode: 'HTML' });
  } catch (error) {
    console.error('Ошибка при завершении аукциона:', error);
    await ctx.reply('Произошла ошибка при завершении аукциона. Попробуйте позже.');
  }
}

async function startNewAuction(ctx, minBet = 1000, minStep = 500, prize = 'секрет') {
  try {
    currentAuction = {
      prize: prize,
      minBet: minBet,
      minStep: minStep,
      highestBid: null,
      highestBidder: null,
      participants: [],
      bids: [],
      isFinished: false,
    };

    saveAuctionState(currentAuction);
    const message = `
🎉 <b>Новый аукцион запущен!</b>
🎁 Лот: ${prize}
💰 Первоначальная ставка: ${minBet} PF
📈 Минимальный шаг повышения: ${minStep} PF
`.trim();
    await ctx.reply(message, { parse_mode: 'HTML' });
  } catch (error) {
    console.error('Ошибка при запуске нового аукциона:', error);
    await ctx.reply('Произошла ошибка при запуске нового аукциона. Попробуйте позже.');
  }
}

// Функция для отображения текущего состояния аукциона
function getAuctionStatus(ctx) {
  currentAuction = getAuctionState() || {
    prize: 'секрет',
    minBet: 1000,
    minStep: 500,
    highestBid: null,
    highestBidder: null,
    participants: [],
    bids: [],
    isFinished: false,
  };

  const { prize, minBet, minStep, highestBid, highestBidder, bids, isFinished } = currentAuction;
  const safeBids = Array.isArray(bids) ? bids : [];

  let status = `📊 Информация об аукционе: \n`;
  status += isFinished ? `❗️ Статус: Завершен\n` : `✅ Статус: Активен\n`;
  status += `\n🎁 Лот: ${prize}\n`;
  status += `📈 Минимальный шаг повышения: ${minStep} PF\n`;

  if (safeBids.length > 0) {
      status += `\n👥 Последние ставки (3):\n`;
      const lastBids = [...safeBids].reverse().slice(0, 3);
      lastBids.forEach((bid, index) => {
          const userId = bid?.userId;
          const isWinner = isFinished && index === 0;
          status += `${index + 1}. ${userId ? createUserLink(userId) : 'Неизвестный'} - ${bid.amount} PF${isWinner ? ' 🏆' : ''}\n`;
      });
  } else {
      status += `\n👥 Ставок пока нет.\n`;
  }

  let keyboard = {};
  if (!isFinished) {
    const nextBidAmount = highestBid ? highestBid + minStep : minBet;
    keyboard = Markup.inlineKeyboard([
      Markup.button.callback(`Перебить ставку (${nextBidAmount})`, `make_bid_${nextBidAmount}`),
    ]);
  }

  return { status, keyboard };
}

async function auctionHandler(ctx) {
  try {
    let args = [];
    if (ctx.message && ctx.message.text) {
      args = ctx.message.text.split(/\s+/).slice(1);
    } else if (ctx.callbackQuery) {
      args = [];
    } else {
      return await ctx.reply('❌ Некорректный запрос.');
    }

    const userId = ctx.from.id.toString();
    const telegramId = ctx.from.id;

    currentAuction = getAuctionState() || {
      prize: 'секрет',
      minBet: 1000,
      minStep: 500,
      highestBid: null,
      highestBidder: null,
      participants: [],
      bids: [],
      isFinished: false,
    };

    if (args.length === 0) {
      const { status, keyboard } = getAuctionStatus(ctx);
      const imagePath = path.join(__dirname, '..', 'images', 'labubu.jpg');

      return await ctx.replyWithPhoto(
        { source: imagePath },
        {
          caption: status,
          parse_mode: 'HTML',
          ...keyboard
        }
      );
    }

    const amount = parseInt(args[0]);
    if (isNaN(amount) || amount <= 0) {
      return await ctx.reply('❌ Укажите корректную сумму ставки.');
    }

    const balances = getUserBalances(userId);
    const userBalance = balances.pfBalance;
    if (userBalance < amount) {
      return await ctx.reply('❌ Недостаточно средств для размещения ставки.');
    }

    const validation = validateBet(amount);
    if (validation.errorMessage) {
      return await ctx.reply(validation.errorMessage, {
        parse_mode: 'HTML',
        reply_markup: validation.keyboard,
      });
    }

    try {
      updateUserBalance(userId, -amount);
    } catch (error) {
      console.error(`[ERROR] Ошибка при списании средств для пользователя ${userId}:`, error);
      return await ctx.reply('❌ Произошла ошибка при списании средств.');
    }

    const result = placeBid(userId, telegramId, amount, ctx);
    saveAuctionState(currentAuction);

    const keyboard = Markup.inlineKeyboard([
      Markup.button.callback('📊 Аукцион', 'auction'),
    ]);

    await ctx.reply(result, {
      parse_mode: 'HTML',
      ...keyboard,
    });
  } catch (error) {
    console.error('Ошибка при обработке команды аукциона:', error);
    await ctx.reply('Произошла ошибка. Попробуйте позже.');
  }
}

function validateBet(amount) {
  if (!currentAuction) {
    return {
      errorMessage: `❌ Аукцион еще не запущен. Дождитесь начала аукциона.`,
      keyboard: null,
    };
  }

  if (currentAuction.isFinished) {
    return {
      errorMessage: `❌ Аукцион завершен. Новые ставки больше не принимаются.`,
      keyboard: null,
    };
  }

  const { minBet, minStep, highestBid } = currentAuction;

  if (!highestBid) {
    if (amount < minBet) {
      const suggestedAmount = minBet;
      const keyboard = Markup.inlineKeyboard([
        Markup.button.callback(`💰 Перебить ставку ${suggestedAmount}`, `make_bid_${suggestedAmount}`),
      ]);
      return {
        errorMessage: `❌ Минимальная ставка: ${minBet}. Ваша ставка слишком мала.`,
        keyboard: keyboard.reply_markup,
      };
    }
  } else {
    const requiredAmount = highestBid + minStep;
    if (amount < requiredAmount) {
      const suggestedAmount = requiredAmount;
      const keyboard = Markup.inlineKeyboard([
        Markup.button.callback(`💰 Перебить ставку ${suggestedAmount}`, `make_bid_${suggestedAmount}`),
      ]);
      return {
        errorMessage: `❌ Минимальный шаг повышения ставки: ${minStep}. Ваша ставка должна быть больше или равна ${requiredAmount}.`,
        keyboard: keyboard.reply_markup,
      };
    }
  }

  return {
    errorMessage: null,
    keyboard: null,
  };
}

// Функция для возврата средств пользователю
async function refundUser(userId, amount, newBidderId, newBidAmount, ctx) {
  try {
    // Возвращаем средства пользователю
    updateUserBalance(userId, amount);
    
    // Получаем данные пользователя для уведомления
    const user = getUserById(userId);
    if (!user || user.isBlocked) {
      console.warn(`[WARN] Пользователь ID:${userId} заблокирован или недоступен для возврата.`);
      return;
    }

    const newBidderLink = createUserLink(newBidderId);
    const message = `💰 Вам возвращена ставка в размере ${amount} PF!\n\n🔺 Вашу ставку размером ${amount} PF перебил игрок: ${newBidderLink}`;

    // Создаем клавиатуру с кнопкой "Аукцион"
    const keyboard = Markup.inlineKeyboard([
      Markup.button.callback('📊 Аукцион', 'auction'),
    ]);

    // Отправляем уведомление пользователю
    await ctx.telegram.sendMessage(userId, message, {
      parse_mode: 'HTML',
      reply_markup: keyboard.reply_markup,
    });

    console.log(`[LOG] Возврат ${amount} PF пользователю ID:${userId} успешно выполнен.`);
  } catch (error) {
    console.error(`[ERROR] Ошибка при возврате средств пользователю ID:${userId}:`, error);
  }
}

function placeBid(userId, telegramId, amount, ctx) {
  if (!userId || !telegramId) {
    console.error('[ERROR] Неверный userId или telegramId при размещении ставки.');
    return '❌ Произошла ошибка. Попробуйте позже.';
  }

  if (!Array.isArray(currentAuction.bids)) {
    currentAuction.bids = [];
  }

  const logMessage = `
[LOG] Размещение новой ставки:
• Игрок: ${createUserLink(userId)}
• Сумма: ${amount} PF
• Telegram ID: ${telegramId}
`.trim();
  console.log(logMessage);

  // Добавляем новую ставку в историю с флагом refunded по умолчанию false
  const newBid = { 
    userId, 
    telegramId, 
    amount,
    refunded: false // Флаг для отслеживания возврата
  };
  currentAuction.bids.push(newBid);
  
  // Обновляем текущую максимальную ставку и победителя
  currentAuction.highestBid = amount;
  currentAuction.highestBidder = { userId, telegramId };

  // Добавляем пользователя в список участников, если его там еще нет
  if (!currentAuction.participants.some(p => p.userId === userId)) {
    currentAuction.participants.push({ userId, telegramId });
    console.log(`[LOG] Новый участник добавлен в аукцион: ID:${userId}, Telegram ID:${telegramId}`);
  }

  // Логика возврата средств для ставок, которые перешли на 3-е место с конца
  // Только если у нас уже есть минимум 3 ставки
  if (currentAuction.bids.length >= 3) {
    // Индекс ставки, которая должна быть возвращена (3-я с конца)
    const refundIndex = currentAuction.bids.length - 3;
    const bidToRefund = currentAuction.bids[refundIndex];

    // Проверяем, что ставка еще не была возвращена
    if (!bidToRefund.refunded) {
      // Возвращаем средства пользователю
      refundUser(bidToRefund.userId, bidToRefund.amount, userId, amount, ctx)
        .catch(error => {
          console.error(`[ERROR] Ошибка при попытке возврата средств пользователю ID:${bidToRefund.userId}:`, error);
        });
      
      // Помечаем ставку как возвращенную
      bidToRefund.refunded = true;
    }
  }

  // Уведомляем предыдущего участника, если его ставка была перебита
  if (currentAuction.bids.length > 1) {
    const previousBidder = currentAuction.bids[currentAuction.bids.length - 2];
    if (previousBidder && previousBidder.telegramId !== telegramId) {
      notifyPreviousBidder(previousBidder.telegramId, amount, ctx)
        .then(() => {
          console.log(`[LOG] Уведомление успешно отправлено игроку Telegram ID:${previousBidder.telegramId}`);
        })
        .catch((error) => {
          console.error(`[ERROR] Не удалось отправить уведомление игроку Telegram ID:${previousBidder.telegramId}:`, error);
        });
    }
  }

  return `✅ Вы перебили ставку!
💰 Текущая ставка: ${amount} PF
👤 Последний участник: ${createUserLink(userId)}`;
}

async function notifyPreviousBidder(telegramId, newBidAmount, ctx) {
  try {
    const recipient = getUserById(telegramId);
    if (!recipient || recipient.isBlocked) {
      console.warn(`[WARN] Пользователь Telegram ID:${telegramId} заблокирован или недоступен.`);
      return;
    }

    const message = `🔔 Ваша ставка в аукционе была перебита!`;

    const keyboard = Markup.inlineKeyboard([
      Markup.button.callback('📊 Аукцион', 'auction'),
    ]);

    await ctx.telegram.sendMessage(telegramId, message, {
      parse_mode: 'HTML',
      reply_markup: keyboard.reply_markup,
    });

    console.log(`[LOG] Уведомление успешно отправлено игроку Telegram ID:${telegramId}`);
  } catch (error) {
    console.error(`[ERROR] Не удалось отправить уведомление пользователю Telegram ID:${telegramId}:`, error);
    throw error;
  }
}

async function handleMakeBid(ctx) {
  try {
    const userId = ctx.from.id.toString();
    const telegramId = ctx.from.id;
    const callbackData = ctx.callbackQuery.data;
    const amount = parseInt(callbackData.split('_')[2]);

    console.log(`[LOG] Получен запрос на размещение ставки от ID:${userId}, Telegram ID:${telegramId} на сумму ${amount}`);

    currentAuction = getAuctionState() || {
      prize: 'секрет',
      minBet: 1000,
      minStep: 500,
      highestBid: null,
      highestBidder: null,
      participants: [],
      bids: [],
      isFinished: false,
    };

    const balances = getUserBalances(userId);
    const userBalance = balances.pfBalance;

    if (userBalance < amount) {
      console.warn(`[WARN] Недостаточно средств у ID:${userId} для ставки ${amount}`);
      return await ctx.reply('❌ Недостаточно средств для размещения ставки.');
    }

    const validation = validateBet(amount);
    if (validation.errorMessage) {
      console.warn(`[WARN] Невалидная ставка от ID:${userId}: ${validation.errorMessage}`);
      return await ctx.reply(validation.errorMessage, {
        parse_mode: 'HTML',
        reply_markup: validation.keyboard,
      });
    }

    updateUserBalance(userId, -amount);
    console.log(`[LOG] Успешно списано ${amount} PF с баланса ID:${userId}`);

    const result = placeBid(userId, telegramId, amount, ctx);
    saveAuctionState(currentAuction);

    const keyboard = Markup.inlineKeyboard([
      Markup.button.callback('📊 Аукцион', 'auction'),
    ]);

    await ctx.reply(result, {
      parse_mode: 'HTML',
      ...keyboard,
    });

    console.log(`[LOG] Ставка успешно обработана`);
  } catch (error) {
    console.error('Ошибка при обработке кнопки ставки:', error);
    await ctx.reply('Произошла ошибка. Попробуйте позже.');
  }
}

// Экспортируем обработчики
module.exports = {
  auctionHandler,
  endAuction,
  handleMakeBid,
  startNewAuction,
  exportAuctionBids
};