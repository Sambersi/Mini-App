// postToChannel.js
const { Markup } = require('telegraf');
const { isAdmin } = require('./admin/addBalance');

// =====================================================
// ДОСТУП К ТЕХАДМИН-ПАНЕЛИ
// =====================================================
function getTechSuperAdminIds() {
  return String(process.env.ADMIN_IDS || '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
}

function isTechSuperAdmin(userId) {
  return getTechSuperAdminIds().includes(String(userId));
}

// =====================================================
// КАНАЛЫ ДЛЯ ПОСТИНГА
// =====================================================
function getPostChannels() {
  return [
    {
      key: 'main',
      name: '📢 Основной канал',
      id: process.env.CHANNEL_ID,
    },
    {
      key: 'gift',
      name: '🎁 GIFT канал',
      id: process.env.GIFT_CHANNEL_ID,
    },
    {
      key: 'test',
      name: '🧪 Тестовый канал',
      id: process.env.TEST_CHANNEL_ID,
    },
  ].filter((channel) => channel.id);
}

// =====================================================
// КНОПКИ ПОСТА
// =====================================================
const DEFAULT_POST_BUTTONS = [
    { text: 'Бот в Telegram', url: 'https://t.me/F_roobot' },
    { text: 'Mini-App', url: 't.me/clevernever_robot/miniapp' },
    { text: 'Беседа Double Plus', url: 'https://t.me/+uhycwX5AUA40NjAy' },
    { text: 'Беседа DICE', url: 'https://t.me/+HUUFT2Uzc9Y1Yjky' },
    { text: 'GIFT канал', url: 'https://t.me/fbotgiftofficial' },
    { text: 'Буст канала', url: 'https://t.me/boost/FBot42' },
    { text: 'По всем вопросам', url: 'https://t.me/fbotcompitishen' },
    { text: '🍩 Донат', url: 'https://t.me/FBot42/119' },
  ];

// =====================================================
// СЕССИИ СОЗДАНИЯ ПОСТА
// =====================================================
const postSessions = new Map();

// =====================================================
// КЛАВИАТУРЫ
// =====================================================
function getPostChannelKeyboard() {
  const channels = getPostChannels();
  const rows = channels.map((channel, index) => [
    Markup.button.callback(channel.name, `tech_post_channel_${index}`),
  ]);
  rows.push([Markup.button.callback('⬅️ Назад', 'tech_admin_panel')]);
  return Markup.inlineKeyboard(rows);
}

function getPostButtonsSelectionKeyboard(session) {
  const rows = DEFAULT_POST_BUTTONS.map((button, index) => {
    const isActive = session.selectedButtons.has(index);
    const icon = isActive ? '✅' : '⬜️';
    return [
      Markup.button.callback(`${icon} ${button.text}`, `tech_post_toggle_${index}`),
    ];
  });
  rows.push([
    Markup.button.callback('👁 Предпросмотр', 'tech_post_preview'),
    Markup.button.callback('📨 Опубликовать', 'tech_post_send'),
  ]);
  rows.push([
    Markup.button.callback('🔄 Заново', 'tech_post_menu'),
    Markup.button.callback('❌ Отмена', 'tech_post_cancel'),
  ]);
  return Markup.inlineKeyboard(rows);
}

function getCancelPostKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('❌ Отмена создания поста', 'tech_post_cancel')],
  ]);
}

// =====================================================
// СОЗДАНИЕ КНОПОК ПОСТА
// =====================================================
function createPostButtons(buttons) {
  if (!buttons || buttons.length === 0) return {};
  const keyboard = [];
  buttons.forEach((button, index) => {
    if (index % 2 === 0) {
      keyboard.push([Markup.button.url(button.text, button.url)]);
    } else {
      keyboard[keyboard.length - 1].push(Markup.button.url(button.text, button.url));
    }
  });
  return Markup.inlineKeyboard(keyboard);
}

function buildSelectedPostKeyboard(session) {
  const selectedButtons = DEFAULT_POST_BUTTONS.filter((_, index) =>
    session.selectedButtons.has(index)
  );
  if (!selectedButtons.length) return {};
  return createPostButtons(selectedButtons);
}

// =====================================================
// ШАГ 1: ВЫБОР КАНАЛА
// =====================================================
async function startPostMenu(ctx) {
  if (!isTechSuperAdmin(ctx.from.id)) {
    return ctx.answerCbQuery('❌ Нет доступа.', true);
  }
  const userId = String(ctx.from.id);
  postSessions.set(userId, {
    step: 'channel',
    channel: null,
    messageId: null,
    sourceChatId: null,
    selectedButtons: new Set(),
  });
  await ctx.editMessageText('📢 <b>Создание поста</b>\n\nВыберите канал:', {
    parse_mode: 'HTML',
    ...getPostChannelKeyboard(),
  });
  return ctx.answerCbQuery();
}

// =====================================================
// ШАГ 2: ВЫБОР КАНАЛА ЗАВЕРШЁН
// =====================================================
async function handlePostChannelSelection(ctx) {
  const userId = String(ctx.from.id);
  const session = postSessions.get(userId);
  if (!session) return ctx.answerCbQuery('❌ Сессия не найдена.', true);

  const data = ctx.callbackQuery?.data || '';
  const channelIndex = Number(ctx.match?.[1] ?? data.split('_').pop());
  const channels = getPostChannels();
  const channel = channels[channelIndex];
  if (!channel) return ctx.answerCbQuery('❌ Канал не найден.', true);

  session.channel = channel;
  session.step = 'text';
  postSessions.set(userId, session);

  await ctx.editMessageText(
    `📢 Канал: <b>${channel.name}</b>\n\n` +
      'Отправьте сообщение с текстом поста.\n\n' +
      '✅ Поддерживаются: обычные emoji, премиум-эмодзи,\n' +
      'стикеры, фото, видео, HTML-разметка.\n\n' +
      'Бот скопирует ваше сообщение целиком и добавит кнопки.\n\n' +
      'Для отмены отправьте: <code>отмена</code>',
    {
      parse_mode: 'HTML',
      ...getCancelPostKeyboard(),
    }
  );
  return ctx.answerCbQuery();
}

// =====================================================
// ШАГ 3: ПРИЁМ ЛЮБОГО СООБЩЕНИЯ (текст, фото, стикер)
// =====================================================
async function handlePostMessage(ctx) {
  const userId = String(ctx.from.id);
  const session = postSessions.get(userId);

  // Если нет активной сессии или мы не на шаге ввода — пропускаем
  if (!session || session.step !== 'text') {
    return false;
  }

  if (!isTechSuperAdmin(ctx.from.id)) {
    postSessions.delete(userId);
    return false;
  }

  if (!ctx.message) {
    return false;
  }

  // Обработка текстовой команды "отмена"
  const text = ctx.message.text?.trim();
  if (text && text.toLowerCase() === 'отмена') {
    postSessions.delete(userId);
    await ctx.reply('❌ Создание поста отменено.');
    return true;
  }

  // Сохраняем ID сообщения и чата-источника для copyMessage
  session.messageId = ctx.message.message_id;
  session.sourceChatId = ctx.chat.id;
  session.step = 'buttons';
  
  postSessions.set(userId, session);

  await ctx.reply(
    '🔘 Выберите кнопки, которые будут в посте:',
    getPostButtonsSelectionKeyboard(session)
  );
  
  return true;
}

// =====================================================
// ПЕРЕКЛЮЧЕНИЕ КНОПОК
// =====================================================
async function handleTogglePostButton(ctx) {
  const userId = String(ctx.from.id);
  const session = postSessions.get(userId);
  if (!session || session.step !== 'buttons') {
    return ctx.answerCbQuery('❌ Сессия не найдена.', true);
  }
  const data = ctx.callbackQuery?.data || '';
  const buttonIndex = Number(ctx.match?.[1] ?? data.split('_').pop());
  if (!DEFAULT_POST_BUTTONS[buttonIndex]) {
    return ctx.answerCbQuery('❌ Кнопка не найдена.', true);
  }
  if (session.selectedButtons.has(buttonIndex)) {
    session.selectedButtons.delete(buttonIndex);
  } else {
    session.selectedButtons.add(buttonIndex);
  }
  postSessions.set(userId, session);
  await ctx.editMessageReplyMarkup(getPostButtonsSelectionKeyboard(session).reply_markup);
  return ctx.answerCbQuery();
}

// =====================================================
// ПРЕДПРОСМОТР
// =====================================================
async function handlePreviewPost(ctx) {
  const userId = String(ctx.from.id);
  const session = postSessions.get(userId);
  if (!session || !session.messageId) {
    return ctx.answerCbQuery('❌ Сообщение не найдено.', true);
  }

  const keyboard = buildSelectedPostKeyboard(session);

  try {
    await ctx.telegram.copyMessage(ctx.chat.id, session.sourceChatId, session.messageId, {
      ...keyboard,
    });
  } catch (error) {
    console.error('[POST PREVIEW COPY ERROR]', error);
    await ctx.reply('❌ Не удалось создать предпросмотр.');
  }

  return ctx.answerCbQuery();
}

// =====================================================
// ПУБЛИКАЦИЯ В КАНАЛ
// =====================================================
async function handlePublishPost(ctx) {
  const userId = String(ctx.from.id);
  const session = postSessions.get(userId);
  if (!session || !session.channel || !session.messageId) {
    return ctx.answerCbQuery('❌ Данные поста не заполнены.', true);
  }

  const keyboard = buildSelectedPostKeyboard(session);

  try {
    console.log(`[POST PUBLISH] Копирование сообщения ${session.messageId} из ${session.sourceChatId} в канал ${session.channel.id}`);
    
    await ctx.telegram.copyMessage(session.channel.id, session.sourceChatId, session.messageId, {
      ...keyboard,
    });

    postSessions.delete(userId);
    await ctx.reply('✅ Пост успешно опубликован!');
  } catch (error) {
    console.error('[POST PUBLISH COPY ERROR]', error);
    
    // Подробный вывод ошибки для отладки премиум-стикеров
    if (error.description) {
        console.error(`[POST PUBLISH] Telegram API Error: ${error.description}`);
    }

    await ctx.reply(
      '❌ Не удалось опубликовать пост.\n' +
        'Проверьте:\n' +
        '1. Бот админ в канале.\n' +
        '2. У бота есть право постить сообщения.\n' +
        '3. ID канала корректен.'
    );
  }

  return ctx.answerCbQuery();
}

// =====================================================
// ОТМЕНА
// =====================================================
async function handleCancelPost(ctx) {
  const userId = String(ctx.from.id);
  postSessions.delete(userId);
  try {
    await ctx.editMessageText('❌ Создание поста отменено.');
  } catch (error) {
    await ctx.reply('❌ Создание поста отменено.');
  }
  return ctx.answerCbQuery();
}

// =====================================================
// РОУТЕР CALLBACK-ОВ
// =====================================================
async function handlePostCallback(ctx) {
  if (!isTechSuperAdmin(ctx.from.id)) {
    return ctx.answerCbQuery('❌ Нет доступа.', true);
  }
  const data = ctx.callbackQuery?.data;
  if (!data) return ctx.answerCbQuery();

  if (data === 'tech_post_menu') return startPostMenu(ctx);
  if (data.startsWith('tech_post_channel_')) return handlePostChannelSelection(ctx);
  if (data.startsWith('tech_post_toggle_')) return handleTogglePostButton(ctx);
  if (data === 'tech_post_preview') return handlePreviewPost(ctx);
  if (data === 'tech_post_send') return handlePublishPost(ctx);
  if (data === 'tech_post_cancel') return handleCancelPost(ctx);

  return ctx.answerCbQuery();
}

// =====================================================
// СТАРАЯ ФУНКЦИЯ ДЛЯ СОВМЕСТИМОСТИ
// =====================================================
async function sendPostToChannel(ctx, db) {
  try {
    if (!(await isAdmin(ctx))) {
      return ctx.reply('❌ У вас нет прав для выполнения этой команды.');
    }
    const channelId = process.env.CHANNEL_ID;
    if (!channelId) {
      return ctx.reply('❌ В .env не задан CHANNEL_ID.');
    }
    const postContent =
      '🔥 <b>Навигация по F BOT</b>\n\n' +
      '📱 Этот пост предназначен для навигации по F BOT';
    const buttons = [
      { text: 'Бот в Telegram', url: 'https://t.me/F_roobot' },
      { text: 'Беседа Double Plus', url: 'https://t.me/+uhycwX5AUA40NjAy' },
      { text: 'Беседа DICE', url: 'https://t.me/+HUUFT2Uzc9Y1Yjky' },
      { text: 'GIFT канал', url: 'https://t.me/fbotgiftofficial' },
      { text: 'Буст канала', url: 'https://t.me/boost/FBot42' },
      { text: 'По всем вопросам', url: 'https://t.me/fbotcompitishen' },
      { text: '🍩 Донат', url: 'https://t.me/FBot42/119' },
    ];
    const inlineKeyboard = createPostButtons(buttons);
    await ctx.telegram.sendMessage(channelId, postContent, {
      parse_mode: 'HTML',
      ...inlineKeyboard,
    });
    ctx.reply('✅ Пост успешно отправлен в канал!');
  } catch (error) {
    console.error('Ошибка при отправке поста:', error);
    ctx.reply('❌ Произошла ошибка при отправке поста.');
  }
}

module.exports = {
  sendPostToChannel,
  createPostButtons,
  startPostMenu,
  handlePostCallback,
  handlePostMessage,
  getPostChannels,
  DEFAULT_POST_BUTTONS,
};