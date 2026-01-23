const { isAdmin } = require('../admin/addBalance');
const { getUserSkinsByNumericId, getAllSkins, takeSkinFromUser, giveSkinToUser, getUserByAnyId, getSkinById } = require('../db');
const fs = require('fs');
const path = require('path');

// Функция для экранирования HTML-символов
function escapeHtml(text) {
  if (typeof text !== 'string') {
    return text;
  }
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '<')
    .replace(/>/g, '>')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Функция для проверки скинов
async function checkSkins(ctx) {
  try {
    // Проверяем права администратора
    if (!(await isAdmin(ctx))) {
      return ctx.reply('❌ У вас нет прав для выполнения этой команды.');
    }

    // Получаем аргументы команды
    const args = ctx.message.text.split(/\s+/);

    if (args.length === 1) {
      // Если команда вызвана без параметров, выводим список всех скинов
      const allSkins = getAllSkins(); // Получаем все скины из базы данных

      if (allSkins.length === 0) {
        return ctx.reply('📦 В проекте нет доступных скинов.');
      }

      // Формируем сообщение со списком всех скинов (экранируем названия)
      const skinsList = allSkins.map(skin => 
        `ID: ${skin.id} | Название: ${escapeHtml(skin.name)} | Редкость: ${skin.rarity} | Цена: ${skin.price} ${skin.currency_type}`
      ).join('\n');

      // Разделяем сообщение на части, если оно превышает лимит Telegram (4096 символов)
      const messageChunks = splitMessage(skinsList, 4096);

      // Отправляем каждую часть как отдельное сообщение
      for (const chunk of messageChunks) {
        await ctx.replyWithHTML(`📦 Список всех доступных скинов:\n\n${chunk}`);
      }
    } else {
      // Если указан numeric_id, проверяем скины пользователя
      const numericId = parseInt(args[1], 10);
      if (isNaN(numericId)) {
        return ctx.reply('❌ Неверный формат numeric_id. Укажите число.');
      }

      // Получаем список скинов пользователя
      const skins = getUserSkinsByNumericId(numericId);

      if (skins.length === 0) {
        return ctx.reply(`📦 У пользователя с numeric_id ${numericId} нет скинов.`);
      }

      // Формируем сообщение со списком скинов пользователя (экранируем названия)
      const skinsList = skins.map(skin => 
        `ID: ${skin.id} | Название: ${escapeHtml(skin.name)} | Редкость: ${skin.rarity} | Серийный номер: ${skin.serial_number} | Файл: <code>${escapeHtml(skin.file_name)}</code>`
      ).join('\n');

      // Отправляем результат пользователю
      ctx.replyWithHTML(`📦 Список скинов пользователя с numeric_id ${numericId}:\n\n${skinsList}`);
    }
  } catch (error) {
    console.error('[ERROR] Ошибка при выполнении команды /проверить_скины:', error);
    ctx.reply('❌ Произошла ошибка при получении списка скинов.');
  }
}

// Функция для отправки изображения скина
async function checkSkinImage(ctx) {
  try {
    // Проверяем права администратора
    if (!(await isAdmin(ctx))) {
      return ctx.reply('❌ У вас нет прав для выполнения этой команды.');
    }

    // Получаем название файла из команды
    const args = ctx.message.text.split(/\s+/);
    if (args.length < 2) {
      return ctx.reply('❌ Использование: /чек название_файла_скина');
    }

    const fileName = args[1].trim(); // Название файла без лишних пробелов
    const filePath = path.join(__dirname, '..', 'images', `${fileName}`); // Корректный путь к папке images

    // Проверяем, существует ли файл
    if (!fs.existsSync(filePath)) {
      return ctx.reply(`❌ Файл "${fileName}" не найден.`);
    }

    // Отправляем файл пользователю
    await ctx.replyWithPhoto({ source: filePath });
  } catch (error) {
    console.error('[ERROR] Ошибка при отправке изображения:', error);
    ctx.reply('❌ Произошла ошибка при отправке изображения.');
  }
}

// Функция для разделения длинного сообщения на части
function splitMessage(message, maxLength) {
  const chunks = [];
  let currentChunk = '';

  // Разделяем сообщение по строкам
  const lines = message.split('\n');
  for (const line of lines) {
    // Проверяем длину с учетом новой строки
    if ((currentChunk + line + '\n').length > maxLength) {
      if (currentChunk) {
        chunks.push(currentChunk.trim());
      }
      currentChunk = line + '\n';
    } else {
      currentChunk += line + '\n';
    }
  }

  // Добавляем последний чанк, если он не пустой
  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}

// Обработчик команды "выдать_скин"
async function giveSkinHandler(ctx) {
  const args = ctx.message.text.split(/\s+/);
  if (args.length < 3) {
    return ctx.reply('Использование: /выдать_скин [ID игрока] [ID скина]');
  }

  const userId = args[1];
  const skinId = parseInt(args[2], 10);

  // Проверяем существование пользователя
  const user = getUserByAnyId(userId);
  if (!user) {
    return ctx.reply('Пользователь не найден.');
  }

  // Проверяем существование скина
  const skin = getSkinById(skinId);
  if (!skin) {
    return ctx.reply('Скин не найден.');
  }

  // Выдаем скин пользователю
  const result = giveSkinToUser(userId, skinId);
  if (result.success) {
    return ctx.reply(`Скин "${escapeHtml(skin.name)}" успешно выдан пользователю ${user.username}.`);
  } else {
    return ctx.reply(result.message);
  }
}

// Обработчик команды "забрать_скин"
async function takeSkinHandler(ctx) {
  const args = ctx.message.text.split(/\s+/);
  if (args.length < 3) {
    return ctx.reply('Использование: /забрать_скин [ID игрока] [ID скина]');
  }

  const userId = args[1];
  const skinId = parseInt(args[2], 10);

  // Проверяем существование пользователя
  const user = getUserByAnyId(userId);
  if (!user) {
    return ctx.reply('Пользователь не найден.');
  }

  // Проверяем существование скина
  const skin = getSkinById(skinId);
  if (!skin) {
    return ctx.reply('Скин не найден.');
  }

  // Забираем скин у пользователя
  const result = takeSkinFromUser(userId, skinId);
  if (result.success) {
    return ctx.reply(`Скин "${escapeHtml(skin.name)}" успешно забран у пользователя ${user.username}.`);
  } else {
    return ctx.reply(result.message);
  }
}

module.exports = {
  checkSkins,
  checkSkinImage,
  giveSkinHandler,
  takeSkinHandler,
};