const { Telegraf, Markup } = require('telegraf'); // Используем telegraf
const { isTechAdmin } = require('../admin/addBalance'); // Проверка прав технического администратора

// Максимальная длина одного сообщения в Telegram
const MAX_MESSAGE_LENGTH = 4096;

// Функция для обработки команды "объявление"
async function callEveryoneHandler(ctx) {
  try {
    // Проверяем, что команда вызвана в публичном чате
    if (ctx.chat.type === 'private') {
      return ctx.reply('Эта команда доступна только в групповых чатах.');
    }

    // Получаем ID отправителя
    const senderId = ctx.from.id.toString();

    // Проверяем права "Тех администратора"
    const isSenderTechAdmin = await isTechAdmin(senderId);
    if (!isSenderTechAdmin) {
      return ctx.reply('У вас недостаточно прав для выполнения этой команды.');
    }

    // Получаем ID чата
    const chatId = ctx.chat.id;

    // Получаем текст объявления из команды
    const text = ctx.message.text.trim();
    const parts = text.split(/\s+/);
    const announcement = parts.slice(1).join(' '); // Текст объявления

    if (!announcement) {
      return ctx.reply('Пожалуйста, укажите текст объявления.');
    }

    // Получаем список администраторов или участников
    let members = [];
    if (process.env.USE_ADMIN_LIST_ONLY === 'true') {
      // Получаем только администраторов
      members = await getChatAdministrators(ctx, chatId);
    } else {
      // Получаем участников из базы данных (если реализовано)
      members = await getAllMembersFromDatabase(chatId);
    }

    if (!members || members.length === 0) {
      return ctx.reply('Не удалось получить список участников чата.');
    }

    // Формируем сообщение с тегами участников, исключая ботов
    const tags = members
      .filter(member => !member.is_bot) // Исключаем ботов
      .map(member => `<a href="tg://user?id=${member.id}">\u200B</a>`) // Тегаем пользователей невидимым символом
      .filter(tag => tag !== ''); // Убираем пустые теги

    if (tags.length === 0) {
      return ctx.reply('Нет доступных участников для тега.');
    }

    // Разбиваем теги на части, чтобы не превышать лимит сообщения
    const messageChunks = splitMessageByChunks(tags, MAX_MESSAGE_LENGTH);

    // Отправляем первое сообщение с объявлениями и тегами
    let announcementMessage = `<b>📢 Объявление:</b>\n\n${announcement}`;
    if (messageChunks.length > 0) {
      announcementMessage += `\n\n${messageChunks[0]}`;
    }
    await ctx.replyWithHTML(announcementMessage);

    // Если есть дополнительные части, отправляем их отдельно
    for (let i = 1; i < messageChunks.length; i++) {
      await ctx.reply(messageChunks[i], { parse_mode: 'HTML' });
    }
  } catch (error) {
    console.error('Ошибка при выполнении команды "объявление":', error);
    return ctx.reply('Произошла ошибка при выполнении команды.');
  }
}

// Функция для разбиения сообщения на части
function splitMessageByChunks(tags, maxLength) {
  const chunks = [];
  let currentChunk = '';

  for (const tag of tags) {
    // Если добавление нового тега превышает лимит, сохраняем текущий чанк и начинаем новый
    if ((currentChunk + tag + ' ').length > maxLength) {
      chunks.push(currentChunk.trim());
      currentChunk = '';
    }

    currentChunk += tag + ' ';
  }

  // Добавляем последний чанк, если он не пустой
  if (currentChunk.trim() !== '') {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}

// Функция для получения списка администраторов чата
async function getChatAdministrators(ctx, chatId) {
  try {
    // Используем метод getChatAdministrators для получения администраторов
    const response = await ctx.telegram.getChatAdministrators(chatId);

    if (!response || response.length === 0) {
      return [];
    }

    return response.map(admin => admin.user); // Возвращаем только объекты пользователей
  } catch (error) {
    console.error('Ошибка при получении списка администраторов чата:', error);
    return [];
  }
}

// Функция для получения участников из базы данных
async function getAllMembersFromDatabase(chatId) {
  try {
    // Здесь должна быть логика получения участников из базы данных
    // Например, запрос к таблице участников чата
    // Пример возврата:
    return [
      { id: 123456789, is_bot: false },
      { id: 987654321, is_bot: false },
      // Другие участники...
    ];
  } catch (error) {
    console.error('Ошибка при получении участников из базы данных:', error);
    return [];
  }
}

// Регистрация команды в боте
module.exports = {
  callEveryoneHandler
};