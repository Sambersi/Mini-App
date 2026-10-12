// utils/errorNotifier.js
function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
  
  function formatMoscowTime(date = new Date()) {
    return date.toLocaleString('ru-RU', {
      timeZone: 'Europe/Moscow',
      day: '2-digit', month: 'long', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false,
    }) + ' МСК';
  }
  
  function humanizeError(error) {
    const message = error?.message || String(error);
    const code = error?.code || '';
  
    const codeMap = {
      ECONNREFUSED: 'Соединение отклонено (сервер недоступен)',
      ETIMEDOUT: 'Превышено время ожидания ответа',
      ENOTFOUND: 'Не удалось найти адрес сервера (DNS)',
      ECONNRESET: 'Соединение сброшено удалённой стороной',
      EPIPE: 'Соединение закрыто преждевременно',
      EAI_AGAIN: 'Временная ошибка DNS',
      EADDRINUSE: 'Порт уже занят другим процессом',
      EACCES: 'Нет прав доступа',
    };
    if (code && codeMap[code]) return `${codeMap[code]} (код: ${code})`;
  
    const patterns = [
      [/socket hang up/i, 'Соединение разорвано'],
      [/ECONNREFUSED/i, 'Соединение отклонено (ECONNREFUSED)'],
      [/ETIMEDOUT/i, 'Таймаут соединения (ETIMEDOUT)'],
      [/ENOTFOUND/i, 'Не найден адрес сервера (ENOTFOUND)'],
      [/ECONNRESET/i, 'Соединение сброшено (ECONNRESET)'],
      [/FetchError/i, 'Сбой HTTP-запроса к внешнему сервису'],
      [/TelegramError/i, 'Ошибка Telegram API'],
      [/Timeout/i, 'Таймаут операции'],
      [/\b429\b/, 'Превышен лимит запросов Telegram (Too Many Requests)'],
      [/Bad Request/i, 'Некорректный запрос к API (Bad Request)'],
      [/\b401\b/, 'Ошибка авторизации (неверный токен)'],
      [/\b403\b/, 'Доступ запрещён (Forbidden)'],
      [/\b404\b/, 'Объект не найден (Not Found)'],
      [/\b50[0234]\b/, 'Сервер Telegram временно недоступен'],
    ];
    for (const [re, text] of patterns) {
      if (re.test(message)) return text;
    }
    return message.length > 200 ? message.substring(0, 200) + '…' : message;
  }
  
  async function sendErrorNotification(bot, reason, opts = {}) {
    const { critical = false, context = null } = opts;
  
    // Читаем переменную В МОМЕНТ ВЫЗОВА, а не при загрузке модуля
    const adminId = process.env.MAIN_ADMIN;
    if (!adminId) {
      console.warn('[NOTIFIER] MAIN_ADMIN не задан в .env — уведомление пропущено.');
      return false;
    }
    if (!bot?.telegram) {
      console.warn('[NOTIFIER] bot.telegram недоступен — уведомление пропущено.');
      return false;
    }
  
    const time = formatMoscowTime();
    const decoded = escapeHtml(humanizeError(reason)); // ← экранируем HTML
    const emoji = critical ? '🚨' : '⚠️';
    const title = critical ? 'КРИТИЧЕСКАЯ ОШИБКА' : 'СБОЙ В РАБОТЕ';
    const status = critical ? 'Бот остановлен ❌' : 'Бот продолжает работу ✅';
  
    const lines = [
      `${emoji} <b>${title}</b>`,
      '',
      `📍 <b>Статус:</b> ${status}`,
      `🔍 <b>Что произошло:</b> ${decoded}`,
    ];
    if (context) lines.push(`📎 <b>Контекст:</b> ${escapeHtml(context)}`);
    lines.push(`🕐 <b>Время:</b> ${time}`);
  
    try {
      await bot.telegram.sendMessage(adminId, lines.join('\n'), { parse_mode: 'HTML' });
      console.log('[NOTIFIER] Уведомление отправлено админу.');
      return true;
    } catch (e) {
      console.error('[NOTIFIER] Ошибка отправки уведомления:', e.message);
      return false;
    }
  }
  
  module.exports = { formatMoscowTime, humanizeError, sendErrorNotification, escapeHtml };