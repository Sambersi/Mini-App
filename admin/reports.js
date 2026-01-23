const { logError } = require('../utils/errorHandler');
const {
  getUserById,
  updateUserDFBalance,
  incrementLikesReceived,
  incrementDislikesReceived,
  getUserStatuses,
  hasUnansweredReports
} = require('../db');

// Функция для проверки, является ли пользователь главным администратором
function isMainAdmin(userId) {
  return process.env.MAIN_ADMIN === userId.toString();
}


// Обновленная функция для проверки прав администратора
async function isAdmin(ctx) {
  const senderId = ctx.from.id.toString();
  // Проверяем, является ли пользователь главным администратором
  if (isMainAdmin(senderId)) {
    return true;
  }
  // Проверяем, есть ли у пользователя статус "Тех администратор" или другой админ-статус
  try {
    const statuses = await getUserStatuses(senderId);
    return statuses.includes('Тех администратор') || statuses.includes('Администратор');
  } catch (error) {
    console.error('Ошибка при проверке статусов администратора:', error);
    return false;
  }
}

// Функция для создания нового репорта
async function createReport(ctx, db) {
  try {
    const userId = ctx.from.id.toString();
    const user = await getUserById(userId);

    if (!user) {
      return ctx.reply(
        '❕ <b>Вы не зарегистрированы.</b> Используйте команду "/start" для регистрации.',
        { parse_mode: 'HTML' }
      );
    }

    // Проверяем, есть ли у пользователя неотвеченные репорты
    const hasUnanswered = await hasUnansweredReports(userId);
    if (hasUnanswered) {
      return ctx.reply(
        '❌ <b>У вас уже есть неотвеченный репорт. Дождитесь ответа администратора.</b>',
        { parse_mode: 'HTML' }
      );
    }

    const text = ctx.message.text.trim();
    const parts = text.split(/\s+/);
    const reportText = parts.slice(1).join(' ').trim();

    if (!reportText) {
      return ctx.reply('❕ <b>Использование:</b> репорт [текст вопроса]', { parse_mode: 'HTML' });
    }

    // Ограничиваем текст репорта до 242 символов
    const truncatedText = truncateText(reportText, 242);

    const username = user.username || `User${user.numeric_id}`;
    const userLink = `<a href="tg://user?id=${userId}">${escapeHtml(username)}</a>`;

    const stmt = db.prepare(`
      INSERT INTO reports (user_id, username, report_text, status, likes, dislikes, user_feedback, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const info = stmt.run(userId, username, truncatedText, 'not_answered', 0, 0, null, Date.now() / 1000);

    const reportNumber = info.lastInsertRowid;
    const adminMessage = `
📮 <b>Новый репорт №${reportNumber}:</b>
👤 <b>Пользователь:</b> ${userLink}
📃 <b>Текст репорта:</b> ${escapeHtml(truncatedText)}
✖️ <b>Статус:</b> Не отвеченный
`.trim();

    await ctx.telegram.sendMessage(process.env.REPORTS_CHAT_ID, adminMessage, { parse_mode: 'HTML' });
    await ctx.reply(
      '☑️ <b>Ваш репорт успешно отправлен администрации</b>, ожидайте ответа!',
      { parse_mode: 'HTML' }
    );
  } catch (error) {
    logError(error);
    await ctx.reply('❕ <b>Произошла ошибка при отправке репорта.</b>', { parse_mode: 'HTML' });
  }
}


// Функция для получения всех НЕОТВЕЧЕННЫХ репортов
async function getReports(ctx, db) {
  try {
    const senderId = ctx.from.id.toString();
    const isAdminCheck = await isAdmin(ctx);

    if (!isAdminCheck) {
      return;
    }

    // Получаем список неотвеченных репортов
    const stmt = db.prepare(`
      SELECT r.*, u.numeric_id as user_numeric_id
      FROM reports r
      LEFT JOIN users u ON r.user_id = u.id
      WHERE r.status = ?
      ORDER BY r.id DESC
      LIMIT 15
    `);
    const reports = stmt.all('not_answered');

    if (!reports || reports.length === 0) {
      return ctx.reply('<b>❕ Список неотвеченных репортов пуст.</b>', { parse_mode: 'HTML' });
    }

    let response = '';
    for (const report of reports) {
      const userLink = `<a href="tg://user?id=${report.user_id}">${escapeHtml(report.username)}</a>`;
      const truncatedText = truncateText(escapeHtml(report.report_text), 242); // Ограничиваем текст до 242 символов

      // Добавляем numeric_id пользователя в вывод
      response += `
<b>Репорт №${report.id}:</b>
👤 <b>Пользователь:</b> ${userLink} (ID: ${report.user_numeric_id})
📃 <b>Текст вопроса:</b> ${truncatedText}
--------------------------
`;
    }

    // Разделяем сообщение на части, если оно превышает лимит
    const MAX_MESSAGE_LENGTH = 4096;
    const messages = splitMessage(response.trim(), MAX_MESSAGE_LENGTH);

    for (const message of messages) {
      await ctx.reply(message, { parse_mode: 'HTML' });
    }
  } catch (error) {
    logError(error);
    await ctx.reply('❕ <b>Произошла ошибка при получении списка репортов.</b>', { parse_mode: 'HTML' });
  }
}

// Функция для безопасного экранирования HTML-символов
function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;') // Заменяем & на &amp;
    .replace(/</g, '<')  // Заменяем < на <
    .replace(/>/g, '>'); // Заменяем > на >
}

// Функция для ограничения длины текста
function truncateText(text, maxLength) {
  if (text.length <= maxLength) {
    return text;
  }
  return text.slice(0, maxLength - 3) + '...'; // Добавляем многоточие в конце
}

// Функция для разделения длинного текста на части
function splitMessage(text, maxLength) {
  const messages = [];
  while (text.length > 0) {
    let chunk = text.slice(0, maxLength);

    // Если часть текста заканчивается на незакрытый тег, уменьшаем длину до ближайшего закрытия тега
    const lastTagIndex = chunk.lastIndexOf('</');
    if (lastTagIndex !== -1 && lastTagIndex + '</b>'.length > maxLength) {
      chunk = chunk.slice(0, lastTagIndex);
    }

    messages.push(chunk.trim());
    text = text.slice(chunk.length);
  }
  return messages;
}

// Функция для безопасного экранирования HTML-символов
function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;') // Заменяем & на &amp;
    .replace(/</g, '<')  // Заменяем < на <
    .replace(/>/g, '>'); // Заменяем > на >
}

// Функция для разделения длинного текста на части
function splitMessage(text, maxLength) {
  const messages = [];
  while (text.length > 0) {
    let chunk = text.slice(0, maxLength);

    // Если часть текста заканчивается на незакрытый тег, уменьшаем длину до ближайшего закрытия тега
    const lastTagIndex = chunk.lastIndexOf('</');
    if (lastTagIndex !== -1 && lastTagIndex + '</b>'.length > maxLength) {
      chunk = chunk.slice(0, lastTagIndex);
    }

    messages.push(chunk.trim());
    text = text.slice(chunk.length);
  }
  return messages;
}

// Функция для ответа на репорт
async function answerReport(ctx, db, parts) {
  try {
    const senderId = ctx.from.id.toString();
    const isAdminCheck = await isAdmin(ctx);

    if (!isAdminCheck) {
      return;
    }

    if (parts.length < 3) {
      return ctx.reply('❕ <b>Использование:</b> ответить [номер_репорта] [текст_ответа]', { parse_mode: 'HTML' });
    }

    const reportId = parseInt(parts[1], 10);
    const responseText = parts.slice(2).join(' ').trim();

    if (isNaN(reportId) || !responseText) {
      return ctx.reply('❕ <b>Некорректный номер репорта или текст ответа.</b>', { parse_mode: 'HTML' });
    }

    const stmt = db.prepare('SELECT * FROM reports WHERE id = ? AND status = ?');
    const report = stmt.get(reportId, 'not_answered');

    if (!report) {
      return ctx.reply('❕ <b>Репорт с указанным номером не найден или уже был отвечен.</b>', { parse_mode: 'HTML' });
    }

    const admin = await getUserById(ctx.from.id.toString());
    const adminUsername = admin?.username || 'Анонимный админ';
    const adminLink = `<a href="tg://user?id=${ctx.from.id}">${escapeHtml(adminUsername)}</a>`;
    const escapedResponseText = escapeHtml(responseText); // Экранируем текст ответа

    const updateStmt = db.prepare(`
      UPDATE reports
      SET status = 'answered', admin_response = ?, admin_id = ?, admin_username = ?
      WHERE id = ?
    `);
    updateStmt.run(responseText, ctx.from.id.toString(), adminUsername, reportId);

    const playerUserId = report.user_id;
    const replyMessage = `
📮 <b>Ответ администратора:</b>
👤 <b>Администратор:</b> ${adminLink}
📝 <b>Текст ответа:</b> ${escapedResponseText}
`.trim();

    const likeButton = {
      text: '👍 Лайк',
      callback_data: `report_feedback_${reportId}_like`,
    };
    const dislikeButton = {
      text: '👎 Дизлайк',
      callback_data: `report_feedback_${reportId}_dislike`,
    };

    await ctx.telegram.sendMessage(playerUserId, replyMessage, {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [[likeButton, dislikeButton]],
      },
    });

    const adminNotification = `
📮 <b>Репорт №${reportId} был отвечен:</b>
👤 <b>Администратор:</b> ${adminLink}
📃 <b>Текст вопроса:</b> ${escapeHtml(report.report_text)}
📝 <b>Текст ответа:</b> ${escapedResponseText}
`.trim();

    await ctx.telegram.sendMessage(process.env.REPORTS_CHAT_ID, adminNotification, { parse_mode: 'HTML' });
    await ctx.reply('✅ <b>Ответ успешно отправлен игроку.</b>', { parse_mode: 'HTML' });
  } catch (error) {
    logError(error);
    await ctx.reply('❕ <b>Произошла ошибка при ответе на репорт.</b>', { parse_mode: 'HTML' });
  }
}

// Функция для удаления репорта по ID
async function deleteReportById(ctx, db, reportId) {
  try {
    // Проверяем права администратора
    const isAdminCheck = await isAdmin(ctx);
    if (!isAdminCheck) {
      return ctx.reply('❌ У вас нет прав для использования этой команды.');
    }

    // Проверяем, существует ли репорт в базе данных
    const stmt = db.prepare('SELECT * FROM reports WHERE id = ?');
    const report = stmt.get(reportId);

    if (!report) {
      return ctx.reply(`❌ Репорт с ID ${reportId} не найден.`);
    }

    // Удаляем репорт
    const deleteStmt = db.prepare('DELETE FROM reports WHERE id = ?');
    const info = deleteStmt.run(reportId);

    if (info.changes > 0) {
      return ctx.reply(`✅ Репорт с ID ${reportId} успешно удален.`);
    } else {
      return ctx.reply(`❌ Не удалось удалить репорт с ID ${reportId}.`);
    }
  } catch (error) {
    console.error('[REPORTS] Ошибка при удалении репорта:', error);
    return ctx.reply('❌ Произошла ошибка. Попробуйте позже.');
  }
}

module.exports = {
  createReport,
  getReports,
  answerReport,
  deleteReportById
};