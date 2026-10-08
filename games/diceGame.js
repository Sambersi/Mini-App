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
            this.warningTimers = {}; 
            DiceGame.instance = this;
        }
        return DiceGame.instance;
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
        
        const newRound = {
            roundId,
            startTime,
            endTime,
            participants: {},
            maxParticipants: 5,
            roundAmount: firstBetAmount,
            warnedFiveSeconds: false,
            state: 'ACCEPTING' // Новое состояние для контроля бота
        };
        
        if (!this.chatRounds[chatId]) this.chatRounds[chatId] = [];
        this.chatRounds[chatId].push(newRound);
        
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
        try {
            amount = parseBetAmount(amountInput);
        } catch (error) {
            return { success: false, message: error.message };
        }
        
        const MIN_BET = 100;
        const MAX_BET = 4000000;
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
            if (currentRound.roundId) await saveDiceBet(currentRound.roundId, userId.toString(), username, amount);
            
            // Продление таймера на 10 секунд при входе НОВОГО игрока в существующую комнату
            if (isExistingRound) {
                const addedTime = 10 * 1000;
                currentRound.endTime += addedTime;
                const timerKey = `${chatId}_${currentRound.roundId}`;
                
                clearTimeout(this.roundTimers[timerKey]);
                clearTimeout(this.cancelRoundTimers[timerKey]);
                clearTimeout(this.warningTimers[timerKey]);
                
                const remainingTime = currentRound.endTime - Date.now();
                
                this.roundTimers[timerKey] = setTimeout(async () => {
                    await this.endRound(bot, chatId, currentRound.roundId);
                }, remainingTime);
                
                this.cancelRoundTimers[timerKey] = setTimeout(async () => {
                    // Логика отмены сработает в endRound
                }, remainingTime);
                
                if (remainingTime > 5000 && !currentRound.warnedFiveSeconds) {
                    this.warningTimers[timerKey] = setTimeout(async () => {
                        const r = this.chatRounds[chatId]?.find(r => r.roundId === currentRound.roundId);
                        if (r && !r.warnedFiveSeconds) {
                            r.warnedFiveSeconds = true;
                            await bot.telegram.sendMessage(chatId, `<b>⏳ До итогов раунда осталось менее 5 секунд!</b>`, { parse_mode: 'HTML' });
                        }
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

    // Обработчик вызова бота F_BOT
    async handleBotChallenge(bot, chatId, roundId, userId) {
        const activeRounds = this.chatRounds[chatId] || [];
        const round = activeRounds.find(r => r.roundId === roundId);
        if (!round || round.state !== 'WAITING_FOR_BOT') {
            return { success: false, message: 'Раунд не найден или предложение недействительно.' };
        }
        
        const realPlayers = Object.keys(round.participants).filter(id => id !== 'F_BOT');
        if (realPlayers[0] !== userId.toString()) {
            return { success: false, message: 'Это предложение только для создателя комнаты.' };
        }
        
        round.participants['F_BOT'] = { username: 'F BOT', amount: round.roundAmount, isBot: true };
        round.state = 'EXTENDED_BY_BOT';
        
        const addedTime = 10 * 1000;
        round.endTime = Date.now() + addedTime;
        
        const timerKey = `${chatId}_${roundId}`;
        clearTimeout(this.cancelRoundTimers[timerKey]);
        
        this.roundTimers[timerKey] = setTimeout(async () => {
            await this.endRound(bot, chatId, roundId);
        }, addedTime);
        
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
        
        if (realPlayers.length === 0) {
            this.resetRound(chatId, roundId);
            return;
        }
        
        // Логика F_BOT: если только 1 реальный игрок и бот еще не добавлен
        if (realPlayers.length === 1 && !participants['F_BOT']) {
            if (Math.random() < 0.5) {
                round.state = 'WAITING_FOR_BOT';
                const keyboard = Markup.inlineKeyboard([
                    Markup.button.callback('🤖 Сыграть с F BOT', `play_with_bot_${roundId}`)
                ]);
                await bot.telegram.sendMessage(
                    chatId,
                    `🤖 <b>F BOT</b> заметил, что вам скучно одному!\nСыграть с ним на ${round.roundAmount.toLocaleString('ru-RU')} PF?`,
                    { parse_mode: 'HTML', ...keyboard }
                );
                
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
        
        // Генерация результатов
        if (hasBot && realPlayers.length === 1) {
            // Бот против 1 игрока: 55% шанс бота
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
                    const totalPoints = dice1 + dice2;
                    results[userId] = { dice1, dice2, totalPoints };
                }
                const pointsArray = Object.values(results).map((result) => result.totalPoints);
                const uniquePoints = new Set(pointsArray);
                if (uniquePoints.size !== pointsArray.length) hasDuplicates = true;
            }
        }
        
        for (const userId in participants) {
            if (userId === 'F_BOT') continue;
            const { dice1, dice2 } = results[userId];
            const bets = await getDiceBetsByRoundId(roundId);
            const bet = bets.find((bet) => bet.user_id === userId);
            if (bet) await updateDiceResults(bet.id, dice1, dice2);
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
        
        const totalBank = Object.entries(participants).filter(([id]) => id !== 'F_BOT').reduce((sum, [id, p]) => sum + p.amount, 0);
        const commissionRate = round.roundAmount < 100000 ? 5 : 10;
        const prizePool = totalBank - (totalBank * (commissionRate / 100));
        const realWinners = winners.filter(id => id !== 'F_BOT');
        const prizePerWinner = realWinners.length > 0 ? Math.floor(prizePool / realWinners.length) : 0;
        
        let finalMessage = `<b>🎲 Итоги раунда дайса</b> (${round.roundAmount.toLocaleString('ru-RU')} PF):\n`;
        for (const userId in participants) {
            const { username } = participants[userId];
            const { dice1, dice2, totalPoints } = results[userId];
            if (userId === 'F_BOT') {
                finalMessage += `🤖 <b>F BOT</b> - ${totalPoints}\n`;
            } else {
                finalMessage += `${createUserLink(userId, username)} - ${totalPoints}\n`;
            }
        }
        finalMessage += `\n💰 Банк: ${totalBank.toLocaleString('ru-RU')} PF\n`;
        
        if (winners.includes('F_BOT') && realWinners.length === 0) {
            finalMessage += `🏆 Победитель: <b>F BOT</b>\n💰 Банк сгорает!\n`;
        } else if (realWinners.length === 1) {
            const winnerId = realWinners[0];
            const { username } = participants[winnerId];
            finalMessage += `🏆 Победитель: ${createUserLink(winnerId, username)}\n<b>🤑 Выигрыш:</b> ${prizePerWinner.toLocaleString('ru-RU')} PF\n`;
            finalMessage += `💶 Комиссия: ${commissionRate}%\n`;
            await updateUserBalance(winnerId, prizePerWinner);
        } else if (realWinners.length > 1) {
            finalMessage += `🏆 Победители (${realWinners.length}):\n`;
            for (const winnerId of realWinners) {
                const { username } = participants[winnerId];
                finalMessage += `- ${createUserLink(winnerId, username)}\n`;
                await updateUserBalance(winnerId, prizePerWinner);
            }
            finalMessage += `\n<b>Каждый выиграл:</b> ${prizePerWinner.toLocaleString('ru-RU')} PF\n`;
            finalMessage += `💶 Комиссия: ${commissionRate}%\n`;
        } else {
            finalMessage += `Никто не выиграл.\n`;
        }
        
        const repeatButton = Markup.inlineKeyboard([
            Markup.button.callback(`🔄 Повторить (${round.roundAmount.toLocaleString('ru-RU')} PF)`, `repeat_round_${round.roundAmount}`)
        ]);
        
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
            const { amount } = participants[userId];
            await updateUserBalance(userId, amount);
        }
    }

    showBank = (chatId) => {
        const activeRounds = this.chatRounds[chatId] || [];
        if (activeRounds.length === 0) {
            return { text: '<b>Текущие раунды еще не начаты.</b>' };
        }
        let bankMessage = '<b>—— АКТИВНЫЕ DICE КОМНАТЫ ——</b>\n\n';
        const keyboards = [];
        
        for (const round of activeRounds) {
            const participants = Object.entries(round.participants || {});
            if (participants.length === 0) continue;
            const remainingTime = Math.max(0, Math.ceil((round.endTime - Date.now()) / 1000));
            const totalBank = participants.reduce((sum, [id, p]) => id === 'F_BOT' ? sum : sum + p.amount, 0);
            
            bankMessage += `<b>🎲 Раунд (${round.roundAmount.toLocaleString('ru-RU')} PF)</b>\n`;
            for (const [uid, p] of participants) {
                if (uid === 'F_BOT' || p.isBot) {
                    bankMessage += `• 🤖 <b>F BOT</b> - <b>${p.amount.toLocaleString('ru-RU')} PF</b>\n`;
                } else {
                    bankMessage += `• ${createUserLink(uid, p.username)} - <b>${p.amount.toLocaleString('ru-RU')} PF</b>\n`;
                }
            }
            bankMessage += `\n<b>💰 Банк:</b> ${totalBank.toLocaleString('ru-RU')} PF\n`;
            bankMessage += `<b>⏳ Оставшееся время:</b> ${remainingTime} сек.\n`;
            
            keyboards.push([Markup.button.callback(`Участвовать (${round.roundAmount.toLocaleString('ru-RU')} PF)`, `participate_${round.roundId}`)]);
            bankMessage += '\n<b>=================</b>\n\n';
        }
        return { 
            text: bankMessage.trim() || '<b>❕ Вы не участвуете ни в одном раунде.</b>', 
            reply_markup: Markup.inlineKeyboard(keyboards).reply_markup 
        };
    };
    
    getParticipateKeyboard(roundId, amount) {
        return Markup.inlineKeyboard([
            Markup.button.callback(`Участвовать (${amount.toLocaleString('ru-RU')} PF)`, `participate_${roundId}`)
        ]);
    }
}

function parseBetAmount(input) {
    input = input.trim().toLowerCase();
    const match = input.match(/^([\d.,]+)([к]*)$/);
    if (!match) throw new Error('❕ Некорректный формат суммы ставки.');
    const numberPart = match[1].replace(',', '.');
    const suffix = match[2] || '';
    const number = parseFloat(numberPart);
    if (isNaN(number) || number <= 0) throw new Error('❕ Некорректная сумма ставки.');
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

async function diceHandler(ctx) {
    try {
        const chatId = ctx.chat.id;
        const lowerText = ctx.message.text.trim().toLowerCase();
        if (!(await isDiceChat(chatId))) return ctx.reply('❕ Режим Dice не активирован в этом чате.');
        const userId = ctx.from.id;
        const userFromDb = await getUserById(userId.toString());
        const username = userFromDb?.username || 'Неизвестный';
        const userBalance = userFromDb.balance || 0;
        const MIN_BET = 100;
        const MAX_BET = 4000000;
        const tenPercentBet = Math.floor(userBalance * 0.1);
        const fiftyPercentBet = Math.floor(userBalance * 0.5);
        const fullBalanceBet = userBalance;
        let bets = [];
        if (tenPercentBet >= MIN_BET && tenPercentBet <= MAX_BET) bets.push(tenPercentBet);
        if (fiftyPercentBet >= MIN_BET && fiftyPercentBet <= MAX_BET) bets.push(fiftyPercentBet);
        if (fullBalanceBet >= MIN_BET && fullBalanceBet <= MAX_BET) bets.push(fullBalanceBet);
        if (bets.length === 0) {
            return ctx.replyWithHTML(`<b>❌ Проверьте свой баланс.</b>\nМинимальная ставка: ${MIN_BET} PF\nМаксимальная ставка: ${MAX_BET} PF`);
        }
        const instructions = `\n🎲  <b >Как сделать ставку на Dice? </b >\nВведите команду вручную:\nПример:  <code >дайс 100 </code > или  <code >дайс 1к </code >\n <b >Доступные варианты ставок: </b >\n`;
        const keyboard = Markup.inlineKeyboard(bets.map((bet) => [Markup.button.callback(`дайс ${Math.floor(bet).toLocaleString('ru-RU')} PF`, `start_dice_${bet}`)]));
        return ctx.replyWithHTML(instructions, keyboard);
    } catch (error) {
        console.error('Ошибка при обработке команды "дайс":', error);
        return ctx.reply('Произошла ошибка. Попробуйте позже.', { parse_mode: 'HTML' });
    }
}

module.exports = { diceGame: new DiceGame(), parseBetAmount, diceHandler };