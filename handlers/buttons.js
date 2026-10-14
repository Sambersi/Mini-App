const { Markup } = require('telegraf'); // Импортируем Markup из Telegraf
const { isDoubleChat, isDiceChat } = require('../db');



// Клавиатура для обычного режима
function createHelpKeyboard() {
    return Markup.keyboard([
        ['🏦 Банк', '🎃 HALLOWEEN EVENT', '🍩 Донат'], // Первая строка (2 кнопки)
        ['👥 Реф система', '👾 Босс', '🎮 Игровые режимы'], // Вторая строка (2 кнопки)
        ['🏆 Рейтинг', '📦 Контейнеры', '🪪 Профиль'] // Третья строка (3 кнопки)
    ])
        .resize() // Автоматически изменять размер клавиатуры
}

// Клавиатура для режима "дабл"
function createDoubleKeyboard() {
    return Markup.keyboard([
        ['х2', 'х3', 'х5', 'GAME'], // Первая строка (4 кнопки)
        ['Банк', 'Баланс', 'Донат', 'Бонус'] // Вторая строка (3 кнопки)
    ])
        .resize(); // Автоматически изменять размер клавиатуры
}

// Клавиатура для режима "дайс"
function createDiceKeyboard() {
    return Markup.keyboard([
        ['Dice', 'Банк', 'Донат'], // Первая строка (2 кнопки)
        ['Баланс', 'Рейтинг', 'Бонус'], // Вторая строка (2 кнопки)
        
    ])
        .resize(); // Автоматически изменять размер клавиатуры
}

// Функция для обработки клавиатуры в зависимости от режима чата
async function handleChatModeKeyboard(ctx) {
    try {
        // Получаем ID чата
        const chatId = ctx.chat.id.toString();

        // Проверяем активные режимы чата
        const isDoubleChatEnabled = await isDoubleChat(chatId);
        const isDiceChatEnabled = await isDiceChat(chatId);

        let keyboard;
        let message;

        if (isDoubleChatEnabled) {
            // Если активен режим "дабл"
            keyboard = createDoubleKeyboard();
            message = '🎮 Активен режим "DOUBLE PLUS". Используйте кнопки для управления ставками:';
        } else if (isDiceChatEnabled) {
            // Если активен режим "дайс"
            keyboard = createDiceKeyboard();
            message = '🎲 Активен режим "DICE". Используйте кнопки для управления игрой:';
        } else {
            // Обычный режим
            keyboard = createHelpKeyboard();
            message = '📚 Доступные команды:';
        }

        // Отправляем сообщение с соответствующей клавиатурой
        await ctx.reply(message, {
            reply_markup: keyboard.reply_markup, // Убедитесь, что клавиатура передается как объект
            parse_mode: 'HTML'
        });
    } catch (error) {
        console.error('[handleChatModeKeyboard] Ошибка:', error);
        await ctx.reply('Произошла ошибка при определении режима чата.', { parse_mode: 'HTML' });
    }
}

// Экспортируем функции для использования в других файлах
module.exports = {
    createHelpKeyboard,
    createDoubleKeyboard,
    createDiceKeyboard,
    handleChatModeKeyboard,
};