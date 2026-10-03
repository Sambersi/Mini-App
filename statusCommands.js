// statusCommands.js
const {
  getUserByNumericId,
  updateUserStatus,
  getAllStatuses,
  getStatusById,
  removeUserStatus,
  addSkinToUser,
  getSkinById,
  getSkinIdByName,
  getUserStatuses
} = require('./db');
const { isAdmin } = require('./admin/addBalance');
const path = require('path');
const fs = require('fs');

// ID пользователей, которым разрешено использовать команды награждения и разжалования
const AUTHORIZED_ADMIN_IDS = ['7330982735', '768451950'];

async function checkAdminRights(ctx) {
  const senderId = ctx?.from?.id?.toString();
  if (!senderId) {
    console.warn('[Статусы] Не удалось определить ID отправителя.');
    return false;
  }
  const isAuthorized = AUTHORIZED_ADMIN_IDS.includes(senderId);
  if (!isAuthorized) {
    console.log(`[Статусы] Пользователь ${senderId} попытался использовать команду администратора, но не имеет прав.`);
  }
  return isAuthorized;
}

// Сообщения для каждого статуса
const statusMessages = {
  "Главный админ": `
🚨 Вы получили статус: 👑 Главный админ 🚨
🎉 Поздравляем! Это высшая роль в проекте.
• Полный доступ ко всем системам
• Управление всеми администраторами
• Эксклюзивные привилегии и возможности
`.trim(),

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

  "Руководитель партнёрки": `
🤝 Вы получили статус: 👔 Руководитель партнёрки
🎉 Поздравляем! Теперь у вас есть особые привилегии:
• Управление партнёрской программой
• Доступ к статистике партнёров
• Эксклюзивные бонусы
• Приоритет в репортах
`.trim(),

  "Модератор": `
🛡️ Вы получили статус: 👮 Модератор
🎉 Поздравляем! Теперь у вас есть особые привилегии:
• Возможность мутить пользователей
• Возможность управлять чатом
• Приоритет в репортах
• Повышенный бонус до 500 PF
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

  "Партнёр": `
🤝 Вы получили статус: 🤝 Партнёр
🎉 Поздравляем! Теперь у вас есть особые привилегии:
• Участие в партнёрской программе
• Повышенный процент от рефералов
• Приоритет в поддержке
`.trim(),

  "Beto-tester": `
🧪 Вы получили статус: 🧪 Beto-tester
🎉 Поздравляем! Теперь у вас есть доступ к тестовым функциям:
• Ранний доступ к новым функциям
• Возможность тестировать обновления
• Приоритет в баг-репортах
`.trim(),
};

async function listStatusesHandler(ctx) {
  try {
    if (!(await checkAdminRights(ctx))) return;
    const statuses = await getAllStatuses();
    if (statuses.length === 0) {
      return ctx.reply('Список статусов пуст.', { parse_mode: 'HTML' });
    }
    const statusList = statuses
      .sort((a, b) => b.priority - a.priority)
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
    if (!(await checkAdminRights(ctx))) return;
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
    if (!player) return ctx.reply(`Пользователь с id ${playerId} не найден.`);
    const status = await getStatusById(statusId);
    if (!status) return ctx.reply(`Статус с ID ${statusId} не найден.`);
    const updateResult = await updateUserStatus(player.id, statusId);
    if (!updateResult.success) return ctx.reply('Не удалось выдать статус.');

    const username = player.username || 'Неизвестный';
    const userLink = `<a href="tg://user?id=${player.id}">${username}</a>`;
    const adminMessage = `Пользователю ${userLink} успешно выдан статус: 🌟 <b>${status.name}</b>.`;
    await ctx.reply(adminMessage, { parse_mode: 'HTML' });

    // Сопоставление статусов со скинами (только для тех, у кого есть скины)
    const skinNameMap = {
      'Администратор': 'Admin тян card',
      'DIAMOND': 'DIAMOND CARD',
      'PLATINUM': 'PLATINUM CARD',
      'GOLD': 'GOLD CARD'
    };

    const skinName = skinNameMap[status.name];
    if (skinName) {
      const skinId = getSkinIdByName(skinName);
      if (skinId) {
        const addResult = await addSkinToUser(player.id, skinId);
        if (addResult.success || addResult.alreadyOwned) {
          const skin = await getSkinById(skinId);
          const imagePath = path.resolve(__dirname, './images', skin.file_name);
          if (fs.existsSync(imagePath)) {
            const skinMessage = `
🎉 <b>Вы получили новый скин!</b>
🎁 За получение статуса "<b>${status.name}</b>" вам был выдан уникальный скин:
🎨 "${skin.name}"
Этот скин не доступен в магазине и принадлежит только пользователям с вашим статусом!
`.trim();
            await ctx.telegram.sendPhoto(player.id, { source: imagePath }, {
              caption: skinMessage,
              parse_mode: 'HTML'
            }).catch((photoError) => {
              console.error(`Ошибка отправки фото пользователю ${player.id}:`, photoError);
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
    });
  } catch (error) {
    console.error('Ошибка при выполнении команды "наградить":', error);
  }
}

async function removeStatusHandler(ctx) {
  try {
    if (!(await checkAdminRights(ctx))) return;
    const parts = ctx.message.text.trim().split(/\s+/);
    if (parts.length !== 3) {
      return ctx.reply('Использование: разжаловать id id_статуса', { parse_mode: 'HTML' });
    }
    const playerId = parseInt(parts[1], 10);
    const statusId = parseInt(parts[2], 10);
    if (isNaN(playerId) || isNaN(statusId)) {
      return ctx.reply('Некорректные параметры.', { parse_mode: 'HTML' });
    }
    const player = await getUserByNumericId(playerId);
    if (!player) return ctx.reply(`Пользователь с id ${playerId} не найден.`);
    const removeResult = await removeUserStatus(player.id, statusId);
    if (!removeResult.success) return ctx.reply(removeResult.message || 'Не удалось удалить статус.');

    const username = player.username || 'Неизвестный';
    const userLink = `<a href="tg://user?id=${player.id}">${username}</a>`;
    const statusName = await getStatusNameById(statusId);

    const adminMessage = `
У пользователя ${userLink} успешно удален статус:
—🌟 ${statusName} —
`.trim();
    await ctx.reply(adminMessage, { parse_mode: 'HTML' });

    const userMessage = `
📮 У вас был удален статус:
—🌟 ${statusName} —
❕ К сожалению, вы больше не обладаете связанными с этим статусом привилегиями.
`.trim();

    await ctx.telegram.sendMessage(player.id, userMessage, { parse_mode: 'HTML' }).catch((notifyError) => {
      console.error(`Не удалось отправить сообщение пользователю ${player.id}:`, notifyError);
    });
  } catch (error) {
    console.error('Ошибка при выполнении команды "разжаловать":', error);
  }
}

async function getStatusNameById(statusId) {
  const status = await getStatusById(statusId);
  return status?.name || 'Неизвестный статус';
}

module.exports = {
  listStatusesHandler,
  awardStatusHandler,
  removeStatusHandler,
};