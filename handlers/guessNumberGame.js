const { getUserById } = require('../db');

// Хранилище состояния игры
const gameState = {
    isRunning: false,
    secretNumber: null,
    winnerId: null,
    startTime: null, // Время начала игры
    attemptedPlayers: new Set(), // Множество для хранения ID игроков
};

// Функция для запуска игры
async function startGame(ctx) {
    const parts = ctx.message.text.split(' ');

    if (parts.length !== 2 || isNaN(parseInt(parts[1]))) {
        return ctx.reply('❌ Неверный формат команды. Использование: начать_игру [число]');
    }

    if (gameState.isRunning) {
        return ctx.reply('❌ Игра уже запущена. Завершите текущую игру перед началом новой.');
    }

    const secretNumber = parseInt(parts[1]);

    // Сохраняем состояние игры
    gameState.isRunning = true;
    gameState.secretNumber = secretNumber;
    gameState.winnerId = null;
    gameState.startTime = Date.now(); // Сохраняем время начала игры
    gameState.attemptedPlayers.clear(); // Очищаем список игроков

    console.log(`[ИГРА] Игра началась. Загаданное число: ${secretNumber}`);
}

// Функция для завершения игры
async function stopGame(ctx) {
    if (!gameState.isRunning) {
        return ctx.reply('❌ В данный момент игра не запущена.');
    }

    const secretNumber = gameState.secretNumber;

    // Очищаем состояние игры
    gameState.isRunning = false;
    gameState.secretNumber = null;
    gameState.winnerId = null;
    gameState.startTime = null; // Сбрасываем время начала игры
    gameState.attemptedPlayers.clear(); // Очищаем список игроков

    await ctx.reply(`⏹ Игра "Угадай число" принудительно завершена. Загаданное число было: ${secretNumber}`);
    console.log('[ИГРА] Игра принудительно завершена');
}

// Обработчик попыток угадать число
async function handleGuessNumber(ctx, text, bot) {
    if (!gameState.isRunning) return;

    const guessedNumber = parseInt(text);
    const secretNumber = gameState.secretNumber;

    if (isNaN(guessedNumber)) return;

    // Добавляем ID игрока в список участников
    gameState.attemptedPlayers.add(ctx.from.id);

    if (guessedNumber === secretNumber && !gameState.winnerId) {
        gameState.winnerId = ctx.from.id;

        const winnerLink = `<a href="tg://user?id=${ctx.from.id}">${ctx.from.first_name}</a>`;

        // Получаем numeric_id победителя из базы данных
        const winnerUser = await getUserById(ctx.from.id.toString());
        const winnerNumericId = winnerUser?.numeric_id || 'Неизвестно';

        // Рассчитываем время, прошедшее с начала игры
        const elapsedTime = Math.floor((Date.now() - gameState.startTime) / 1000); // В секундах
        const playerCount = gameState.attemptedPlayers.size; // Количество уникальных игроков

        // ID сообщения с верным числом (чтобы отправить ответ)
        const messageId = ctx.message.message_id;

        // Отправляем первое сообщение о победе
        await ctx.replyWithHTML(`🎉 Победитель найден! Игрок ${winnerLink} угадал число!`, {
            reply_to_message_id: messageId,
        });

        // Функция для отправки сообщений с задержкой
        const sendDelayedMessages = async () => {
            await new Promise(resolve => setTimeout(resolve, 2000)); // Задержка 2 секунды
            await ctx.reply('⏹ Игра завершена. Угадывать больше не нужно.', {
                reply_to_message_id: messageId,
            });

            await new Promise(resolve => setTimeout(resolve, 2000)); // Задержка 2 секунды
            await ctx.reply(`⏱️ Число было угадано за ${elapsedTime} секунд.`);

            await new Promise(resolve => setTimeout(resolve, 2000)); // Задержка 2 секунды
            await ctx.reply(`👥 В игре приняли участие ${playerCount} игрок(ов).`);

            await new Promise(resolve => setTimeout(resolve, 2000)); // Задержка 2 секунды
            await ctx.replyWithHTML(`🔢 Загаданное число было: <b>${secretNumber}</b>`, {
                reply_to_message_id: messageId,
            });
        };

        // Вызываем функцию отправки сообщений
        await sendDelayedMessages();

        console.log(`[ИГРА] Игрок ${ctx.from.id} угадал число за ${elapsedTime} секунд. Игроков: ${playerCount}`);

        // Отправляем numeric_id победителя администратору
        const adminTelegramId = 7330982735; // Telegram ID администратора
        try {
            await bot.telegram.sendMessage(
                adminTelegramId,
                `🎮 Игра завершена! ID победителя: <code>${winnerNumericId}</code>. Время: ${elapsedTime} сек., игроков: ${playerCount}.`,
                { parse_mode: 'HTML' }
            );
        } catch (error) {
            console.error('[ИГРА] Ошибка при отправке numeric_id администратору:', error);
        }

        // Сбрасываем состояние игры
        gameState.isRunning = false;
        gameState.secretNumber = null;
        gameState.winnerId = null;
        gameState.startTime = null;
        gameState.attemptedPlayers.clear();
    }
}

// Экспортируем функции
module.exports = {
    startGame,
    stopGame,
    handleGuessNumber,
    gameState,
};