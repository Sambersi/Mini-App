// handlers/double.js
const { Markup } = require('telegraf');
const { doubleGame } = require('../games/doubleGame');
const { logError } = require('../utils/errorHandler');
const {
  getUserById,
  isDoubleChat,
  getDoubleBetsByRound, // ИЗМЕНЕНО: заменяет getBetsByRoundId
} = require('../db');

const lastBetTimes = {};

function createUserLink(userId, username) {
  const displayName = username || 'Неизвестный';
  return `<a href="tg://user?id=${userId}">${displayName}</a>`;
}

function parseBetAmount(input, kSuffix, userBalance) {
  input = input.trim().toLowerCase();
  if (input === 'всё' || input === 'все') return userBalance;
  const numberPart = parseFloat(input.replace(/[^0-9.]/g, ''));
  if (isNaN(numberPart) || numberPart <= 0) throw new Error('❕ Некорректная сумма ставки.\nСумма должна быть положительной.');
  let baseAmount = Math.floor(numberPart);
  const kCount = (kSuffix.match(/к/g) || []).length;
  for (let i = 0; i < kCount; i++) baseAmount *= 1000;
  return baseAmount;
}

async function doubleHandler(ctx) {
  try {
    const chatId = ctx.chat.id;
    const lowerText = ctx.message.text.trim().toLowerCase();

    if (!(await isDoubleChat(chatId))) {
      return ctx.reply('❕ Режим Double не активирован в этом чате.');
    }

    // ИЗМЕНЕНО: убран автозапуск раунда из обработчика
    // Раунд управляется только из doubleGame.initGame / таймера

    // Команда "банк"
    if (lowerText === 'банк') {
      if (!doubleGame.round?.hash) return ctx.reply('❕ Раунд ещё не начат. Попробуйте позже.');
      const hash = doubleGame.round.hash;

      // ИЗМЕНЕНО: используем getDoubleBetsByRound вместо getBetsByRoundId
      const chatBets = getDoubleBetsByRound(hash).filter(bet => bet.chat_id === chatId.toString());

      if (!chatBets.length) {
        const remainingTime = Math.max(0, Math.ceil((doubleGame.round.endTime - Date.now()) / 1000));
        return ctx.reply(`▪️ В этом раунде пока нет ставок в текущем чате.\n\n⏳ До конца раунда: ${remainingTime} сек.\n🔒 Хеш игры: ${hash}`);
      }

      const groupedBets = {};
      let totalBank = 0;
      for (const bet of chatBets) {
        const key = `${bet.user_id}_${bet.multiplier}`;
        if (!groupedBets[key]) {
          const u = await getUserById(bet.user_id);
          groupedBets[key] = { userId: bet.user_id, username: u?.username || 'Неизвестный', multiplier: bet.multiplier, totalAmount: 0 };
        }
        groupedBets[key].totalAmount += bet.amount;
        totalBank += bet.amount;
      }

      const sortedBets = Object.values(groupedBets).sort((a, b) => {
        const order = { 'x2': 1, 'x3': 2, 'x5': 3, 'GAME': 4 };
        return order[a.multiplier] - order[b.multiplier];
      });

      let message = `▫️ Текущие ставки в чате: ${totalBank.toLocaleString('ru-RU')} PF\n\n`;
      for (const bet of sortedBets) {
        const userLink = createUserLink(bet.userId, bet.username);
        message += `${userLink} - ${bet.totalAmount.toLocaleString('ru-RU')} PF на ${bet.multiplier}\n`;
      }
      const remainingTime = Math.max(0, Math.ceil((doubleGame.round.endTime - Date.now()) / 1000));
      message += `\n🔒 Хеш игры: ${hash}\n⏳ До конца раунда: ${remainingTime} сек.`;
      return ctx.reply(message, { parse_mode: 'HTML' });
    }

    // Команды без суммы
    const matchWithoutAmount = lowerText.match(/^([235]|игра|game|х2|х3|х5)$/i);
    if (matchWithoutAmount) {
      const raw = matchWithoutAmount[1];
      const multiplier = raw.toLowerCase() === 'игра' || raw.toLowerCase() === 'game' ? 'GAME' : `x${raw.replace(/х/gi, '')}`;
      return handleMultiplierCommand(ctx, multiplier);
    }

    // Ставки с суммой
    const matchWithAmount = lowerText.match(/^([235]|игра|game)\s+(всё|все|[\d\w]+)([к]*)$/i);
    if (!matchWithAmount) return ctx.reply('❕ Некорректный формат сообщения.\nПример: "5 1" или "игра всё".');

    const [, rawMultiplier, amountInput, kSuffix] = matchWithAmount;
    const multiplier = rawMultiplier.toLowerCase() === 'игра' || rawMultiplier.toLowerCase() === 'game' ? 'GAME' : `x${rawMultiplier}`;

    const userId = ctx.from.id;
    const userFromDb = await getUserById(userId.toString());
    const username = userFromDb?.username || 'Неизвестный';
    const userBalance = userFromDb.balance || 0;

    const cooldownKey = `${userId}_${multiplier}`;
    const currentTime = Date.now();
    if (lastBetTimes[cooldownKey] && currentTime - lastBetTimes[cooldownKey] < 1000) {
      return ctx.reply('❌ Не флудите, попробуйте еще раз через пару секунд!');
    }

    // Проверка времени приёма ставок
    if (!doubleGame.round) return ctx.reply('❕ Раунд ещё не начался.');
    const remainingTimeForBets = doubleGame.round.result === 'GAME'
      ? doubleGame.round.endTime - 20 * 1000
      : doubleGame.round.endTime - 5 * 1000;
    if (currentTime >= remainingTimeForBets) return ctx.reply('⏳ Ставки больше не принимаются. Формируются итоги игры.');

    let finalAmount;
    try { finalAmount = parseBetAmount(amountInput, kSuffix, userBalance); } catch (e) { return ctx.reply(e.message); }
    if (finalAmount < 1) return ctx.reply('❕ Минимальная ставка — 1 PF.');
    if (finalAmount > userBalance) return ctx.reply('❕ У вас недостаточно средств для этой ставки.');

    const userLink = createUserLink(userId, username);
    lastBetTimes[cooldownKey] = currentTime;

    // ИЗМЕНЕНО: убран прямой вызов saveBet — запись происходит внутри handleBet через logDoubleBet
    const betResult = await doubleGame.handleBet(userId, username, multiplier, finalAmount, chatId, ctx.chat.title);

    if (betResult.success) {
      return ctx.reply(`✔️ ${userLink}, ваша ставка ${finalAmount.toLocaleString('ru-RU')} PF на ${multiplier} принята.`, { parse_mode: 'HTML' });
    } else {
      return ctx.reply(`❕ ${betResult.message || 'Не удалось принять ставку.'}`, { parse_mode: 'HTML' });
    }
  } catch (error) {
    logError(error);
    if (error.response && error.response.error_code === 429) {
      const retryAfter = error.response.parameters?.retry_after || 0;
      return ctx.reply(`❕ Слишком много запросов. Попробуйте через ${retryAfter} секунд.`);
    }
    return ctx.reply('❌ Произошла ошибка. Попробуйте позже.', { parse_mode: 'HTML' });
  }
}

async function handleMultiplierCommand(ctx, multiplier) {
  try {
    const chatId = ctx.chat.id.toString();
    const isDoubleChatEnabled = await isDoubleChat(chatId);
    if (!isDoubleChatEnabled) return;

    const userId = ctx.from.id;
    const userFromDb = await getUserById(userId.toString());
    const username = userFromDb?.username || 'Неизвестный';
    const userLink = `[${username}](tg://user?id=${userId})`;

    const cooldownKey = `${userId}_${multiplier}`;
    const currentTime = Date.now();
    if (lastBetTimes[cooldownKey] && currentTime - lastBetTimes[cooldownKey] < 1000) {
      return ctx.reply('❌ Не флудите, попробуйте еще раз через пару секунд!');
    }
    lastBetTimes[cooldownKey] = currentTime;

    const userBalance = userFromDb.balance || 0;
    if (userBalance <= 0) {
      await ctx.reply(`${userLink}, ваш баланс равен 0 PF. Ставки невозможны.`, { parse_mode: 'Markdown' });
      return;
    }

    const suggestedAmounts = [Math.floor(userBalance * 0.1) || 1, Math.floor(userBalance * 0.5) || 1, userBalance];
    const validAmounts = suggestedAmounts.filter(a => a > 0);
    if (!validAmounts.length) return ctx.reply(`${userLink}, недостаточно средств для формирования ставок.`);

    const keyboard = Markup.inlineKeyboard(
      validAmounts.map(amount => Markup.button.callback(`${multiplier} ${amount.toLocaleString('ru-RU')}`, `bet_${multiplier}_${amount}`))
        .reduce((rows, btn, i) => { if (i % 2 === 0) rows.push([btn]); else rows[rows.length - 1].push(btn); return rows; }, [])
    );

    return ctx.reply(`🎲 ${userLink}, выберите сумму ставки на ${multiplier} или введите команду вручную:\nПример: ${multiplier.toLowerCase()} [сумма]`, {
      parse_mode: 'Markdown',
      reply_markup: keyboard.reply_markup,
    });
  } catch (error) {
    console.error('[handleMultiplierCommand] Ошибка:', error);
    return ctx.reply('Произошла ошибка. Попробуйте позже.', { parse_mode: 'Markdown' });
  }
}

module.exports = { doubleHandler, parseBetAmount, handleMultiplierCommand, lastBetTimes };