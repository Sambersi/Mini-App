"use strict";
const { createCanvas, loadImage } = require('canvas');
const path = require('path');
const fs = require('fs');
const { saveDiceRound, isDiceChat, saveDiceBet, getUserById, updateUserBalance, updateDiceResults, getDiceBetsByRoundId } = require('../db');
const { generateDiceResultsImage } = require('./generateDiceResultsImage');
const { Markup } = require('telegraf');

class DiceGame {
  constructor() {
    if (!DiceGame.instance) {
      this.chatRounds = {};
      this.roundTimers = {};
      this.cancelRoundTimers = {};
      this.isRoundCanceled = {};
      this.warningTimers = {}; // Новый объект для хранения таймеров предупреждений
      DiceGame.instance = this;
    }
    return DiceGame.instance;
  }

  startRound(chatId, bot, firstBetAmount) {
    const activeRounds = this.chatRounds[chatId] || [];
    if (activeRounds.length >= 3) {
      return { 
        success: false, 
        message: '❕ В этом чате уже запущено максимальное количество раундов [3].',
        parse_mode: 'HTML' // Добавляем режим разбора HTML
      };
    }
    const existingRound = activeRounds.find((round) => round.roundAmount === firstBetAmount);
    if (existingRound) {
        return { 
            success: false, 
            message: `❕ Раунд с суммой ставки ${firstBetAmount} PF уже запущен.` 
        };
    }
    const startTime = Date.now();
    const endTime = startTime + 30 * 1000;
    const roundId = `round_${startTime}_${Math.random().toString(36).substr(2, 9)}`;
    saveDiceRound(chatId, startTime, endTime, roundId);
    const newRound = {
        roundId,
        startTime,
        endTime,
        participants: {},
        maxParticipants: 5,
        roundAmount: firstBetAmount,
        warnedFiveSeconds: false, // Флаг для отслеживания предупреждения
    };
    if (!this.chatRounds[chatId]) {
        this.chatRounds[chatId] = [];
    }
    this.chatRounds[chatId].push(newRound);

    const participateButton = Markup.inlineKeyboard([
        Markup.button.callback(
            `Участвовать (${firstBetAmount.toLocaleString('ru-RU')} PF)`,
            `participate_${roundId}`
        ),
    ]);

    bot.telegram.sendMessage(
        chatId,
        `<b>🎲 Новый раунд дайса начался!</b>\n\n<b>💰 Ставки принимаются в размере:</b> ${firstBetAmount.toLocaleString('ru-RU')} PF.\n<b>⏳ Время на регистрацию:</b> 30 секунд.`,
        {
            parse_mode: 'HTML',
            ...participateButton,
        }
    );

    const timerKey = `${chatId}_${roundId}`;

    // Таймер завершения раунда
    this.roundTimers[timerKey] = setTimeout(async () => {
        await this.endRound(bot, chatId, roundId);
    }, 30 * 1000);

    // Таймер проверки участников
    this.cancelRoundTimers[timerKey] = setTimeout(async () => {
        const activeRounds = this.chatRounds[chatId] || [];
        const round = activeRounds.find((r) => r.roundId === roundId);
        if (
          round &&
          Object.keys(round.participants || {}).length === 0 &&
          !this.isRoundCanceled[timerKey] &&
          Date.now() >= (round?.endTime || 0)
      ) {
          this.isRoundCanceled[timerKey] = true;
          await this.returnBetsToUsers(chatId, roundId);
          const roundAmount = round.roundAmount.toLocaleString('ru-RU');
          await bot.telegram.sendMessage(
              chatId,
              `<b>❕ Раунд дайса (${roundAmount}) PF отменен из-за недостатка участников. Ставки возвращены.</b>`,
              { parse_mode: 'HTML' }
          );
          this.resetRound(chatId, roundId);
      }
    }, 30 * 1000);

  // Таймер предупреждения за 5 секунд
this.warningTimers[timerKey] = setTimeout(async () => {
  const activeRounds = this.chatRounds[chatId] || [];
  const round = activeRounds.find((r) => r.roundId === roundId);
  if (round && !round.warnedFiveSeconds) {
      round.warnedFiveSeconds = true; // Устанавливаем флаг
      await bot.telegram.sendMessage(
          chatId,
          `<b>⏳ До итогов раунда (${firstBetAmount.toLocaleString('ru-RU')} PF) осталось менее 5 секунд!</b>`,
          { parse_mode: 'HTML' }
      );
  }
}, 25 * 1000); // Запускаем за 5 секунд до конца

    return { 
        success: true, 
        message: `<b>🎲 Новый раунд дайса начался!</b>`, 
        round: newRound 
    };
}

  handleBet = async (userId, usernameFromTelegram, amountInput, chatId, bot) => {
    if (typeof amountInput !== 'string' || amountInput == null) {
      amountInput = String(amountInput || '');
    }

    let amount;
    try {
      amount = parseBetAmount(amountInput);
    } catch (error) {
      return { success: false, message: error.message };
    }

    const MIN_BET = 100;
    const MAX_BET = 4000000;

    if (amount < MIN_BET) {
      return { success: false, message: `💢 Минимальная ставка — ${MIN_BET} PF.` };
    }
    if (amount > MAX_BET) {
      return { success: false, message: `💢 Максимальная ставка — ${MAX_BET.toLocaleString('ru-RU')} PF.` };
    }

    const user = await getUserById(userId);
    if (!user || user.balance < amount) {
      return { success: false, message: '❕ Недостаточно средств для ставки.' };
    }

    const username = user?.username || usernameFromTelegram || 'Неизвестный';
    const activeRounds = this.chatRounds[chatId] || [];
    let matchingRound = activeRounds.find((round) => round.roundAmount === amount && Date.now() < round.endTime);

    if (!matchingRound) {
      const startResult = this.startRound(chatId, bot, amount);
      if (!startResult.success) {
        return { success: false, message: startResult.message || '❕ Произошла ошибка при регистрации раунда.' };
      }
      const updatedActiveRounds = this.chatRounds[chatId] || [];
      matchingRound = updatedActiveRounds.find((round) => round.roundAmount === amount);
    }

    const currentRound = matchingRound;

    if (Date.now() > (currentRound?.endTime || 0)) {
      return { success: false, message: '❕ Время регистрации ставок истекло.' };
    }

    if (
      currentRound &&
      currentRound.participants &&
      Object.keys(currentRound.participants).includes(userId.toString())
    ) {
      return { success: false, message: '❕ Вы уже сделали ставку в этом раунде.' };
    }

    if (Object.keys(currentRound.participants || {}).length >= currentRound.maxParticipants) {
      return { success: false, message: '❕ В данном раунде уже участвует максимальное количество игроков (5).' };
    }

    if (!currentRound.participants) {
      currentRound.participants = {};
    }

    try {
      await updateUserBalance(userId, -amount);
      currentRound.participants[userId] = { username, amount };
      if (currentRound.roundId) {
        await saveDiceBet(currentRound.roundId, userId, username, amount);
      }
      console.log(`[DEBUG] [Ставка] Сохранена ставка: Пользователь: ${userId}, Чат: ${chatId}, Сумма: ${amount}`);
      return { success: true, message: `✔️ Ставка ${amount} PF принята.` };
    } catch (error) {
      console.error(`[ERROR] Ошибка при сохранении ставки: ${error.message}`);
      await updateUserBalance(userId, amount);
      return { success: false, message: '❕ Произошла ошибка при обработке ставки.' };
    }
  };

  endRound = async (bot, chatId, roundId) => {
    const activeRounds = this.chatRounds[chatId] || [];
    const round = activeRounds.find((r) => r.roundId === roundId);
    const timerKey = `${chatId}_${roundId}`;
  
    if (!round || this.isRoundCanceled[timerKey]) {
      return;
    }
  
    const participants = round.participants || {};
  
    if (Object.keys(participants).length === 0) {
      this.resetRound(chatId, roundId);
      return;
    }
  
    const totalBank = Object.values(participants).reduce((sum, participant) => sum + participant.amount, 0);
  
    if (Object.keys(participants).length < 2) {
      this.isRoundCanceled[timerKey] = true;
      await this.returnBetsToUsers(chatId, roundId);
      await bot.telegram.sendMessage(
        chatId,
        `❕ Раунд дайса (${round.roundAmount.toLocaleString('ru-RU')} PF) отменен из-за недостатка участников. Ставки возвращены.`,
        { parse_mode: 'HTML' }
      );
      this.resetRound(chatId, roundId);
      return;
    }
  
    const results = {};
    let hasDuplicates = true;
  
    while (hasDuplicates) {
      hasDuplicates = false;
      for (const userId in participants) {
        const dice1 = Math.floor(Math.random() * 6) + 1;
        const dice2 = Math.floor(Math.random() * 6) + 1;
        const totalPoints = dice1 + dice2;
        results[userId] = { dice1, dice2, totalPoints };
      }
      const pointsArray = Object.values(results).map((result) => result.totalPoints);
      const uniquePoints = new Set(pointsArray);
      if (uniquePoints.size !== pointsArray.length) {
        hasDuplicates = true;
      }
    }
  
    for (const userId in participants) {
      const { dice1, dice2 } = results[userId];
      const bets = await getDiceBetsByRoundId(roundId);
      const bet = bets.find((bet) => bet.user_id === userId);
      if (bet) {
        await updateDiceResults(bet.id, dice1, dice2);
      }
    }
  
    let maxPoints = -Infinity;
    const winners = [];
  
    for (const userId in results) {
      if (results[userId].totalPoints > maxPoints) {
        maxPoints = results[userId].totalPoints;
        winners.length = 0;
        winners.push(userId);
      } else if (results[userId].totalPoints === maxPoints) {
        winners.push(userId);
      }
    }
  
    // Определяем комиссию в зависимости от номинала раунда
    const commissionRate = round.roundAmount < 100000 ? 5 : 10; // 5% для <100k, 10% для >=100k
    const prizePool = totalBank - (totalBank * (commissionRate / 100)); // Вычитаем комиссию
    const prizePerWinner = Math.floor(prizePool / winners.length);
  
    // Формируем итоговое сообщение с жирным форматированием
    let finalMessage = `<b>🎲 Итоги раунда дайса</b> (${round.roundAmount.toLocaleString('ru-RU')} PF):\n`;
    for (const userId in participants) {
      const { username } = participants[userId];
      const { dice1, dice2, totalPoints } = results[userId];
      finalMessage += `${createUserLink(userId, username)} - ${totalPoints}\n`;
    }
  
    finalMessage += `\n💰 Банк: ${totalBank.toLocaleString('ru-RU')} PF\n`;
  
    if (winners.length === 0) {
      finalMessage += `Никто не выиграл.\n`;
    } else if (winners.length === 1) {
      const winnerId = winners[0];
      const { username } = participants[winnerId];
      finalMessage += `🏆 Победитель: ${createUserLink(winnerId, username)}\n<b>🤑 Выигрыш:</b> ${prizePerWinner.toLocaleString('ru-RU')} PF\n`;
      finalMessage += `💶 Комиссия: ${commissionRate}%\n`; // Добавляем информацию о комиссии
      await updateUserBalance(winnerId, prizePerWinner);
    } else {
      finalMessage += `🏆 Победители (${winners.length}):\n`;
      for (const winnerId of winners) {
        const { username } = participants[winnerId];
        finalMessage += `- ${createUserLink(winnerId, username)}\n`;
        await updateUserBalance(winnerId, prizePerWinner);
      }
      finalMessage += `\n<b>Каждый выиграл:</b> ${prizePerWinner.toLocaleString('ru-RU')} PF\n`;
      finalMessage += `💶 Комиссия: ${commissionRate}%\n`; // Добавляем информацию о комиссии
    }
  
    const repeatButton = Markup.inlineKeyboard([
      Markup.button.callback(
        `🔄 Повторить (${round.roundAmount.toLocaleString('ru-RU')} PF)`,
        `repeat_round_${round.roundAmount}`
      ),
    ]);
  
    try {
      const imageBuffer = await generateDiceResultsImage(chatId, roundId, participants, results, totalBank);
      console.log(`Изображение результатов создано.`);
      await bot.telegram.sendPhoto(
        chatId,
        { source: imageBuffer },
        {
          caption: finalMessage.trim(),
          parse_mode: 'HTML',
          ...repeatButton,
        }
      );
    } catch (error) {
      console.error('Ошибка при генерации или отправке изображения:', error);
      await bot.telegram.sendMessage(
        chatId,
        finalMessage.trim(),
        {
          parse_mode: 'HTML',
          ...repeatButton,
        }
      );
    }
  
    this.resetRound(chatId, roundId);
  };

  resetRound(chatId, roundId) {
    const activeRounds = this.chatRounds[chatId] || [];
    this.chatRounds[chatId] = activeRounds.filter((round) => round.roundId !== roundId);
    clearTimeout(this.roundTimers[`${chatId}_${roundId}`]);
    clearTimeout(this.cancelRoundTimers[`${chatId}_${roundId}`]);
    clearTimeout(this.warningTimers[`${chatId}_${roundId}`]); // Очищаем таймер предупреждения
    delete this.isRoundCanceled[`${chatId}_${roundId}`];
  }

  async returnBetsToUsers(chatId, roundId) {
    const activeRounds = this.chatRounds[chatId] || [];
    const round = activeRounds.find((r) => r.roundId === roundId);
    if (!round) return;
    const participants = round.participants || {};
    for (const userId in participants) {
      const { amount } = participants[userId];
      await updateUserBalance(userId, amount);
      console.log(`[DEBUG] Возвращена ставка пользователю ${userId}: ${amount} PF`);
    }
  }

  showBank = (chatId) => {
    const activeRounds = this.chatRounds[chatId] || [];
    if (activeRounds.length === 0) {
        return '<b>Текущие раунды еще не начаты.</b>';
    }

    let bankMessage = '<b>—— АКТИВНЫЕ DICE КОМНАТЫ ——</b>\n\n';

    for (const round of activeRounds) {
        const participants = Object.values(round.participants || {});
        if (participants.length === 0) {
            continue;
        }

        const remainingTime = Math.max(0, Math.ceil((round.endTime - Date.now()) / 1000));
        const totalBank = participants.reduce((sum, participant) => sum + participant.amount, 0);

        // Название раунда
        bankMessage += `<b>🎲 Раунд (${round.roundAmount.toLocaleString('ru-RU')} PF)</b>\n`;

        // Участники раунда
        for (const participant of participants) {
            const userLink = createUserLink(participant.userId, participant.username);
            bankMessage += `• ${userLink} - <b>${participant.amount.toLocaleString('ru-RU')} PF</b>\n`;
        }

        // Банк и время
        bankMessage += `\n<b>💰 Банк:</b> ${totalBank.toLocaleString('ru-RU')} PF\n`;
        bankMessage += `<b>⏳ Оставшееся время:</b> ${remainingTime} сек.\n`;

        // Разделитель между раундами
        bankMessage += '\n<b>=================</b>\n\n';
    }

    return bankMessage.trim() || '<b>❕ Вы не участвуете ни в одном раунде.</b>';
};
}

function parseBetAmount(input) {
  input = input.trim().toLowerCase();
  const match = input.match(/^([\d.,]+)([к]*)$/);
  if (!match) {
    throw new Error('❕ Некорректный формат суммы ставки.');
  }
  const numberPart = match[1].replace(',', '.');
  const suffix = match[2] || '';
  const number = parseFloat(numberPart);
  if (isNaN(number) || number <= 0) {
    throw new Error('❕ Некорректная сумма ставки.');
  }
  let amount = number;
  if (suffix === 'к') amount *= 1000;
  else if (suffix === 'kk') amount *= 1000000;
  else if (suffix === 'kkk') amount *= 1000000000;
  return Math.floor(amount);
}

function createUserLink(userId, username) {
  const displayName = username || 'Неизвестный';
  return `<a href="tg://user?id=${userId}">${displayName}</a>`;
}

// Обработка команды "дайс"
async function diceHandler(ctx) {
  try {
    const chatId = ctx.chat.id;
    const lowerText = ctx.message.text.trim().toLowerCase();
    // Проверяем, активирован ли режим Dice в чате
    if (!(await isDiceChat(chatId))) {
      return ctx.reply('❕ Режим Dice не активирован в этом чате.');
    }
    const userId = ctx.from.id;
    const userFromDb = await getUserById(userId.toString());
    const username = userFromDb?.username || 'Неизвестный';
    const userLink = createUserLink(userId, username);
    const userBalance = userFromDb.balance || 0;

    // Определяем минимальную и максимальную ставки
    const MIN_BET = 100;
    const MAX_BET = 4000000;

    // Вычисляем возможные ставки: 10%, 50% и полный баланс
    const tenPercentBet = Math.floor(userBalance * 0.1);
    const fiftyPercentBet = Math.floor(userBalance * 0.5);
    const fullBalanceBet = userBalance;

    // Убедимся, что все ставки соответствуют ограничениям
    let bets = [];
    if (tenPercentBet >= MIN_BET && tenPercentBet <= MAX_BET) {
      bets.push(tenPercentBet);
    }
    if (fiftyPercentBet >= MIN_BET && fiftyPercentBet <= MAX_BET) {
      bets.push(fiftyPercentBet);
    }
    if (fullBalanceBet >= MIN_BET && fullBalanceBet <= MAX_BET) {
      bets.push(fullBalanceBet);
    }

    // Если пользователь имеет недостаточный баланс для всех вариантов, отправляем сообщение об ошибке
    if (bets.length === 0) {
      return ctx.replyWithHTML(
        `<b>❌ Проверьте свой баланс.</b>
Минимальная ставка: ${MIN_BET} PF
Максимальная ставка: ${MAX_BET} PF`
      );
    }

    // Инструкции по ставкам на дайс
    const instructions = `
🎲 <b>Как сделать ставку на Dice?</b>
Введите команду вручную:
Пример: <code>дайс 100</code> или <code>дайс 1к</code>
<b>Доступные варианты ставок:</b>
`;

    // Создаем клавиатуру с кнопками
    const keyboard = Markup.inlineKeyboard(bets.map((bet) => [
      Markup.button.callback(
        `дайс ${Math.floor(bet).toLocaleString('ru-RU')} PF`,
        `start_dice_${bet}`
      )
    ]));

    // Отправляем сообщение с инструкциями и кнопками
    return ctx.replyWithHTML(instructions, keyboard);
  } catch (error) {
    console.error('Ошибка при обработке команды "дайс":', error);
    return ctx.reply('Произошла ошибка. Попробуйте позже.', { parse_mode: 'HTML' });
  }
}


module.exports = { diceGame: new DiceGame(), parseBetAmount, diceHandler };