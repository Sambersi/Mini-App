"use strict";
const { createCanvas, loadImage } = require('canvas');
const path = require('path');
const fs = require('fs');
const { 
    saveDiceRound, isDiceChat, saveDiceBet, getUserById, updateUserBalance, 
    updateDiceResults, getDiceBetsByRoundId, getAllActiveDiceChats,
    logDiceRound, logDiceBet, finishDiceRoundLog, updateDiceBetResult, getLastDiceBetsInChat
} = require('../db');
const { generateDiceResultsImage } = require('./generateDiceResultsImage');
const { Markup } = require('telegraf');

class DiceGame {
    constructor() {
        if (!DiceGame.instance) {
            this.chatRounds = {};
            this.roundTimers = {};
            this.cancelRoundTimers = {};
            this.isRoundCanceled = {};
            this.warningTimers = {}; 
            
            // Новые поля для автоматических предложений и логирования
            this.chatLastActivity = {};
            this.pendingSuggestions = {};
            this.INACTIVITY_THRESHOLD = 30 * 1000; // 30 секунд для теста (в боевом режиме ставьте 15 * 60 * 1000)
            this.botInstance = null;
            
            DiceGame.instance = this;
        }
        return DiceGame.instance;
    }

    init(bot) {
        this.botInstance = bot;
        // Запускаем глобальный интервал проверки неактивности чатов
        setInterval(async () => {
            try {
                const activeChats = await getAllActiveDiceChats();
                for (const chatId of activeChats) {
                    const lastActivity = this.chatLastActivity[chatId] || 0;
                    const hasActiveRound = (this.chatRounds[chatId] || []).length > 0;
                    const hasPendingSuggestion = !!this.pendingSuggestions[chatId];

                    if (!hasActiveRound && !hasPendingSuggestion && (Date.now() - lastActivity > this.INACTIVITY_THRESHOLD)) {
                        this.chatLastActivity[chatId] = Date.now(); // Сбрасываем, чтобы не спамить, если отправка упадет
                        await this.sendAutoSuggestion(chatId, bot);
                    }
                }
            } catch (e) {
                console.error('[DiceGame] AutoSuggestion Interval Error:', e.message);
            }
        }, 10000); // Проверка каждые 10 секунд
    }

    async sendAutoSuggestion(chatId, bot) {
        if (!bot) return;
        let recentAmounts = getLastDiceBetsInChat(chatId, 5);
        if (recentAmounts.length === 0) {
            recentAmounts = [1000, 5000, 10000]; // Фолбэк, если в чате еще не играли
        }
        
        const baseAmount = recentAmounts[Math.floor(Math.random() * recentAmounts.length)];
        
        const buttons = [];
        const addBtn = (amt, text) => {
            if (amt >= 100 && amt <= 4000000) {
                buttons.push([Markup.button.callback(text, `dice_accept_auto_${amt}`)]);
            }
        };

        addBtn(baseAmount, `✅ Согласиться (${baseAmount.toLocaleString('ru-RU')} PF)`);
        addBtn(baseAmount * 2, `⬆️ Удвоить (${(baseAmount * 2).toLocaleString('ru-RU')} PF)`);
        addBtn(Math.floor(baseAmount / 2), `⬇️ Уменьшить (${Math.floor(baseAmount / 2).toLocaleString('ru-RU')} PF)`);
        
        const otherAmounts = recentAmounts.filter(a => a !== baseAmount && a !== baseAmount * 2 && a !== Math.floor(baseAmount / 2));
        for (const amt of otherAmounts) {
            addBtn(amt, `🎲 Играть на ${amt.toLocaleString('ru-RU')} PF`);
        }
        
        if (buttons.length === 0) addBtn(1000, `✅ Сыграть на 1 000 PF`);

        try {
            const msg = await bot.telegram.sendMessage(
                chatId,
                `🤖 <b>Давно не было игр!</b>\nПредлагаю сыграть в дайc на <b>${baseAmount.toLocaleString('ru-RU')} PF</b>.\nУ вас есть 30 секунд, чтобы согласиться или выбрать другую сумму!`,
                { parse_mode: 'HTML', reply_markup: Markup.inlineKeyboard(buttons) }
            );
            
            const timeoutId = setTimeout(async () => {
                try { await bot.telegram.deleteMessage(chatId, msg.message_id); } catch (e) {}
                delete this.pendingSuggestions[chatId];
            }, 30000);
            
            this.pendingSuggestions[chatId] = { messageId: msg.message_id, timeoutId, baseAmount };
        } catch (e) {
            console.error('[DiceGame] AutoSuggestion error:', e.message);
        }
    }

    async handleAutoAccept(chatId, userId, username, amount, bot, messageId) {
        const suggestion = this.pendingSuggestions[chatId];
        if (!suggestion) {
            return { success: false, message: 'Предложение уже истекло или было принято.' };
        }
        
        clearTimeout(suggestion.timeoutId);
        try { await bot.telegram.deleteMessage(chatId, messageId); } catch (e) {}
        delete this.pendingSuggestions[chatId];
        
        // Передаем в обычный handleBet, который сам создаст комнату и спишет средства
        const result = await this.handleBet(userId, username, amount.toString(), chatId, bot);
        return result;
    }

    startRound(chatId, bot, firstBetAmount) {
        const activeRounds = this.chatRounds[chatId] || [];
        if (activeRounds.length >= 3) {
            return { success: false, message: '❕ В этом чате уже запущено максимальное количество раундов [3].', parse_mode: 'HTML' };
        }
        const existingRound = activeRounds.find((round) => round.roundAmount === firstBetAmount);
        if (existingRound) {
            return { success: false, message: `❕ Раунд с суммой ставки ${firstBetAmount} PF уже запущен.` };
        }
        
        const startTime = Date.now();
        const endTime = startTime + 30 * 1000;
        const roundId = `round_${startTime}_${Math.random().toString(36).substr(2, 9)}`;
        saveDiceRound(chatId, startTime, endTime, roundId);
        logDiceRound(roundId, chatId, startTime, firstBetAmount); // Логирование
        
        const newRound = {
            roundId, startTime, endTime, participants: {}, maxParticipants: 5,
            roundAmount: firstBetAmount, warnedFiveSeconds: false, state: 'ACCEPTING'
        };
        
        if (!this.chatRounds[chatId]) this.chatRounds[chatId] = [];
        this.chatRounds[chatId].push(newRound);
        this.chatLastActivity[chatId] = Date.now(); // Обновление активности
        
        const participateButton = Markup.inlineKeyboard([
            Markup.button.callback(`Участвовать (${firstBetAmount.toLocaleString('ru-RU')} PF)`, `participate_${roundId}`)
        ]);
        
        bot.telegram.sendMessage(
            chatId,
            `<b>🎲 Новый раунд дайса начался!</b>\n\n<b>💰 Ставки принимаются в размере:</b> ${firstBetAmount.toLocaleString('ru-RU')} PF.\n<b>⏳ Время на регистрацию:</b> 30 секунд.`,
            { parse_mode: 'HTML', ...participateButton }
        );
        
        const timerKey = `${chatId}_${roundId}`;
        
        this.roundTimers[timerKey] = setTimeout(async () => {
            await this.endRound(bot, chatId, roundId);
        }, 30 * 1000);
        
        this.cancelRoundTimers[timerKey] = setTimeout(async () => {
            const activeRounds = this.chatRounds[chatId] || [];
            const round = activeRounds.find((r) => r.roundId === roundId);
            if (round && Object.keys(round.participants || {}).length === 0 && !this.isRoundCanceled[timerKey] && Date.now() >= (round?.endTime || 0)) {
                this.isRoundCanceled[timerKey] = true;
                await this.returnBetsToUsers(chatId, roundId);
                await bot.telegram.sendMessage(chatId, `<b>❕ Раунд дайса отменен из-за недостатка участников.</b>`, { parse_mode: 'HTML' });
                this.resetRound(chatId, roundId);
            }
        }, 30 * 1000);
        
        this.warningTimers[timerKey] = setTimeout(async () => {
            const activeRounds = this.chatRounds[chatId] || [];
            const round = activeRounds.find((r) => r.roundId === roundId);
            if (round && !round.warnedFiveSeconds && round.state === 'ACCEPTING') {
                round.warnedFiveSeconds = true;
                await bot.telegram.sendMessage(chatId, `<b>⏳ До итогов раунда (${firstBetAmount.toLocaleString('ru-RU')} PF) осталось менее 5 секунд!</b>`, { parse_mode: 'HTML' });
            }
        }, 25 * 1000);
        
        return { success: true, message: `<b>🎲 Новый раунд дайса начался!</b>`, round: newRound };
    }

    handleBet = async (userId, usernameFromTelegram, amountInput, chatId, bot) => {
        if (typeof amountInput !== 'string' || amountInput == null) amountInput = String(amountInput || '');
        let amount;
        try { amount = parseBetAmount(amountInput); } catch (error) { return { success: false, message: error.message }; }
        
        const MIN_BET = 100; const MAX_BET = 4000000;
        if (amount < MIN_BET) return { success: false, message: `💢 Минимальная ставка — ${MIN_BET} PF.` };
        if (amount > MAX_BET) return { success: false, message: `💢 Максимальная ставка — ${MAX_BET.toLocaleString('ru-RU')} PF.` };
        
        const user = await getUserById(userId);
        if (!user || user.balance < amount) return { success: false, message: '❕ Недостаточно средств для ставки.' };
        
        const username = user?.username || usernameFromTelegram || 'Неизвестный';
        const activeRounds = this.chatRounds[chatId] || [];
        let matchingRound = activeRounds.find((round) => round.roundAmount === amount && Date.now() < round.endTime && round.state === 'ACCEPTING');
        let isExistingRound = !!matchingRound;
        
        if (!matchingRound) {
            const startResult = this.startRound(chatId, bot, amount);
            if (!startResult.success) return { success: false, message: startResult.message || '❕ Произошла ошибка при регистрации раунда.' };
            const updatedActiveRounds = this.chatRounds[chatId] || [];
            matchingRound = updatedActiveRounds.find((round) => round.roundAmount === amount);
            isExistingRound = false;
        }
        
        const currentRound = matchingRound;
        if (Date.now() > (currentRound?.endTime || 0)) return { success: false, message: '❕ Время регистрации ставок истекло.' };
        if (currentRound.participants && Object.keys(currentRound.participants).includes(userId.toString())) return { success: false, message: '❕ Вы уже сделали ставку в этом раунде.' };
        if (Object.keys(currentRound.participants || {}).length >= currentRound.maxParticipants) return { success: false, message: '❕ В данном раунде уже участвует максимальное количество игроков (5).' };
        
        if (!currentRound.participants) currentRound.participants = {};
        
        try {
            await updateUserBalance(userId, -amount);
            currentRound.participants[userId.toString()] = { username, amount };
            this.chatLastActivity[chatId] = Date.now(); // Обновление активности
            
            if (currentRound.roundId) {
                await saveDiceBet(currentRound.roundId, userId.toString(), username, amount);
                const betLogId = logDiceBet(currentRound.roundId, chatId, userId.toString(), username, amount);
                currentRound.participants[userId.toString()].logId = betLogId; // Сохраняем ID лога
            }
            
            if (isExistingRound) {
                const addedTime = 10 * 1000;
                currentRound.endTime += addedTime;
                const timerKey = `${chatId}_${currentRound.roundId}`;
                clearTimeout(this.roundTimers[timerKey]); clearTimeout(this.cancelRoundTimers[timerKey]); clearTimeout(this.warningTimers[timerKey]);
                const remainingTime = currentRound.endTime - Date.now();
                this.roundTimers[timerKey] = setTimeout(async () => { await this.endRound(bot, chatId, currentRound.roundId); }, remainingTime);
                if (remainingTime > 5000 && !currentRound.warnedFiveSeconds) {
                    this.warningTimers[timerKey] = setTimeout(async () => {
                        const r = this.chatRounds[chatId]?.find(r => r.roundId === currentRound.roundId);
                        if (r && !r.warnedFiveSeconds) { r.warnedFiveSeconds = true; await bot.telegram.sendMessage(chatId, `<b>⏳ До итогов раунда осталось менее 5 секунд!</b>`, { parse_mode: 'HTML' }); }
                    }, remainingTime - 5000);
                }
                await bot.telegram.sendMessage(chatId, `⏳ <b>Время продлено!</b> Новый игрок присоединился. До итогов осталось ${Math.ceil(remainingTime / 1000)} сек.`, { parse_mode: 'HTML' });
            }
            
            return { success: true, message: `✔️ Ставка ${amount} PF принята.`, roundId: currentRound.roundId, amount: amount };
        } catch (error) {
            console.error(`[ERROR] Ошибка при сохранении ставки: ${error.message}`);
            try { await updateUserBalance(userId, amount); } catch(e) {}
            return { success: false, message: '❕ Произошла ошибка при обработке ставки.' };
        }
    };

    async handleBotChallenge(bot, chatId, roundId, userId) {
        const activeRounds = this.chatRounds[chatId] || [];
        const round = activeRounds.find(r => r.roundId === roundId);
        if (!round || round.state !== 'WAITING_FOR_BOT') return { success: false, message: 'Раунд не найден или предложение недействительно.' };
        
        const realPlayers = Object.keys(round.participants).filter(id => id !== 'F_BOT');
        if (realPlayers[0] !== userId.toString()) return { success: false, message: 'Это предложение только для создателя комнаты.' };
        
        round.participants['F_BOT'] = { username: 'F BOT', amount: round.roundAmount, isBot: true };
        round.state = 'EXTENDED_BY_BOT';
        const addedTime = 10 * 1000;
        round.endTime = Date.now() + addedTime;
        
        const timerKey = `${chatId}_${roundId}`;
        clearTimeout(this.cancelRoundTimers[timerKey]);
        this.roundTimers[timerKey] = setTimeout(async () => { await this.endRound(bot, chatId, roundId); }, addedTime);
        await bot.telegram.sendMessage(chatId, `🤖 <b>F BOT</b> принимает вызов! У других игроков есть 10 секунд, чтобы присоединиться.`, { parse_mode: 'HTML' });
        return { success: true };
    }

    endRound = async (bot, chatId, roundId) => {
        const activeRounds = this.chatRounds[chatId] || [];
        const round = activeRounds.find((r) => r.roundId === roundId);
        const timerKey = `${chatId}_${roundId}`;
        if (!round || this.isRoundCanceled[timerKey]) return;
        
        const participants = round.participants || {};
        const realPlayers = Object.keys(participants).filter(id => id !== 'F_BOT');
        this.chatLastActivity[chatId] = Date.now(); // Обновление активности
        
        if (realPlayers.length === 0) { this.resetRound(chatId, roundId); return; }
        
        if (realPlayers.length === 1 && !participants['F_BOT']) {
            if (Math.random() < 0.5) {
                round.state = 'WAITING_FOR_BOT';
                const keyboard = Markup.inlineKeyboard([Markup.button.callback('🤖 Сыграть с F BOT', `play_with_bot_${roundId}`)]);
                await bot.telegram.sendMessage(chatId, `🤖 <b>F BOT</b> заметил, что вам скучно одному!\nСыграть с ним на ${round.roundAmount.toLocaleString('ru-RU')} PF?`, { parse_mode: 'HTML', ...keyboard });
                this.cancelRoundTimers[timerKey] = setTimeout(async () => {
                    if (round.state === 'WAITING_FOR_BOT') {
                        await this.returnBetsToUsers(chatId, roundId);
                        await bot.telegram.sendMessage(chatId, `❕ Раунд отменен, F BOT не дождался ответа.`, { parse_mode: 'HTML' });
                        this.resetRound(chatId, roundId);
                    }
                }, 20 * 1000);
                return;
            } else {
                this.isRoundCanceled[timerKey] = true;
                await this.returnBetsToUsers(chatId, roundId);
                await bot.telegram.sendMessage(chatId, `❕ Раунд отменен из-за недостатка участников.`, { parse_mode: 'HTML' });
                this.resetRound(chatId, roundId);
                return;
            }
        }
        
        if (realPlayers.length < 2 && !participants['F_BOT']) {
            this.isRoundCanceled[timerKey] = true;
            await this.returnBetsToUsers(chatId, roundId);
            await bot.telegram.sendMessage(chatId, `❕ Раунд отменен из-за недостатка участников.`, { parse_mode: 'HTML' });
            this.resetRound(chatId, roundId);
            return;
        }
        
        const results = {};
        const hasBot = 'F_BOT' in participants;
        
        if (hasBot && realPlayers.length === 1) {
            const botWins = Math.random() < 0.55;
            const creatorId = realPlayers[0];
            if (botWins) {
                results['F_BOT'] = { dice1: 6, dice2: 6, totalPoints: 12 };
                results[creatorId] = { dice1: 5, dice2: 6, totalPoints: 11 };
            } else {
                results[creatorId] = { dice1: 6, dice2: 6, totalPoints: 12 };
                results['F_BOT'] = { dice1: 5, dice2: 6, totalPoints: 11 };
            }
        } else {
            let hasDuplicates = true;
            while (hasDuplicates) {
                hasDuplicates = false;
                for (const userId in participants) {
                    const dice1 = Math.floor(Math.random() * 6) + 1;
                    const dice2 = Math.floor(Math.random() * 6) + 1;
                    results[userId] = { dice1, dice2, totalPoints: dice1 + dice2 };
                }
                const pointsArray = Object.values(results).map((result) => result.totalPoints);
                if (new Set(pointsArray).size !== pointsArray.length) hasDuplicates = true;
            }
        }
        
        let maxPoints = -Infinity; const winners = [];
        for (const userId in results) {
            if (results[userId].totalPoints > maxPoints) { maxPoints = results[userId].totalPoints; winners.length = 0; winners.push(userId); } 
            else if (results[userId].totalPoints === maxPoints) winners.push(userId);
        }
        
        const totalBank = Object.entries(participants).filter(([id]) => id !== 'F_BOT').reduce((sum, [id, p]) => sum + p.amount, 0);
        const commissionRate = round.roundAmount < 100000 ? 5 : 10;
        const prizePool = totalBank - (totalBank * (commissionRate / 100));
        const realWinners = winners.filter(id => id !== 'F_BOT');
        const prizePerWinner = realWinners.length > 0 ? Math.floor(prizePool / realWinners.length) : 0;
        
        // Логирование результатов и обновление БД
        for (const userId in participants) {
            if (userId === 'F_BOT') continue;
            const { dice1, dice2, totalPoints } = results[userId];
            const { logId } = participants[userId];
            const isWinner = realWinners.includes(userId);
            const winAmount = isWinner ? prizePerWinner : 0;

            const bets = await getDiceBetsByRoundId(roundId);
            const bet = bets.find((bet) => bet.user_id === userId);
            if (bet) await updateDiceResults(bet.id, dice1, dice2);
            if (logId) updateDiceBetResult(logId, dice1, dice2, totalPoints, isWinner, winAmount);
            
            if (isWinner) await updateUserBalance(userId, prizePerWinner);
        }
        
        const winnerId = realWinners.length > 0 ? realWinners[0] : null;
        finishDiceRoundLog(roundId, winnerId, totalBank, Object.keys(participants).length);
        
        let finalMessage = `<b>🎲 Итоги раунда дайса</b> (${round.roundAmount.toLocaleString('ru-RU')} PF):\n`;
        for (const userId in participants) {
            const { username } = participants[userId];
            const { totalPoints } = results[userId];
            finalMessage += userId === 'F_BOT' ? `🤖 <b>F BOT</b> - ${totalPoints}\n` : `${createUserLink(userId, username)} - ${totalPoints}\n`;
        }
        finalMessage += `\n💰 Банк: ${totalBank.toLocaleString('ru-RU')} PF\n`;
        
        if (winners.includes('F_BOT') && realWinners.length === 0) finalMessage += `🏆 Победитель: <b>F BOT</b>\n💰 Банк сгорает!\n`;
        else if (realWinners.length === 1) finalMessage += `🏆 Победитель: ${createUserLink(realWinners[0], participants[realWinners[0]].username)}\n<b>🤑 Выигрыш:</b> ${prizePerWinner.toLocaleString('ru-RU')} PF\n💶 Комиссия: ${commissionRate}%\n`;
        else if (realWinners.length > 1) {
            finalMessage += `🏆 Победители (${realWinners.length}):\n`;
            for (const w of realWinners) finalMessage += `- ${createUserLink(w, participants[w].username)}\n`;
            finalMessage += `\n<b>Каждый выиграл:</b> ${prizePerWinner.toLocaleString('ru-RU')} PF\n💶 Комиссия: ${commissionRate}%\n`;
        }
        
        const repeatButton = Markup.inlineKeyboard([Markup.button.callback(`🔄 Повторить (${round.roundAmount.toLocaleString('ru-RU')} PF)`, `repeat_round_${round.roundAmount}`)]);
        try {
            const imageBuffer = await generateDiceResultsImage(chatId, roundId, participants, results, totalBank);
            await bot.telegram.sendPhoto(chatId, { source: imageBuffer }, { caption: finalMessage.trim(), parse_mode: 'HTML', ...repeatButton });
        } catch (error) {
            await bot.telegram.sendMessage(chatId, finalMessage.trim(), { parse_mode: 'HTML', ...repeatButton });
        }
        this.resetRound(chatId, roundId);
    };

    resetRound(chatId, roundId) {
        const activeRounds = this.chatRounds[chatId] || [];
        this.chatRounds[chatId] = activeRounds.filter((round) => round.roundId !== roundId);
        clearTimeout(this.roundTimers[`${chatId}_${roundId}`]);
        clearTimeout(this.cancelRoundTimers[`${chatId}_${roundId}`]);
        clearTimeout(this.warningTimers[`${chatId}_${roundId}`]); 
        delete this.isRoundCanceled[`${chatId}_${roundId}`];
    }

    async returnBetsToUsers(chatId, roundId) {
        const activeRounds = this.chatRounds[chatId] || [];
        const round = activeRounds.find((r) => r.roundId === roundId);
        if (!round) return;
        const participants = round.participants || {};
        for (const userId in participants) {
            if (userId === 'F_BOT') continue;
            await updateUserBalance(userId, participants[userId].amount);
        }
    }

    showBank = (chatId) => {
        const activeRounds = this.chatRounds[chatId] || [];
        if (activeRounds.length === 0) return { text: '<b>Текущие раунды еще не начаты.</b>' };
        let bankMessage = '<b>—— АКТИВНЫЕ DICE КОМНАТЫ ——</b>\n\n';
        const keyboards = [];
        for (const round of activeRounds) {
            const participants = Object.entries(round.participants || {});
            if (participants.length === 0) continue;
            const remainingTime = Math.max(0, Math.ceil((round.endTime - Date.now()) / 1000));
            const totalBank = participants.reduce((sum, [id, p]) => id === 'F_BOT' ? sum : sum + p.amount, 0);
            bankMessage += `<b>🎲 Раунд (${round.roundAmount.toLocaleString('ru-RU')} PF)</b>\n`;
            for (const [uid, p] of participants) bankMessage += uid === 'F_BOT' ? `• 🤖 <b>F BOT</b> - <b>${p.amount.toLocaleString('ru-RU')} PF</b>\n` : `• ${createUserLink(uid, p.username)} - <b>${p.amount.toLocaleString('ru-RU')} PF</b>\n`;
            bankMessage += `\n<b>💰 Банк:</b> ${totalBank.toLocaleString('ru-RU')} PF\n<b>⏳ Оставшееся время:</b> ${remainingTime} сек.\n\n<b>=================</b>\n\n`;
            keyboards.push([Markup.button.callback(`Участвовать (${round.roundAmount.toLocaleString('ru-RU')} PF)`, `participate_${round.roundId}`)]);
        }
        return { text: bankMessage.trim() || '<b>❕ Вы не участвуете ни в одном раунде.</b>', reply_markup: Markup.inlineKeyboard(keyboards).reply_markup };
    };
    
    getParticipateKeyboard(roundId, amount) {
        return Markup.inlineKeyboard([Markup.button.callback(`Участвовать (${amount.toLocaleString('ru-RU')} PF)`, `participate_${roundId}`)]);
    }
}

function parseBetAmount(input) {
    input = input.trim().toLowerCase();
    const match = input.match(/^([\d.,]+)([к]*)$/);
    if (!match) throw new Error('❕ Некорректный формат суммы ставки.');
    const number = parseFloat(match[1].replace(',', '.'));
    if (isNaN(number) || number <= 0) throw new Error('❕ Некорректная сумма ставки.');
    let amount = number;
    if (match[2] === 'к') amount *= 1000;
    else if (match[2] === 'kk') amount *= 1000000;
    return Math.floor(amount);
}

function createUserLink(userId, username) {
    return `<a href="tg://user?id=${userId}">${username || 'Неизвестный'}</a>`;
}

async function diceHandler(ctx) {
    try {
        const chatId = ctx.chat.id;
        if (!(await isDiceChat(chatId))) return ctx.reply('❕ Режим Dice не активирован в этом чате.');
        const userId = ctx.from.id;
        const userFromDb = await getUserById(userId.toString());
        const userBalance = userFromDb.balance || 0;
        const MIN_BET = 100; const MAX_BET = 4000000;
        let bets = [Math.floor(userBalance * 0.1), Math.floor(userBalance * 0.5), userBalance].filter(b => b >= MIN_BET && b <= MAX_BET);
        if (bets.length === 0) return ctx.replyWithHTML(`<b>❌ Проверьте свой баланс.</b>\nМинимальная ставка: ${MIN_BET} PF\nМаксимальная ставка: ${MAX_BET} PF`);
        const instructions = `\n🎲 <b>Как сделать ставку на Dice?</b>\nВведите команду вручную:\nПример: <code>дайс 100</code> или <code>дайс 1к</code>\n<b>Доступные варианты ставок:</b>\n`;
        const keyboard = Markup.inlineKeyboard(bets.map((bet) => [Markup.button.callback(`дайс ${Math.floor(bet).toLocaleString('ru-RU')} PF`, `start_dice_${bet}`)]));
        return ctx.replyWithHTML(instructions, keyboard);
    } catch (error) {
        return ctx.reply('Произошла ошибка. Попробуйте позже.', { parse_mode: 'HTML' });
    }
}

module.exports = { diceGame: new DiceGame(), parseBetAmount, diceHandler };