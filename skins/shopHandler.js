const {addSkinQuote}=require('../src/services/skinQuote');
const {createSkinCheckout}=require('../src/telegram/skinCheckout');
//shopHandler.js
const { Markup } = require('telegraf');
const path = require('path');
const { 
  purchaseSkin,
  getAllSkins, 
  getUserAvailableSkins, 
  getSkinStock
} = require('../db');
const { getSkinShopSession, saveSkinShopSession, destroySkinShopSession } = require('../sessions/skinShopSession');

function formatNumberWithDots(number) {
  return number.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

const rarityEmojis = {
  ORDINARY: '🔵', // Обычная
  EPIC: '🟣',    // Эпическая
  LEGENDARY: '🟡' // Легендарная
};

// Форматирование сообщения для главного меню магазина скинов
async function formatShopMessage(skins, currentPage, totalPages) {
  const startIdx = currentPage * 5;
  const endIdx = Math.min((currentPage + 1) * 5, skins.length);
  let message = '🛒 <b>Магазин скинов</b>\n\n';

  message += 'Доступные скины для покупки:\n\n';
  for (let i = startIdx; i < endIdx; i++) {
    const skin = skins[i];
    const rarityEmoji = rarityEmojis[skin.rarity] || '❓'; // Смайлик для редкости
    const stockInfo = (await getSkinStock(skin.id));
    message += `${rarityEmoji} ${skin.name} - ${formatNumberWithDots(skin.price)} ${skin.currency_type} [${stockInfo.stock}/${stockInfo.max_stock} шт.]\n• Редкость: ${skin.rarity} \n\n`;
  }  
  message += `▫️Страница ${currentPage + 1}/${totalPages}\n`;
  message += '\n🧭 Используйте кнопки ниже для навигации:';
  return message;
}

// Форматирование сообщения для покупки скина
async function formatBuySkinMessage(skin, currentIndex, totalSkins, isOwned) {
  let message = '🛒 <b>Покупка скина</b>\n\n';
  message += `▫️<b>Название:</b> ${skin.name}\n`;
  const rarityEmoji = rarityEmojis[skin.rarity] || '❓'; // Смайлик для редкости
  message += `${rarityEmoji} Редкость: <b>${skin.rarity}</b>\n`;
  message += `💰<b>Цена:</b> ${formatNumberWithDots(skin.price)} ${skin.currency_type}\n`; // Форматируем цену
  const stockInfo = (await getSkinStock(skin.id));
  message += `💳 <b>Осталось:</b> ${stockInfo.stock}/${stockInfo.max_stock} шт.\n`;
  message += `${isOwned ? '✅ <b>Наличие у игрока:</b> Да\n' : '❌ <b>Наличие у игрока:</b> Нет\n\n'}`;
  message += `🎨 Скин ${currentIndex + 1} из ${totalSkins}`;
  return message;
}

// Клавиатура для пагинации в магазине скинов
function createShopKeyboard(currentPage, totalPages) {
  const paginationButtons = [];
  if (currentPage > 0) {
    paginationButtons.push(Markup.button.callback('⬅️ Назад', `page_${currentPage - 1}`));
  }
  if (currentPage < totalPages - 1) {
    paginationButtons.push(Markup.button.callback('➡️ Вперед', `page_${currentPage + 1}`));
  }

  const mainButtons = [
    Markup.button.callback('📦 Мои скины', 'my_skins'),
    Markup.button.callback('🛒 Выбрать скин', 'select_skin_to_buy'),
  ];

  const closeButtons = [
    Markup.button.callback('❌ Закрыть', 'close_shop'),
  ];

  // Расположим кнопки в несколько рядов
  return Markup.inlineKeyboard([
    mainButtons,            // Первый ряд: "Мои скины", "Выбрать скин"
    paginationButtons,      // Второй ряд: навигация "Назад", "Вперед"
    closeButtons            // Третий ряд: "Закрыть"
  ]);
}

// Клавиатура для покупки скина
async function createBuySkinKeyboard(currentIndex, totalSkins, isOwned, skin, userId) {
  let token;
  if(!isOwned){const session=await getSkinShopSession(userId);token=addSkinQuote(session,skin);await saveSkinShopSession(userId,session);}

  const actionButtons = [];
  if (isOwned) {
    actionButtons.push(Markup.button.callback('✅ Уже куплен', 'already_owned'));
  } else {
    actionButtons.push(Markup.button.callback('🛒 Купить скин', `buy_skin_${token}`));
  }
  actionButtons.push(Markup.button.callback('🛒 В магазин', 'to_shop'));
  const navigationButtons = [];
  if (currentIndex > 0) {
    navigationButtons.push(Markup.button.callback('⬅️ Назад', `prev_skin_${currentIndex}`));
  }
  if (currentIndex < totalSkins - 1) {
    navigationButtons.push(Markup.button.callback('➡️ Вперед', `next_skin_${currentIndex}`));
  }
  return Markup.inlineKeyboard([actionButtons, navigationButtons]);
}

// Обработчик команды "/скины" (главное меню магазина)
async function skinShopHandler(ctx) {
  try {
    const userId = ctx.from.id.toString();
    
    // Инициализация состояния магазина скинов
    let session = (await getSkinShopSession(userId));
    if (!session?.skinShop) {
      session.skinShop = { initiator: userId, currentPage: 0, currentSkinIndex: 0 };
      (await saveSkinShopSession(userId, session));
    }

    const skins = await getAllSkins(true);
    if (!skins || skins.length === 0) {
      return ctx.reply('В данный момент нет доступных скинов.');
    }

    const totalPages = Math.ceil(skins.length / 5);
    const currentPage = session.skinShop.currentPage;
    const message = (await formatShopMessage(skins, currentPage, totalPages));
    const keyboard = createShopKeyboard(currentPage, totalPages);

    await ctx.replyWithHTML(message, keyboard);
  } catch (error) {
    console.error('❌ Ошибка при отображении магазина скинов:', error);
    await ctx.reply('Произошла ошибка при отображении магазина скинов.');
  }
}

// Обработчик переключения страниц в магазине
async function handlePageChange(ctx) {
  try {
    const page = parseInt(ctx.match[1], 10);
    const userId = ctx.from.id.toString();

    let session = (await getSkinShopSession(userId));
    if (!session?.skinShop || session.skinShop.initiator !== userId) {
      return ctx.answerCbQuery('Это меню создано другим пользователем или устарело.', { show_alert: true });
    }

    session.skinShop.currentPage = page;
    (await saveSkinShopSession(userId, session));

    const skins = await getAllSkins(true);
    if (!skins || skins.length === 0) {
      return ctx.answerCbQuery('В данный момент нет доступных скинов.');
    }

    const totalPages = Math.ceil(skins.length / 5);
    const message = (await formatShopMessage(skins, page, totalPages));
    const keyboard = createShopKeyboard(page, totalPages);

    await ctx.editMessageText(message, { parse_mode: 'HTML', ...keyboard });
  } catch (error) {
    console.error('❌ Ошибка при переключении страницы:', error);
    ctx.answerCbQuery('Произошла ошибка при переключении страницы.');
  }
}

// Обработчик выбора скина для покупки
async function handleSelectSkinToBuy(ctx) {
  try {
    const userId = ctx.from.id.toString();

    let session = (await getSkinShopSession(userId));
    if (!session?.skinShop || session.skinShop.initiator !== userId) {
      return ctx.answerCbQuery('Это меню создано другим пользователем или устарело.', { show_alert: true });
    }

    const skins = await getAllSkins(true);
    if (!skins || skins.length === 0) {
      return ctx.answerCbQuery('В данный момент нет доступных скинов.');
    }

    session.skinShop.currentSkinIndex = 0;
    (await saveSkinShopSession(userId, session));

    const skin = skins[session.skinShop.currentSkinIndex];
    const availableSkins = await getUserAvailableSkins(userId);
    const isOwned = availableSkins.includes(skin.id);

    const message = (await formatBuySkinMessage(skin, session.skinShop.currentSkinIndex, skins.length, isOwned));
    const keyboard = await createBuySkinKeyboard(session.skinShop.currentSkinIndex, skins.length, isOwned, skin, userId);

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
    console.error('❌ Ошибка при выборе скина для покупки:', error);
    ctx.answerCbQuery('Произошла ошибка при выборе скина для покупки.', { show_alert: true });
  }
}

// Обработчик навигации между скинами в режиме покупки
async function handleSkinNavigation(ctx) {
  try {
    const action = ctx.match[1]; // prev или next
    const currentSkinIndexStr = ctx.match[2]; // Индекс скина из кнопки
    const userId = ctx.from.id.toString();

    let session = (await getSkinShopSession(userId));
    if (!session?.skinShop || session.skinShop.initiator !== userId) {
      return ctx.answerCbQuery('Это меню создано другим пользователем или устарело.', { show_alert: true });
    }

    const currentIndex = parseInt(currentSkinIndexStr, 10);
    if (isNaN(currentIndex)) {
      console.error('❌ Ошибка: Индекс не является числом.');
      return ctx.answerCbQuery('Произошла ошибка при навигации.');
    }

    const skins = await getAllSkins(true);
    if (!skins || skins.length === 0) {
      return ctx.answerCbQuery('В данный момент нет доступных скинов.');
    }

    let newIndex = currentIndex;
    if (action === 'prev' && currentIndex > 0) {
      newIndex = currentIndex - 1;
    } else if (action === 'next' && currentIndex < skins.length - 1) {
      newIndex = currentIndex + 1;
    }

    // Если индекс не изменился, просто подтверждаем действие
    if (newIndex === currentIndex) {
      return ctx.answerCbQuery('Вы уже на первом/последнем скине.');
    }

    session.skinShop.currentSkinIndex = newIndex;
    (await saveSkinShopSession(userId, session));

    const skin = skins[newIndex];
    const availableSkins = await getUserAvailableSkins(userId);
    const isOwned = availableSkins.includes(skin.id);

    const message = (await formatBuySkinMessage(skin, newIndex, skins.length, isOwned));
    const keyboard = await createBuySkinKeyboard(newIndex, skins.length, isOwned, skin, userId);

    const imagePath = path.join(__dirname, '../images', skin.file_name);

    // Проверяем, отличается ли новое содержимое от текущего
    const currentMessage = ctx.callbackQuery.message;
    const isNewContentDifferent =
      !currentMessage.caption ||
      currentMessage.caption !== message ||
      JSON.stringify(currentMessage.reply_markup.inline_keyboard) !==
        JSON.stringify(keyboard.reply_markup.inline_keyboard);

    if (isNewContentDifferent) {
      await ctx.editMessageMedia(
        {
          type: 'photo',
          media: { source: imagePath },
          caption: message,
          parse_mode: 'HTML',
        },
        { ...keyboard }
      );
    } else {
      // Если содержимое не изменилось, просто подтверждаем действие
      return ctx.answerCbQuery('Содержимое не изменилось.');
    }
  } catch (error) {
    console.error('❌ Ошибка при навигации между скинами:', error);
    ctx.answerCbQuery('Произошла ошибка при навигации между скинами.');
  }
}

const handleBuySkin=createSkinCheckout({getSession:getSkinShopSession,purchase:purchaseSkin});

// Обработчик закрытия магазина
async function handleCloseShop(ctx) {
  try {
    const userId = ctx.from.id.toString();
    (await destroySkinShopSession(userId));
    ctx.answerCbQuery('Вы скрыли магазин скинов.');
    await ctx.deleteMessage(); // Удаляем сообщение магазина
    return ctx.reply('Вы скрыли магазин скинов.');
  } catch (error) {
    console.error('❌ Ошибка при закрытии магазина скинов:', error);
    ctx.answerCbQuery('Произошла ошибка при закрытии магазина скинов.');
    return ctx.reply('Произошла ошибка при закрытии магазина скинов.');
  }
}

// Обработчик возврата в магазин
async function handleToShop(ctx) {
  try {
    const userId = ctx.from.id.toString();

    let session = (await getSkinShopSession(userId));
    if (!session?.skinShop || session.skinShop.initiator !== userId) {
      ctx.answerCbQuery('Это меню создано другим пользователем или устарело.', { show_alert: true });
      return ctx.reply('Это меню создано другим пользователем или устарело.');
    }

    session.skinShop.currentSkinIndex = 0;
    (await saveSkinShopSession(userId, session));

    const skins = await getAllSkins(true);
    if (!skins || skins.length === 0) {
      ctx.answerCbQuery('В данный момент нет доступных скинов.');
      return ctx.reply('В данный момент нет доступных скинов.');
    }

    const totalPages = Math.ceil(skins.length / 5);
    const currentPage = session.skinShop.currentPage;
    const message = (await formatShopMessage(skins, currentPage, totalPages));
    const keyboard = createShopKeyboard(currentPage, totalPages);

    // Если сообщение содержит изображение, отправляем новое текстовое сообщение
    if (ctx.callbackQuery.message.photo) {
      await ctx.replyWithHTML(message, keyboard);
    } else {
      await ctx.editMessageText(message, { parse_mode: 'HTML', ...keyboard });
    }
  } catch (error) {
    console.error('❌ Ошибка при возврате в магазин:', error);
    ctx.answerCbQuery('Произошла ошибка при возврате в магазин.');
    return ctx.reply('Произошла ошибка при возврате в магазин.');
  }
}

module.exports = {
  skinShopHandler,
  handlePageChange,
  handleSelectSkinToBuy,
  handleSkinNavigation,
  handleBuySkin,
  handleCloseShop,
  handleToShop,

};
