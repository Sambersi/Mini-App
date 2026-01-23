const { Markup } = require('telegraf');
const db = require('../db'); // Импортируем модуль для работы с базой данных
const { getUserBalances, getUserStatuses, addSkinToUser,
  getSkinIdByName,
  getUserAvailableSkins,
  updateContainerCount,
  getCardTemplateById, } = require('../db');
const { createUserLink } = require('../games/doubleGame');
require('dotenv').config();
const path = require('path');
const fs = require('fs');

// Функция для получения текущего баланса DF пользователя
function getUserDFBalance(userId) {
  const user = db.getUserById(userId);
  return user ? user.df_balance || 0 : 0;
}

// Функция для обработки команды "донат"
async function handleDonationCommand(ctx) {
  try {
    // Проверяем тип чата
    if (ctx.chat.type === 'private') {
      // Личный чат - показываем меню доната
      await showDonationMenu(ctx); // Используем функцию из handlers/donationShop
    } else {
      // Публичный чат - предлагаем перейти в личные сообщения
      const botUsername = process.env.BOT_USERNAME || 'F_roobot';
      const donateButton = Markup.inlineKeyboard([
        Markup.button.url('🎁 Перейти к личному чату', `https://t.me/${botUsername}?start=/donate`)
      ]);

      const userLink = createUserLink(ctx.from.id, ctx.from.username || ctx.from.first_name);
      return ctx.replyWithHTML(
        `${userLink}, используйте команду "донат" только в личных чатах.`,
        donateButton
      );
    }
  } catch (error) {
    console.error('Ошибка при обработке команды "донат":', error);
    await ctx.reply('Произошла ошибка. Попробуйте позже.');
  }
}

// Начальное меню доната
async function showDonationMenu(ctx) {
  try {
    const userId = ctx.from.id.toString();
    const dfBalance = getUserDFBalance(userId);

    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('💸 Пополнить баланс', 'donate_balance')],
      [Markup.button.callback('🛍 Донат шоп', 'donate_shop')],
    ]);

    ctx.replyWithHTML(`🍩 DONATE\n\n<b>Баланс DF:</b> ${dfBalance.toLocaleString('ru-RU')}`, keyboard);
  } catch (error) {
    console.error('Ошибка при отправке меню доната:', error);
    ctx.reply('Произошла ошибка. Попробуйте позже.');
  }
}
const skinNameMap = {
  'Администратор': 'Admin тян card',
  'DIAMOND': 'DIAMOND CARD',
  'PLATINUM': 'PLATINUM CARD',
  'GOLD': 'GOLD CARD'
};

// Добавляем объект для хранения состояния меню
const menuStates = {};

// Модифицируем функции показа меню для сохранения message_id

async function showDonationShopMenu(ctx) {
  try {
    const userId = ctx.from.id.toString();
    const dfBalance = getUserDFBalance(userId);


    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('🪙 Валюта (PF)', 'donate_currency_pf')],
      [Markup.button.callback('🌟 Статусы', 'donate_statuses')],
      [Markup.button.callback('📦 Контейнеры', 'donate_containers')],
      [Markup.button.callback('💳 Скины на карты', 'donate_skins')],
      [Markup.button.callback('🔫 Оружие босса', 'weapon_shop')],
      [Markup.button.callback('💠 Уникальные предложения', 'donate_unique_offers')],
      [Markup.button.callback('🚀 Акции', 'donate_shares')],
      [Markup.button.callback('⬅️ Назад', 'donate_back')],
    ]);

    const message = await ctx.replyWithHTML(
      `🛒 <b>DONATE SHOP</b>\n\n❕ Все покупки производятся через ДОНАТ валюту!\n\n<b>Баланс DF:</b> ${dfBalance.toLocaleString('ru-RU')}`,
      keyboard
    );
    
    // Сохраняем состояние меню
    menuStates[userId] = {
      messageId: message.message_id,
      type: 'donate_shop'
    };
  } catch (error) {
    console.error('Ошибка при отправке меню донат-шопа:', error);
    ctx.reply('Произошла ошибка. Попробуйте позже.');
  }
}

// Обновляем функцию обработки покупки PF
async function handleBuyPF(ctx, amount, costInDF) {
  try {
    const userId = ctx.from.id.toString();
    const user = db.getUserById(userId);

    if (!user) {
      return ctx.reply('❌ Не удалось найти ваш профиль.');
    }

    const balances = getUserBalances(userId);

    if (balances.dfBalance < costInDF) {
      return ctx.reply(`❌ У вас недостаточно DF для покупки ${amount} PF.`);
    }

    // Обновляем балансы пользователя
    db.updateUserField(userId, 'balance', amount); 
    db.updateUserField(userId, 'df_balance', -costInDF); 

    // Получаем новые балансы
    const newBalances = getUserBalances(userId);

    // Редактируем меню с обновленными балансами
    if (menuStates[userId]) {
      const { messageId, type } = menuStates[userId];

      let updatedMessage;
      if (type === 'donate_shop') {
        updatedMessage = `🛒 DONATE SHOP\n\n❕ Все покупки производятся через ДОНАТ валюту!\n\n` +
          `<b>Баланс DF:</b> ${newBalances.dfBalance.toLocaleString('ru-RU')}\n` +
          `<b>Баланс наличных (PF):</b> ${newBalances.pfBalance.toLocaleString('ru-RU')}\n` +
          `<b>Баланс карты (PF):</b> ${newBalances.cardBalance.toLocaleString('ru-RU')}`;
      } else if (type === 'currency_pf') {
        updatedMessage = `🪙 <b>Покупка валюты (PF)</b>\n\n` +
          `Выберите сумму для покупки:\n\n` +
          `<b>Баланс DF:</b> ${newBalances.dfBalance.toLocaleString('ru-RU')}\n` +
          `<b>Баланс наличных (PF):</b> ${newBalances.pfBalance.toLocaleString('ru-RU')}\n` +
          `<b>Баланс карты (PF):</b> ${newBalances.cardBalance.toLocaleString('ru-RU')}`;
      }

      // Редактируем существующее сообщение
      await ctx.telegram.editMessageText(
        ctx.chat.id,
        messageId,
        null,
        updatedMessage,
        { parse_mode: 'HTML', reply_markup: ctx.callbackQuery.message.reply_markup }
      );
    }

    // Отправляем подтверждение о покупке
    ctx.replyWithHTML(
      `✅ Вы успешно купили ${amount.toLocaleString('ru-RU')} PF за ${costInDF} DF.`
    );
  } catch (error) {
    console.error('Ошибка при покупке валюты:', error);
    ctx.reply('Произошла ошибка. Попробуйте позже.');
  }
}


// Меню покупки валюты (PF)
// Меню покупки валюты (PF)
async function showCurrencyPFMenu(ctx) {
  try {
    const userId = ctx.from.id.toString();
    const balances = getUserBalances(userId); // Получаем все балансы


    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('20.000 PF (180 DF)', 'buy_pf_15000')],
      [Markup.button.callback('100.000 PF (900 DF)', 'buy_pf_50000')],
      [Markup.button.callback('500.000 PF (3.600 DF)', 'buy_pf_100000')],
      [Markup.button.callback('1.000.000 PF (6.800 DF)', 'buy_pf_250000')],
      [Markup.button.callback('3.000.000 PF (17.900 DF)', 'buy_pf_1000000')],
      [Markup.button.callback('10.000.000 PF (44.750 DF)', 'buy_pf_2250000')],
      [Markup.button.callback('❔ Зачем нужны PF?', 'pf_info')],
      [Markup.button.callback('⬅️ Назад', 'donate_currency_pf_back')], // Кнопка "Назад"]
    ]);
    
    const message = `🪙 <b>Покупка валюты (PF)</b>\n` +
      `Выберите сумму для покупки:\n` +
      `<b>Баланс DF:</b> ${balances.dfBalance.toLocaleString('ru-RU')}\n` +
      `<b>Баланс наличных (PF):</b> ${balances.pfBalance.toLocaleString('ru-RU')}\n` +
      `<b>Баланс карты (PF):</b> ${balances.cardBalance.toLocaleString('ru-RU')}`;

    const sentMessage = await ctx.replyWithHTML(message, keyboard);

    // Сохраняем состояние меню
    menuStates[userId] = {
      messageId: sentMessage.message_id,
      type: 'currency_pf'
    };
  } catch (error) {
    console.error('Ошибка при отправке меню покупки валюты:', error);
    ctx.reply('Произошла ошибка. Попробуйте позже.');
  }
}

// Информация о PF
async function showPFInfo(ctx) {
  try {
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('⬅️ Назад', 'donate_currency_pf_back')],
    ]);

    ctx.replyWithHTML(
      'ℹ️ <b>Зачем нужны PF?</b>\n\nPF — это игровая валюта, которая используется для:\n' +
        '• Участия в игровых режимах.\n' +
        '• Прокачки прогресса персонажа.\n' +
        '• Покупки предметов и улучшений.',
      keyboard
    );
  } catch (error) {
    console.error('Ошибка при отправке информации о PF:', error);
    ctx.reply('Произошла ошибка. Попробуйте позже.');
  }
}
// Тексты с информацией о статусах
const statusMessages = {
  "Администратор": `
—👮‍♂️ Администратор —

• Доступ к админ-чату
• Доступ к админ командам
• Эксклюзивные бонусы 
• Уникальный скин на карточку
• Возможность просмотра ID и профиль игроков
• Возможность зарабатывать DF, отвечая на репорты
• х2 на любую сумму игровой валюты (PF) при покупке через ДОНАТ!
• Повышенный бонус до 2000 PF
• Лимит контейнеров повышен до 5ОО
• Безлимит на открытие контейнеров за раз

💬 За получением ссылки на ADMIN чат - ${process.env.ADMIN_CHAT_LINK || 'Ссылка временно недоступна'} 
`.trim(),

  "DIAMOND": `
— 💎 DIAMOND —

• Возможность просмотра профилей игроков
• Возможность просмотра ID игроков
• Скидка 50% на активацию DOUBLE PLUS и DICE
• Эксклюзивный скин на карточку
• Возможность активации эксклюзивных промо-кодов
• Приоритет в репорте 
• Повышенный бонус до 1500 PF
• Лимит контейнеров повышен до 3ОО 
• Возможность открывать до 5О контейнеров за раз!
`.trim(),

  "PLATINUM": `
— 🪙 PLATINUM —

• Возможность просмотра профилей игроков
• Возможность просмотра ID игроков
• Скидка 25% на активацию DOUBLE PLUS и DICE
• Эксклюзивный скин на карточку
• Возможность активации эксклюзивных промо-кодов
• Приоритет в репорте 
• Повышенный бонус до 750 PF
• Лимит контейнеров повышен до 250
`.trim(),

  "GOLD": `
— 👑 GOLD —

• Возможность просмотра ID игроков
• Скидка 10% на активацию DOUBLE PLUS + DICE
• Эксклюзивный скин на карточку
• Возможность активации эксклюзивных промо-кодов
• Приоритет в репорте 
• Повышенный бонус до 500 PF
• Лимит контейнеров повышен до 2ОО
`.trim(),
};

// Обновленная функция показа меню статусов
async function showStatusesMenu(ctx) {
  try {
    const userId = ctx.from.id.toString();
    const dfBalance = getUserDFBalance(userId);

    // Получаем текущие статусы пользователя из БД
    const userStatusNames = await getUserStatuses(userId); // Возвращает массив названий статусов

    // Логируем текущие статусы пользователя
    console.log(`[DEBUG] Пользователь ${userId} имеет статусы:`, userStatusNames);

    // Определяем доступные для покупки статусы
    const availableStatuses = [
      { name: 'GOLD', cost: 899, id: 6 },
      { name: 'PLATINUM', cost: 1999, id: 5 },
      { name: 'DIAMOND', cost: 4499, id: 4 },
      { name: 'Администратор', cost: 6499, id: 1 },
    ];

    // Логируем доступные статусы
    console.log(`[DEBUG] Доступные статусы:`, availableStatuses);

    let message = `🌟 <b>Покупка статусов</b>\n\n`;
    message += `<b>Баланс DF:</b> ${dfBalance.toLocaleString('ru-RU')}\n\n`;

    if (userStatusNames.length > 0) {
      message += `<b>Уже купленные статусы:</b>\n`;
      userStatusNames.forEach(statusName => {
        const status = availableStatuses.find(s => s.name === statusName);
        if (status) {
          message += `• ${status.name} (${status.cost} DF)\n`;
        }
      });
      message += `\n`;
    } else {
      message += `У вас пока нет купленных статусов.\n\n`;
    }

    message += `<b>Доступные для покупки статусы:</b>\n`;
    availableStatuses.forEach(status => {
      if (!userStatusNames.includes(status.name)) {
        message += `• ${status.name} (${status.cost} DF)\n`;
      }
    });

    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('👑 GOLD (899 DF)', 'buy_status_gold')],
      [Markup.button.callback('💎 PLATINUM (1999 DF)', 'buy_status_platinum')],
      [Markup.button.callback('🌟 DIAMOND (4499 DF)', 'buy_status_diamond')],
      [Markup.button.callback('👑 Администратор (6499 DF)', 'buy_status_admin')],
      [Markup.button.callback('❔ Зачем нужны статусы?', 'status_info')],
      [Markup.button.callback('⬅️ Назад', 'donate_statuses_back')],
    ]);

    // Если состояние меню существует, редактируем сообщение
    if (menuStates[userId] && menuStates[userId].type === 'statuses') {
      const { messageId } = menuStates[userId];
      await ctx.telegram.editMessageText(
        ctx.chat.id,
        messageId,
        null,
        message,
        { parse_mode: 'HTML', reply_markup: keyboard }
      );
    } else {
      // Если состояние меню отсутствует, отправляем новое сообщение
      const sentMessage = await ctx.replyWithHTML(message, keyboard);
      menuStates[userId] = {
        messageId: sentMessage.message_id,
        type: 'statuses'
      };
    }
  } catch (error) {
    console.error('[ERROR] Ошибка при отправке меню покупки статусов:', error);
    ctx.reply('Произошла ошибка. Попробуйте позже.');
  }
}

// Информация о статусах
async function showStatusInfo(ctx) {
  try {
    // Формируем клавиатуру с кнопками
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('👮‍♂️ Инфо АДМИН', 'status_info_Администратор')],
      [Markup.button.callback('💎 Инфо DIAMOND', 'status_info_DIAMOND')],
      [Markup.button.callback('🪙 Инфо PLATINUM', 'status_info_PLATINUM')],
      [Markup.button.callback('👑 Инфо GOLD', 'status_info_GOLD')],
      [Markup.button.callback('⬅️ Назад', 'donate_statuses_back')],
    ]);

    // Текст сообщения
    const messageText = `ℹ️ <b>Зачем нужны статусы?</b>
Статусы дают вам уникальные привилегии в игре:
• Доступ к эксклюзивным функциям.
• Повышенный авторитет среди игроков.
• Специальные бонусы и награды.
📚 Чтобы узнать привилегии каждого из статусов, воспользуйтесь кнопками ниже:`

    // Отправляем сообщение с кнопками
    await ctx.telegram.sendMessage(ctx.chat.id, messageText, {
      parse_mode: 'HTML',
      reply_markup: keyboard.reply_markup // Убедитесь, что reply_markup передается как объект
    });
  } catch (error) {
    console.error('Ошибка при отправке информации о статусах:', error);
    ctx.reply('Произошла ошибка. Попробуйте позже.');
  }
}

// Обработка запроса информации о конкретном статусе
async function handleStatusInfo(ctx, statusName) {
  try {
    const statusMessage = statusMessages[statusName] || `Информация о статусе "${statusName}" временно недоступна.`;
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('⬅️ Назад', 'status_info_back')],
    ]);

    await ctx.replyWithHTML(statusMessage, { reply_markup: keyboard });
  } catch (error) {
    console.error('Ошибка при отправке информации о статусе:', error);
    ctx.reply('Произошла ошибка. Попробуйте позже.');
  }
}

// Обработка покупки статуса
async function handleBuyStatus(ctx, statusName, costInDF, statusId) {
  try {
    const userId = ctx.from.id.toString();
    const user = db.getUserById(userId);
    
    if (!user) {
      return ctx.reply('❌ Не удалось найти ваш профиль.');
    }
    
    const userDFBalance = user.df_balance || 0;
    const userStatusNames = await getUserStatuses(userId);

    // Проверка на наличие статуса
    if (userStatusNames.includes(statusName)) {
      return ctx.reply(`❌ Вы уже купили статус "${statusName}".`);
    }

    // Проверка баланса DF
    if (userDFBalance < costInDF) {
      return ctx.reply(`❌ У вас недостаточно DF для покупки статуса "${statusName}".`);
    }

    // Обновление статуса пользователя
    const updateResult = await db.updateUserStatus(userId, statusId);
    if (!updateResult.success) {
      return ctx.reply('❌ Произошла ошибка при обновлении статуса.');
    }

    // Обновляем баланс DF пользователя
    db.updateUserField(userId, 'df_balance', -costInDF);

    // Начисление скина
    const skinNameMap = {
      'Администратор': 'Admin тян card',
      'DIAMOND': 'DIAMOND CARD',
      'PLATINUM': 'PLATINUM CARD',
      'GOLD': 'GOLD CARD'
    };
    
    const skinName = skinNameMap[statusName];
    let skinMessageSent = false; // Флаг отправки сообщения о скине
    
    if (skinName) {
      const skinId = getSkinIdByName(skinName);
      if (skinId) {
        const userSkins = getUserAvailableSkins(userId);
        if (!userSkins.includes(skinId)) {
          const addResult = await addSkinToUser(userId, skinId);
          if (addResult.success) {
            const skin = getCardTemplateById(skinId);
            if (skin && skin.file_name) {
              const imagePath = path.resolve(__dirname, './images', skin.file_name);
              
              const skinMessage = `
                🎉 <b>Вы получили новый скин!</b>
                🎁 За получение статуса "<b>${statusName}</b>" вам был выдан уникальный скин:
                🎨 "${skin.name}"
                Этот скин не доступен в магазине и принадлежит только пользователям с вашим статусом!
              `.trim();
              
              if (fs.existsSync(imagePath)) {
                try {
                  await ctx.telegram.sendPhoto(userId, { source: imagePath }, {
                    caption: skinMessage,
                    parse_mode: 'HTML'
                  });
                  skinMessageSent = true; // Сообщение о скине успешно отправлено
                } catch (sendError) {
                  console.error(`Ошибка при отправке изображения скина (${skinName}):`, sendError);
                }
              } else {
                console.error(`Файл изображения для скина "${skinName}" не найден: ${imagePath}`);
              }
            } else {
              console.error(`Данные скина не найдены (ID: ${skinId}, Name: ${skinName})`);
            }
          }
        }
      }
    }

    // Если сообщение о скине не было отправлено из-за ошибок
    if (!skinMessageSent && skinName) {
      const fallbackMessage = `
        🎉 <b>Вы получили новый скин!</b>
        🎁 За получение статуса "<b>${statusName}</b>" вам был выдан уникальный скин.
      `.trim();
      await ctx.reply(fallbackMessage, { parse_mode: 'HTML' });
    }

    // Формирование сообщения о привилегиях
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
  💎 Вы получили статус: DIAMOND 💎
  
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
  ✨ Вы получили статус: PLATINUM 
  
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
  💫 Вы получили статус: GOLD 
  
  🎉 Поздравляем! Теперь у вас есть особые привилегии:
  
  • Возможность просмотра ID игроков - /id
  • Скидка 10% на активацию DOUBLE PLUS + DICE
  • Эксклюзивный скин на карточку
  • Возможность активации эксклюзивных промо-кодов
  • Приоритет в репорте 
  • Повышенный бонус до 500 PF
  • Лимит контейнеров повышен до 2ОО
      `.trim()
    };

    // Отправка сообщения о привилегиях
    await ctx.replyWithHTML(
      `✅ Вы успешно купили статус: <b>${statusName}</b> за ${costInDF} DF.\n\n` + 
      (statusMessages[statusName] || 
       `🌟 Вам был выдан новый статус: ${statusName}\n❗️ Поздравляем! Теперь у вас есть особые привилегии.`),
      { parse_mode: 'HTML' }
    );

    // Обновление меню покупки статусов
    const newBalances = getUserBalances(userId);
    const newUserStatusNames = await getUserStatuses(userId);
    const availableStatuses = [
      { name: 'GOLD', cost: 899, id: 6 },
      { name: 'PLATINUM', cost: 1999, id: 5 },
      { name: 'DIAMOND', cost: 4499, id: 4 },
      { name: 'Администратор', cost: 6499, id: 1 },
    ];

    let updatedMessage = `🌟 <b>Покупка статусов</b>\n` +
                         `<b>Баланс DF:</b> ${newBalances.dfBalance.toLocaleString('ru-RU')}\n`;
                         
    if (newUserStatusNames.length > 0) {
      updatedMessage += `<b>Уже купленные статусы:</b>\n`;
      newUserStatusNames.forEach(statusName => {
        const status = availableStatuses.find(s => s.name === statusName);
        if (status) {
          updatedMessage += `• ${status.name} (${status.cost} DF)\n`;
        }
      });
      updatedMessage += `\n`;
    } else {
      updatedMessage += `У вас пока нет купленных статусов.\n`;
    }

    updatedMessage += `<b>Доступные для покупки статусы:</b>\n`;
    availableStatuses.forEach(status => {
      if (!newUserStatusNames.includes(status.name)) {
        updatedMessage += `• ${status.name} (${status.cost} DF)\n`;
      }
    });

    const messageId = menuStates[userId]?.messageId;
    if (messageId) {
      await ctx.telegram.editMessageText(
        ctx.chat.id,
        messageId,
        null,
        updatedMessage,
        { parse_mode: 'HTML', reply_markup: ctx.callbackQuery.message.reply_markup }
      );
    }

  } catch (error) {
    console.error('Ошибка при покупке статуса:', error);
    ctx.reply('Произошла ошибка. Попробуйте позже.');
  }
}

// Меню покупки контейнеров
async function showContainersMenu(ctx) {
  try {
    const userId = ctx.from.id.toString();
    const balances = getUserBalances(userId); // Получаем все балансы
    const user = db.getUserById(userId);
    const containerCount = user.container_type_3 || 0; // Используем третий тип контейнеров
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('1 GOLD-контейнер (200 DF)', 'buy_container_1')],
      [Markup.button.callback('5 GOLD-контейнеров (900 DF)', 'buy_container_5')],
      [Markup.button.callback('25 GOLD-контейнеров (4500 DF)', 'buy_container_25')],
      [Markup.button.callback('100 GOLD-контейнеров (17999 DF)', 'buy_container_100')],
      [Markup.button.callback('❔ Зачем нужны контейнеры?', 'container_info')],
      [Markup.button.callback('⬅️ Назад', 'donate_containers_back')], // Кнопка "Назад"
    ]);
    const message = `📦 <b>Покупка контейнеров</b>
<b>Баланс DF:</b> ${balances.dfBalance.toLocaleString('ru-RU')}
<b>Количество GOLD-контейнеров (тип 3):</b> ${containerCount}
Выберите количество контейнеров для покупки:
`;
    const sentMessage = await ctx.replyWithHTML(message, keyboard);
    // Сохраняем состояние меню
    menuStates[userId] = {
      messageId: sentMessage.message_id,
      type: 'containers'
    };
  } catch (error) {
    console.error('Ошибка при отправке меню покупки контейнеров:', error);
    ctx.reply('Произошла ошибка. Попробуйте позже.');
  }
}

// Информация о контейнерах
async function showContainerInfo(ctx) {
  try {
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('⬅️ Назад', 'donate_containers_back')],
    ]);
    ctx.replyWithHTML(
      'ℹ️ <b>Зачем нужны контейнеры?</b>\n' +
      'Контейнеры содержат редкие предметы, которые могут помочь вам в игре:\n' +
      '• Уникальные скины.\n' +
      '• Дополнительные бонусы.\n' +
      '• Редкие предметы для улучшения прогресса.',
      keyboard
    );
  } catch (error) {
    console.error('Ошибка при отправке информации о контейнерах:', error);
    ctx.reply('Произошла ошибка. Попробуйте позже.');
  }
}

// Обработка покупки контейнеров
async function handleBuyContainer(ctx, count, costInDF) {
  try {
      const userId = ctx.from.id.toString();
      const user = db.getUserById(userId);
      if (!user) {
          return ctx.reply('❌ Не удалось найти ваш профиль.');
      }

      // Проверяем баланс DF
      const balances = getUserBalances(userId);
      if (balances.dfBalance < costInDF) {
          return ctx.reply(`❌ У вас недостаточно DF для покупки ${count} контейнеров.`);
      }

      // Проверяем лимиты контейнеров
      const containerType = 3; // GOLD контейнер (тип 3)
      const currentCounts = user.container_type_3 || 0;
      const result = updateContainerCount(userId, containerType, count);

      if (!result.success) {
          return ctx.reply(result.message, { parse_mode: 'HTML' });
      }

      // Если лимит не превышен, обновляем баланс DF
      db.updateUserField(userId, 'df_balance', -costInDF);

      // Получаем новые балансы
      const newBalances = getUserBalances(userId);
      const newContainerCount = (db.getUserById(userId).container_type_3 || 0);

      // Формируем обновленное сообщение
      if (menuStates[userId] && menuStates[userId].type === 'containers') {
          const { messageId } = menuStates[userId];
          const updatedMessage = `📦 <b>Покупка контейнеров</b>
<b>Баланс DF:</b> ${newBalances.dfBalance.toLocaleString('ru-RU')}
<b>Количество GOLD-контейнеров (тип 3):</b> ${newContainerCount}
Выберите количество контейнеров для покупки:
`;
          // Редактируем существующее сообщение
          await ctx.telegram.editMessageText(
              ctx.chat.id,
              messageId,
              null,
              updatedMessage,
              { parse_mode: 'HTML', reply_markup: ctx.callbackQuery.message.reply_markup }
          );
      }

      // Создаем инлайн-кнопку для открытия GOLD контейнера
      const keyboard = Markup.inlineKeyboard([
          Markup.button.callback('🎁 Открыть GOLD контейнер', 'open_container_3')
      ]);

      // Отправляем подтверждение о покупке с кнопкой
      ctx.replyWithHTML(
          `✅ Вы успешно купили ${count} GOLD-контейнер(ов) за ${costInDF} DF.`,
          { ...keyboard }
      );
  } catch (error) {
      console.error('Ошибка при покупке контейнеров:', error);
      ctx.reply('Произошла ошибка. Попробуйте позже.');
  }
}

// Меню уникальных предложений
async function showUniqueOffersMenu(ctx) {
  try {
    const userId = ctx.from.id.toString();
    const dfBalance = getUserDFBalance(userId);
    const user = db.getUserById(userId);

    // Получаем текущий numeric_id пользователя
    const currentNumericId = user?.numeric_id || null;

    // Цена за каждый игровой ID
    const price = 5000;

    const keyboard = Markup.inlineKeyboard([
      // [Markup.button.callback(
      //   `🎮 Игровой ID 5 ${currentNumericId === 5 ? '(✅ Куплено)' : `(${price} DF)`}`, 
      //   `buy_id_5`
      // )],
      // [Markup.button.callback(
      //   `🎮 Игровой ID 6 ${currentNumericId === 6 ? '(✅ Куплено)' : `(${price} DF)`}`, 
      //   `buy_id_6`
      // )],

      [Markup.button.callback('⬅️ Назад', 'donate_back')],
    ]);

    const message = `💠 <b>Уникальные предложения</b>
Выберите игровой ID для покупки:
<b>Баланс DF:</b> ${dfBalance.toLocaleString('ru-RU')}`;

    if (menuStates[userId] && menuStates[userId].type === 'unique_offers') {
      // Редактируем существующее сообщение
      await ctx.telegram.editMessageText(
        ctx.chat.id,
        menuStates[userId].messageId,
        null,
        message,
        { parse_mode: 'HTML', reply_markup: keyboard.reply_markup }
      );
    } else {
      // Отправляем новое сообщение
      const sentMessage = await ctx.replyWithHTML(message, keyboard);
      // Сохраняем состояние меню
      menuStates[userId] = {
        messageId: sentMessage.message_id,
        type: 'unique_offers'
      };
    }
  } catch (error) {
    console.error('Ошибка при отправке меню уникальных предложений:', error);
    ctx.reply('Произошла ошибка. Попробуйте позже.');
  }
}

// Обработка покупки игрового ID
async function handleBuyId(ctx, id, costInDF) {
  try {
    const userId = ctx.from.id.toString();
    const user = db.getUserById(userId);
    if (!user) {
      return ctx.reply('❌ Не удалось найти ваш профиль.');
    }
    
    const userDFBalance = user.df_balance || 0;
    
    // Проверяем баланс DF
    if (userDFBalance < costInDF) {
      return ctx.reply(`❌ У вас недостаточно DF для покупки игрового ID ${id}.`);
    }
    
    // Проверяем, свободен ли указанный ID
    const isIdTaken = db.getUserByNumericId(id);
    if (isIdTaken) {
      return ctx.reply(`❌ Игровой ID ${id} уже занят.`);
    }
    
    // Обновляем баланс DF пользователя
    db.updateUserField(userId, 'df_balance', -costInDF);
    
    // Обновляем numeric_id пользователя
    const updateResult = db.updateNumericId(user.numeric_id, id);
    if (!updateResult.success) {
      return ctx.reply(updateResult.message || '❌ Не удалось выдать игровой ID.');
    }
    
    // Получаем новые данные
    const newDFBalance = getUserDFBalance(userId);
    const userLink = createUserLink(userId, user.username);
    
    // Формируем сообщение о покупке
    const purchaseMessage = `🎩 Вы успешно приобрели игровой ID ${id} за ${costInDF} DF.`;
    
    // Отправляем сообщение пользователю
    await ctx.replyWithHTML(purchaseMessage);
    
    // Отправляем уведомление главному администратору
    const mainAdminId = process.env.MAIN_ADMIN;
    if (mainAdminId) {
      const adminMessage = ` Игрок ${userLink} приобрел игровой ID ${id} за ${costInDF} DF.`;
      await ctx.telegram.sendMessage(mainAdminId, adminMessage, { parse_mode: 'HTML' }).catch((error) => {
        console.error(`Не удалось отправить сообщение главному администратору ${mainAdminId}:`, error);
      });
    } else {
      console.error('Главный администратор не указан в переменных окружения.');
    }
    
    // Редактируем меню с обновленными балансами
    if (menuStates[userId] && menuStates[userId].type === 'unique_offers') {
      const { messageId } = menuStates[userId];
      
      // Создаем обновленную клавиатуру с проверкой купленных ID
      const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback(
          `🎮 Игровой ID 5 ${user.numeric_id === 5 ? '(✅ Куплено)' : ''}`, 
          `buy_id_5`
        )],
        [Markup.button.callback(
          `🎮 Игровой ID 6 ${user.numeric_id === 6 ? '(✅ Куплено)' : ''}`, 
          `buy_id_6`
        )],
        [Markup.button.callback('⬅️ Назад', 'donate_back')],
      ]);
      
      const updatedMessage = `💠 <b>Уникальные предложения</b>\n\n` +
        `Выберите игровой ID для покупки:\n` +
        `<b>Баланс DF:</b> ${newDFBalance.toLocaleString('ru-RU')}`;
      
      // Редактируем существующее сообщение
      await ctx.telegram.editMessageText(
        ctx.chat.id,
        messageId,
        null,
        updatedMessage,
        { parse_mode: 'HTML', reply_markup: keyboard.reply_markup }
      );
    }
  } catch (error) {
    console.error('Ошибка при покупке игрового ID:', error);
    ctx.reply('Произошла ошибка. Попробуйте позже.');
  }
}

// Обновленная функция показа меню акций
async function showSharesMenu(ctx) {
  try {
    const userId = ctx.from.id.toString();
    const dfBalance = getUserDFBalance(userId);
    const userStatusNames = await getUserStatuses(userId);
    
    let message = `🚀 <b>Акции - Статусы со скидкой 25%</b>\n`;
    message += `<b>Баланс DF:</b> ${dfBalance.toLocaleString('ru-RU')}\n\n`;

    const availableStatuses = [
      { name: 'GOLD', originalCost: 899, discountedCost: 674, id: 6 },
      { name: 'PLATINUM', originalCost: 1999, discountedCost: 1499, id: 5 },
      { name: 'DIAMOND', originalCost: 4499, discountedCost: 3374, id: 4 },
      { name: 'Администратор', originalCost: 6499, discountedCost: 4874, id: 1 },
    ];

    // Добавляем информацию о доступных статусах
    message += `<b>Доступные для покупки статусы:</b>\n`;
    availableStatuses.forEach(status => {
      if (!userStatusNames.includes(status.name)) {
        message += `• ${status.name} (${status.discountedCost} DF) <s>${status.originalCost} DF</s>\n`;
      }
    });

    // Создаем клавиатуру с указанием скидки
    const keyboard = Markup.inlineKeyboard(
      availableStatuses.map(status => {
        if (userStatusNames.includes(status.name)) return null;
        return [
          Markup.button.callback(
            `${getEmojiForStatus(status.name)} ${status.name} (${status.discountedCost} DF) 🔻25%`,
            `buy_discounted_status_${status.name}`
          ),
        ];
      }).filter(Boolean).concat([
        [Markup.button.callback('⬅️ Назад', 'donate_shares_back')],
      ])
    );

    if (menuStates[userId] && menuStates[userId].type === 'shares') {
      const { messageId } = menuStates[userId];
      await ctx.telegram.editMessageText(
        ctx.chat.id,
        messageId,
        null,
        message,
        { parse_mode: 'HTML', reply_markup: keyboard }
      );
    } else {
      const sentMessage = await ctx.replyWithHTML(message, keyboard);
      menuStates[userId] = {
        messageId: sentMessage.message_id,
        type: 'shares',
      };
    }
  } catch (error) {
    console.error('[ERROR] Ошибка при отправке меню акций:', error);
    ctx.reply('Произошла ошибка. Попробуйте позже.');
  }
}

// Обработка покупки статуса по акции
async function handleBuyDiscountedStatus(ctx, statusName, cost, statusId) {
  try {
    const userId = ctx.from.id.toString();
    const user = db.getUserById(userId);

    if (!user) {
      return ctx.reply('❌ Не удалось найти ваш профиль.');
    }

    const userDFBalance = user.df_balance || 0;
    const userStatusNames = await getUserStatuses(userId);

    // Проверка на наличие статуса
    if (userStatusNames.includes(statusName)) {
      return ctx.reply(`❌ Вы уже купили статус "${statusName}".`);
    }

    // Проверка баланса DF
    if (userDFBalance < cost) {
      return ctx.reply(`❌ У вас недостаточно DF для покупки статуса "${statusName}" по акции.`);
    }

    // Обновление статуса пользователя
    const updateResult = await db.updateUserStatus(userId, statusId);

    if (!updateResult.success) {
      return ctx.reply('❌ Произошла ошибка при обновлении статуса.');
    }

    // Снимаем средства с баланса
    db.updateUserField(userId, 'df_balance', -cost);

    // Логика начисления скина
    const skinNameMap = {
      'GOLD': 'GOLD CARD',
      'PLATINUM': 'PLATINUM CARD',
      'DIAMOND': 'DIAMOND CARD',
      'Администратор': 'Admin тян card',
    };

    const skinName = skinNameMap[statusName];
    let skinMessageSent = false;

    if (skinName) {
      const skinId = getSkinIdByName(skinName);

      if (skinId) {
        const userSkins = getUserAvailableSkins(userId);

        if (!userSkins.includes(skinId)) {
          const addResult = await addSkinToUser(userId, skinId);

          if (addResult.success) {
            const skin = getCardTemplateById(skinId);

            if (skin && skin.file_name) {
              const imagePath = path.resolve(__dirname, './images', skin.file_name);
              const skinMessage = `
                🎉 <b>Вы получили новый скин!</b>
                🎁 За получение статуса "<b>${statusName}</b>" вам был выдан уникальный скин:
                🎨 "${skin.name}"
                Этот скин не доступен в магазине и принадлежит только пользователям с вашим статусом!
              `.trim();

              if (fs.existsSync(imagePath)) {
                try {
                  await ctx.telegram.sendPhoto(userId, { source: imagePath }, {
                    caption: skinMessage,
                    parse_mode: 'HTML',
                  });
                  skinMessageSent = true;
                } catch (sendError) {
                  console.error(`Ошибка при отправке изображения скина (${skinName}):`, sendError);
                }
              } else {
                console.error(`Файл изображения для скина "${skinName}" не найден: ${imagePath}`);
              }
            } else {
              console.error(`Данные скина не найдены (ID: ${skinId}, Name: ${skinName})`);
            }
          }
        }
      }
    }

    // Если скин не отправлен, отправляем текстовое сообщение
    if (!skinMessageSent && skinName) {
      const fallbackMessage = `
        🎉 <b>Вы получили новый скин!</b>
        🎁 За получение статуса "<b>${statusName}</b>" вам был выдан уникальный скин.
      `.trim();
      await ctx.reply(fallbackMessage, { parse_mode: 'HTML' });
    }

    // Отправка сообщения о привилегиях
    await ctx.replyWithHTML(
      `✅ Вы успешно купили статус по акции: <b>${statusName}</b>\n` +
      `💰 Стоимость: ${cost} DF\n` +
      (statusMessages[statusName] ||
        `🌟 Вам был выдан новый статус: ${statusName}\n❗️ Поздравляем! Теперь у вас есть особые привилегии.`),
      { parse_mode: 'HTML' }
    );

    // Обновление меню акций
    const newBalances = getUserBalances(userId);
    const newUserStatusNames = await getUserStatuses(userId);

    const availableStatuses = [
      { name: 'GOLD', originalCost: 899, discountedCost: 674, id: 6 },
      { name: 'PLATINUM', originalCost: 1999, discountedCost: 1499, id: 5 },
      { name: 'DIAMOND', originalCost: 4499, discountedCost: 3374, id: 4 },
      { name: 'Администратор', originalCost: 6499, discountedCost: 4874, id: 1 },
    ];

    let updatedMessage = `🚀 <b>Акции - Статусы со скидкой 25%</b>\n` +
                         `<b>Баланс DF:</b> ${newBalances.dfBalance.toLocaleString('ru-RU')}\n`;

    availableStatuses.forEach(status => {
      if (!newUserStatusNames.includes(status.name)) {
        updatedMessage += `• ${status.name} (${status.discountedCost} DF) <s>${status.originalCost} DF</s>\n`;
      }
    });

    const messageId = menuStates[userId]?.messageId;

    if (messageId) {
      await ctx.telegram.editMessageText(
        ctx.chat.id,
        messageId,
        null,
        updatedMessage,
        { parse_mode: 'HTML', reply_markup: ctx.callbackQuery.message.reply_markup }
      );
    }
  } catch (error) {
    console.error('Ошибка при покупке статуса по акции:', error);
    ctx.reply('Произошла ошибка. Попробуйте позже.');
  }
}

// Вспомогательная функция для получения эмодзи статуса
function getEmojiForStatus(statusName) {
  switch(statusName) {
    case 'GOLD': return '👑';
    case 'PLATINUM': return '🌟';
    case 'DIAMOND': return '💎';
    case 'Администратор': return '👮‍♂️';
    default: return '';
  }
}

module.exports = {
  showDonationMenu,
  showDonationShopMenu,
  showCurrencyPFMenu,
  handleBuyPF,
  showPFInfo,
  showStatusesMenu,
  handleBuyStatus,
  showStatusInfo,
  showContainersMenu,
  showContainerInfo,
  handleBuyContainer,
  handleDonationCommand,
  handleStatusInfo,
  showUniqueOffersMenu,
  handleBuyId,
  showSharesMenu,
  handleBuyDiscountedStatus

};