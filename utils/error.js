const { Telegraf } = require('telegraf');
const { logError } = require('./errorHandler'); // Импортируем функцию логирования ошибок
const { incrementRequestCount, calculateLoadDetails } = require('../botMonitoring');

// Глобальный обработчик ошибок
function setupGlobalErrorHandler(bot) {
    bot.catch(async (err, ctx) => {
        try {
            // Логируем ошибку
            logError(err);

            // Определяем контекст ошибки
            const chatId = ctx?.chat?.id || 'unknown_chat';
            const userId = ctx?.from?.id || 'unknown_user';
            const messageText = ctx?.message?.text || 'unknown_message';

            console.error(`Ошибка в чате ${chatId}, пользователь ${userId}, сообщение: "${messageText}"`);
            console.error('Детали ошибки:', err);

            // Проверяем тип ошибки
            if (err.response && err.response.description) {
                const errorDescription = err.response.description;

                // Обработка ошибок Telegram API
                switch (errorDescription) {
                    case 'Forbidden: bot was blocked by the user':
                        console.warn(`Пользователь ${userId} заблокировал бота.`);
                        break;

                    case 'Bad Request: chat not found':
                        console.warn(`Чат ${chatId} не найден.`);
                        break;

                    case 'Conflict: terminated by other getUpdates request':
                        console.error('Конфликт: другой процесс использует getUpdates.');
                        break;

                    default:
                        console.error(`Неизвестная ошибка Telegram API: ${errorDescription}`);
                }
            } else if (err instanceof TypeError || err instanceof ReferenceError) {
                // Обработка ошибок JavaScript
                console.error(`Ошибка JavaScript: ${err.message}`);
            } else if (err.name === 'DatabaseError') {
                // Обработка ошибок базы данных
                console.error(`Ошибка базы данных: ${err.message}`);
            } else {
                // Обработка остальных ошибок
                console.error('Произошла неизвестная ошибка:', err);
            }

            // Отправляем уведомление администраторам в случае критической ошибки
            if (isCriticalError(err)) {
                const errorMessage = `
⚠️ <b>КРИТИЧЕСКАЯ ОШИБКА</b> ⚠️

<b>Дата:</b> ${new Date().toLocaleString()}
<b>Чат:</b> ${chatId}
<b>Пользователь:</b> ${userId}
<b>Сообщение:</b> ${messageText}

<b>Описание:</b>
${err.message || 'Неизвестная ошибка'}
                `;
                await sendAlertToAdmins(errorMessage); // Уведомляем администраторов
            }

            // Отправляем сообщение пользователю, если контекст доступен
            if (ctx) {
                try {
                    await ctx.reply('Произошла ошибка. Попробуйте позже.', { parse_mode: 'HTML' });
                } catch (replyError) {
                    console.error('Не удалось отправить сообщение об ошибке пользователю:', replyError);
                }
            }

            // Защита от перегрузки
            if (isOverloaded()) {
                console.warn('Бот перегружен. Временно блокируем новые запросы.');
                await cooldownBot(); // Временно блокируем запросы
            }
        } catch (handlerError) {
            console.error('Ошибка в глобальном обработчике ошибок:', handlerError);
        }
    });
}

// Функция для определения критических ошибок
function isCriticalError(err) {
    const criticalErrors = [
        'DatabaseError',
        'Conflict: terminated by other getUpdates request',
        'ECONNRESET',
        'ETIMEDOUT',
        'UnhandledPromiseRejectionWarning',
    ];

    return criticalErrors.some((errorType) => err.message.includes(errorType));
}

// Функция для проверки перегрузки
function isOverloaded() {
    const loadDetails = calculateLoadDetails();
    return loadDetails.overall > 90; // Если нагрузка превышает 90%
}

// Функция для временного блокирования запросов
async function cooldownBot() {
    console.log('Бот временно переходит в режим ожидания...');
    await new Promise((resolve) => setTimeout(resolve, 5000)); // Пауза на 5 секунд
    console.log('Бот возобновил работу.');
}

module.exports = { setupGlobalErrorHandler };