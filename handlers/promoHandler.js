// handlers/promoHandler.js
const { Markup } = require('telegraf');
const {
  createPromo,
  getAllPromos,
  deletePromoById,
  getPromoByName,
  hasUserActivatedPromo,
  recordPromoActivation,
  activatePromo,
  getPromoById,
  getUserStatuses,
  getUserById,
  cleanupExpiredPromos,
  logPromoActivation
} = require('../db');
const { generatePromoImage } = require('./generatePromoImage');
const { createUserLink } = require('../bank/bankTransfers');
// Импортируем функции каналов из postToChannel
const { getPostChannels } = require('../postToChannel');

// --- КОНФИГУРАЦИЯ И СПРАВОЧНИКИ ---
const prizeTypeMapping = {
  'container_type_3': 'GOLD-контейнер',
  'balance': 'PF',
  'df_balance': 'DF',
  'npf_shares': 'NPF-акция',
  'tickets': 'Билетики',
};

const statusesList = [
  { id: 0, name: 'Все пользователи' },
  { id: 7, name: 'Beto-tester' },
  { id: 6, name: 'GOLD' },
  { id: 5, name: 'PLATINUM' },
  { id: 4, name: 'DIAMOND' },
  { id: 3, name: 'Модератор' },
  { id: 2, name: 'Тех админ' },
  { id: 1, name: 'Администратор' },
];

const LOG_GIVE_CHAT_ID = process.env.LOG_GIVE_CHAT_ID;
const LOG_CHAT_PROMO_ID = process.env.LOG_CHAT_PROMO_ID;

// Хранилище сессий создания промокодов
const promoSessions = new Map();

// =====================================================
// НОВОЕ: Хранилище сессий постинга промо
// Шаги: 'channel' → 'text' → 'ready'
// =====================================================
const promoPostSessions = new Map();

// === ЕДИНАЯ МАШИНА ШАГОВ ===
const STEP_NAME = 0;
const STEP_LIMIT_TYPE = 1;
const STEP_TIME_VALUE = 2;
const STEP_ACT_VALUE = 3;
const STEP_PRIZE_TYPE = 4;
const STEP_PRIZE_AMOUNT = 5;
const STEP_STATUS = 6;
const STEP_TEMPLATE = 7;
const STEP_SUMMARY = 8;

// --- ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ---
function formatNumber(num) {
  if (num === undefined || num === null) return '0';
  return Number(num).toLocaleString('ru-RU');
}

function escapeHtml(text) {
  if (typeof text !== 'string') return text;
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function getStatusNameById(id) {
  const status = statusesList.find(s => s.id === id);
  return status ? status.name : 'Неизвестный';
}

function formatDuration(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0) return `${h} ч ${m} мин`;
  return `${m} мин`;
}

async function isAdmin(ctx) {
  const senderId = ctx.from.id.toString();
  return process.env.MAIN_ADMIN === senderId || (await getUserStatuses(senderId)).includes('Тех администратор');
}

// --- КЛАВИАТУРЫ ---
const cancelKeyboard = Markup.inlineKeyboard([
  Markup.button.callback('🔴 Отменить создание', 'promo_cancel_create')
]);

const limitTypeKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback('🔢 По количеству', 'promo_limit_type_count'), Markup.button.callback('⏳ По времени', 'promo_limit_type_time')],
  [Markup.button.callback('🔙 Отмена', 'promo_cancel_create')]
]);

const timeQuickKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback('10 мин', 'promo_quick_time_10'), Markup.button.callback('25 мин', 'promo_quick_time_25'), Markup.button.callback('45 мин', 'promo_quick_time_45')],
  [Markup.button.callback('❌ Отмена', 'promo_cancel_create')]
]);

const activationsQuickKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback('5', 'promo_quick_act_5'), Markup.button.callback('10', 'promo_quick_act_10'), Markup.button.callback('15', 'promo_quick_act_15')],
  [Markup.button.callback('❌ Отмена', 'promo_cancel_create')]
]);

const prizeTypeKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback('📦 GOLD-контейнер', 'promo_prize_container_type_3')],
  [Markup.button.callback('💰 PF', 'promo_prize_balance'), Markup.button.callback('💎 DF', 'promo_prize_df_balance')],
  [Markup.button.callback('📈 NPF-акция', 'promo_prize_npf_shares')],
  [Markup.button.callback('🎫 Билетики', 'promo_prize_tickets')],
  [Markup.button.callback('🔙 Отмена', 'promo_cancel_create')]
]);

const prizeAmountQuickKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback('10k', 'promo_quick_sum_10000'), Markup.button.callback('25k', 'promo_quick_sum_25000'), Markup.button.callback('100k', 'promo_quick_sum_100000')],
  [Markup.button.callback('❌ Отмена', 'promo_cancel_create')]
]);

const statusKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback('🌍 Все', 'promo_status_0')],
  [Markup.button.callback('🧪 Beto-tester', 'promo_status_7')],
  [Markup.button.callback('🥇 GOLD', 'promo_status_6'), Markup.button.callback('🥈 PLATINUM', 'promo_status_5')],
  [Markup.button.callback('💎 DIAMOND', 'promo_status_4')],
  [Markup.button.callback('👮 Модератор', 'promo_status_3'), Markup.button.callback('⚙️ Тех админ', 'promo_status_2')],
  [Markup.button.callback('👑 Администратор', 'promo_status_1')],
  [Markup.button.callback('🔙 Отмена', 'promo_cancel_create')]
]);

const templateKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback('🤖 Авто', 'promo_template_auto')],
  [Markup.button.callback('🟢 Жирный', 'promo_template_fat'), Markup.button.callback('🔵 Обычный', 'promo_template_default')],
  [Markup.button.callback('🔙 Отмена', 'promo_cancel_create')]
]);

const finalConfirmKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback('✅ Подтвердить и создать', 'promo_confirm_final')],
  [Markup.button.callback('✏️ Редактировать данные', 'promo_edit_menu')]
]);

const editMenuKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback('Изменить название', 'promo_edit_name')],
  [Markup.button.callback('Изменить лимит (кол/время)', 'promo_edit_limit_type')],
  [Markup.button.callback('Изменить тип приза', 'promo_edit_prize_type')],
  [Markup.button.callback('Изменить сумму приза', 'promo_edit_prize_amount')],
  [Markup.button.callback('Изменить мин. статус', 'promo_edit_status')],
  [Markup.button.callback('🖼 Сменить шаблон изображения', 'promo_edit_template')],
  [Markup.button.callback('⬅️ Назад к проверке', 'promo_back_to_check')]
]);

const cancelEditKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback('❌ Отмена редактирования', 'promo_back_to_check')]
]);

// =====================================================
// НОВОЕ: Клавиатуры для постинга промо
// =====================================================
function getPromoPostChannelKeyboard() {
  const channels = getPostChannels();
  const rows = channels.map((channel, index) => [
    Markup.button.callback(channel.name, `promo_post_channel_${index}`),
  ]);
  rows.push([Markup.button.callback('⬅️ Назад к промо', 'promo_post_back')]);
  return Markup.inlineKeyboard(rows);
}

function getPromoPostReadyKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('👁 Предпросмотр', 'promo_post_preview')],
    [Markup.button.callback('📨 Опубликовать', 'promo_post_send')],
    [Markup.button.callback('✏️ Изменить текст', 'promo_post_edit_text')],
    [Markup.button.callback('🔄 Сменить канал', 'promo_post_change_channel')],
    [Markup.button.callback('⬅️ Назад к промо', 'promo_post_back')],
  ]);
}

function getPromoPostCancelKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('❌ Отменить постинг', 'promo_post_cancel')],
  ]);
}

// =====================================================
// НОВОЕ: Функции постинга промо
// =====================================================

// Начать процесс постинга промо
async function startPromoPost(ctx, promoName) {
  const userId = String(ctx.from.id);
  
  promoPostSessions.set(userId, {
    step: 'channel',
    promoName: promoName,
    channel: null,
    text: null,
    messageId: null,
    sourceChatId: null,
  });

  const channels = getPostChannels();
  if (channels.length === 0) {
    promoPostSessions.delete(userId);
    await ctx.reply('❌ Нет доступных каналов для постинга. Проверьте .env переменные CHANNEL_ID, GIFT_CHANNEL_ID, TEST_CHANNEL_ID.');
    return;
  }

  await ctx.editMessageText(
    `📢 <b>Публикация промокода</b>\n\n` +
    `Промокод: <code>${escapeHtml(promoName)}</code>\n\n` +
    `Выберите канал для публикации:`,
    {
      parse_mode: 'HTML',
      ...getPromoPostChannelKeyboard(),
    }
  );
}

// Обработка выбора канала
async function handlePromoPostChannelSelection(ctx) {
  const userId = String(ctx.from.id);
  const session = promoPostSessions.get(userId);
  
  if (!session) {
    return ctx.answerCbQuery('❌ Сессия не найдена.', true);
  }

  const data = ctx.callbackQuery?.data || '';
  const channelIndex = Number(data.replace('promo_post_channel_', ''));
  const channels = getPostChannels();
  const channel = channels[channelIndex];

  if (!channel) {
    return ctx.answerCbQuery('❌ Канал не найден.', true);
  }

  session.channel = channel;
  session.step = 'text';
  promoPostSessions.set(userId, session);

  await ctx.editMessageText(
    `📢 Канал: <b>${channel.name}</b>\n\n` +
    `Промокод: <code>${escapeHtml(session.promoName)}</code>\n\n` +
    `Отправьте <b>текст поста</b> для публикации.\n\n` +
    `💡 Можно отправить:\n` +
    `• Просто текст\n` +
    `• Фото с подписью\n` +
    `• Стикеры, видео, премиум-эмодзи\n\n` +
    `Всё будет скопировано целиком и опубликовано в канале.`,
    {
      parse_mode: 'HTML',
      ...getPromoPostCancelKeyboard(),
    }
  );

  return ctx.answerCbQuery();
}

// Обработка сообщения (текст / фото / стикер) для промо-поста
async function handlePromoPostMessage(ctx) {
  const userId = String(ctx.from.id);
  const session = promoPostSessions.get(userId);

  // Если нет активной сессии или не на шаге ввода текста — пропускаем
  if (!session || session.step !== 'text') {
    return false;
  }

  if (!(await isAdmin(ctx))) {
    promoPostSessions.delete(userId);
    return false;
  }

  if (!ctx.message) {
    return false;
  }

  // Обработка текстовой команды "отмена"
  const text = ctx.message.text?.trim();
  if (text && text.toLowerCase() === 'отмена') {
    promoPostSessions.delete(userId);
    await ctx.reply('❌ Постинг промо отменён.');
    return true;
  }

  // Сохраняем ID сообщения и чата-источника
  session.messageId = ctx.message.message_id;
  session.sourceChatId = ctx.chat.id;
  session.step = 'ready';
  promoPostSessions.set(userId, session);

  await ctx.reply(
    `✅ Сообщение принято!\n\n` +
    `📢 Канал: <b>${session.channel.name}</b>\n` +
    `🏷 Промокод: <code>${escapeHtml(session.promoName)}</code>\n\n` +
    `Выберите действие:`,
    {
      parse_mode: 'HTML',
      ...getPromoPostReadyKeyboard(),
    }
  );

  return true;
}

// Предпросмотр промо-поста
async function handlePromoPostPreview(ctx) {
  const userId = String(ctx.from.id);
  const session = promoPostSessions.get(userId);

  if (!session || !session.messageId) {
    return ctx.answerCbQuery('❌ Сообщение не найдено.', true);
  }

  try {
    await ctx.telegram.copyMessage(ctx.chat.id, session.sourceChatId, session.messageId);
    await ctx.answerCbQuery('👁 Предпросмотр отправлен выше.');
  } catch (error) {
    console.error('[PROMO POST PREVIEW ERROR]', error);
    await ctx.answerCbQuery('❌ Не удалось создать предпросмотр.', true);
  }
}

// Публикация промо-поста в канал
async function handlePromoPostPublish(ctx) {
  const userId = String(ctx.from.id);
  const session = promoPostSessions.get(userId);

  if (!session || !session.channel || !session.messageId) {
    return ctx.answerCbQuery('❌ Данные поста не заполнены.', true);
  }

  try {
    console.log(`[PROMO POST] Копирование сообщения ${session.messageId} из ${session.sourceChatId} в канал ${session.channel.id}`);

    await ctx.telegram.copyMessage(session.channel.id, session.sourceChatId, session.messageId);

    const promoName = session.promoName;
    promoPostSessions.delete(userId);

    await ctx.editMessageText(
      `✅ <b>Промокод успешно опубликован!</b>\n\n` +
      `📢 Канал: <b>${session.channel.name}</b>\n` +
      `🏷 Промокод: <code>${escapeHtml(promoName)}</code>`,
      {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('🔄 Запостить ещё раз', `promo_post_menu_${promoName}`)],
        ]),
      }
    );
  } catch (error) {
    console.error('[PROMO POST PUBLISH ERROR]', error);
    if (error.description) {
      console.error(`[PROMO POST] Telegram API Error: ${error.description}`);
    }

    await ctx.editMessageText(
      `❌ Не удалось опубликовать промокод.\n\n` +
      `Проверьте:\n` +
      `1. Бот админ в канале.\n` +
      `2. У бота есть право постить сообщения.\n` +
      `3. ID канала корректен.`,
      {
        parse_mode: 'HTML',
        ...getPromoPostReadyKeyboard(),
      }
    );
  }

  return ctx.answerCbQuery();
}

// Отмена постинга и возврат к промо
async function handlePromoPostCancel(ctx) {
  const userId = String(ctx.from.id);
  const session = promoPostSessions.get(userId);

  if (!session) {
    return ctx.answerCbQuery('❌ Сессия не найдена.', true);
  }

  const promoName = session.promoName;
  promoPostSessions.delete(userId);

  try {
    await ctx.editMessageText(
      `❌ Постинг отменён.\n\nВозвращаемся к промокоду...`
    );
  } catch (e) {
    // Игнорируем ошибку редактирования
  }

  // Восстанавливаем информацию о промокоде
  await showPromoSummary(ctx, promoName);
  return ctx.answerCbQuery();
}

// Назад к промо (из любого шага постинга)
async function handlePromoPostBack(ctx) {
  const userId = String(ctx.from.id);
  const session = promoPostSessions.get(userId);

  if (!session) {
    return ctx.answerCbQuery('❌ Сессия не найдена.', true);
  }

  const promoName = session.promoName;
  promoPostSessions.delete(userId);

  await showPromoSummary(ctx, promoName);
  return ctx.answerCbQuery();
}

// Изменить текст поста — возврат к шагу ввода
async function handlePromoPostEditText(ctx) {
  const userId = String(ctx.from.id);
  const session = promoPostSessions.get(userId);

  if (!session) {
    return ctx.answerCbQuery('❌ Сессия не найдена.', true);
  }

  session.step = 'text';
  session.messageId = null;
  session.sourceChatId = null;
  promoPostSessions.set(userId, session);

  await ctx.editMessageText(
    `📢 Канал: <b>${session.channel.name}</b>\n\n` +
    `Промокод: <code>${escapeHtml(session.promoName)}</code>\n\n` +
    `Отправьте <b>новый текст поста</b>:`,
    {
      parse_mode: 'HTML',
      ...getPromoPostCancelKeyboard(),
    }
  );

  return ctx.answerCbQuery();
}

// Сменить канал — возврат к выбору канала
async function handlePromoPostChangeChannel(ctx) {
  const userId = String(ctx.from.id);
  const session = promoPostSessions.get(userId);

  if (!session) {
    return ctx.answerCbQuery('❌ Сессия не найдена.', true);
  }

  session.step = 'channel';
  session.channel = null;
  session.messageId = null;
  session.sourceChatId = null;
  promoPostSessions.set(userId, session);

  await ctx.editMessageText(
    `📢 <b>Выбор канала</b>\n\n` +
    `Промокод: <code>${escapeHtml(session.promoName)}</code>\n\n` +
    `Выберите канал:`,
    {
      parse_mode: 'HTML',
      ...getPromoPostChannelKeyboard(),
    }
  );

  return ctx.answerCbQuery();
}

// Показывает итоговое сообщение о промокоде (с кнопкой постинга)
async function showPromoSummary(ctx, promoName) {
  try {
    const promo = await getPromoByName(promoName);
    if (!promo) {
      await ctx.reply(`❌ Промокод <code>${escapeHtml(promoName)}</code> не найден.`);
      return;
    }

    const botUsername = process.env.BOT_USERNAME || 'F_roobot';
    const { getPromoNameByAlias } = require('../db');
    let alias = null;
    try {
      const { generatePromoAlias, savePromoAlias } = require('../db');
      alias = generatePromoAlias(promoName);
      if (alias) savePromoAlias(alias, promoName);
    } catch (e) {}

    const linkPayload = alias ? `promo_${alias}` : `promo_${promoName}`;
    const promoLink = `https://t.me/${botUsername}?start=${linkPayload}`;

    let limitStr = promo.activations_left === -1
      ? `⏳ Время: ${promo.expires_at ? 'до ' + new Date(promo.expires_at * 1000).toLocaleString() : '∞'}`
      : `🔢 Активаций: ${formatNumber(promo.activations_left)}`;

    const summaryMsg = `✅ <b>Промокод готов!</b>\n\n` +
      `🏷 Название: <code>${escapeHtml(promoName)}</code>\n` +
      `${limitStr}\n` +
      `🎁 Приз: ${formatNumber(promo.prize_amount)} ${prizeTypeMapping[promo.prize_type]}\n` +
      `🔒 Статус: ${getStatusNameById(promo.min_status_id)}\n\n` +
      `🔗 <b>Ссылка для активации:</b>\n${promoLink}`;

    const keyboard = Markup.inlineKeyboard([
      [Markup.button.url('🚀 Активировать промокод', promoLink)],
      [Markup.button.callback('📢 Запостить промо', `promo_post_menu_${promoName}`)],
    ]);

    await ctx.reply(summaryMsg, {
      parse_mode: 'HTML',
      ...keyboard,
    });
  } catch (error) {
    console.error('[PROMO SUMMARY ERROR]', error);
    await ctx.reply('❌ Ошибка при показе информации о промокоде.');
  }
}

// Роутер callback-ов для постинга промо
async function handlePromoPostCallback(ctx) {
  if (!(await isAdmin(ctx))) {
    return ctx.answerCbQuery('❌ Нет доступа.', true);
  }

  const data = ctx.callbackQuery?.data;
  if (!data) return ctx.answerCbQuery();

  if (data.startsWith('promo_post_menu_')) {
    const promoName = data.replace('promo_post_menu_', '');
    await startPromoPost(ctx, promoName);
    return ctx.answerCbQuery();
  }

  if (data.startsWith('promo_post_channel_')) {
    return handlePromoPostChannelSelection(ctx);
  }

  if (data === 'promo_post_preview') {
    return handlePromoPostPreview(ctx);
  }

  if (data === 'promo_post_send') {
    return handlePromoPostPublish(ctx);
  }

  if (data === 'promo_post_cancel') {
    return handlePromoPostCancel(ctx);
  }

  if (data === 'promo_post_back') {
    return handlePromoPostBack(ctx);
  }

  if (data === 'promo_post_edit_text') {
    return handlePromoPostEditText(ctx);
  }

  if (data === 'promo_post_change_channel') {
    return handlePromoPostChangeChannel(ctx);
  }

  return ctx.answerCbQuery();
}

// --- ОСНОВНАЯ ЛОГИКА ПОШАГОВОГО ВВОДА ---
async function startPromoCreationSession(ctx) {
  if (!(await isAdmin(ctx))) {
    return ctx.reply('❌ У вас нет прав для создания промокодов.');
  }

  const userId = ctx.from.id.toString();

  promoSessions.set(userId, {
    step: STEP_NAME,
    data: {
      name: '',
      isTimeBased: false,
      activations: 0,
      durationMinutes: 0,
      prize_type: '',
      prize_amount: 0,
      min_status_id: 0
    },
    active: true,
    waitingForEdit: false,
    editField: null,
    forceImageTemplate: null
  });

  await ctx.reply('🚀 <b>Создание нового промокода</b>\n\nШаг 1/7: Введите <b>название</b> промокода:', {
    parse_mode: 'HTML',
    reply_markup: cancelKeyboard.reply_markup
  });
}

function stepHint(session) {
  switch (session.step) {
    case STEP_NAME: return '✍️ Введите название промокода текстом.';
    case STEP_LIMIT_TYPE: return '🔘 Выберите тип ограничения кнопками ниже.';
    case STEP_TIME_VALUE: return '⏳ Введите время в минутах числом (или нажмите кнопку).';
    case STEP_ACT_VALUE: return '🔢 Введите количество активаций числом (или нажмите кнопку).';
    case STEP_PRIZE_TYPE: return '🔘 Выберите тип приза кнопками ниже.';
    case STEP_PRIZE_AMOUNT: return '💰 Введите сумму приза числом (или нажмите кнопку 10k/25k/100k).';
    case STEP_STATUS: return '🔘 Выберите минимальный статус кнопками ниже.';
    case STEP_TEMPLATE: return '🖼 Выберите шаблон изображения кнопками ниже.';
    default: return '🔘 Используйте кнопки под сообщением проверки.';
  }
}

async function handlePromoCreationMessage(ctx) {
  const userId = ctx.from.id.toString();
  const session = promoSessions.get(userId);

  if (!session || !session.active || session.waitingForEdit) return false;

  const text = ctx.message?.text?.trim();
  if (!text) return false;

  try {
    if (session.step === STEP_NAME) {
      session.data.name = text;
      session.step = STEP_LIMIT_TYPE;
      await ctx.reply(`✅ Название <b>${escapeHtml(text)}</b> принято.\n\nШаг 2/7: Выберите тип ограничения:`, {
        parse_mode: 'HTML',
        reply_markup: limitTypeKeyboard.reply_markup
      });
      return true;
    }

    if (session.step === STEP_TIME_VALUE && session.data.isTimeBased) {
      const val = parseInt(text, 10);
      if (isNaN(val) || val <= 0) {
        await ctx.reply('❌ Некорректное число. Введите время в минутах (> 0):', { reply_markup: timeQuickKeyboard.reply_markup });
        return true;
      }
      session.data.durationMinutes = val;
      session.step = STEP_PRIZE_TYPE;
      await ctx.reply(`✅ Время действия: <b>${formatDuration(val)}</b>.\n\nШаг 4/7: Выберите <b>тип приза</b>:`, {
        parse_mode: 'HTML',
        reply_markup: prizeTypeKeyboard.reply_markup
      });
      return true;
    }

    if (session.step === STEP_ACT_VALUE && !session.data.isTimeBased) {
      const val = parseInt(text, 10);
      if (isNaN(val) || val <= 0) {
        await ctx.reply('❌ Некорректное число. Введите количество активаций (> 0):', { reply_markup: activationsQuickKeyboard.reply_markup });
        return true;
      }
      session.data.activations = val;
      session.step = STEP_PRIZE_TYPE;
      await ctx.reply(`✅ Активаций: <b>${formatNumber(val)}</b>.\n\nШаг 4/7: Выберите <b>тип приза</b>:`, {
        parse_mode: 'HTML',
        reply_markup: prizeTypeKeyboard.reply_markup
      });
      return true;
    }

    if (session.step === STEP_PRIZE_AMOUNT) {
      const val = parseFloat(text.replace(',', '.'));
      if (isNaN(val) || val <= 0) {
        await ctx.reply('❌ Некорректная сумма. Введите число или выберите вариант кнопками ниже:', { reply_markup: prizeAmountQuickKeyboard.reply_markup });
        return true;
      }
      session.data.prize_amount = val;
      session.step = STEP_STATUS;
      await ctx.reply(`✅ Сумма приза: <b>${formatNumber(val)}</b> ${prizeTypeMapping[session.data.prize_type]}.\n\nШаг 6/7: Выберите <b>минимальный статус</b>:`, {
        parse_mode: 'HTML',
        reply_markup: statusKeyboard.reply_markup
      });
      return true;
    }

    if (session.step === STEP_SUMMARY && session.editField) {
      const field = session.editField;
      if (field === 'name') {
        session.data.name = text;
        session.editField = null;
        await showSummary(ctx, session);
        return true;
      }
      if (field === 'prize_amount') {
        const val = parseFloat(text.replace(',', '.'));
        if (isNaN(val) || val <= 0) {
          await ctx.reply('❌ Ошибка ввода. Введите число больше 0:', { reply_markup: cancelEditKeyboard.reply_markup });
          return true;
        }
        session.data.prize_amount = val;
        session.editField = null;
        await showSummary(ctx, session);
        return true;
      }
      if (field === 'activations' && !session.data.isTimeBased) {
        const val = parseInt(text, 10);
        if (isNaN(val) || val <= 0) {
          await ctx.reply('❌ Ошибка ввода.', { reply_markup: cancelEditKeyboard.reply_markup });
          return true;
        }
        session.data.activations = val;
        session.editField = null;
        await showSummary(ctx, session);
        return true;
      }
      if (field === 'durationMinutes' && session.data.isTimeBased) {
        const val = parseInt(text, 10);
        if (isNaN(val) || val <= 0) {
          await ctx.reply('❌ Ошибка ввода.', { reply_markup: cancelEditKeyboard.reply_markup });
          return true;
        }
        session.data.durationMinutes = val;
        session.editField = null;
        await showSummary(ctx, session);
        return true;
      }
    }

    await ctx.reply(`❓ Не понял ввод.\n${stepHint(session)}`);
    return true;
  } catch (error) {
    console.error('[PROMO CREATE ERROR]', error);
    await ctx.reply('❌ Произошла ошибка. Попробуйте заново: создать');
    promoSessions.delete(userId);
    return false;
  }
}

async function showSummary(ctx, session) {
  const d = session.data;
  let limitInfo = '';
  if (d.isTimeBased) {
    limitInfo = `⏳ <b>Время действия:</b> ${formatDuration(d.durationMinutes)}`;
  } else {
    limitInfo = `🔢 <b>Активаций:</b> ${formatNumber(d.activations)}`;
  }

  let templateInfo = '🤖 Авто';
  if (session.forceImageTemplate === 'fat') templateInfo = '🟢 Жирный';
  if (session.forceImageTemplate === 'default') templateInfo = '🔵 Обычный';
  if (session.forceImageTemplate === 'fat_time') templateInfo = '🟢 Жирный (Время)';
  if (session.forceImageTemplate === 'default_time') templateInfo = '🔵 Обычный (Время)';

  const summaryText = `
🎉 <b>Проверьте данные промокода:</b>
🏷 <b>Название:</b> <code>${escapeHtml(d.name)}</code>
${limitInfo}
🎁 <b>Приз:</b> ${formatNumber(d.prize_amount)} ${prizeTypeMapping[d.prize_type]}
🔒 <b>Мин. статус:</b> ${getStatusNameById(d.min_status_id)}
🖼 <b>Шаблон:</b> ${templateInfo}

Нажмите «Подтвердить», чтобы создать, или «Редактировать».
`.trim();

  session.step = STEP_SUMMARY;
  await ctx.reply(summaryText, {
    parse_mode: 'HTML',
    reply_markup: finalConfirmKeyboard.reply_markup
  });
}

// --- ОБРАБОТЧИКИ CALLBACK (КНОПКИ) ---
async function handleCallback(ctx) {
  const userId = ctx.from.id.toString();
  const data = ctx.callbackQuery.data;

  // =====================================================
  // НОВОЕ: Сначала проверяем, относится ли callback к постингу промо
  // =====================================================
  if (data.startsWith('promo_post_')) {
    return handlePromoPostCallback(ctx);
  }

  const session = promoSessions.get(userId);
  if (!session && data !== 'promo_cancel_create') {
    return ctx.answerCbQuery('❌ Сессия истекла.', { show_alert: true });
  }

  if (data === 'promo_cancel_create') {
    promoSessions.delete(userId);
    await ctx.editMessageText('❌ Создание отменено.').catch(() => {});
    await ctx.reply('Можете начать заново: создать');
    return ctx.answerCbQuery();
  }

  if (!session) return ctx.answerCbQuery();

  if (data === 'promo_limit_type_time') {
    if (session.step !== STEP_LIMIT_TYPE) return ctx.answerCbQuery('❌ Неверный этап.', { show_alert: true });
    session.data.isTimeBased = true;
    session.step = STEP_TIME_VALUE;
    await ctx.editMessageText(`✅ Выбрано ограничение по <b>времени</b>.\n\nШаг 3/7: Введите время в минутах:`, {
      parse_mode: 'HTML',
      reply_markup: timeQuickKeyboard.reply_markup
    });
    return ctx.answerCbQuery();
  }

  if (data === 'promo_limit_type_count') {
    if (session.step !== STEP_LIMIT_TYPE) return ctx.answerCbQuery('❌ Неверный этап.', { show_alert: true });
    session.data.isTimeBased = false;
    session.step = STEP_ACT_VALUE;
    await ctx.editMessageText(`✅ Выбрано ограничение по <b>количеству</b>.\n\nШаг 3/7: Введите количество активаций:`, {
      parse_mode: 'HTML',
      reply_markup: activationsQuickKeyboard.reply_markup
    });
    return ctx.answerCbQuery();
  }

  if (data.startsWith('promo_quick_time_')) {
    if (session.step !== STEP_TIME_VALUE) return ctx.answerCbQuery('❌ Неверный этап.', { show_alert: true });
    const val = parseInt(data.replace('promo_quick_time_', ''), 10);
    session.data.durationMinutes = val;
    session.step = STEP_PRIZE_TYPE;
    await ctx.editMessageText(`✅ Время: <b>${formatDuration(val)}</b>.\n\nШаг 4/7: Выберите <b>тип приза</b>:`, {
      parse_mode: 'HTML',
      reply_markup: prizeTypeKeyboard.reply_markup
    });
    return ctx.answerCbQuery();
  }

  if (data.startsWith('promo_quick_act_')) {
    if (session.step !== STEP_ACT_VALUE) return ctx.answerCbQuery('❌ Неверный этап.', { show_alert: true });
    const val = parseInt(data.replace('promo_quick_act_', ''), 10);
    session.data.activations = val;
    session.step = STEP_PRIZE_TYPE;
    await ctx.editMessageText(`✅ Активаций: <b>${formatNumber(val)}</b>.\n\nШаг 4/7: Выберите <b>тип приза</b>:`, {
      parse_mode: 'HTML',
      reply_markup: prizeTypeKeyboard.reply_markup
    });
    return ctx.answerCbQuery();
  }

  if (data.startsWith('promo_prize_')) {
    const isEdit = session.step === STEP_SUMMARY && session.editField === 'prize_type';
    if (session.step !== STEP_PRIZE_TYPE && !isEdit) return ctx.answerCbQuery('❌ Неверный этап.', { show_alert: true });
    const typeKey = data.replace('promo_prize_', '');
    const map = {
      'container_type_3': 'container_type_3',
      'balance': 'balance',
      'df_balance': 'df_balance',
      'npf_shares': 'npf_shares',
      'tickets': 'tickets'
    };
    if (!map[typeKey]) return ctx.answerCbQuery('❌ Неизвестный тип приза.');
    session.data.prize_type = map[typeKey];
    if (isEdit) {
      session.editField = null;
      await showSummary(ctx, session);
      await ctx.deleteMessage().catch(() => {});
      return ctx.answerCbQuery();
    }
    session.step = STEP_PRIZE_AMOUNT;
    await ctx.editMessageText(`✅ Тип приза: <b>${prizeTypeMapping[session.data.prize_type]}</b>.\n\nШаг 5/7: Введите <b>сумму приза</b>:`, {
      parse_mode: 'HTML',
      reply_markup: prizeAmountQuickKeyboard.reply_markup
    });
    return ctx.answerCbQuery();
  }

  if (data.startsWith('promo_quick_sum_')) {
    const val = parseInt(data.replace('promo_quick_sum_', ''), 10);
    if (isNaN(val) || val <= 0) return ctx.answerCbQuery('❌ Некорректная сумма.');
    if (session.step === STEP_PRIZE_AMOUNT) {
      session.data.prize_amount = val;
      session.step = STEP_STATUS;
      await ctx.editMessageText(`✅ Сумма: <b>${formatNumber(val)}</b> ${prizeTypeMapping[session.data.prize_type]}.\n\nШаг 6/7: Выберите <b>мин. статус</b>:`, {
        parse_mode: 'HTML',
        reply_markup: statusKeyboard.reply_markup
      });
      return ctx.answerCbQuery();
    }
    if (session.step === STEP_STATUS) {
      session.data.prize_amount = val;
      await ctx.editMessageText(`✅ Сумма обновлена: <b>${formatNumber(val)}</b> ${prizeTypeMapping[session.data.prize_type]}.\n\nШаг 6/7: Выберите <b>мин. статус</b>:`, {
        parse_mode: 'HTML',
        reply_markup: statusKeyboard.reply_markup
      });
      return ctx.answerCbQuery();
    }
    if (session.step === STEP_TEMPLATE) {
      session.data.prize_amount = val;
      await ctx.editMessageText(`✅ Сумма обновлена: <b>${formatNumber(val)}</b>.\n\nШаг 7/7: Выберите <b>шаблон изображения</b>:`, {
        parse_mode: 'HTML',
        reply_markup: templateKeyboard.reply_markup
      });
      return ctx.answerCbQuery();
    }
    if (session.step === STEP_SUMMARY) {
      session.data.prize_amount = val;
      session.editField = null;
      await showSummary(ctx, session);
      return ctx.answerCbQuery();
    }
    return ctx.answerCbQuery('❌ Сначала выберите тип приза.', { show_alert: true });
  }

  if (data.startsWith('promo_status_')) {
    const isEdit = session.step === STEP_SUMMARY && session.editField === 'status';
    if (session.step !== STEP_STATUS && !isEdit) return ctx.answerCbQuery('❌ Неверный этап.', { show_alert: true });
    const statusId = parseInt(data.replace('promo_status_', ''), 10);
    session.data.min_status_id = statusId;
    if (isEdit) {
      session.editField = null;
      await showSummary(ctx, session);
      await ctx.deleteMessage().catch(() => {});
      return ctx.answerCbQuery();
    }
    session.step = STEP_TEMPLATE;
    await ctx.editMessageText(`✅ Мин. статус: <b>${getStatusNameById(statusId)}</b>.\n\nШаг 7/7: Выберите <b>шаблон изображения</b>:`, {
      parse_mode: 'HTML',
      reply_markup: templateKeyboard.reply_markup
    });
    return ctx.answerCbQuery();
  }

  if (data.startsWith('promo_template_')) {
    const isEdit = session.step === STEP_SUMMARY && session.editField === 'template';
    if (session.step !== STEP_TEMPLATE && !isEdit) return ctx.answerCbQuery('❌ Неверный этап.', { show_alert: true });
    const key = data.replace('promo_template_', '');
    if (key === 'auto') {
      session.forceImageTemplate = null;
    } else if (key === 'fat') {
      session.forceImageTemplate = session.data.isTimeBased ? 'fat_time' : 'fat';
    } else if (key === 'default') {
      session.forceImageTemplate = session.data.isTimeBased ? 'default_time' : 'default';
    } else {
      return ctx.answerCbQuery('❌ Неизвестный шаблон.');
    }
    session.editField = null;
    await showSummary(ctx, session);
    await ctx.deleteMessage().catch(() => {});
    return ctx.answerCbQuery();
  }

  if (data === 'promo_confirm_final') {
    if (session.step !== STEP_SUMMARY) return ctx.answerCbQuery('❌ Неверный этап.', { show_alert: true });
    await finalizePromoCreation(ctx, session);
    return;
  }

  if (data === 'promo_edit_menu') {
    session.waitingForEdit = true;
    await ctx.editMessageText('✏️ <b>Редактирование</b>\n\nВыберите поле:', {
      parse_mode: 'HTML',
      reply_markup: editMenuKeyboard.reply_markup
    });
    return ctx.answerCbQuery();
  }

  if (data === 'promo_back_to_check') {
    session.waitingForEdit = false;
    session.editField = null;
    await showSummary(ctx, session);
    return ctx.answerCbQuery();
  }

  if (data.startsWith('promo_edit_')) {
    const field = data.replace('promo_edit_', '');
    session.waitingForEdit = false;
    session.editField = null;
    if (field === 'name') {
      session.editField = 'name';
      await ctx.reply(`✍️ Новое <b>название</b> (текущее: <code>${escapeHtml(session.data.name)}</code>):`, {
        parse_mode: 'HTML',
        reply_markup: cancelEditKeyboard.reply_markup
      });
      await ctx.deleteMessage().catch(() => {});
      return ctx.answerCbQuery();
    }
    if (field === 'limit_type') {
      session.step = STEP_LIMIT_TYPE;
      await ctx.editMessageText('✏️ Выберите новый <b>тип ограничения</b>:', {
        parse_mode: 'HTML',
        reply_markup: limitTypeKeyboard.reply_markup
      });
      return ctx.answerCbQuery();
    }
    if (field === 'prize_type') {
      session.editField = 'prize_type';
      session.step = STEP_SUMMARY;
      await ctx.editMessageText('✏️ Новый <b>тип приза</b>:', {
        parse_mode: 'HTML',
        reply_markup: prizeTypeKeyboard.reply_markup
      });
      return ctx.answerCbQuery();
    }
    if (field === 'prize_amount') {
      session.editField = 'prize_amount';
      await ctx.reply(`✍️ Новая <b>сумма</b> (текущая: ${formatNumber(session.data.prize_amount)}):`, {
        parse_mode: 'HTML',
        reply_markup: cancelEditKeyboard.reply_markup
      });
      await ctx.deleteMessage().catch(() => {});
      return ctx.answerCbQuery();
    }
    if (field === 'status') {
      session.editField = 'status';
      session.step = STEP_SUMMARY;
      await ctx.editMessageText('✏️ Новый <b>мин. статус</b>:', {
        parse_mode: 'HTML',
        reply_markup: statusKeyboard.reply_markup
      });
      return ctx.answerCbQuery();
    }
    if (field === 'template') {
      session.editField = 'template';
      session.step = STEP_SUMMARY;
      await ctx.editMessageText('✏️ Выберите <b>шаблон изображения</b>:', {
        parse_mode: 'HTML',
        reply_markup: templateKeyboard.reply_markup
      });
      return ctx.answerCbQuery();
    }
    return ctx.answerCbQuery('❌ Неизвестное поле.');
  }

  return ctx.answerCbQuery();
}

async function finalizePromoCreation(ctx, session) {
  const d = session.data;
  const adminId = ctx.from.id.toString();
  try {
    const existingPromo = await getPromoByName(d.name);
    if (existingPromo) {
      await ctx.reply(`⚠️ <b>Внимание!</b>\n\nПромокод <code>${escapeHtml(d.name)}</code> уже существует.`, {
        parse_mode: 'HTML',
        reply_markup: editMenuKeyboard.reply_markup
      });
      return;
    }

    let activationsLeft = d.isTimeBased ? -1 : d.activations;
    let expiresAt = null;
    if (d.isTimeBased) {
      const now = Math.floor(Date.now() / 1000);
      expiresAt = now + (d.durationMinutes * 60);
    }

    const result = await createPromo(d.name, activationsLeft, d.prize_type, d.prize_amount, adminId, d.min_status_id, expiresAt);
    if (!result.success) {
      promoSessions.delete(ctx.from.id.toString());
      return ctx.reply(`❌ Ошибка: ${result.message}`);
    }

    let photoPath = null;
    try {
      const templateHint = session.forceImageTemplate;
      photoPath = await generatePromoImage(d.name, d.isTimeBased ? d.durationMinutes : d.activations, d.prize_amount, d.prize_type, templateHint, d.isTimeBased, expiresAt);
    } catch (imgErr) {
      console.error('[PROMO IMG ERROR]', imgErr);
    }

    const botUsername = process.env.BOT_USERNAME || 'F_roobot';
    const { generatePromoAlias, savePromoAlias } = require('../db');
    const alias = generatePromoAlias(d.name);
    if (alias) {
      savePromoAlias(alias, d.name);
    }
    const linkPayload = alias ? `promo_${alias}` : `promo_${d.name}`;
    const promoLink = `https://t.me/${botUsername}?start=${linkPayload}`;

    let limitStr = d.isTimeBased
      ? `⏳ Время: ${formatDuration(d.durationMinutes)} (до ${new Date(expiresAt * 1000).toLocaleTimeString()})`
      : `🔢 Активаций: ${formatNumber(d.activations)}`;

    const successMsg = `✅ <b>Промокод создан!</b>\n\n` +
      `🏷 Название: <code>${escapeHtml(d.name)}</code>\n` +
      `${limitStr}\n` +
      `🎁 Приз: ${formatNumber(d.prize_amount)} ${prizeTypeMapping[d.prize_type]}\n` +
      `🔒 Статус: ${getStatusNameById(d.min_status_id)}\n\n` +
      `🔗 <b>Ссылка для активации:</b>\n${promoLink}`;

    // =====================================================
    // НОВОЕ: Добавляем кнопку "Запостить промо" в клавиатуру
    // =====================================================
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.url('🚀 Активировать промокод', promoLink)],
      [Markup.button.callback('📢 Запостить промо', `promo_post_menu_${d.name}`)],
    ]);

    if (photoPath) {
      await ctx.replyWithPhoto({ source: photoPath }, {
        caption: successMsg,
        parse_mode: 'HTML',
        reply_markup: keyboard.reply_markup
      });
    } else {
      await ctx.reply(successMsg, {
        parse_mode: 'HTML',
        reply_markup: keyboard.reply_markup
      });
    }

    promoSessions.delete(ctx.from.id.toString());
  } catch (error) {
    console.error('[PROMO FINALIZE ERROR]', error);
    await ctx.reply('❌ Ошибка при сохранении.');
  }
}

// --- СТАРЫЕ ФУНКЦИИ ---
async function deletePromoHandler(ctx) {
  if (!(await isAdmin(ctx))) return;
  const parts = ctx.message.text.trim().split(/\s+/);
  if (parts.length !== 3 || parts[1] !== 'промо') return ctx.reply('Использование: удалить промо <id>');
  const id = parseInt(parts[2], 10);
  if (isNaN(id)) return ctx.reply('Некорректный ID.');
  const promo = await getPromoById(id);
  if (!promo) return ctx.reply('Промокод не найден.');
  const res = await deletePromoById(id);
  await ctx.reply(res.success ? `✅ Промокод "${escapeHtml(promo.name)}" удален.` : '❌ Ошибка.');
}

async function listPromosHandler(ctx) {
  if (!(await isAdmin(ctx))) return;
  const promos = await getAllPromos();
  if (!promos.length) return ctx.reply('Список пуст.');
  let msg = '';
  for (const p of promos) {
    let limitInfo = p.activations_left === -1
      ? `⏳ До: ${p.expires_at ? new Date(p.expires_at * 1000).toLocaleString() : '∞'}`
      : `🔢 Ост: ${formatNumber(p.activations_left)}`;
    const entry = `• <b>ID</b>: ${p.id} | <code>${escapeHtml(p.name)}</code>\n ${limitInfo} | 🎁 ${formatNumber(p.prize_amount)} ${prizeTypeMapping[p.prize_type]}\n\n`;
    if ((msg + entry).length > 4000) {
      await ctx.reply(msg, { parse_mode: 'HTML' });
      msg = '';
      await new Promise(r => setTimeout(r, 500));
    }
    msg += entry;
  }
  if (msg) await ctx.reply(msg, { parse_mode: 'HTML' });
}

async function usePromoHandler(ctx) {
  const parts = ctx.message.text.trim().split(/\s+/);
  if (parts.length !== 2 || parts[0].toLowerCase() !== 'промо') {
    return ctx.reply('❕ <b>Использование</b>: промо [название]', { parse_mode: 'HTML' });
  }
  const promoName = parts[1];
  const userId = ctx.from.id.toString();
  const now = Math.floor(Date.now() / 1000);
  try {
    console.log(`[PROMO DEBUG] Попытка активации промокода: "${promoName}" пользователем ${userId}`);
    const promo = await getPromoByName(promoName);
    if (!promo) {
      console.log(`[PROMO DEBUG] Промокод "${promoName}" не найден в БД.`);
      logPromoActivation({ userId, promoName, success: false, reason: 'Промокод не найден' });
      return ctx.reply('❕ Промокод не найден.');
    }
    console.log(`[PROMO DEBUG] Промокод найден. ID: ${promo.id}, Activations: ${promo.activations_left}, Expires: ${promo.expires_at}`);
    if (promo.expires_at) {
      if (now > promo.expires_at) {
        console.log(`[PROMO DEBUG] Промокод истек! Сейчас: ${now}, Истекает: ${promo.expires_at}. Удаляем.`);
        logPromoActivation({ userId, promoName: promo.name, prizeType: promo.prize_type, prizeAmount: promo.prize_amount, success: false, reason: 'Срок действия истёк' });
        await deletePromoById(promo.id);
        return ctx.reply('❕ Срок действия этого промокода истек.');
      } else {
        console.log(`[PROMO DEBUG] Время в порядке. Осталось секунд: ${promo.expires_at - now}`);
      }
    }
    if (promo.activations_left <= 0 && promo.activations_left !== -1) {
      console.log(`[PROMO DEBUG] Активации исчерпаны (${promo.activations_left}).`);
      logPromoActivation({ userId, promoName: promo.name, prizeType: promo.prize_type, prizeAmount: promo.prize_amount, success: false, reason: 'Активации исчерпаны' });
      return ctx.reply('❕ Активации исчерпаны.');
    }
    if (await hasUserActivatedPromo(promo.id, userId)) {
      console.log(`[PROMO DEBUG] Пользователь ${userId} уже активировал этот промокод.`);
      logPromoActivation({ userId, promoName: promo.name, prizeType: promo.prize_type, prizeAmount: promo.prize_amount, success: false, reason: 'Уже активирован ранее' });
      return ctx.reply('❕ Вы уже активировали этот код.');
    }
    if (promo.min_status_id > 0) {
      const statuses = await getUserStatuses(userId);
      const reqStatus = getStatusNameById(promo.min_status_id);
      if (!statuses.includes(reqStatus)) {
        console.log(`[PROMO DEBUG] Недостаточный статус у пользователя ${userId}. Требуется: ${reqStatus}`);
        logPromoActivation({ userId, promoName: promo.name, prizeType: promo.prize_type, prizeAmount: promo.prize_amount, success: false, reason: `Недостаточный статус (требуется ${reqStatus})` });
        return ctx.reply(`❕ Недостаточный статус. Требуется: ${reqStatus}.`);
      }
    }
    console.log(`[PROMO DEBUG] Вызов activatePromo...`);
    const res = await activatePromo(promo.id, userId);
    if (!res.success) {
      console.error(`[PROMO DEBUG] Ошибка activatePromo: ${res.message}`);
      return ctx.reply(`❕ Ошибка активации: ${res.message || 'Неизвестная ошибка БД'}`);
    }
    console.log(`[PROMO DEBUG] Активация успешна. Приз: ${res.prizeAmount} ${promo.prize_type}`);
    await recordPromoActivation(promo.id, userId);
    if (promo.activations_left !== -1) {
      const updated = await getPromoById(promo.id);
      if (updated && updated.activations_left <= 0) {
        console.log(`[PROMO DEBUG] Активации кончились, удаляем промокод.`);
        await deletePromoById(updated.id);
      }
    }
    let candyMsg = '';
    if (Math.random() < 0.15) {
      const count = Math.floor(Math.random() * 4) + 2;
      const { giveCandy } = require('../db');
      giveCandy(userId, count);
      candyMsg = `\n🍬 +${count} конфет бонусом!`;
    }
    const user = await getUserById(userId);
    const link = await createUserLink(user.id, user.username || user.first_name);
    await ctx.reply(`✅ ${link}, промокод активирован!\n▫️ Получено: ${formatNumber(res.prizeAmount)} ${prizeTypeMapping[promo.prize_type]}${candyMsg}`, { parse_mode: 'HTML' });
    if (LOG_CHAT_PROMO_ID) {
      try {
        const logMsg = `🔔 <b>Активация промокода</b>\n• Игрок: ${link}\n• Код: <code>${escapeHtml(promo.name)}</code>\n• Приз: ${formatNumber(res.prizeAmount)} ${prizeTypeMapping[promo.prize_type]}`;
        await ctx.telegram.sendMessage(LOG_CHAT_PROMO_ID, logMsg, { parse_mode: 'HTML' });
        console.log(`[PROMO LOG] Лог отправлен в чат ${LOG_CHAT_PROMO_ID}`);
      } catch (logError) {
        console.error(`[PROMO LOG ERROR] Не удалось отправить лог в чат ${LOG_CHAT_PROMO_ID}:`, logError.message);
      }
    } else {
      console.log('[PROMO LOG] Переменная LOG_CHAT_PROMO_ID не установлена, логирование пропущено.');
    }
  } catch (error) {
    console.error('[PROMO USE CRITICAL ERROR]', error);
    await ctx.reply('❕ Произошла критическая ошибка при активации. Попробуйте позже.');
  }
}

module.exports = {
  startPromoCreationSession,
  handlePromoCreationMessage,
  handleCallback,
  deletePromoHandler,
  listPromosHandler,
  usePromoHandler,
  // НОВОЕ: функции для постинга промо
  handlePromoPostMessage,
  handlePromoPostCallback,
  showPromoSummary,
};