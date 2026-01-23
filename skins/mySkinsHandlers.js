//mySkinsHandlers.js
const { Markup } = require('telegraf');
const path = require('path');
const { getAllSkins, getUserAvailableSkins, updateUserSelectedSkin, getSelectedSkin, getUserSkinsWithSerials } = require('../db');
const { getSkinShopSession, saveSkinShopSession } = require('../sessions/skinShopSession');

function formatNumberWithDots(number) {
  return number.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

const rarityEmojis = {
  ORDINARY: '🔵', // Обычная
  EPIC: '🟣',    // Эпическая
  LEGENDARY: '🟡', // Легендарная
  EXCLUSIVE: '💠'
};


function formatMySkinsMessage(skin, currentIndex, totalSkins, isSelected) {
  let message = '🎒 <b>Мои скины</b>\n\n';
  message += `▫️ Название: ${skin.name}\n`;
  
  // Получаем смайлик для редкости
  const rarityEmoji = rarityEmojis[skin.rarity] || '❓'; // По умолчанию вопросительный знак, если редкость не определена

  message += `${rarityEmoji} Редкость:<b> ${skin.rarity} </b>\n`;
  message += `🔖 Серийный номер: <code>${skin.serial_number}</code>\n`; // Используем serial_number из skin
  message += `Активирован: ${isSelected ? '✅' : '❌'}\n\n`;
  message += `🎨 Скин ${currentIndex + 1} из ${totalSkins}`;
  return message;
}

// Клавиатура для "мои скины"
function createMySkinsKeyboard(currentIndex, totalSkins, isSelected) {
  const actionButtons = [];
  if (isSelected) {
    actionButtons.push(Markup.button.callback('✅ Уже активен', 'already_selected'));
  } else {
    actionButtons.push(Markup.button.callback('✅ Применить', `apply_skin_${currentIndex}`));
  }
  actionButtons.push(Markup.button.callback('🛒 В магазин', 'to_shop'));

  const navigationButtons = [];
  if (currentIndex > 0) {
    navigationButtons.push(Markup.button.callback('⬅️ Назад', `prev_my_skin_${currentIndex}`));
  }
  if (currentIndex < totalSkins - 1) {
    navigationButtons.push(Markup.button.callback('➡️ Вперед', `next_my_skin_${currentIndex}`));
  }

  return Markup.inlineKeyboard([actionButtons, navigationButtons]);
}

// Обработчик просмотра "моих скинов"
async function handleMySkins(ctx) {
  try {
      const userId = ctx.from.id.toString();

      // Получаем или создаем состояние сессии
      let session = getSkinShopSession(userId);

      if (!session.mySkinsState) {
          session.mySkinsState = { initiator: userId, currentSkinIndex: 0 };
      }

      // Получаем все скины пользователя с их уникальными серийными номерами
      const userSkins = getUserSkinsWithSerials(userId);

      if (!userSkins || userSkins.length === 0) {
          ctx.answerCbQuery('У вас пока нет доступных скинов.', { show_alert: true });
          return ctx.reply('✖️ У вас пока нет доступных скинов. \n\n🛍 Вы можете купить их в магазине!');
      }

      session.mySkinsState.currentSkinIndex = 0; // Сбрасываем индекс на начало
      saveSkinShopSession(userId, session);

      const skin = userSkins[session.mySkinsState.currentSkinIndex];
      const selectedSkinId = await getSelectedSkin(userId); // Получаем ID выбранного скина
      const isSelected = selectedSkinId === skin.id;

      const message = formatMySkinsMessage(
          skin,
          session.mySkinsState.currentSkinIndex, // Текущий индекс
          userSkins.length,                    // Общее количество скинов
          isSelected
      );
      const keyboard = createMySkinsKeyboard(
          session.mySkinsState.currentSkinIndex,
          userSkins.length,
          isSelected
      );

      const imagePath = path.join(__dirname, '../images', skin.file_name);
      await ctx.replyWithPhoto(
          { source: imagePath },
          {
              caption: message,
              parse_mode: 'HTML',
              ...keyboard,
          }
      );
  } catch (error) {
      console.error('❌ Ошибка при отображении моих скинов:', error);
      ctx.answerCbQuery('Произошла ошибка при отображении моих скинов.', { show_alert: true });
      return ctx.reply('Произошла ошибка при отображении моих скинов.');
  }
}

// Обработчик навигации между "моими скинами"
async function handleMySkinsNavigation(ctx) {
  try {
    const action = ctx.match[1]; // prev или next
    const currentSkinIndexStr = ctx.match[2]; // Индекс скина из кнопки
    const userId = ctx.from.id.toString();

    // Получаем сессию
    let session = getSkinShopSession(userId);

    if (!session || !session.mySkinsState || session.mySkinsState.initiator !== userId) {
      return ctx.answerCbQuery('Это меню создано другим пользователем или устарело.', { show_alert: true });
    }

    const currentIndex = parseInt(currentSkinIndexStr, 10);
    if (isNaN(currentIndex)) {
      console.error('❌ Ошибка: Индекс не является числом.');
      return ctx.answerCbQuery('Произошла ошибка при навигации.');
    }

    const userSkins = getUserSkinsWithSerials(userId);

    if (!userSkins || userSkins.length === 0) {
      return ctx.answerCbQuery('У вас пока нет доступных скинов.');
    }

    let newIndex = currentIndex;
    if (action === 'prev' && currentIndex > 0) {
      newIndex = currentIndex - 1;
    } else if (action === 'next' && currentIndex < userSkins.length - 1) {
      newIndex = currentIndex + 1;
    }

    session.mySkinsState.currentSkinIndex = newIndex;
    saveSkinShopSession(userId, session);

    const skin = userSkins[newIndex];
    const selectedSkinId = await getSelectedSkin(userId); // Получаем ID выбранного скина
    const isSelected = selectedSkinId === skin.id;

    const message = formatMySkinsMessage(
      skin,
      newIndex,
      userSkins.length,
      isSelected
    );

    const keyboard = createMySkinsKeyboard(newIndex, userSkins.length, isSelected);

    const imagePath = path.join(__dirname, '../images', skin.file_name);

    await ctx.editMessageMedia(
      {
        type: 'photo',
        media: { source: imagePath },
        caption: message,
        parse_mode: 'HTML',
      },
      { ...keyboard }
    );
  } catch (error) {
    console.error('❌ Ошибка при навигации между моими скинами:', error);
    ctx.answerCbQuery('Произошла ошибка при навигации между моими скинами.');
  }
}

// Обработчик применения скина
async function handleApplySkin(ctx) {
  try {
    const currentSkinIndexStr = ctx.match[1];
    const userId = ctx.from.id.toString();

    // Получаем сессию
    let session = getSkinShopSession(userId);

    if (!session || !session.mySkinsState || session.mySkinsState.initiator !== userId) {
      ctx.answerCbQuery('Это меню создано другим пользователем или устарело.', { show_alert: true });
      return ctx.reply('Это меню создано другим пользователем или устарело.');
    }

    const currentIndex = parseInt(currentSkinIndexStr, 10);
    if (isNaN(currentIndex)) {
      console.error('❌ Ошибка: Индекс не является числом.');
      ctx.answerCbQuery('Произошла ошибка при применении.');
      return ctx.reply('Произошла ошибка при применении.');
    }

    const userSkins = getUserSkinsWithSerials(userId);

    if (!userSkins || userSkins.length === 0) {
      return ctx.answerCbQuery('У вас пока нет доступных скинов.');
    }

    const skin = userSkins[currentIndex];

    if (!skin) {
      console.error('❌ Ошибка: Скин не найден.');
      ctx.answerCbQuery('Скин не найден.');
      return ctx.reply('Скин не найден.');
    }

    const success = await updateUserSelectedSkin(userId, skin.id);
    if (!success) {
      ctx.answerCbQuery('Не удалось применить скин.');
      return ctx.reply('Не удалось применить скин.');
    }

    const isSelected = true; // Теперь этот скин активен
    const message = formatMySkinsMessage(skin, currentIndex, userSkins.length, isSelected);
    const keyboard = createMySkinsKeyboard(currentIndex, userSkins.length, isSelected);

    const imagePath = path.join(__dirname, '../images', skin.file_name);
    await ctx.editMessageMedia(
      {
        type: 'photo',
        media: { source: imagePath },
        caption: message,
        parse_mode: 'HTML',
      },
      { ...keyboard }
    );

    const notificationMessage = `Скин "${skin.name}" успешно применен!`;
    ctx.answerCbQuery(notificationMessage);
    return ctx.reply(notificationMessage);
  } catch (error) {
    console.error('❌ Ошибка при применении скина:', error);
    ctx.answerCbQuery('Произошла ошибка при применении скина.', { show_alert: true });
    return ctx.reply('Произошла ошибка при применении скина.');
  }
}

module.exports = {
  handleMySkins,
  handleMySkinsNavigation,
  handleApplySkin,
};