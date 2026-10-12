// utils/errorNotifier.js
const MAIN_ADMIN_ID = process.env.MAIN_ADMIN;

/**
 * Форматирует дату/время по Москве в читаемый вид.
 * @param {Date} [date] - дата, по умолчанию сейчас
 * @returns {string} например: "12 октября 2026, 23:58:18 МСК"
 */
function formatMoscowTime(date = new Date()) {
    return date.toLocaleString('ru-RU', {
        timeZone: 'Europe/Moscow',
        day: '2-digit',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    }) + ' МСК';
}

/**
 * Переводит технические коды ошибок и сообщения в понятный русский текст.
 * @param {*} error - объект ошибки, строка или что угодно
 * @returns {string}
 */
function humanizeError(error) {
    const message = error?.message || String(error);
    const code = error?.code || '';

    // Справочник сетевых кодов Node.js
    const codeMap = {
        'ECONNREFUSED': 'Соединение отклонено (сервер недоступен)',
        'ETIMEDOUT':    'Превышено время ожидания ответа',
        'ENOTFOUND':    'Не удалось найти адрес сервера (DNS)',
        'ECONNRESET':   'Соединение сброшено удалённой стороной',
        'EPIPE':        'Соединение закрыто преждевременно',
        'EAI_AGAIN':    'Временная ошибка DNS',
        'EADDRINUSE':   'Порт уже занят другим процессом',
        'EACCES':       'Нет прав доступа',
    };

    if (code && codeMap[code]) return `${codeMap[code]} (код: ${code})`;

    // Поиск по подстрокам в сообщении
    const patterns = [
        [/socket hang up/i,       'Соединение разорвано'],
        [/ECONNREFUSED/i,         'Соединение отклонено (ECONNREFUSED)'],
        [/ETIMEDOUT/i,            'Таймаут соединения (ETIMEDOUT)'],
        [/ENOTFOUND/i,            'Не найден адрес сервера (ENOTFOUND)'],
        [/ECONNRESET/i,           'Соединение сброшено (ECONNRESET)'],
        [/FetchError/i,           'Сбой HTTP-запроса к внешнему сервису'],
        [/TelegramError/i,        'Ошибка Telegram API'],
        [/Timeout/i,              'Таймаут операции'],
        [/\b429\b/,               'Превышен лимит запросов Telegram (Too Many Requests)'],
        [/\b400\b.*Bad Request/i, 'Некорректный запрос к API (Bad Request)'],
        [/\b401\b/,               'Ошибка авторизации (неверный токен)'],
        [/\b403\b.*Forbidden/i,   'Доступ запрещён (Forbidden)'],
        [/\b404\b/,               'Объект не найден (Not Found)'],
        [/\b500\b/,               'Внутренняя ошибка сервера Telegram'],
        [/\b502\b|\b503\b|\b504\b/, 'Сервер Telegram временно недоступен'],
    ];

    for (const [re, text] of patterns) {
        if (re.test(message)) return text;
    }

    // Фоллбэк: обрезаем слишком длинные сообщения
    return message.length > 200 ? message.substring(0, 200) + '…' : message;
}

/**
 * Отправляет красивое уведомление об ошибке главному админу.
 * Никогда не выбрасывает исключений — сетевые сбои только логирует.
 *
 * @param {import('telegraf').Telegraf} bot - экземпляр бота
 * @param {*} reason - причина (строка или объект ошибки)
 * @param {Object} [opts]
 * @param {boolean} [opts.critical=false] - критическая ли ошибка (бот остановлен)
 * @param {string} [opts.context] - дополнительный контекст (например, "SIGTERM")
 */
async function sendErrorNotification(bot, reason, opts = {}) {
    const { critical = false, context = null } = opts;

    if (!MAIN_ADMIN_ID) {
        console.warn('[NOTIFIER] MAIN_ADMIN_ID не задан в .env — уведомление не отправлено.');
        return;
    }
    if (!bot?.telegram) {
        console.warn('[NOTIFIER] bot.telegram недоступен — уведомление не отправлено.');
        return;
    }

    const time    = formatMoscowTime();
    const decoded = humanizeError(reason);
    const emoji   = critical ? '🚨' : '⚠️';
    const title   = critical ? 'КРИТИЧЕСКАЯ ОШИБКА' : 'СБОЙ В РАБОТЕ';
    const status  = critical ? 'Бот остановлен ❌' : 'Бот продолжает работу ✅';

    const lines = [
        `${emoji} <b>${title}</b>`,
        '',
        `📍 <b>Статус:</b> ${status}`,
        `🔍 <b>Что произошло:</b> ${decoded}`,
    ];
    if (context) lines.push(`📎 <b>Контекст:</b> ${context}`);
    lines.push(`🕐 <b>Время:</b> ${time}`);

    try {
        await bot.telegram.sendMessage(MAIN_ADMIN_ID, lines.join('\n'), { parse_mode: 'HTML' });
    } catch (e) {
        // Тихо логируем — уведомление не должно ломать процесс
        console.error('[NOTIFIER] Не удалось отправить уведомление:', e.message);
    }
}

module.exports = {
    formatMoscowTime,
    humanizeError,
    sendErrorNotification,
};