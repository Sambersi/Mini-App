// roulette.js
const { Telegraf, Markup } = require('telegraf');
const { createCanvas } = require('canvas'); // Убедитесь, что установлен: npm install canvas
const {
    getUserBalance, // Получение текущего баланса пользователя
    updateUserBalance, // Обновление баланса пользователя
    getUserById
} = require('../db'); // Импортируем необходимые функции из db.js

// --- Хранилище сессий пользователей для казино (временно, для демонстрации) ---
// В реальном приложении используйте БД или Redis
// Обновлённая структура сессии: { betsCount: number, captchaSolved: boolean, correctAnswer: string, captchaPending: boolean, lastGameAction: { type: 'new' | 'repeat', data: any } }
const casinoUserSessions = {};

// --- Функции для работы с капчей казино ---

// Функция для генерации изображения с числом для казино
async function generateCasinoCaptchaImage(number) {
    const canvas = createCanvas(150, 70);
    const ctx = canvas.getContext('2d');

    function getRandomColor() {
        const r = Math.floor(Math.random() * 256);
        const g = Math.floor(Math.random() * 256);
        const b = Math.floor(Math.random() * 256);
        return `rgb(${r}, ${g}, ${b})`;
    }

    const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    gradient.addColorStop(0, getRandomColor());
    gradient.addColorStop(1, getRandomColor());
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (let i = 0; i < 5; i++) {
        ctx.strokeStyle = getRandomColor();
        ctx.lineWidth = Math.random() * 3 + 1;
        ctx.beginPath();
        ctx.moveTo(Math.random() * canvas.width, Math.random() * canvas.height);
        ctx.lineTo(Math.random() * canvas.width, Math.random() * canvas.height);
        ctx.stroke();
    }

    for (let i = 0; i < 5; i++) {
        ctx.fillStyle = getRandomColor();
        const radius = Math.random() * 10 + 5;
        const x = Math.random() * canvas.width;
        const y = Math.random() * canvas.height;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
    }

    for (let i = 0; i < 3; i++) {
        ctx.fillStyle = getRandomColor();
        const width = Math.random() * 30 + 10;
        const height = Math.random() * 20 + 10;
        const x = Math.random() * canvas.width;
        const y = Math.random() * canvas.height;
        ctx.fillRect(x, y, width, height);
    }

    ctx.font = '36px Arial';
    ctx.fillStyle = getRandomColor();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(number.toString(), canvas.width / 2, canvas.height / 2);

    for (let i = 0; i < 100; i++) {
        const x = Math.random() * canvas.width;
        const y = Math.random() * canvas.height;
        ctx.fillStyle = getRandomColor();
        ctx.fillRect(x, y, 1, 1);
    }

    return canvas.toBuffer();
}

// Функция для проверки, требуется ли капча казино
// Изменено: также true, если капча показана, но не решена
// Изменено: капча теперь показывается каждые 9 ставок
function isCasinoCaptchaRequired(userId) {
    const session = casinoUserSessions[userId] || { betsCount: 0, captchaSolved: false, captchaPending: false };
    return (session.betsCount > 0 && session.betsCount % 9 === 0 && !session.captchaSolved) || session.captchaPending;
}

// Функция для отправки капчи казино пользователю
async function sendCasinoCaptcha(ctx, userId) {
    try {
        const numbers = Array.from({ length: 90 }, (_, i) => 10 + i);
        const selectedNumbers = [];
        while (selectedNumbers.length < 6) {
            const randomIndex = Math.floor(Math.random() * numbers.length);
            const randomNumber = numbers[randomIndex];
            if (!selectedNumbers.includes(randomNumber)) {
                selectedNumbers.push(randomNumber);
                numbers.splice(randomIndex, 1);
            }
        }

        const correctNumberIndex = Math.floor(Math.random() * selectedNumbers.length);
        const correctNumber = selectedNumbers[correctNumberIndex];
        const correctAnswer = `casino_captcha_${correctNumber}`;

        const answers = [...selectedNumbers.map(number => `casino_wrong_${number}`)];
        answers[correctNumberIndex] = correctAnswer;
        answers.sort(() => Math.random() - 0.5);

        const buttons = answers.map(answer => {
            const number = parseInt(answer.split('_')[2], 10);
            return Markup.button.callback(number.toString(), answer);
        });

        const keyboard = Markup.inlineKeyboard([
            buttons.slice(0, 3),
            buttons.slice(3, 6)
        ]);

        const imageBuffer = await generateCasinoCaptchaImage(correctNumber);

        // Используем editMessageMedia если это callback, иначе replyWithPhoto
        if (ctx.callbackQuery && ctx.callbackQuery.message) {
            const chatId = ctx.callbackQuery.message.chat.id;
            const messageId = ctx.callbackQuery.message.message_id;
            try {
                await ctx.telegram.editMessageMedia(
                    chatId,
                    messageId,
                    null,
                    {
                        type: 'photo',
                        media: { source: imageBuffer },
                        caption: '🛡️ <b>Для продолжения игры в казино пройдите капчу.</b>\n\n🎨 Выберите число, указанное на картинке:',
                        parse_mode: 'HTML' // <-- Перенесено сюда
                    },
                    { // <-- reply_markup отдельно
                        ...keyboard 
                    }
                );
            } catch (editError) {
                if (editError.response?.error_code === 400 && editError.response?.description?.includes('message is not modified')) {
                    console.warn('[Казино] Сообщение с капчей не было изменено.');
                    // Если сообщение не изменилось, просто обновим клавиатуру
                    await ctx.telegram.editMessageReplyMarkup(chatId, messageId, null, keyboard);
                } else {
                    console.error('[Казино] Ошибка при редактировании сообщения с капчей:', editError);
                    // Если редактирование не удалось, отправляем новое сообщение
                    await ctx.replyWithPhoto(
                        { source: imageBuffer },
                        {
                            caption: '🛡️ <b>Для продолжения игры в казино пройдите капчу.</b>\n\n🎨 Выберите число, указанное на картинке:',
                            parse_mode: 'HTML',
                            ...keyboard
                        }
                    );
                }
            }
        } else {
            await ctx.replyWithPhoto(
                { source: imageBuffer },
                {
                    caption: '🛡️ <b>Для продолжения игры в казино пройдите капчу.</b>\n\n🎨 Выберите число, указанное на картинке:',
                    parse_mode: 'HTML',
                    ...keyboard
                }
            );
        }

        if (!casinoUserSessions[userId]) {
            casinoUserSessions[userId] = { betsCount: 0, captchaSolved: false, captchaPending: true };
        } else {
            casinoUserSessions[userId].captchaPending = true; // Устанавливаем флаг ожидания
        }
        casinoUserSessions[userId].correctAnswer = correctAnswer;

        return true;
    } catch (error) {
        console.error('[Казино] Ошибка при генерации капчи:', error);
        await ctx.reply('❌ Произошла ошибка при генерации капчи казино. Попробуйте позже.');
        // Сбрасываем флаг в случае ошибки
        if (casinoUserSessions[userId]) {
            casinoUserSessions[userId].captchaPending = false;
        }
        return false;
    }
}

// Функция для продолжения игры после успешного решения капчи
// Принимаем оригинальный ctx для отправки сообщений
async function proceedWithGame(originalCtx, userId) {
    const session = casinoUserSessions[userId];
    if (!session || !session.lastGameAction) {
        console.warn(`[Казино] Нет сохранённого действия для продолжения игры для пользователя ${userId}`);
        // Отправляем сообщение через оригинальный контекст
        try {
            await originalCtx.reply('❌ Не удалось продолжить игру. Попробуйте снова.');
        } catch (e) {
            console.error('[Казино] Ошибка при отправке сообщения об ошибке продолжения игры:', e);
        }
        return;
    }

    const action = session.lastGameAction;
    delete session.lastGameAction; // Очищаем после использования

    console.log(`[Казино] Продолжаем игру для пользователя ${userId} с действием:`, action);

    try {
        // Важно: используем оригинальный ctx, переданный в функцию, а не какой-то воссозданный
        if (action.type === 'new') {
            // Для новой игры action.data содержит текст команды (например, "казино 1000")
            // Мы не можем просто подставить ctx.message.text, так как это может быть не тот объект
            // Вместо этого, напрямую вызываем логику обработки ставки с нужными параметрами
            
            // Парсим ставку из сохранённых данных
            const parts = action.data.trim().split(/\s+/);
            const betInput = parts[1]; // "1000" из "казино 1000"
            
            if (!betInput) {
                throw new Error('❌ Некорректная команда для продолжения игры.');
            }
            
            // Получаем баланс пользователя
            const userBalance = getUserBalance(userId, 'PF');
            
            // Парсим ставку
            let betAmount;
            try {
                betAmount = parseBetAmount(betInput, userBalance);
            } catch (parseError) {
                throw new Error(`❌ Ошибка при парсинге ставки: ${parseError.message}`);
            }
            
            // Проверяем диапазон ставки
            if (betAmount < 100 || betAmount > 350000) {
                throw new Error('❌ Ставка должна быть от 100 до 350 000.');
            }

            // Проверяем баланс пользователя
            if (userBalance < betAmount) {
                throw new Error('❌ Недостаточно средств для выполнения ставки.');
            }

            // Списываем ставку с баланса
            try {
                updateUserBalance(userId, -betAmount); // Списываем ставку
            } catch (error) {
                throw new Error('❌ Произошла ошибка при списании средств.');
            }

            // Отправляем эмодзи игрового автомата 🎰
            const diceMessage = await originalCtx.replyWithDice({ emoji: '🎰' });

            // Ждем 2 секунды перед продолжением
            await new Promise(resolve => setTimeout(resolve, 2000));

            // Получаем значение dice_value от 1 до 64
            const diceValue = diceMessage.dice.value;

            // Декодируем значения слотов
            const slotResults = getSlotResults(diceValue);

            // Преобразуем результаты в эмодзи
            const slotEmojis = slotResults.map(symbol => symbolToEmoji[symbol]);

            // Форматируем текстовое представление результата
            const userLink = createUserLink(userId); // Создаем ссылку на пользователя
            const formattedResult = `🎰 ${userLink}, результаты ставки:\n\n${slotEmojis.join(' | ')}\n`;

            // Проверяем выигрышные комбинации
            const winInfo = checkWin(slotResults);

            // Вычисляем выигрыш и округляем его до целого числа
            const winnings = Math.floor(betAmount * winInfo.multiplier);

            // Начисляем выигрыш на баланс
            if (winnings > 0) {
                try {
                    updateUserBalance(userId, winnings); // Начисляем выигрыш
                } catch (error) {
                    console.error('[Казино] Ошибка при начислении выигрыша:', error);
                    // Важно: средства уже списаны, но выигрыш не начислен. Можно добавить логику восстановления.
                    throw new Error('❌ Произошла ошибка при начислении выигрыша. Свяжитесь с администратором.');
                }
            }

            // --- Обновление счётчика ставок казино ---
            // Увеличиваем счётчик и сбрасываем состояние капчи
            session.betsCount += 1;
            session.captchaSolved = false;
            // --- Конец обновления счётчика ---

            // Формируем итоговое сообщение
            let responseMessage = `${formattedResult}\n`;
            if (winInfo.multiplier > 0) {
                responseMessage += `${winInfo.message} [x${winInfo.multiplier}]\n`;
                responseMessage += `🏆 Ваш выигрыш: ${winnings.toLocaleString('ru-RU')} PF`; // Округленная сумма
            } else {
                responseMessage += `${winInfo.message}\n`;
                responseMessage += `💸 Вы проиграли: ${betAmount.toLocaleString('ru-RU')} PF`;
            }

            // Создаем кнопки "Повторить", "Удвоить ставку" и "Коэффициенты"
            const keyboard = Markup.inlineKeyboard([
                [
                    Markup.button.callback(`🔄 Повторить`, `repeat_bet_${betAmount}`),
                    Markup.button.callback(`✖️ Удвоить ${betAmount * 2} PF`, `double_bet_${betAmount * 2}`)
                ],
                [Markup.button.callback(`📋 Коэффициенты`, `show_coefficients`)]
            ]);

            // Отправляем итоговое сообщение с кнопками через оригинальный ctx
            await originalCtx.reply(responseMessage, { parse_mode: 'HTML', ...keyboard });

            
        } else if (action.type === 'repeat') {
            // Для повторной ставки action.data содержит сумму ставки
            const betAmount = action.data;
            
            // Проверяем, что betAmount является числом
            if (typeof betAmount !== 'number' || isNaN(betAmount)) {
                throw new Error('❌ Некорректная сумма ставки для повтора.');
            }
            
            // Получаем текущий баланс пользователя
            const userBalance = getUserBalance(userId, 'PF');

            // Проверяем баланс пользователя
            if (userBalance < betAmount) {
               throw new Error(`❌ Недостаточно средств для ставки ${betAmount.toLocaleString('ru-RU')} PF.`);
            }

            // Списываем ставку с баланса
            try {
                updateUserBalance(userId, -betAmount);
            } catch (error) {
                throw new Error('❌ Произошла ошибка при списании средств.');
            }

            // Отправляем эмодзи игрового автомата 🎰
            const diceMessage = await originalCtx.replyWithDice({ emoji: '🎰' });

            // Ждем 2 секунды перед продолжением
            await new Promise(resolve => setTimeout(resolve, 2000));

            // Получаем значение dice_value от 1 до 64
            const diceValue = diceMessage.dice.value;

            // Декодируем значения слотов
            const slotResults = getSlotResults(diceValue);

            // Преобразуем результаты в эмодзи
            const slotEmojis = slotResults.map(symbol => symbolToEmoji[symbol]);

            // Форматируем текстовое представление результата
            const userLink = createUserLink(userId); // Создаем ссылку на пользователя
            const formattedResult = `🎰 ${userLink}, результаты ставки:\n\n${slotEmojis.join(' | ')}\n`;

            // Проверяем выигрышные комбинации
            const winInfo = checkWin(slotResults);

            // Вычисляем выигрыш и округляем его до целого числа
            const winnings = Math.floor(betAmount * winInfo.multiplier);

            // Начисляем выигрыш на баланс
            if (winnings > 0) {
                try {
                    updateUserBalance(userId, winnings);
                } catch (error) {
                    console.error('[Казино] Ошибка при начислении выигрыша:', error);
                    // Важно: средства уже списаны, но выигрыш не начислен.
                    throw new Error('❌ Ошибка при начислении выигрыша. Свяжитесь с администратором.');
                }
            }

            // --- Обновление счётчика ставок казино ---
            // Увеличиваем счётчик и сбрасываем состояние капчи
            session.betsCount += 1;
            session.captchaSolved = false;
            // --- Конец обновления счётчика ---

            // Формируем итоговое сообщение
            let responseMessage = `${formattedResult}\n`;
            if (winInfo.multiplier > 0) {
                responseMessage += `${winInfo.message} [x${winInfo.multiplier}]\n`;
                responseMessage += `🏆 Ваш выигрыш: ${winnings.toLocaleString('ru-RU')} PF`; // Округленная сумма
            } else {
                responseMessage += `${winInfo.message}\n`;
                responseMessage += `💸 Вы проиграли: ${betAmount.toLocaleString('ru-RU')} PF`;
            }

            // Создаем кнопки "Повторить", "Удвоить ставку" и "Коэффициенты"
            const keyboard = Markup.inlineKeyboard([
                [
                    Markup.button.callback(`🔄 Повторить`, `repeat_bet_${betAmount}`),
                    Markup.button.callback(`✖️ Удвоить ${betAmount * 2} PF`, `double_bet_${betAmount * 2}`)
                ],
                [Markup.button.callback(`📋 Коэффициенты`, `show_coefficients`)]
            ]);

            // Отправляем новое сообщение с результатами ставки и кнопками через оригинальный ctx
            await originalCtx.reply(responseMessage, { parse_mode: 'HTML', ...keyboard });
        }
    } catch (error) {
        console.error('[Казино] Ошибка при автоматическом продолжении игры:', error);
        try {
            await originalCtx.reply(`❌ ${error.message || 'Произошла ошибка при продолжении игры после капчи. Попробуйте снова.'}`);
        } catch (replyError) {
            console.error('[Казино] Ошибка при отправке сообщения об ошибке:', replyError);
        }
    }
}


// Обработчик правильного ответа на капчу казино
// Принимаем оригинальный ctx для передачи в proceedWithGame
async function casinoCaptchaCorrectHandler(originalCtx) {
    const userId = originalCtx.from.id.toString();
    const session = casinoUserSessions[userId];

    if (!session || originalCtx.callbackQuery.data !== session.correctAnswer) {
        return await originalCtx.answerCbQuery('Эта капча уже неактивна или не для вас.');
    }

    session.captchaSolved = true;
    session.captchaPending = false; // Сбрасываем флаг ожидания
    delete session.correctAnswer;

    try {
        await originalCtx.deleteMessage(originalCtx.callbackQuery.message.message_id);
    } catch (err) {
        console.warn('[Казино] Не удалось удалить сообщение с капчей:', err.message);
    }

    await originalCtx.answerCbQuery('✅ Капча пройдена! Игра продолжается.');
    console.log(`[Казино] Пользователь ${userId} успешно прошел капчу.`);

    // Автоматически продолжаем игру, передавая оригинальный ctx
    await proceedWithGame(originalCtx, userId);
}

// Обработчик неправильного ответа на капчу казино
async function casinoCaptchaWrongHandler(ctx) {
    const userId = ctx.from.id.toString();
    const session = casinoUserSessions[userId];

    if (!session || !session.correctAnswer) {
        return await ctx.answerCbQuery('Эта капча уже неактивна или не для вас.');
    }

    // Не сбрасываем captchaPending, чтобы капча оставалась активной
    await ctx.answerCbQuery('❌ Неверно. Попробуйте еще раз.');

    // Генерируем и отправляем новую капчу (сохраняя состояние ожидания)
    // sendCasinoCaptcha уже устанавливает captchaPending = true
    await sendCasinoCaptcha(ctx, userId);
    console.log(`[Казино] Пользователь ${userId} не прошел капчу, отправлена новая.`);
}


// --- Функции для игры в казино ---

// Функция для создания гиперссылки на пользователя с использованием HTML
function createUserLink(userId) {
    const user = getUserById(userId);
    if (!user) {
        return 'Неизвестный';
    }

    const username = user.username || 'Без имени';
    const displayName = username.replace(/</g, '<').replace(/>/g, '>'); // Исправлено экранирование

    return `<a href="tg://user?id=${userId}">${displayName}</a>`;
}


function parseBetAmount(input, userBalance) {
    input = input.trim().toLowerCase();
    if (input === 'всё' || input === 'все') {
        return Math.min(userBalance, 350000);
    }

    const numberPart = parseFloat(input.replace(/[^0-9.]/g, ''));
    if (isNaN(numberPart) || numberPart <= 0) {
        throw new Error('❌ Пожалуйста, укажите корректную ставку.\n• Например: казино 1к');
    }

    let baseAmount = Math.floor(numberPart);

    const kCount = (input.match(/к/g) || []).length;
    for (let i = 0; i < kCount; i++) {
        baseAmount *= 1000;
    }

    return baseAmount;
}

const symbolToEmoji = {
    "BAR": "BAR",
    "виноград": "🍇",
    "лимон": "🍋",
    "семь": "7"
};

function getSlotResults(diceValue) {
    const symbols = ["BAR", "виноград", "лимон", "семь"];
    diceValue -= 1;
    const result = [];

    for (let i = 0; i < 3; i++) {
        result.push(symbols[diceValue % 4]);
        diceValue = Math.floor(diceValue / 4);
    }

    return result;
}

// Обновленная функция проверки выигрышных комбинаций с новыми коэффициентами
function checkWin(slotResults) {
    const [slot1, slot2, slot3] = slotResults;

    // Проверка на три одинаковых символа
    if (slot1 === slot2 && slot2 === slot3) {
        const multipliers = {
            "BAR": 1.5,       // BAR -> 1.5x
            "виноград": 2.5,  // виноград -> 2.5x
            "лимон": 4,       // лимон -> 4x
            "семь": 7         // семь -> 7x
        };
        return { 
            message: `🤩 Три ${slot1}а!`, 
            multiplier: multipliers[slot1] || 0 
        };
    }

    // Проверка на две семерки
    if (
        (slot1 === "семь" && slot2 === "семь") ||
        (slot1 === "семь" && slot3 === "семь") ||
        (slot2 === "семь" && slot3 === "семь")
    ) {
        return { 
            message: '😎 Две семерки!', 
            multiplier: 2 // 2 семерки -> 2x
        };
    }

    // Проверка на два одинаковых символа
    if (
        (slot1 === slot2 && slot1 !== slot3) ||
        (slot1 === slot3 && slot1 !== slot2) ||
        (slot2 === slot3 && slot2 !== slot1)
    ) {
        const symbol = slot1 === slot2 ? slot1 : slot2 === slot3 ? slot2 : slot1;
        const multipliers = {
            "BAR": 1,         // 2 BAR -> 1x
            "виноград": 1.2,  // 2 винограда -> 1.2x
            "лимон": 1.5      // 2 лимона -> 1.5x
        };
        return { 
            message: `🤩 Два ${symbol}а!`, 
            multiplier: multipliers[symbol] || 0 
        };
    }

    // Все разные символы
    return { 
        message: '😔 Все разные. Попробуйте снова. [0]', 
        multiplier: 0 
    }; // Проигрыш -> 0x
}

const cooldowns = {};

async function rouletteHandler(ctx) {
    try {
        const userId = ctx.from.id.toString();

        // --- Проверка капчи казино ---
        // Изменено: если капча требуется или в процессе, показываем её
        // Изменено: капча теперь показывается каждые 9 ставок
        if (isCasinoCaptchaRequired(userId)) {
             // Сохраняем действие для последующего выполнения
             if (!casinoUserSessions[userId]) {
                casinoUserSessions[userId] = { betsCount: 0, captchaSolved: false, captchaPending: false };
             }
             casinoUserSessions[userId].lastGameAction = { type: 'new', data: ctx.message.text };

             const captchaSent = await sendCasinoCaptcha(ctx, userId);
             // Не устанавливаем общий cooldown, так как капча сама блокирует
             // Отвечаем пользователю через callback query, если это кнопка
             if (ctx.callbackQuery) {
                await ctx.answerCbQuery('🛡️ Пройдите капчу казино, чтобы продолжить.');
             }
             return;
        }
        // --- Конец проверки капчи казино ---

        // Обычная проверка кулдауна для самой игры
        if (cooldowns[userId]) {
            // Отвечаем пользователю через callback query, если это кнопка
            if (ctx.callbackQuery) {
                return await ctx.answerCbQuery('⏳ Подождите завершения предыдущей ставки.');
            } else {
                return await ctx.reply('⏳ Подождите завершения предыдущей ставки.');
            }
        }
        cooldowns[userId] = true;

        const messageText = ctx.message.text.trim();
        const [command, betInput] = messageText.split(/\s+/);

        if (!betInput) {
            delete cooldowns[userId];
            return await ctx.reply('❌ Пожалуйста, укажите корректную ставку.\n• Например: казино 1к');
        }

        const userBalance = getUserBalance(userId, 'PF');

        let betAmount;
        try {
            betAmount = parseBetAmount(betInput, userBalance);
        } catch (error) {
            delete cooldowns[userId];
            return await ctx.reply(error.message);
        }

        if (betAmount < 100 || betAmount > 350000) {
            delete cooldowns[userId];
            return await ctx.reply('❌ Ставка должна быть от 100 до 350 000.');
        }

        if (userBalance < betAmount) {
            delete cooldowns[userId];
            return await ctx.reply('❌ Недостаточно средств для выполнения ставки.');
        }

        try {
            updateUserBalance(userId, -betAmount);
        } catch (error) {
            delete cooldowns[userId];
            return await ctx.reply('❌ Произошла ошибка при списании средств.');
        }

        const diceMessage = await ctx.replyWithDice({ emoji: '🎰' });

        await new Promise(resolve => setTimeout(resolve, 2000));

        const diceValue = diceMessage.dice.value;

        const slotResults = getSlotResults(diceValue);

        const slotEmojis = slotResults.map(symbol => symbolToEmoji[symbol]);

        const userLink = createUserLink(userId);
        const formattedResult = `🎰 ${userLink}, результаты ставки:\n\n${slotEmojis.join(' | ')}\n`;

        const winInfo = checkWin(slotResults);

        const winnings = Math.floor(betAmount * winInfo.multiplier);

        if (winnings > 0) {
            try {
                updateUserBalance(userId, winnings);
            } catch (error) {
                console.error('[Казино] Ошибка при начислении выигрыша:', error);
                delete cooldowns[userId];
                return await ctx.reply('❌ Произошла ошибка при начислении выигрыша. Свяжитесь с администратором.');
            }
        }

        // --- Обновление счётчика ставок казино ---
        if (!casinoUserSessions[userId]) {
            casinoUserSessions[userId] = { betsCount: 0, captchaSolved: false, captchaPending: false };
        }
        casinoUserSessions[userId].betsCount += 1;
        // Не сбрасываем captchaSolved здесь, только после успешной игры
        // captchaSolved будет сброшен в sendCasinoCaptcha при следующей необходимости капчи
        // --- Конец обновления счётчика ---

        let responseMessage = `${formattedResult}\n`;
        if (winInfo.multiplier > 0) {
            responseMessage += `${winInfo.message} [x${winInfo.multiplier}]\n`;
            responseMessage += `🏆 Ваш выигрыш: ${winnings.toLocaleString('ru-RU')} PF`;
        } else {
            responseMessage += `${winInfo.message}\n`;
            responseMessage += `💸 Вы проиграли: ${betAmount.toLocaleString('ru-RU')} PF`;
        }

        const keyboard = Markup.inlineKeyboard([
            [
                Markup.button.callback(`🔄 Повторить`, `repeat_bet_${betAmount}`),
                Markup.button.callback(`✖️ Удвоить ${betAmount * 2} PF`, `double_bet_${betAmount * 2}`)
            ],
            [Markup.button.callback(`📋 Коэффициенты`, `show_coefficients`)]
        ]);

        await ctx.reply(responseMessage, { parse_mode: 'HTML', ...keyboard });

        // Снимаем кулдаун только после успешного завершения игры
        delete cooldowns[userId];
        // Сбрасываем состояние капчи только после успешной игры
        casinoUserSessions[userId].captchaSolved = false;
    } catch (error) {
        console.error('[Казино] Ошибка при выполнении команды "казино":', error);
        delete cooldowns[ctx.from.id.toString()];
        // Сбрасываем состояние капчи в случае ошибки, чтобы не блокировать пользователя
        const userId = ctx.from?.id?.toString();
        if (userId && casinoUserSessions[userId]) {
             casinoUserSessions[userId].captchaPending = false;
             delete casinoUserSessions[userId].lastGameAction; // Очищаем сохранённое действие
        }
        // Отвечаем пользователю через callback query, если это кнопка, иначе обычным сообщением
        if (ctx.callbackQuery) {
            await ctx.answerCbQuery(`❌ ${error.message || 'Произошла ошибка. Попробуйте позже.'}`);
        } else {
            await ctx.reply(`❌ ${error.message || 'Произошла ошибка. Попробуйте позже.'}`);
        }
    }
}

async function repeatBetHandler(ctx, betAmountOverride) {
    try {
        const userId = ctx.from.id.toString();

        // Определяем сумму ставки: либо переопределенная, либо из ctx.match
        let betAmount;
        if (betAmountOverride !== undefined) {
            betAmount = betAmountOverride;
        } else if (ctx.match && ctx.match[1]) {
            betAmount = parseInt(ctx.match[1]);
        } else {
            throw new Error('❌ Не указана сумма ставки для повтора.');
        }

        // --- Проверка капчи казино ---
        // Изменено: если капча требуется или в процессе, показываем её
        // Изменено: капча теперь показывается каждые 9 ставок
        if (isCasinoCaptchaRequired(userId)) {
            // Сохраняем действие для последующего выполнения
             if (!casinoUserSessions[userId]) {
                casinoUserSessions[userId] = { betsCount: 0, captchaSolved: false, captchaPending: false };
             }
             casinoUserSessions[userId].lastGameAction = { type: 'repeat', data: betAmount };

             const captchaSent = await sendCasinoCaptcha(ctx, userId);
             // Отвечаем пользователю через callback query
             return await ctx.answerCbQuery('🛡️ Пройдите капчу казино, чтобы продолжить.');
        }
        // --- Конец проверки капчи казино ---

        // Обычная проверка кулдауна для самой игры
        if (cooldowns[userId]) {
            return await ctx.answerCbQuery('⏳ Подождите завершения предыдущей ставки.');
        }
        cooldowns[userId] = true;


        const userBalance = getUserBalance(userId, 'PF');

        if (userBalance < betAmount) {
            delete cooldowns[userId];
            return await ctx.answerCbQuery(`❌ Недостаточно средств для ставки ${betAmount.toLocaleString('ru-RU')} PF.`);
        }

        try {
            updateUserBalance(userId, -betAmount);
        } catch (error) {
            delete cooldowns[userId];
            return await ctx.answerCbQuery('❌ Произошла ошибка при списании средств.');
        }

        const diceMessage = await ctx.replyWithDice({ emoji: '🎰' });

        await new Promise(resolve => setTimeout(resolve, 2000));

        const diceValue = diceMessage.dice.value;

        const slotResults = getSlotResults(diceValue);

        const slotEmojis = slotResults.map(symbol => symbolToEmoji[symbol]);

        const userLink = createUserLink(userId);
        const formattedResult = `🎰 ${userLink}, результаты ставки:\n\n${slotEmojis.join(' | ')}\n`;

        const winInfo = checkWin(slotResults);

        const winnings = Math.floor(betAmount * winInfo.multiplier);

        if (winnings > 0) {
            try {
                updateUserBalance(userId, winnings);
            } catch (error) {
                console.error('[Казино] Ошибка при начислении выигрыша:', error);
                delete cooldowns[userId];
                return await ctx.answerCbQuery('❌ Ошибка при начислении выигрыша. Свяжитесь с администратором.');
            }
        }

         // --- Обновление счётчика ставок казино ---
         if (!casinoUserSessions[userId]) {
            casinoUserSessions[userId] = { betsCount: 0, captchaSolved: false, captchaPending: false };
        }
        casinoUserSessions[userId].betsCount += 1;
        // Не сбрасываем captchaSolved здесь
        // --- Конец обновления счётчика ---

        let responseMessage = `${formattedResult}\n`;
        if (winInfo.multiplier > 0) {
            responseMessage += `${winInfo.message} [x${winInfo.multiplier}]\n`;
            responseMessage += `🏆 Ваш выигрыш: ${winnings.toLocaleString('ru-RU')} PF`;
        } else {
            responseMessage += `${winInfo.message}\n`;
            responseMessage += `💸 Вы проиграли: ${betAmount.toLocaleString('ru-RU')} PF`;
        }

        const keyboard = Markup.inlineKeyboard([
            [
                Markup.button.callback(`🔄 Повторить`, `repeat_bet_${betAmount}`),
                Markup.button.callback(`✖️ Удвоить ${betAmount * 2} PF`, `double_bet_${betAmount * 2}`)
            ],
            [Markup.button.callback(`📋 Коэффициенты`, `show_coefficients`)]
        ]);

        await ctx.reply(responseMessage, { parse_mode: 'HTML', ...keyboard });

        // Снимаем кулдаун только после успешного завершения игры
        delete cooldowns[userId];
        // Сбрасываем состояние капчи только после успешной игры
        casinoUserSessions[userId].captchaSolved = false;
    } catch (error) {
        console.error('[Казино] Ошибка при обработке повторной ставки:', error);
        delete cooldowns[ctx.from.id.toString()];
         // Сбрасываем состояние капчи в случае ошибки, чтобы не блокировать пользователя
        const userId = ctx.from?.id?.toString();
        if (userId && casinoUserSessions[userId]) {
             casinoUserSessions[userId].captchaPending = false;
             delete casinoUserSessions[userId].lastGameAction; // Очищаем сохранённое действие
        }
        // Отвечаем пользователю через callback query
        await ctx.answerCbQuery(`❌ ${error.message || 'Произошла ошибка. Попробуйте позже.'}`);
    }
}

module.exports = {
    rouletteHandler,
    repeatBetHandler,
    casinoCaptchaCorrectHandler,
    casinoCaptchaWrongHandler
};
