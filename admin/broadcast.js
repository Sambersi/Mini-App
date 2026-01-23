const { getAllUsers, getUserStatuses } = require('../db'); // Получаем всех пользователей из базы данных
const { logError } = require('../utils/errorHandler'); // Импортируем обработчик ошибок

// Функция для проверки, является ли пользователь главным администратором
function isMainAdmin(userId) {
  return process.env.MAIN_ADMIN === userId.toString();
}

// Функция для проверки, является ли пользователь "Тех администратор"
async function isTechAdmin(userId) {
  const statuses = await getUserStatuses(userId); // Получаем статусы пользователя
  return statuses.includes('Тех администратор'); // Проверяем наличие статуса
}

// Функция для проверки прав администратора
async function isAdmin(ctx) {
  const senderId = ctx.from.id.toString();
  return isMainAdmin(senderId) || (await isTechAdmin(senderId));
}

// Функция для рассылки сообщений
async function broadcastMessage(ctx, parts) {
  try {
    // Проверяем права администратора
    if (!(await isAdmin(ctx))) {
      return ctx.reply('У вас нет прав для использования этой команды.');
    }

    const commandType = parts[1].toLowerCase(); // Тип рассылки (текст, цитата)
    if (!['текст', 'цитата'].includes(commandType)) {
      return ctx.reply('Некорректный тип рассылки. Доступные типы: текст, цитата.');
    }

    let successCount = 0;
    let failureCount = 0;

    // Получаем список всех зарегистированных пользователей
    const users = await getAllUsers();
    if (!users || users.length === 0) {
      return ctx.reply('Список пользователей пуст. Рассылка невозможна.');
    }

    // Обработка текстовой рассылки
    if (commandType === 'текст') {
      const contentText = ctx.message.text.split(/\s+/).slice(2).join(' '); // Основной контент для текстовой рассылки
      if (!contentText.trim()) {
        return ctx.reply('Текст рассылки не может быть пустым. Использование: рассылка текст <текст>');
      }

      for (const user of users) {
        try {
          await ctx.telegram.sendMessage(user.id, contentText, { parse_mode: 'HTML' });
          successCount++;
        } catch (error) {
          console.error(`Ошибка при отправке рассылки пользователю ${user.id}:`, error);
          failureCount++;
        }
      }
    }

    // Обработка рассылки цитаты
    else if (commandType === 'цитата') {
      const replyToMessage = ctx.message.reply_to_message; // Сообщение, на которое отвечает админ
      const removeAuthor = parts[2] === '-'; // Проверяем наличие "-"

      if (!replyToMessage) {
        return ctx.reply('Ответьте на сообщение.');
      }

      // Рассылка через ответное сообщение
      for (const user of users) {
        try {
          if (removeAuthor) {
            // Отправляем только текст без автора
            await ctx.telegram.sendMessage(user.id, replyToMessage.text, { parse_mode: 'HTML' });
          } else {
            // Пересылаем сообщение с автором
            await ctx.telegram.forwardMessage(user.id, replyToMessage.chat.id, replyToMessage.message_id);
          }
          successCount++;
        } catch (error) {
          console.error(`Ошибка при отправке рассылки пользователю ${user.id}:`, error);
          failureCount++;
        }
      }
    }

    // Отправляем администратору статистику рассылки
    const adminMessage = `
Рассылка завершена.
Всего пользователей: ${users.length}
Успешно доставлено: ${successCount}
Не удалось доставить: ${failureCount}
`.trim();

    await ctx.reply(adminMessage, { parse_mode: 'HTML' });
  } catch (error) {
    logError(error); // Логируем ошибку
    await ctx.reply('Произошла ошибка при выполнении рассылки.');
  }
}

// Экспортируем функцию
module.exports = {
  broadcastMessage,
};