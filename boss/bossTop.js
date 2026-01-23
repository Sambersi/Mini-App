const { Markup } = require('telegraf');
const { getTopPlayersByBossDamage, isHyperlinkDisabled } = require('../db'); // Импортируем функции из базы данных

// Функция для форматирования чисел с разделителями тысяч
function formatNumber(number) {
    if (number === null || number === undefined) return '0'; // Защита от null или undefined
    return number.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

// Символы для цифр (эмодзи)
const digitEmojis = {
    '0': '0️⃣',
    '1': '1️⃣',
    '2': '2️⃣',
    '3': '3️⃣',
    '4': '4️⃣',
    '5': '5️⃣',
    '6': '6️⃣',
    '7': '7️⃣',
    '8': '8️⃣',
    '9': '9️⃣',
  };
  
  // Функция для преобразования числа в эмодзи
  function numberToEmoji(number) {
    return String(number).split('').map(digit => digitEmojis[digit] || digit).join('');
  }

// Функция для создания ссылки на пользователя с учетом анонимности
function createUserLink(userId, username, disableHyperlink) {
    const escapedUsername = username
        ? username.replace(/([<>&"'])/g, (match) => {
              const escapeMap = {
                  '<': '<',
                  '>': '>',
                  '&': '&amp;',
                  '"': '&quot;',
                  "'": '&#39;',
              };
              return escapeMap[match];
          })
        : 'Неизвестный';

    if (disableHyperlink) {
        return escapedUsername;
    }

    return `<a href="tg://user?id=${userId}">${escapedUsername}</a>`;
}

  
// Обработчик команды "топ_босс"
async function bossTopHandler(ctx) {
    try {
      // Получаем ID текущего пользователя
      const currentUserId = ctx.from.id.toString();
  
      // Получаем топ игроков по нанесённому урону
      const topPlayers = await getTopPlayersByBossDamage();
  
      // Проверяем, что топ не пустой
      if (!topPlayers || topPlayers.length === 0) {
        return ctx.reply('❌ Список игроков пуст.');
      }
  
      // Генерируем сообщение с топом (ограничиваем до 25 игроков)
      let message = '🏆 Топ-25 игроков по нанесённому урону боссу:\n\n';
  
      for (let i = 0; i < Math.min(25, topPlayers.length); i++) { // Ограничение на 25 игроков
        const player = topPlayers[i];
        const position = i + 1;
        const username = player?.username || 'Неизвестный';
        const userId = player?.id; // ID пользователя из базы данных (может быть null)
        const damage = formatNumber(player?.total_damage || 0);
  
        // Создаем ссылку на пользователя
        const userLink = createUserLink(userId, username, isHyperlinkDisabled(userId));
  
        // Преобразуем позицию в эмодзи
        const positionEmoji = numberToEmoji(position);
  
        message += `${positionEmoji} ${userLink} — ${damage} урона\n`;
      }
  
      // Находим место текущего пользователя в общем списке
      const currentUser = topPlayers.find(player => player.id === currentUserId);
      if (currentUser) {
        const userPosition = topPlayers.indexOf(currentUser) + 1;
  
        // Если пользователь не входит в топ-25, добавляем информацию о его месте
        if (userPosition > 25) {
          const totalDamage = formatNumber(currentUser.total_damage || 0);
          const userPositionEmoji = numberToEmoji(userPosition);
  
          // Создаем ссылку на текущего пользователя
          const userLink = createUserLink(currentUserId, currentUser.username, isHyperlinkDisabled(currentUserId));
  
          // Добавляем разделительную линию
          message += `\n─────────────────────\n\n${userPositionEmoji} ${userLink} — ${totalDamage} урона`;
        }
      } else {
        // Если пользователь вообще не нанес урон, выводим его место с нулевым уроном
        const userPosition = topPlayers.length + 1;
        const userPositionEmoji = numberToEmoji(userPosition);
  
        // Создаем ссылку на текущего пользователя
        const userLink = createUserLink(currentUserId, ctx.from.username, isHyperlinkDisabled(currentUserId));
  
        // Добавляем разделительную линию
        message += `\n─────────────────────\n\n${userPositionEmoji} ${userLink} — 0 урона`;
      }
  
      // Создаём клавиатуру с кнопками
      const keyboard = {
        inline_keyboard: [
          [{ text: '⬅️ Назад в меню босса', callback_data: 'back_to_boss_handler' }],
        ],
      };
  
      // Отправляем текстовое сообщение с топом
      await ctx.reply(message, {
        parse_mode: 'HTML',
        reply_markup: keyboard,
      });
    } catch (error) {
      console.error('[BOSS TOP] Ошибка при обработке команды:', error);
      await ctx.reply('❌ Произошла ошибка при формировании топа.');
    }
  }

module.exports = {
    bossTopHandler,
};