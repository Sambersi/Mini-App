//statusCommands.js
const { 
  getUserByNumericId, 
  updateUserStatus, 
  getAllStatuses, 
  getStatusById, 
  removeUserStatus,
  addSkinToUser,
  getSkinById,
  getSkinIdByName,
  getUserStatuses // Импортируем функцию для получения статусов пользователя
} = require('./db');
const { isAdmin } = require('./admin/addBalance'); // Из папки admin
const path = require('path');
const fs = require('fs');

// --- Конфигурация ---
// ID пользователей, которым разрешено использовать команды награждения и разжалования
const AUTHORIZED_ADMIN_IDS = ['7330982735', '768451950'];

// --- Логика проверки прав ---

// Проверка прав администратора (только для указанных ID)
async function checkAdminRights(ctx) {
  const senderId = ctx?.from?.id?.toString();
  if (!senderId) {
      console.warn('[Статусы] Не удалось определить ID отправителя.');
      return false;
  }
  const isAuthorized = AUTHORIZED_ADMIN_IDS.includes(senderId);
  if (!isAuthorized) {
      console.log(`[Статусы] Пользователь ${senderId} попытался использовать команду администратора, но не имеет прав.`);
      // Намеренно не отправляем сообщение и не бросаем исключение
  }
  return isAuthorized;
}

// Сообщения для каждого статуса
const statusMessages = {
    "Администратор": `
  🚨 Вы получили статус: 👮‍♂️ Администратор 🚨
  
  🎉 Поздравляем! Теперь у вас есть особые привилегии:
  
  • Доступ к админ-чату
  • Доступ к админ командам
  • Эксклюзивные бонусы 
  • Уникальный скин на карточку
  • Возможность просмотра ID и профиль игроков - /id и /prof
  • Возможность зарабатывать DF, отвечая на репорты
  • Скидка 50% на активацию DOUBLE PLUS и DICE
  • х2 на любую сумму игровой валюты (PF) при покупке через ДОНАТ!
  • Повышенный бонус до 2000 PF
  • Лимит контейнеров повышен до 5ОО
  • Безлимит на открытие контейнеров за раз

  💬 За получением ссылки на ADMIN чат - ${process.env.ADMIN_CHAT_LINK || 'Ссылка временно недоступна'} 
  `.trim(),
  
    "DIAMOND": `
  🌟 Вы получили статус: 💎 DIAMOND 
  
  🎉 Поздравляем! Теперь у вас есть особые привилегии:
  
  • Возможность просмотра профилей игроков - /prof
  • Возможность просмотра ID игроков - /id
  • Скидка 35% на активацию DOUBLE PLUS и DICE
  • Эксклюзивный скин на карточку
  • Возможность активации эксклюзивных промо-кодов
  • Приоритет в репорте 
  • Повышенный бонус до 1500 PF
  • Лимит контейнеров повышен до 3ОО 
  • Возможность открывать до 5О контейнеров за раз!
  `.trim(),
  
    "PLATINUM": `
  ✨ Вы получили статус: 🪙 PLATINUM 
  
  🎉 Поздравляем! Теперь у вас есть особые привилегии:
  
  • Возможность просмотра профилей игроков - /prof
  • Возможность просмотра ID игроков - /id
  • Скидка 25% на активацию DOUBLE PLUS и DICE
  • Эксклюзивный скин на карточку
  • Возможность активации эксклюзивных промо-кодов
  • Приоритет в репорте 
  • Повышенный бонус до 750 PF
  • Лимит контейнеров повышен до 250
  `.trim(),
  
    "GOLD": `
  💫 Вы получили статус: 👑 GOLD 💫
  
  🎉 Поздравляем! Теперь у вас есть особые привилегии:
  
  • Возможность просмотра ID игроков - /id
  • Скидка 10% на активацию DOUBLE PLUS + DICE
  • Эксклюзивный скин на карточку
  • Возможность активации эксклюзивных промо-кодов
  • Приоритет в репорте 
  • Повышенный бонус до 500 PF
  • Лимит контейнеров повышен до 2ОО
  `.trim(),
  };

// Обработчик команды "список статусов"
async function listStatusesHandler(ctx) {
  try {
      // Проверяем права администратора
      if (!(await checkAdminRights(ctx))) {
          return; // Завершаем выполнение без отправки ответа, если нет прав
      }

      const statuses = await getAllStatuses(); // Получаем все статусы из базы данных
      if (statuses.length === 0) {
          return ctx.reply('Список статусов пуст.', { parse_mode: 'HTML' });
      }

      // Формируем список статусов
      const statusList = statuses
          .map((status) => `- ${status.name} (ID: ${status.id}, Приоритет: ${status.priority})`)
          .join('\n');

      await ctx.reply(`Список доступных статусов:\n${statusList}`, { parse_mode: 'HTML' });
  } catch (error) {
      console.error('Ошибка при получении списка статусов:', error);
      await ctx.reply('Произошла ошибка при получении списка статусов.');
  }
}

async function awardStatusHandler(ctx) {
    try {
      // Проверяем права администратора (только для указанных ID)
      if (!(await checkAdminRights(ctx))) {
        return; // Просто выходим, если нет прав
      }
  
      const parts = ctx.message.text.trim().split(/\s+/);
      if (parts.length !== 3) {
        return ctx.reply('Использование: наградить id номер_статуса', { parse_mode: 'HTML' });
      }
  
      const playerId = parseInt(parts[1], 10);
      const statusId = parseInt(parts[2], 10);
  
      if (isNaN(playerId) || isNaN(statusId)) {
        return ctx.reply('Некорректные параметры.', { parse_mode: 'HTML' });
      }
  
      const player = await getUserByNumericId(playerId);
      if (!player) {
        return ctx.reply(`Пользователь с id ${playerId} не найден.`);
      }
  
      const status = await getStatusById(statusId);
      if (!status) {
        return ctx.reply(`Статус с ID ${statusId} не найден.`);
      }
  
      const updateResult = await updateUserStatus(player.id, statusId);
      if (!updateResult.success) {
        return ctx.reply('Не удалось выдать статус.');
      }
  
      const username = player.username || 'Неизвестный';
      const userLink = `<a href="tg://user?id=${player.id}">${username}</a>`;
      const adminMessage = `Пользователю ${userLink} успешно выдан статус: 🌟 <b>${status.name}</b>.`;
      await ctx.reply(adminMessage, { parse_mode: 'HTML' });
  
      // Получаем ID скина по названию
      const skinNameMap = {
        'Администратор': 'Admin тян card',
        'DIAMOND': 'DIAMOND CARD',
        'PLATINUM': 'PLATINUM CARD',
        'GOLD': 'GOLD CARD'
      };
  
      const skinName = skinNameMap[status.name];
      if (skinName) {
        const skinId = getSkinIdByName(skinName);
        if (!skinId) {
          console.error(`Скин "${skinName}" не найден в базе данных.`);
          // Не отправляем сообщение об ошибке скина админу
          // return ctx.reply(`Скин "${skinName}" не найден в базе данных.`);
        } else {
            const addResult = await addSkinToUser(player.id, skinId);
            if (addResult.success || addResult.alreadyOwned) {
              const skin = await getSkinById(skinId);
        
              // Формируем абсолютный путь к изображению
              const imagePath = path.resolve(__dirname, './images', skin.file_name);
        
              // Проверяем, существует ли файл
              if (!fs.existsSync(imagePath)) {
                console.error(`Файл "${imagePath}" не найден.`);
                // Не отправляем сообщение об ошибке файла админу
                // return ctx.reply('Извините, изображение временно недоступно.');
              } else {
                  const skinMessage = `
        🎉 <b>Вы получили новый скин!</b>
        
        🎁 За получение статуса "<b>${status.name}</b>" вам был выдан уникальный скин:
        🎨 "${skin.name}"
        
        Этот скин не доступен в магазине и принадлежит только пользователям с вашим статусом!
        `.trim();
        
                  // Отправляем изображение с подписью
                  await ctx.telegram.sendPhoto(player.id, { source: imagePath }, {
                    caption: skinMessage,
                    parse_mode: 'HTML'
                  }).catch((photoError) => {
                      console.error(`Ошибка отправки фото пользователю ${player.id}:`, photoError);
                      // Не отправляем сообщение об ошибке отправки фото админу
                  });
              }
            }
        }
      }
  
      const userMessage = statusMessages[status.name] || `
  🎉 Вам был выдан новый статус: 
  
  — 🌟 ${status.name} —
    
  ❗️ Поздравляем! Теперь у вас есть особые привилегии.
  `.trim();
  
      await ctx.telegram.sendMessage(player.id, userMessage, { parse_mode: 'HTML' }).catch((notifyError) => {
        console.error(`Ошибка отправки пользователю ${player.id}:`, notifyError);
        // Не отправляем сообщение об ошибке уведомления админу
        // ctx.reply(`Статус был выдан, но не удалось отправить уведомление пользователю ${playerId}.`);
      });
    } catch (error) {
      console.error('Ошибка при выполнении команды "наградить":', error);
      // Не отправляем сообщение об общей ошибке админу
      // await ctx.reply('Произошла ошибка. Попробуйте позже.');
    }
  }

// Обработчик команды "удалить статус"
async function removeStatusHandler(ctx) {
  try {
      // Проверяем права администратора (только для указанных ID)
      if (!(await checkAdminRights(ctx))) {
          return; // Просто выходим, если нет прав
      }

      // Извлекаем id и id_статуса
      const parts = ctx.message.text.trim().split(/\s+/);
      if (parts.length !== 3) {
          return ctx.reply('Использование: удалить статус id id_статуса', { parse_mode: 'HTML' });
      }

      const playerId = parseInt(parts[1], 10);
      const statusId = parseInt(parts[2], 10);

      if (isNaN(playerId) || isNaN(statusId)) {
          return ctx.reply('Некорректные параметры. Использование: удалить статус <id> <id_статуса>', { parse_mode: 'HTML' });
      }

      // Находим пользователя по числовому ID
      const player = await getUserByNumericId(playerId);
      if (!player) {
          return ctx.reply(`Пользователь с id ${playerId} не найден.`);
      }

      // Удаляем статус у пользователя
      const removeResult = await removeUserStatus(player.id, statusId);
      if (!removeResult.success) {
          return ctx.reply(removeResult.message || 'Не удалось удалить статус.');
      }

      // Создаем гиперссылку на пользователя
      const username = player.username || 'Неизвестный';
      const userLink = `<a href="tg://user?id=${player.id}">${username}</a>`;

      // Формируем сообщение для администратора
      const adminMessage = `
У пользователя ${userLink} успешно удален статус: 

—🌟 ${await getStatusNameById(statusId)} —
      `.trim();

      // Отправляем подтверждение администратору
      console.log(adminMessage); // Лог для отладки
      await ctx.reply(adminMessage, { parse_mode: 'HTML' });

      // Уведомляем пользователя об удалении статуса
      const userMessage = `
📮 У вас был удален статус: 

—🌟 ${await getStatusNameById(statusId)} —

❕ К сожалению, вы больше не обладаете связанными с этим статусом привилегиями.
      `.trim();

      console.log(`Отправка уведомления пользователю ${player.id}:`, userMessage); // Лог для отладки
      await ctx.telegram.sendMessage(player.id, userMessage, { parse_mode: 'HTML' }).catch((notifyError) => {
          console.error(`Не удалось отправить сообщение пользователю ${player.id}:`, notifyError);
          // Не отправляем сообщение об ошибке уведомления админу
          // ctx.reply(
          //     `Статус был успешно удален, но не удалось отправить уведомление пользователю ${playerId}.`,
          //     { parse_mode: 'HTML' }
          // );
      });
  } catch (error) {
      console.error('Ошибка при выполнении команды "удалить статус":', error);
      // Не отправляем сообщение об общей ошибке админу
      // await ctx.reply('Произошла ошибка. Попробуйте позже.');
  }
}

// Вспомогательная функция для получения названия статуса по его ID
async function getStatusNameById(statusId) {
  const status = await getStatusById(statusId);
  return status?.name || 'Неизвестный статус';
}

module.exports = {
  listStatusesHandler,
  awardStatusHandler,
  removeStatusHandler,
};
