// admin/playerManagement.js
"use strict";

const { Markup } = require('telegraf');
const path = require('path');
const fs = require('fs');
const {
  getPlayerByAnyIdPm,
  setUserFieldPm,
  getUserStatuses,
  getUserSkinsWithSerials,
  getUserPrefixNamesPm,
  deleteUserAccount,
  resetAccount,
  getReferralCountPm,
  getReferrerId,
  getUserById,
  getSkinById,
  // модерация
  isUserBanned,
  getBlacklistEntry,
  addToBlacklist,
  removeFromBlacklist,
  isUserMuted,
  addMute,
  removeMute,
  getUserMutesPm,
  // скины
  getAllSkinsWithOwnershipPm,
  giveSkinToUser,
  takeSkinFromUser,
  getUserAvailableSkins,
  // статусы
  getAllStatuses,
  updateUserStatus,
  removeUserStatus,
  // префиксы
  getAllPrefixes,
  addPrefixToUser,
  removePrefixFromUser,
  getUserPrefixesDetailedPm,
  getAllSpecialPrefixes,
} = require('../db');

// =====================================================
// СЕССИИ
// =====================================================
const pmSessions = new Map();

const PM_STATE = {
  IDLE: 'IDLE',
  WAITING_ID: 'WAITING_ID',
  WAITING_EDIT_VALUE: 'WAITING_EDIT_VALUE',
  WAITING_BAN_DURATION: 'WAITING_BAN_DURATION',
  WAITING_BAN_REASON: 'WAITING_BAN_REASON',
  WAITING_MUTE_CHAT: 'WAITING_MUTE_CHAT',
  WAITING_MUTE_DURATION: 'WAITING_MUTE_DURATION',
  WAITING_MUTE_REASON: 'WAITING_MUTE_REASON',
};

function getSession(adminId) {
  return pmSessions.get(String(adminId)) || null;
}
function setSession(adminId, data) {
  pmSessions.set(String(adminId), data);
}
function clearSession(adminId) {
  pmSessions.delete(String(adminId));
}

// Известные чаты для мута
const KNOWN_CHATS = {
  '-1002681608387': 'DICE',
  '-1002546508751': 'DOUBLE PLUSS',
};

// =====================================================
// КОНФИГУРАЦИЯ ПОЛЕЙ
// =====================================================
const CATEGORIES = {
  currencies: {
    label: '💰 Валюты',
    fields: {
      balance:          { label: 'PF баланс',       type: 'number', fmt: true,  def: 0 },
      card_balance:     { label: 'Баланс карты',    type: 'number', fmt: true,  def: 0 },
      df_balance:       { label: 'DF баланс',       type: 'number', fmt: true,  def: 0 },
      npf_shares:       { label: 'Акции NPF',       type: 'number',            def: 0 },
    },
  },
  items: {
    label: '🎫 Предметы',
    fields: {
      tickets:          { label: 'Билетики',           type: 'number', def: 0 },
      fortune_tickets:  { label: 'Билетики фортуны',   type: 'number', def: 0 },
      candy:            { label: 'Конфеты',            type: 'number', def: 0 },
      secret_gifts:     { label: 'Секретные подарки',  type: 'number', def: 0 },
      container_type_1: { label: 'Контейнеры CLASSIC', type: 'number', def: 0 },
      container_type_2: { label: 'Контейнеры PREMIUM', type: 'number', def: 0 },
      container_type_3: { label: 'Контейнеры GOLD',    type: 'number', def: 0 },
    },
  },
  combat: {
    label: '⚡ Боевые',
    fields: {
      energy:        { label: 'Энергия',          type: 'number', def: 0 },
      attack_power:  { label: 'Сила атаки',       type: 'number', def: 1 },
      account_level: { label: 'Уровень аккаунта', type: 'number', def: 1 },
    },
  },
  stats: {
    label: '🎮 Статистика',
    fields: {
      double_wins:           { label: 'Победы (дабл)',       type: 'number', def: 0 },
      double_losses:         { label: 'Проигрыши (дабл)',    type: 'number', def: 0 },
      game_wins:             { label: 'Победы GAME',         type: 'number', def: 0 },
      max_win_amount:        { label: 'Макс. выигрыш',       type: 'number', fmt: true, def: 0 },
      max_bet_amount:        { label: 'Макс. ставка',        type: 'number', fmt: true, def: 0 },
      current_win_streak:    { label: 'Текущая серия побед', type: 'number', def: 0 },
      best_win_streak:       { label: 'Лучшая серия побед',  type: 'number', def: 0 },
      double_total_bets:     { label: 'Всего ставок',        type: 'number', def: 0 },
      double_total_winnings: { label: 'Всего выигрышей',     type: 'number', fmt: true, def: 0 },
      double_total_losses:   { label: 'Всего проигрышей',    type: 'number', fmt: true, def: 0 },
    },
  },
  flags: {
    label: '⚙️ Флаги',
    fields: {
      disable_hyperlink:     { label: 'Гиперссылка выкл.',      type: 'boolean', def: 0 },
      transfers_blocked:     { label: 'Переводы заблокированы', type: 'boolean', def: 0 },
      is_hidden_in_top:      { label: 'Скрыт в топе',           type: 'boolean', def: 0 },
      notifications_enabled: { label: 'Уведомления вкл.',       type: 'boolean', def: 1 },
      report_blocked:        { label: 'Репорты заблокированы',  type: 'boolean', def: 0 },
      is_registered:         { label: 'Зарегистрирован',        type: 'boolean', def: 1 },
    },
  },
  referral: {
    label: '👥 Реферальная',
    fields: {
      referral_bonus_amount: { label: 'Бонус за реферала', type: 'number', fmt: true, def: 30000 },
      referrer_bank:         { label: 'Банк реферовода',   type: 'number', fmt: true, def: 0 },
    },
  },
  other: {
    label: '📝 Прочее',
    fields: {
      username:             { label: 'Никнейм',           type: 'text',   def: 'Press Эфыч' },
      total_donated_stars:  { label: 'Всего донат-звёзд', type: 'number', def: 0 },
      likes_received:       { label: 'Лайки',             type: 'number', def: 0 },
      dislikes_received:    { label: 'Дизлайки',          type: 'number', def: 0 },
    },
  },
};

// Управляемые разделы (скины, статусы, префиксы, модерация)
const MANAGE_SECTIONS = {
  skins:    { label: '🎨 Скины' },
  statuses: { label: '🏷 Статусы' },
  prefixes: { label: '🔤 Префиксы' },
  moderation: { label: '🛡 Модерация (бан/мут)' },
};

// =====================================================
// УТИЛИТЫ
// =====================================================

// Форматирование числа с разделением тысяч пробелом
function fmtNum(n) {
  if (n == null || isNaN(n)) return '0';
  return Math.floor(Number(n)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

// Парсинг ввода с поддержкой "к" и "кк"
// 1к = 1000, 1кк = 1000000, 1м = 1000000
function parseAmountInput(str) {
  if (str == null) return null;
  let s = String(str).trim().toLowerCase().replace(/\s/g, '');
  if (!s) return null;
  let multiplier = 1;
  if (s.endsWith('кк')) {
    multiplier = 1000000;
    s = s.slice(0, -2);
  } else if (s.endsWith('к')) {
    multiplier = 1000;
    s = s.slice(0, -1);
  } else if (s.endsWith('м')) {
    multiplier = 1000000;
    s = s.slice(0, -1);
  }
  const num = parseFloat(s);
  if (isNaN(num)) return null;
  return Math.floor(num * multiplier);
}

function boolLabel(v) {
  return v ? '✅ Да' : '❌ Нет';
}

function truncate(str, max = 16) {
  if (!str) return '';
  return str.length > max ? str.substring(0, max) + '…' : str;
}

async function safeEditOrReply(ctx, text, keyboard) {
  const opts = { parse_mode: 'HTML', ...keyboard };
  try {
    if (ctx.callbackQuery && ctx.callbackQuery.message) {
      await ctx.editMessageText(text, opts);
    } else {
      await ctx.reply(text, opts);
    }
  } catch (e) {
    try { await ctx.reply(text, opts); } catch (e2) { /* ignore */ }
  }
}

async function safeAnswer(ctx, text) {
  try { if (ctx.callbackQuery) await ctx.answerCbQuery(text); } catch (e) {}
}

// Удалить текущее сообщение (для перехода с фото на текст)
async function deleteCurrentMessage(ctx) {
  try {
    if (ctx.callbackQuery && ctx.callbackQuery.message) {
      await ctx.deleteMessage();
    }
  } catch (e) { /* ignore */ }
}

// =====================================================
// ЗАПУСК ПОИСКА ИГРОКА
// =====================================================
async function startPlayerSearch(ctx) {
  const adminId = String(ctx.from.id);
  setSession(adminId, { state: PM_STATE.WAITING_ID, targetUserId: null });

  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('❌ Отмена', 'pm_cancel')],
  ]);

  await safeEditOrReply(
    ctx,
    '👤 <b>Управление игроком</b>\n\n' +
    'Введите <b>Numeric ID</b> или <b>Telegram ID</b> игрока.\n' +
    'Или нажмите «Отмена».',
    keyboard
  );
  await safeAnswer(ctx);
}

// =====================================================
// ОБРАБОТКА ТЕКСТА
// =====================================================
async function handlePlayerManagementMessage(ctx) {
  const adminId = String(ctx.from.id);
  const session = getSession(adminId);
  if (!session || session.state === PM_STATE.IDLE) return false;

  const text = (ctx.message?.text || '').trim();
  if (!text) return false;

  // Отмена по тексту
  if (text.toLowerCase() === 'отмена') {
    session.state = PM_STATE.IDLE;
    session.editField = null;
    session.editCategory = null;
    session.banData = null;
    session.muteData = null;
    setSession(adminId, session);
    await ctx.reply('❌ Операция отменена.', Markup.inlineKeyboard([
      [Markup.button.callback('⬅️ В техпанель', 'tech_admin_panel')],
    ]));
    return true;
  }

  // --- Ожидание ID игрока ---
  if (session.state === PM_STATE.WAITING_ID) {
    const player = getPlayerByAnyIdPm(text);
    if (!player) {
      await ctx.reply('❌ Игрок не найден. Попробуйте другой ID или «Отмена».');
      return true;
    }
    session.state = PM_STATE.IDLE;
    session.targetUserId = player.id;
    setSession(adminId, session);
    await showMainMenu(ctx, player.id);
    return true;
  }

  // --- Ожидание нового значения поля ---
  if (session.state === PM_STATE.WAITING_EDIT_VALUE) {
    const { targetUserId, editField, editCategory } = session;
    const player = getUserById(targetUserId);
    if (!player) {
      clearSession(adminId);
      await ctx.reply('❌ Игрок не найден.');
      return true;
    }

    const cat = CATEGORIES[editCategory];
    const fieldCfg = cat?.fields?.[editField];
    if (!fieldCfg) {
      clearSession(adminId);
      await ctx.reply('❌ Поле не найдено.');
      return true;
    }

    let newValue;
    if (fieldCfg.type === 'number') {
      newValue = parseAmountInput(text);
      if (newValue == null) {
        await ctx.reply('❌ Введите число (можно с «к»: 1к = 1000, 1кк = 1 000 000) или «Отмена».');
        return true;
      }
    } else if (fieldCfg.type === 'text') {
      newValue = text;
    } else {
      clearSession(adminId);
      await ctx.reply('❌ Неизвестный тип поля.');
      return true;
    }

    const oldValue = player[editField];
    const result = setUserFieldPm(targetUserId, editField, newValue);

    if (result.success) {
      session.state = PM_STATE.IDLE;
      session.editField = null;
      session.editCategory = null;
      setSession(adminId, session);

      const oldDisplay = fieldCfg.fmt ? fmtNum(oldValue) : oldValue;
      const newDisplay = fieldCfg.fmt ? fmtNum(newValue) : newValue;

      await ctx.replyWithHTML(
        `✅ <b>Значение изменено!</b>\n\n` +
        `👤 Игрок: <b>${truncate(player.username)}</b> (ID: <code>${player.numeric_id}</code>)\n` +
        `📌 Поле: <b>${fieldCfg.label}</b>\n` +
        `📦 Было: <code>${oldDisplay}</code>\n` +
        `📦 Стало: <code>${newDisplay}</code>`,
        Markup.inlineKeyboard([
          [Markup.button.callback('✏️ Редактирование', `pm_edit_cat_${editCategory}`)],
          [Markup.button.callback('👁 Просмотр', `pm_view_cat_${editCategory}`)],
          [Markup.button.callback('⬅️ Главное меню', 'pm_main')],
        ])
      );
    } else {
      await ctx.reply(`❌ Ошибка: ${result.message}`);
    }
    return true;
  }

  // --- Ожидание времени бана ---
  if (session.state === PM_STATE.WAITING_BAN_DURATION) {
    const banData = session.banData || {};
    if (text.toLowerCase() === 'навсегда') {
      banData.duration = null;
    } else {
      const hours = parseFloat(text);
      if (isNaN(hours) || hours <= 0) {
        await ctx.reply('❌ Введите время в часах или «навсегда», либо «Отмена».');
        return true;
      }
      banData.duration = hours;
    }
    session.banData = banData;
    session.state = PM_STATE.WAITING_BAN_REASON;
    setSession(adminId, session);
    await ctx.reply('📝 Введите причину бана (или «Отмена»):');
    return true;
  }

  // --- Ожидание причины бана ---
  if (session.state === PM_STATE.WAITING_BAN_REASON) {
    const banData = session.banData || {};
    banData.reason = text || 'Не указана';
    const targetUserId = session.targetUserId;
    const player = getUserById(targetUserId);

    const banUntil = banData.duration === null
      ? null
      : Math.floor(Date.now() / 1000) + banData.duration * 3600;

    addToBlacklist(targetUserId, banData.reason, banUntil);

    session.state = PM_STATE.IDLE;
    session.banData = null;
    setSession(adminId, session);

    // Уведомление игроку
    try {
      const durText = banData.duration === null ? 'Навсегда' : `${banData.duration} ч.`;
      await ctx.telegram.sendMessage(targetUserId,
        `📛 <b>Вы были забанены администратором.</b>\n` +
        `📕 Причина: ${banData.reason}\n` +
        `⏳ Время бана: ${durText}`,
        { parse_mode: 'HTML' }
      );
    } catch (e) { /* игрок заблокировал бота */ }

    await ctx.replyWithHTML(
      `✅ <b>Игрок забанен!</b>\n\n` +
      `👤 Игрок: <b>${truncate(player?.username)}</b> (ID: <code>${player?.numeric_id}</code>)\n` +
      `📕 Причина: ${banData.reason}\n` +
      `⏳ Время: ${banData.duration === null ? 'Навсегда' : banData.duration + ' ч.'}`,
      Markup.inlineKeyboard([
        [Markup.button.callback('🛡 Модерация', 'pm_mod')],
        [Markup.button.callback('⬅️ Главное меню', 'pm_main')],
      ])
    );
    return true;
  }

  // --- Ожидание чата для мута ---
  if (session.state === PM_STATE.WAITING_MUTE_CHAT) {
    const muteData = session.muteData || {};
    // Принимаем либо ID чата, либо название из списка
    let chatId = text;
    const knownEntry = Object.entries(KNOWN_CHATS).find(([, name]) => name.toLowerCase() === text.toLowerCase());
    if (knownEntry) chatId = knownEntry[0];
    if (!chatId.startsWith('-')) {
      await ctx.reply('❌ Введите ID чата (начинается с -) или название из списка, либо «Отмена».');
      return true;
    }
    muteData.chatId = chatId;
    session.muteData = muteData;
    session.state = PM_STATE.WAITING_MUTE_DURATION;
    setSession(adminId, session);
    await ctx.reply('⏳ Введите время мута в часах, «мин» для минут, или «навсегда» (или «Отмена»):');
    return true;
  }

  // --- Ожидание времени мута ---
  if (session.state === PM_STATE.WAITING_MUTE_DURATION) {
    const muteData = session.muteData || {};
    if (text.toLowerCase() === 'навсегда') {
      muteData.duration = null;
    } else {
      const isMinutes = text.toLowerCase().endsWith('мин');
      const num = parseFloat(text.replace(/мин/i, '').trim());
      if (isNaN(num) || num <= 0) {
        await ctx.reply('❌ Введите корректное время или «навсегда», либо «Отмена».');
        return true;
      }
      muteData.duration = isMinutes ? num / 60 : num; // в часах
    }
    session.muteData = muteData;
    session.state = PM_STATE.WAITING_MUTE_REASON;
    setSession(adminId, session);
    await ctx.reply('📝 Введите причину мута (или «Отмена»):');
    return true;
  }

  // --- Ожидание причины мута ---
  if (session.state === PM_STATE.WAITING_MUTE_REASON) {
    const muteData = session.muteData || {};
    muteData.reason = text || 'Не указана';
    const targetUserId = session.targetUserId;
    const player = getUserById(targetUserId);
    const chatId = muteData.chatId;

    const mutedUntil = muteData.duration === null
      ? null
      : Math.floor(Date.now() / 1000) + muteData.duration * 3600;

    addMute(targetUserId, chatId, muteData.reason, mutedUntil);

    // Ограничиваем права в чате
    try {
      const permissions = {
        can_send_messages: false,
        can_send_media_messages: false,
        can_send_polls: false,
        can_send_other_messages: false,
        can_add_web_page_previews: false,
        can_change_info: false,
        can_invite_users: false,
        can_pin_messages: false,
      };
      const untilDate = muteData.duration === null ? 0 : Math.floor(Date.now() / 1000) + muteData.duration * 3600;
      await ctx.telegram.restrictChatMember(chatId, targetUserId, permissions, untilDate);
    } catch (e) {
      console.error('[PM] Не удалось ограничить права в чате:', e.message);
    }

    session.state = PM_STATE.IDLE;
    session.muteData = null;
    setSession(adminId, session);

    const chatName = KNOWN_CHATS[chatId] || chatId;
    await ctx.replyWithHTML(
      `✅ <b>Мут выдан!</b>\n\n` +
      `👤 Игрок: <b>${truncate(player?.username)}</b> (ID: <code>${player?.numeric_id}</code>)\n` +
      `📍 Чат: <code>${chatName}</code>\n` +
      `📕 Причина: ${muteData.reason}\n` +
      `⏳ Время: ${muteData.duration === null ? 'Навсегда' : muteData.duration + ' ч.'}`,
      Markup.inlineKeyboard([
        [Markup.button.callback('🛡 Модерация', 'pm_mod')],
        [Markup.button.callback('⬅️ Главное меню', 'pm_main')],
      ])
    );
    return true;
  }

  return false;
}

// =====================================================
// ГЛАВНОЕ МЕНЮ ИГРОКА
// =====================================================
async function showMainMenu(ctx, targetUserId) {
  const player = getUserById(targetUserId);
  if (!player) {
    await ctx.reply('❌ Игрок не найден.');
    return;
  }

  const statuses = await getUserStatuses(targetUserId);
  const totalPF = (player.balance || 0) + (player.card_balance || 0);
  const refCount = getReferralCountPm(targetUserId);
  const banned = isUserBanned(targetUserId);

  const text =
    `👤 <b>Управление игроком</b>\n\n` +
    `🪪 Ник: <b>${truncate(player.username)}</b>\n` +
    `🆔 Numeric ID: <code>${player.numeric_id}</code>\n` +
    `🆔 Telegram ID: <code>${player.id}</code>\n` +
    `🏷 Статусы: ${statuses.length > 0 ? statuses.join(', ') : 'Player'}\n` +
    `💰 Общий PF: <b>${fmtNum(totalPF)}</b>\n` +
    `🍩 DF: <b>${fmtNum(player.df_balance || 0)}</b>\n` +
    `👥 Рефералов: <b>${refCount}</b>\n` +
    `${banned ? '📛 <b>АККАУНТ ЗАБАНЕН</b>' : '🟢 Аккаунт активен'}`;

  const keyboard = Markup.inlineKeyboard([
    [
      Markup.button.callback('👁 Просмотр данных', 'pm_view'),
      Markup.button.callback('✏️ Редактирование', 'pm_edit'),
    ],
    [
      Markup.button.callback('🎨 Скины', 'pm_skins'),
      Markup.button.callback('🏷 Статусы', 'pm_statuses'),
    ],
    [
      Markup.button.callback('🔤 Префиксы', 'pm_prefixes'),
      Markup.button.callback('🛡 Модерация', 'pm_mod'),
    ],
    [
      Markup.button.callback('🔄 Обнулить аккаунт', 'pm_reset'),
      Markup.button.callback('🗑 Удалить аккаунт', 'pm_delete'),
    ],
    [Markup.button.callback('⬅️ Назад в техпанель', 'tech_admin_panel')],
  ]);

  await safeEditOrReply(ctx, text, keyboard);
  await safeAnswer(ctx);
}

// =====================================================
// ПРОСМОТР: КАТЕГОРИИ
// =====================================================
async function showViewCategories(ctx) {
  const adminId = String(ctx.from.id);
  const session = getSession(adminId);
  if (!session?.targetUserId) return safeAnswer(ctx, '❌ Сначала найдите игрока.');

  const player = getUserById(session.targetUserId);
  if (!player) return safeAnswer(ctx, '❌ Игрок не найден.');

  const rows = [];
  for (const [key, cat] of Object.entries(CATEGORIES)) {
    rows.push([Markup.button.callback(cat.label, `pm_view_cat_${key}`)]);
  }
  for (const [key, sec] of Object.entries(MANAGE_SECTIONS)) {
    rows.push([Markup.button.callback(sec.label, `pm_manage_${key}`)]);
  }
  rows.push([Markup.button.callback('⬅️ Назад', 'pm_main')]);

  await safeEditOrReply(
    ctx,
    `👁 <b>Просмотр данных</b>\n👤 Игрок: <b>${truncate(player.username)}</b> (ID: <code>${player.numeric_id}</code>)\n\nВыберите категорию:`,
    Markup.inlineKeyboard(rows)
  );
  await safeAnswer(ctx);
}

// =====================================================
// ПРОСМОТР: КОНКРЕТНАЯ КАТЕГОРИЯ
// =====================================================
async function showViewCategory(ctx, catKey) {
  const adminId = String(ctx.from.id);
  const session = getSession(adminId);
  if (!session?.targetUserId) return safeAnswer(ctx, '❌ Сначала найдите игрока.');

  const player = getUserById(session.targetUserId);
  if (!player) return safeAnswer(ctx, '❌ Игрок не найден.');

  const cat = CATEGORIES[catKey];
  if (!cat) return safeAnswer(ctx, '❌ Категория не найдена.');

  let text = `${cat.label}\n👤 Игрок: <b>${truncate(player.username)}</b>\n\n`;

  for (const [fieldKey, fieldCfg] of Object.entries(cat.fields)) {
    const val = player[fieldKey];
    if (fieldCfg.type === 'boolean') {
      text += `▫️ ${fieldCfg.label}: <b>${boolLabel(val)}</b>\n`;
    } else if (fieldCfg.type === 'number') {
      text += `▫️ ${fieldCfg.label}: <b>${fieldCfg.fmt ? fmtNum(val) : val}</b>\n`;
    } else {
      text += `▫️ ${fieldCfg.label}: <b>${truncate(val, 32)}</b>\n`;
    }
  }

  if (catKey === 'currencies') {
    const totalPF = (player.balance || 0) + (player.card_balance || 0);
    text += `\n📊 Общий PF (баланс + карта): <b>${fmtNum(totalPF)}</b>`;
  }
  if (catKey === 'referral') {
    const refId = getReferrerId(player.id);
    const refCount = getReferralCountPm(player.id);
    text += `\n▫️ Реферер ID: <code>${refId || 'Нет'}</code>\n`;
    text += `▫️ Количество рефералов: <b>${refCount}</b>`;
  }

  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('✏️ Редактировать раздел', `pm_edit_cat_${catKey}`)],
    [Markup.button.callback('⬅️ Категории', 'pm_view')],
    [Markup.button.callback('🏠 Главное меню', 'pm_main')],
  ]);

  await safeEditOrReply(ctx, text, keyboard);
  await safeAnswer(ctx);
}

// =====================================================
// РЕДАКТИРОВАНИЕ: КАТЕГОРИИ
// =====================================================
async function showEditCategories(ctx) {
  const adminId = String(ctx.from.id);
  const session = getSession(adminId);
  if (!session?.targetUserId) return safeAnswer(ctx, '❌ Сначала найдите игрока.');

  const player = getUserById(session.targetUserId);
  if (!player) return safeAnswer(ctx, '❌ Игрок не найден.');

  const rows = [];
  for (const [key, cat] of Object.entries(CATEGORIES)) {
    rows.push([Markup.button.callback(cat.label, `pm_edit_cat_${key}`)]);
  }
  rows.push([Markup.button.callback('⬅️ Назад', 'pm_main')]);

  await safeEditOrReply(
    ctx,
    `✏️ <b>Редактирование данных</b>\n👤 Игрок: <b>${truncate(player.username)}</b> (ID: <code>${player.numeric_id}</code>)\n\nВыберите категорию:`,
    Markup.inlineKeyboard(rows)
  );
  await safeAnswer(ctx);
}

// =====================================================
// РЕДАКТИРОВАНИЕ: КОНКРЕТНАЯ КАТЕГОРИЯ
// =====================================================
async function showEditCategory(ctx, catKey) {
  const adminId = String(ctx.from.id);
  const session = getSession(adminId);
  if (!session?.targetUserId) return safeAnswer(ctx, '❌ Сначала найдите игрока.');

  const player = getUserById(session.targetUserId);
  if (!player) return safeAnswer(ctx, '❌ Игрок не найден.');

  const cat = CATEGORIES[catKey];
  if (!cat) return safeAnswer(ctx, '❌ Категория не найдена.');

  let text = `${cat.label} — <b>Редактирование</b>\n👤 Игрок: <b>${truncate(player.username)}</b>\n\nВыберите поле для изменения:\n`;

  const rows = [];
  for (const [fieldKey, fieldCfg] of Object.entries(cat.fields)) {
    const val = player[fieldKey];
    if (fieldCfg.type === 'boolean') {
      const icon = val ? '🟢' : '🔴';
      rows.push([Markup.button.callback(`${icon} ${fieldCfg.label}: ${boolLabel(val)}`, `pm_toggle_${catKey}_${fieldKey}`)]);
      text += `▫️ ${fieldCfg.label}: <b>${boolLabel(val)}</b> (нажмите для переключения)\n`;
    } else {
      const display = fieldCfg.type === 'number' ? (fieldCfg.fmt ? fmtNum(val) : val) : truncate(val, 24);
      rows.push([Markup.button.callback(`✏️ ${fieldCfg.label}: ${display}`, `pm_editfield_${catKey}_${fieldKey}`)]);
      text += `▫️ ${fieldCfg.label}: <b>${display}</b>\n`;
    }
  }

  rows.push([Markup.button.callback('🔄 Обнулить раздел', `pm_resetcat_${catKey}`)]);
  rows.push([Markup.button.callback('👁 Просмотр раздела', `pm_view_cat_${catKey}`)]);
  rows.push([Markup.button.callback('⬅️ Категории', 'pm_edit')]);
  rows.push([Markup.button.callback('🏠 Главное меню', 'pm_main')]);

  await safeEditOrReply(ctx, text, Markup.inlineKeyboard(rows));
  await safeAnswer(ctx);
}

// =====================================================
// РЕДАКТИРОВАНИЕ: ОЖИДАНИЕ ЗНАЧЕНИЯ
// =====================================================
async function startFieldEdit(ctx, catKey, fieldKey) {
  const adminId = String(ctx.from.id);
  const session = getSession(adminId);
  if (!session?.targetUserId) return safeAnswer(ctx, '❌ Сначала найдите игрока.');

  const player = getUserById(session.targetUserId);
  if (!player) return safeAnswer(ctx, '❌ Игрок не найден.');

  const cat = CATEGORIES[catKey];
  const fieldCfg = cat?.fields?.[fieldKey];
  if (!fieldCfg) return safeAnswer(ctx, '❌ Поле не найдено.');

  session.state = PM_STATE.WAITING_EDIT_VALUE;
  session.editField = fieldKey;
  session.editCategory = catKey;
  setSession(adminId, session);

  if (fieldCfg.type === 'text') {
    await safeEditOrReply(
      ctx,
      `✏️ <b>Изменение: ${fieldCfg.label}</b>\n` +
      `👤 Игрок: <b>${truncate(player.username)}</b>\n` +
      `Текущее значение: <code>${truncate(player[fieldKey], 32)}</code>\n\n` +
      `Введите новое значение или «Отмена».`,
      Markup.inlineKeyboard([[Markup.button.callback('❌ Отмена', 'pm_cancel_edit')]])
    );
    await safeAnswer(ctx);
    return;
  }

  const currentVal = fieldCfg.fmt ? fmtNum(player[fieldKey]) : player[fieldKey];
  await safeEditOrReply(
    ctx,
    `✏️ <b>Изменение: ${fieldCfg.label}</b>\n` +
    `👤 Игрок: <b>${truncate(player.username)}</b> (ID: <code>${player.numeric_id}</code>)\n` +
    `Текущее значение: <code>${currentVal}</code>\n\n` +
    `Введите новое число (можно «к»: 1к=1000, 1кк=1 000 000) или «Отмена».`,
    Markup.inlineKeyboard([[Markup.button.callback('❌ Отмена', 'pm_cancel_edit')]])
  );
  await safeAnswer(ctx);
}

// =====================================================
// ПЕРЕКЛЮЧЕНИЕ BOOLEAN
// =====================================================
async function toggleBooleanField(ctx, catKey, fieldKey) {
  const adminId = String(ctx.from.id);
  const session = getSession(adminId);
  if (!session?.targetUserId) return safeAnswer(ctx, '❌ Сначала найдите игрока.');

  const player = getUserById(session.targetUserId);
  if (!player) return safeAnswer(ctx, '❌ Игрок не найден.');

  const cat = CATEGORIES[catKey];
  const fieldCfg = cat?.fields?.[fieldKey];
  if (!fieldCfg || fieldCfg.type !== 'boolean') return safeAnswer(ctx, '❌ Поле не найдено.');

  const oldValue = !!player[fieldKey];
  const newValue = oldValue ? 0 : 1;

  const result = setUserFieldPm(session.targetUserId, fieldKey, newValue);
  if (result.success) {
    await safeAnswer(ctx, `✅ ${fieldCfg.label}: ${boolLabel(oldValue)} → ${boolLabel(!!newValue)}`);
    await showEditCategory(ctx, catKey);
  } else {
    await safeAnswer(ctx, `❌ Ошибка: ${result.message}`);
  }
}

// =====================================================
// ОБНУЛЕНИЕ РАЗДЕЛА
// =====================================================
async function confirmResetCategory(ctx, catKey) {
  const adminId = String(ctx.from.id);
  const session = getSession(adminId);
  if (!session?.targetUserId) return safeAnswer(ctx, '❌ Сначала найдите игрока.');

  const player = getUserById(session.targetUserId);
  if (!player) return safeAnswer(ctx, '❌ Игрок не найден.');

  const cat = CATEGORIES[catKey];
  if (!cat) return safeAnswer(ctx, '❌ Категория не найдена.');

  let fieldsText = '';
  for (const [fieldKey, fieldCfg] of Object.entries(cat.fields)) {
    const def = fieldCfg.def != null ? fieldCfg.def : 0;
    const defDisplay = fieldCfg.type === 'boolean' ? boolLabel(def) : (fieldCfg.fmt ? fmtNum(def) : def);
    fieldsText += `▫️ ${fieldCfg.label} → <code>${defDisplay}</code>\n`;
  }

  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('✅ Подтвердить обнуление', `pm_resetcat_confirm_${catKey}`)],
    [Markup.button.callback('❌ Отмена', `pm_edit_cat_${catKey}`)],
  ]);

  await safeEditOrReply(
    ctx,
    `🔄 <b>Обнуление раздела: ${cat.label}</b>\n` +
    `👤 Игрок: <b>${truncate(player.username)}</b>\n\n` +
    `Все поля раздела будут сброшены:\n${fieldsText}\n` +
    `Подтвердите действие:`,
    keyboard
  );
  await safeAnswer(ctx);
}

async function doResetCategory(ctx, catKey) {
  const adminId = String(ctx.from.id);
  const session = getSession(adminId);
  if (!session?.targetUserId) return safeAnswer(ctx, '❌ Сначала найдите игрока.');

  const player = getUserById(session.targetUserId);
  if (!player) return safeAnswer(ctx, '❌ Игрок не найден.');

  const cat = CATEGORIES[catKey];
  if (!cat) return safeAnswer(ctx, '❌ Категория не найдена.');

  let changed = 0;
  for (const [fieldKey, fieldCfg] of Object.entries(cat.fields)) {
    const def = fieldCfg.def != null ? fieldCfg.def : 0;
    const result = setUserFieldPm(session.targetUserId, fieldKey, def);
    if (result.success) changed++;
  }

  await safeEditOrReply(
    ctx,
    `✅ <b>Раздел обнулён!</b>\n\n` +
    `👤 Игрок: <b>${truncate(player.username)}</b>\n` +
    `📌 Раздел: ${cat.label}\n` +
    `🔄 Сброшено полей: <b>${changed}</b>`,
    Markup.inlineKeyboard([
      [Markup.button.callback('✏️ Редактирование', `pm_edit_cat_${catKey}`)],
      [Markup.button.callback('👁 Просмотр', `pm_view_cat_${catKey}`)],
      [Markup.button.callback('⬅️ Категории', 'pm_edit')],
      [Markup.button.callback('🏠 Главное меню', 'pm_main')],
    ])
  );
  await safeAnswer(ctx);
}

// =====================================================
// СКИНЫ: ПРОСМОТР С ФОТО И НАВИГАЦИЕЙ
// =====================================================
async function showSkinsView(ctx, startIndex = 0) {
  const adminId = String(ctx.from.id);
  const session = getSession(adminId);
  if (!session?.targetUserId) return safeAnswer(ctx, '❌ Сначала найдите игрока.');

  const player = getUserById(session.targetUserId);
  if (!player) return safeAnswer(ctx, '❌ Игрок не найден.');

  const skins = getUserSkinsWithSerials(player.id);
  if (!skins || skins.length === 0) {
    await safeEditOrReply(
      ctx,
      `🎨 <b>Скины игрока</b> ${truncate(player.username)}\n\nСкинов нет.\n`,
      Markup.inlineKeyboard([
        [Markup.button.callback('➕ Добавить скин', 'pm_skin_add_menu')],
        [Markup.button.callback('⬅️ Категории', 'pm_view')],
        [Markup.button.callback('🏠 Главное меню', 'pm_main')],
      ])
    );
    await safeAnswer(ctx);
    return;
  }

  // Нормализуем индекс
  let idx = startIndex;
  if (idx < 0) idx = skins.length - 1;
  if (idx >= skins.length) idx = 0;

  session.skinsIndex = idx;
  setSession(adminId, session);

  const skin = skins[idx];
  const selectedId = player.selected_skin_id || 0;
  const isActive = skin.id === selectedId;
  const rarityEmojis = { ORDINARY: '🔵', EPIC: '🟣', LEGENDARY: '🟡', EXCLUSIVE: '💠', 'EXCLUSIVE+': '🌟' };
  const rarityEmoji = rarityEmojis[skin.rarity] || '❓';

  const caption =
    `🎒 <b>Скины игрока</b> ${truncate(player.username)}\n\n` +
    `▫️ Название: <b>${skin.name}</b>\n` +
    `${rarityEmoji} Редкость: <b>${skin.rarity}</b>\n` +
    `🔖 Серийный номер: <code>${skin.serial_number}</code>\n` +
    `Активен: ${isActive ? '✅' : '❌'}\n\n` +
    `🎨 Скин ${idx + 1} из ${skins.length}`;

  const keyboard = Markup.inlineKeyboard([
    [
      Markup.button.callback('⬅️', 'pm_skin_prev'),
      Markup.button.callback(isActive ? '✅ Активен' : '🎯 Сделать активным', 'pm_skin_setactive'),
      Markup.button.callback('➡️', 'pm_skin_next'),
    ],
    [
      Markup.button.callback('➕ Добавить скин', 'pm_skin_add_menu'),
      Markup.button.callback('➖ Забрать этот', 'pm_skin_remove'),
    ],
    [
      Markup.button.callback('⬅️ Категории', 'pm_view'),
      Markup.button.callback('🏠 Главное меню', 'pm_main'),
    ],
  ]);

  const imagePath = path.join(__dirname, '../images', skin.file_name);
  try {
    if (fs.existsSync(imagePath)) {
      // Если это колбэк с фото — редактируем медиа, иначе шлём фото
      if (ctx.callbackQuery && ctx.callbackQuery.message && ctx.callbackQuery.message.photo) {
        await ctx.editMessageMedia(
          { type: 'photo', media: { source: imagePath }, caption, parse_mode: 'HTML' },
          keyboard
        );
      } else {
        await ctx.replyWithPhoto({ source: imagePath }, { caption, parse_mode: 'HTML', ...keyboard });
      }
    } else {
      await safeEditOrReply(ctx, caption + '\n\n⚠️ Файл изображения не найден.', keyboard);
    }
  } catch (e) {
    await safeEditOrReply(ctx, caption + '\n\n⚠️ Не удалось загрузить изображение.', keyboard);
  }
  await safeAnswer(ctx);
}

async function skinsNavigate(ctx, direction) {
  const adminId = String(ctx.from.id);
  const session = getSession(adminId);
  if (!session?.targetUserId) return safeAnswer(ctx, '❌ Сначала найдите игрока.');

  const skins = getUserSkinsWithSerials(session.targetUserId);
  if (!skins || skins.length === 0) return safeAnswer(ctx, '❌ Скинов нет.');

  const current = session.skinsIndex || 0;
  let newIndex = current + direction;
  await showSkinsView(ctx, newIndex);
}

async function setSkinActive(ctx) {
  const adminId = String(ctx.from.id);
  const session = getSession(adminId);
  if (!session?.targetUserId) return safeAnswer(ctx, '❌ Сначала найдите игрока.');

  const skins = getUserSkinsWithSerials(session.targetUserId);
  if (!skins || skins.length === 0) return safeAnswer(ctx, '❌ Скинов нет.');

  const idx = session.skinsIndex || 0;
  const skin = skins[idx];
  if (!skin) return safeAnswer(ctx, '❌ Скин не найден.');

  const { updateUserSelectedSkin } = require('../db');
  updateUserSelectedSkin(session.targetUserId, skin.id);
  await safeAnswer(ctx, `✅ Скин "${skin.name}" сделан активным`);
  await showSkinsView(ctx, idx);
}

async function removeCurrentSkin(ctx) {
  const adminId = String(ctx.from.id);
  const session = getSession(adminId);
  if (!session?.targetUserId) return safeAnswer(ctx, '❌ Сначала найдите игрока.');

  const player = getUserById(session.targetUserId);
  const skins = getUserSkinsWithSerials(session.targetUserId);
  if (!skins || skins.length === 0) return safeAnswer(ctx, '❌ Скинов нет.');

  const idx = session.skinsIndex || 0;
  const skin = skins[idx];
  if (!skin) return safeAnswer(ctx, '❌ Скин не найден.');

  // Подтверждение
  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('✅ Забрать скин', `pm_skin_remove_confirm_${skin.id}`)],
    [Markup.button.callback('❌ Отмена', 'pm_skins')],
  ]);
  await safeEditOrReply(
    ctx,
    `⚠️ Забрать скин <b>${skin.name}</b> у игрока ${truncate(player.username)}?`,
    keyboard
  );
  await safeAnswer(ctx);
}

async function confirmRemoveSkin(ctx, skinId) {
  const adminId = String(ctx.from.id);
  const session = getSession(adminId);
  if (!session?.targetUserId) return safeAnswer(ctx, '❌ Сначала найдите игрока.');

  const player = getUserById(session.targetUserId);
  const result = takeSkinFromUser(session.targetUserId, skinId);
  if (result.success) {
    await safeAnswer(ctx, '✅ Скин забран');
    // После удаления показываем обновлённый список (с индекса 0)
    await showSkinsView(ctx, 0);
  } else {
    await safeAnswer(ctx, `❌ ${result.message}`);
  }
}

// =====================================================
// СКИНЫ: МЕНЮ ДОБАВЛЕНИЯ
// =====================================================
const SKINS_ADD_PER_PAGE = 8;

async function showSkinAddMenu(ctx, page = 0) {
  const adminId = String(ctx.from.id);
  const session = getSession(adminId);
  if (!session?.targetUserId) return safeAnswer(ctx, '❌ Сначала найдите игрока.');

  const player = getUserById(session.targetUserId);
  const allSkins = getAllSkinsWithOwnershipPm(player.id);
  // Показываем только те, которых нет
  const available = allSkins.filter(s => !s.owned);

  if (available.length === 0) {
    await safeEditOrReply(
      ctx,
      `🎨 <b>Добавление скина</b>\n\nУ игрока уже есть все скины.`,
      Markup.inlineKeyboard([
        [Markup.button.callback('⬅️ К скинам', 'pm_skins')],
        [Markup.button.callback('🏠 Главное меню', 'pm_main')],
      ])
    );
    await safeAnswer(ctx);
    return;
  }

  const totalPages = Math.ceil(available.length / SKINS_ADD_PER_PAGE);
  let p = page;
  if (p < 0) p = totalPages - 1;
  if (p >= totalPages) p = 0;

  session.skinAddPage = p;
  setSession(adminId, session);

  const start = p * SKINS_ADD_PER_PAGE;
  const pageSkins = available.slice(start, start + SKINS_ADD_PER_PAGE);

  let text = `🎨 <b>Добавление скина</b>\n👤 Игрок: <b>${truncate(player.username)}</b>\nСтр. ${p + 1}/${totalPages}\n\nВыберите скин:\n`;

  const rows = [];
  for (const s of pageSkins) {
    const rarityEmojis = { ORDINARY: '🔵', EPIC: '🟣', LEGENDARY: '🟡', EXCLUSIVE: '💠', 'EXCLUSIVE+': '🌟' };
    const em = rarityEmojis[s.rarity] || '';
    rows.push([Markup.button.callback(`${em} ${truncate(s.name, 24)}`, `pm_skin_add_${s.id}`)]);
  }

  // Навигация по страницам
  const navRow = [];
  if (totalPages > 1) {
    navRow.push(Markup.button.callback('⬅️', 'pm_skin_add_prev'));
    navRow.push(Markup.button.callback(`${p + 1}/${totalPages}`, 'pm_noop'));
    navRow.push(Markup.button.callback('➡️', 'pm_skin_add_next'));
    rows.push(navRow);
  }
  rows.push([Markup.button.callback('⬅️ К скинам', 'pm_skins')]);

  await safeEditOrReply(ctx, text, Markup.inlineKeyboard(rows));
  await safeAnswer(ctx);
}

async function skinAddNavigate(ctx, direction) {
  const adminId = String(ctx.from.id);
  const session = getSession(adminId);
  const currentPage = session?.skinAddPage || 0;
  await showSkinAddMenu(ctx, currentPage + direction);
}

async function addSkinToPlayer(ctx, skinId) {
  const adminId = String(ctx.from.id);
  const session = getSession(adminId);
  if (!session?.targetUserId) return safeAnswer(ctx, '❌ Сначала найдите игрока.');

  const player = getUserById(session.targetUserId);
  const skin = getSkinById(skinId);
  if (!skin) return safeAnswer(ctx, '❌ Скин не найден.');

  const result = giveSkinToUser(session.targetUserId, skinId);
  if (result.success) {
    await safeAnswer(ctx, `✅ Скин "${skin.name}" добавлен (SN: ${result.serial})`);
    // Возвращаемся к списку скинов игрока
    await showSkinsView(ctx, 0);
  } else if (result.alreadyOwned) {
    await safeAnswer(ctx, '⚠️ Скин уже есть у игрока');
  } else {
    await safeAnswer(ctx, `❌ ${result.message}`);
  }
}

// =====================================================
// СТАТУСЫ: УПРАВЛЕНИЕ
// =====================================================
async function showStatusesManage(ctx) {
  const adminId = String(ctx.from.id);
  const session = getSession(adminId);
  if (!session?.targetUserId) return safeAnswer(ctx, '❌ Сначала найдите игрока.');

  const player = getUserById(session.targetUserId);
  const userStatuses = await getUserStatuses(player.id);
  const allStatuses = getAllStatuses();

  let text = `🏷 <b>Статусы игрока</b> ${truncate(player.username)}\n\n`;
  text += `<b>Текущие статусы:</b>\n`;
  if (userStatuses.length === 0) text += '  Нет (Player)\n';
  else userStatuses.forEach((s, i) => { text += `  ${i + 1}. ${s}\n`; });

  const rows = [];
  rows.push([Markup.button.callback('➕ Добавить статус', 'pm_status_add_menu')]);
  // Кнопки удаления для каждого статуса
  if (userStatuses.length > 0) {
    for (const st of allStatuses) {
      if (userStatuses.includes(st.name)) {
        rows.push([Markup.button.callback(`➖ ${st.name}`, `pm_status_remove_${st.id}`)]);
      }
    }
  }
  rows.push([Markup.button.callback('⬅️ Назад', 'pm_main')]);

  await safeEditOrReply(ctx, text, Markup.inlineKeyboard(rows));
  await safeAnswer(ctx);
}

async function showStatusAddMenu(ctx) {
  const adminId = String(ctx.from.id);
  const session = getSession(adminId);
  if (!session?.targetUserId) return safeAnswer(ctx, '❌ Сначала найдите игрока.');

  const player = getUserById(session.targetUserId);
  const userStatuses = await getUserStatuses(player.id);
  const allStatuses = getAllStatuses();
  const available = allStatuses.filter(s => !userStatuses.includes(s.name));

  let text = `🏷 <b>Добавить статус</b>\n👤 Игрок: <b>${truncate(player.username)}</b>\n\nВыберите статус:\n`;

  const rows = [];
  if (available.length === 0) {
    text += 'Все статусы уже выданы.\n';
  } else {
    for (const st of available) {
      rows.push([Markup.button.callback(`${st.name} (приор. ${st.priority})`, `pm_status_add_${st.id}`)]);
    }
  }
  rows.push([Markup.button.callback('⬅️ К статусам', 'pm_statuses')]);

  await safeEditOrReply(ctx, text, Markup.inlineKeyboard(rows));
  await safeAnswer(ctx);
}

async function addStatusToPlayer(ctx, statusId) {
  const adminId = String(ctx.from.id);
  const session = getSession(adminId);
  if (!session?.targetUserId) return safeAnswer(ctx, '❌ Сначала найдите игрока.');

  const result = updateUserStatus(session.targetUserId, statusId);
  if (result.success) {
    await safeAnswer(ctx, '✅ Статус добавлен');
  } else {
    await safeAnswer(ctx, result.message || '❌ Ошибка');
  }
  await showStatusesManage(ctx);
}

async function removeStatusFromPlayer(ctx, statusId) {
  const adminId = String(ctx.from.id);
  const session = getSession(adminId);
  if (!session?.targetUserId) return safeAnswer(ctx, '❌ Сначала найдите игрока.');

  const result = removeUserStatus(session.targetUserId, statusId);
  if (result.success) {
    await safeAnswer(ctx, '✅ Статус удалён');
  } else {
    await safeAnswer(ctx, result.message || '❌ Ошибка');
  }
  await showStatusesManage(ctx);
}

// =====================================================
// ПРЕФИКСЫ: УПРАВЛЕНИЕ
// =====================================================
async function showPrefixesManage(ctx) {
  const adminId = String(ctx.from.id);
  const session = getSession(adminId);
  if (!session?.targetUserId) return safeAnswer(ctx, '❌ Сначала найдите игрока.');

  const player = getUserById(session.targetUserId);
  const data = getUserPrefixesDetailedPm(player.id);

  let text = `🔤 <b>Префиксы игрока</b> ${truncate(player.username)}\n\n`;
  text += `<b>Обычные:</b>\n`;
  if (data.regular.length === 0) text += '  Нет\n';
  else data.regular.forEach((p, i) => { text += `  ${i + 1}. ${p.name}\n`; });

  text += `\n<b>Специальные:</b>\n`;
  if (data.special.length === 0) text += '  Нет\n';
  else data.special.forEach((p, i) => { text += `  ${i + 1}. ${p.name}\n`; });

  const rows = [];
  rows.push([Markup.button.callback('➕ Добавить обычный префикс', 'pm_prefix_add_menu')]);
  // Кнопки удаления обычных префиксов
  for (const p of data.regular) {
    rows.push([Markup.button.callback(`➖ ${truncate(p.name, 28)}`, `pm_prefix_remove_${p.id}`)]);
  }
  rows.push([Markup.button.callback('⬅️ Назад', 'pm_main')]);

  await safeEditOrReply(ctx, text, Markup.inlineKeyboard(rows));
  await safeAnswer(ctx);
}

async function showPrefixAddMenu(ctx) {
  const adminId = String(ctx.from.id);
  const session = getSession(adminId);
  if (!session?.targetUserId) return safeAnswer(ctx, '❌ Сначала найдите игрока.');

  const player = getUserById(session.targetUserId);
  const data = getUserPrefixesDetailedPm(player.id);
  const ownedIds = new Set(data.regular.map(p => p.id));
  const allPrefixes = getAllPrefixes();
  const available = allPrefixes.filter(p => !ownedIds.has(p.id));

  let text = `🔤 <b>Добавить префикс</b>\n👤 Игрок: <b>${truncate(player.username)}</b>\n\nВыберите префикс:\n`;

  const rows = [];
  if (available.length === 0) {
    text += 'Все префиксы уже выданы.\n';
  } else {
    for (const p of available) {
      rows.push([Markup.button.callback(truncate(p.prefix, 32), `pm_prefix_add_${p.id}`)]);
    }
  }
  rows.push([Markup.button.callback('⬅️ К префиксам', 'pm_prefixes')]);

  await safeEditOrReply(ctx, text, Markup.inlineKeyboard(rows));
  await safeAnswer(ctx);
}

async function addPrefixToPlayer(ctx, prefixId) {
  const adminId = String(ctx.from.id);
  const session = getSession(adminId);
  if (!session?.targetUserId) return safeAnswer(ctx, '❌ Сначала найдите игрока.');

  const result = addPrefixToUser(session.targetUserId, prefixId);
  await safeAnswer(ctx, result ? '✅ Префикс добавлен' : '❌ Ошибка');
  await showPrefixesManage(ctx);
}

async function removePrefixFromPlayer(ctx, prefixId) {
  const adminId = String(ctx.from.id);
  const session = getSession(adminId);
  if (!session?.targetUserId) return safeAnswer(ctx, '❌ Сначала найдите игрока.');

  const result = removePrefixFromUser(session.targetUserId, prefixId);
  await safeAnswer(ctx, result ? '✅ Префикс удалён' : '❌ Ошибка');
  await showPrefixesManage(ctx);
}

// =====================================================
// МОДЕРАЦИЯ: БАН/МУТ
// =====================================================
async function showModeration(ctx) {
  const adminId = String(ctx.from.id);
  const session = getSession(adminId);
  if (!session?.targetUserId) return safeAnswer(ctx, '❌ Сначала найдите игрока.');

  const player = getUserById(session.targetUserId);
  const banned = isUserBanned(player.id);

  let text = `🛡 <b>Модерация</b>\n👤 Игрок: <b>${truncate(player.username)}</b>\n\n`;

  // Бан
  if (banned) {
    const banInfo = getBlacklistEntry(player.id);
    const reason = banInfo?.reason || 'Не указана';
    let untilText = 'Навсегда';
    if (banInfo?.banned_until) {
      const now = Date.now() / 1000;
      if (banInfo.banned_until > now) {
        untilText = new Date(banInfo.banned_until * 1000).toLocaleString();
      } else {
        untilText = 'Истёк (скоро разбан)';
      }
    }
    text += `📛 <b>БАН:</b>\n`;
    text += `▫️ Причина: ${reason}\n`;
    text += `▫️ До: ${untilText}\n\n`;
  } else {
    text += `🟢 Аккаунт не забанен.\n\n`;
  }

  // Муты
  const mutes = getUserMutesPm(player.id);
  if (mutes.length > 0) {
    text += `🔇 <b>Муты (${mutes.length}):</b>\n`;
    for (const m of mutes) {
      const chatName = KNOWN_CHATS[m.chat_id] || m.chat_id;
      const until = m.muted_until === null ? 'Навсегда' : new Date(m.muted_until * 1000).toLocaleString();
      text += `▫️ Чат <code>${chatName}</code>\n   До: ${until}\n   Причина: ${m.reason || 'Не указана'}\n`;
    }
    text += '\n';
  } else {
    text += `🔊 Мутов нет.\n`;
  }

  const rows = [];
  if (banned) {
    rows.push([Markup.button.callback('✅ Разбанить', 'pm_unban')]);
  } else {
    rows.push([Markup.button.callback('📛 Забанить', 'pm_ban')]);
  }
  rows.push([
    Markup.button.callback('🔇 Замьютить', 'pm_mute'),
    Markup.button.callback('🔊 Размутить', 'pm_unmute_menu'),
  ]);
  rows.push([Markup.button.callback('⬅️ Назад', 'pm_main')]);

  await safeEditOrReply(ctx, text, Markup.inlineKeyboard(rows));
  await safeAnswer(ctx);
}

// --- БАН ---
async function startBan(ctx) {
  const adminId = String(ctx.from.id);
  const session = getSession(adminId);
  if (!session?.targetUserId) return safeAnswer(ctx, '❌ Сначала найдите игрока.');

  session.state = PM_STATE.WAITING_BAN_DURATION;
  session.banData = {};
  setSession(adminId, session);

  await safeEditOrReply(
    ctx,
    `📛 <b>Бан игрока</b>\n\n` +
    `Введите время бана в часах, или «навсегда», или «Отмена».\n` +
    `Примеры: <code>24</code>, <code>навсегда</code>`,
    Markup.inlineKeyboard([[Markup.button.callback('❌ Отмена', 'pm_cancel')]])
  );
  await safeAnswer(ctx);
}

async function doUnban(ctx) {
  const adminId = String(ctx.from.id);
  const session = getSession(adminId);
  if (!session?.targetUserId) return safeAnswer(ctx, '❌ Сначала найдите игрока.');

  const player = getUserById(session.targetUserId);
  removeFromBlacklist(session.targetUserId);

  try {
    await ctx.telegram.sendMessage(session.targetUserId,
      `✅ <b>Вы были разблокированы администратором.</b>`,
      { parse_mode: 'HTML' }
    );
  } catch (e) { /* ignore */ }

  await safeEditOrReply(
    ctx,
    `✅ <b>Игрок разбанен!</b>\n\n👤 Игрок: <b>${truncate(player?.username)}</b> (ID: <code>${player?.numeric_id}</code>)`,
    Markup.inlineKeyboard([
      [Markup.button.callback('🛡 Модерация', 'pm_mod')],
      [Markup.button.callback('⬅️ Главное меню', 'pm_main')],
    ])
  );
  await safeAnswer(ctx);
}

// --- МУТ ---
async function startMute(ctx) {
  const adminId = String(ctx.from.id);
  const session = getSession(adminId);
  if (!session?.targetUserId) return safeAnswer(ctx, '❌ Сначала найдите игрока.');

  session.state = PM_STATE.WAITING_MUTE_CHAT;
  session.muteData = {};
  setSession(adminId, session);

  const chatList = Object.entries(KNOWN_CHATS).map(([id, name]) => `${name}: <code>${id}</code>`).join('\n');

  await safeEditOrReply(
    ctx,
    `🔇 <b>Мут игрока</b>\n\n` +
    `Известные чаты:\n${chatList}\n\n` +
    `Введите ID чата (начинается с <code>-</code>) или название чата, или «Отмена».`,
    Markup.inlineKeyboard([[Markup.button.callback('❌ Отмена', 'pm_cancel')]])
  );
  await safeAnswer(ctx);
}

async function showUnmuteMenu(ctx) {
  const adminId = String(ctx.from.id);
  const session = getSession(adminId);
  if (!session?.targetUserId) return safeAnswer(ctx, '❌ Сначала найдите игрока.');

  const player = getUserById(session.targetUserId);
  const mutes = getUserMutesPm(player.id);

  if (mutes.length === 0) {
    await safeEditOrReply(
      ctx,
      `🔊 У игрока ${truncate(player.username)} нет активных мутов.`,
      Markup.inlineKeyboard([
        [Markup.button.callback('🛡 Модерация', 'pm_mod')],
        [Markup.button.callback('⬅️ Главное меню', 'pm_main')],
      ])
    );
    await safeAnswer(ctx);
    return;
  }

  let text = `🔊 <b>Размутить игрока</b> ${truncate(player.username)}\n\nВыберите чат:\n`;
  const rows = [];
  for (const m of mutes) {
    const chatName = KNOWN_CHATS[m.chat_id] || m.chat_id;
    rows.push([Markup.button.callback(`🔊 ${chatName}`, `pm_unmute_${m.chat_id}`)]);
  }
  rows.push([Markup.button.callback('⬅️ Модерация', 'pm_mod')]);

  await safeEditOrReply(ctx, text, Markup.inlineKeyboard(rows));
  await safeAnswer(ctx);
}

async function doUnmute(ctx, chatId) {
  const adminId = String(ctx.from.id);
  const session = getSession(adminId);
  if (!session?.targetUserId) return safeAnswer(ctx, '❌ Сначала найдите игрока.');

  const player = getUserById(session.targetUserId);
  removeMute(session.targetUserId, chatId);

  // Восстанавливаем права
  try {
    const permissions = {
      can_send_messages: true,
      can_send_media_messages: true,
      can_send_polls: true,
      can_send_other_messages: true,
      can_add_web_page_previews: true,
      can_change_info: true,
      can_invite_users: true,
      can_pin_messages: true,
    };
    await ctx.telegram.restrictChatMember(chatId, session.targetUserId, permissions);
  } catch (e) {
    console.error('[PM] Не удалось восстановить права в чате:', e.message);
  }

  try {
    const chatName = KNOWN_CHATS[chatId] || chatId;
    await ctx.telegram.sendMessage(session.targetUserId,
      `✅ Вы были размьючены администратором.\n📍 Чат: ${chatName}`,
      { parse_mode: 'HTML' }
    );
  } catch (e) { /* ignore */ }

  await safeEditOrReply(
    ctx,
    `✅ <b>Мут снят!</b>\n\n👤 Игрок: <b>${truncate(player?.username)}</b>\n📍 Чат: <code>${KNOWN_CHATS[chatId] || chatId}</code>`,
    Markup.inlineKeyboard([
      [Markup.button.callback('🛡 Модерация', 'pm_mod')],
      [Markup.button.callback('⬅️ Главное меню', 'pm_main')],
    ])
  );
  await safeAnswer(ctx);
}

// =====================================================
// ОБНУЛЕНИЕ АККАУНТА
// =====================================================
async function showResetConfirm(ctx) {
  const adminId = String(ctx.from.id);
  const session = getSession(adminId);
  if (!session?.targetUserId) return safeAnswer(ctx, '❌ Сначала найдите игрока.');

  const player = getUserById(session.targetUserId);
  if (!player) return safeAnswer(ctx, '❌ Игрок не найден.');

  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('✅ Подтвердить обнуление', 'pm_reset_confirm')],
    [Markup.button.callback('❌ Отмена', 'pm_main')],
  ]);

  await safeEditOrReply(
    ctx,
    `⚠️ <b>Обнуление аккаунта</b>\n\n` +
    `👤 Игрок: <b>${truncate(player.username)}</b>\n` +
    `🆔 Numeric ID: <code>${player.numeric_id}</code>\n` +
    `🆔 Telegram ID: <code>${player.id}</code>\n\n` +
    `Будут сброшены: балансы, контейнеры, статусы, скины, префиксы, оружие, статистика.\n` +
    `Сохранятся: Numeric ID, факт регистрации.\n\n` +
    `<b>Подтвердите действие:</b>`,
    keyboard
  );
  await safeAnswer(ctx);
}

async function doReset(ctx) {
  const adminId = String(ctx.from.id);
  const session = getSession(adminId);
  if (!session?.targetUserId) return safeAnswer(ctx, '❌ Сначала найдите игрока.');

  const player = getUserById(session.targetUserId);
  if (!player) return safeAnswer(ctx, '❌ Игрок не найден.');

  const result = resetAccount(player.id);
  if (result.success) {
    await safeEditOrReply(
      ctx,
      `✅ <b>Аккаунт обнулён!</b>\n\n` +
      `👤 Игрок: <b>${truncate(player.username)}</b>\n` +
      `🆔 Numeric ID: <code>${player.numeric_id}</code>\n` +
      `🆔 Telegram ID: <code>${player.id}</code>\n\n` +
      `Все данные сброшены. Игрок может заново пройти регистрацию.`,
      Markup.inlineKeyboard([
        [Markup.button.callback('🏠 Главное меню', 'pm_main')],
        [Markup.button.callback('⬅️ В техпанель', 'tech_admin_panel')],
      ])
    );
  } else {
    await ctx.reply(`❌ Ошибка обнуления: ${result.message}`);
  }
  await safeAnswer(ctx);
}

// =====================================================
// УДАЛЕНИЕ АККАУНТА
// =====================================================
async function showDeleteConfirm(ctx) {
  const adminId = String(ctx.from.id);
  const session = getSession(adminId);
  if (!session?.targetUserId) return safeAnswer(ctx, '❌ Сначала найдите игрока.');

  const player = getUserById(session.targetUserId);
  if (!player) return safeAnswer(ctx, '❌ Игрок не найден.');

  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('🗑 ПОДТВЕРДИТЬ УДАЛЕНИЕ', 'pm_delete_confirm')],
    [Markup.button.callback('❌ Отмена', 'pm_main')],
  ]);

  await safeEditOrReply(
    ctx,
    `🚨 <b>УДАЛЕНИЕ АККАУНТА</b>\n\n` +
    `👤 Игрок: <b>${truncate(player.username)}</b>\n` +
    `🆔 Numeric ID: <code>${player.numeric_id}</code>\n` +
    `🆔 Telegram ID: <code>${player.id}</code>\n\n` +
    `⚠️ Будут удалены ВСЕ данные из ВСЕХ таблиц:\n` +
    `профиль, балансы, скины, промо-активации, ставки, муты, оружие и т.д.\n\n` +
    `<b>Это действие необратимо!</b>\n\n` +
    `Нажмите «ПОДТВЕРДИТЬ УДАЛЕНИЕ» для продолжения.`,
    keyboard
  );
  await safeAnswer(ctx);
}

async function doDelete(ctx) {
  const adminId = String(ctx.from.id);
  const session = getSession(adminId);
  if (!session?.targetUserId) return safeAnswer(ctx, '❌ Сначала найдите игрока.');

  const player = getUserById(session.targetUserId);
  if (!player) return safeAnswer(ctx, '❌ Игрок не найден.');

  const result = deleteUserAccount(player.id);
  if (result.success) {
    clearSession(adminId);
    await safeEditOrReply(
      ctx,
      `✅ <b>Аккаунт удалён!</b>\n\n` +
      `👤 Бывший игрок: <b>${truncate(player.username)}</b>\n` +
      `🆔 Numeric ID: <code>${player.numeric_id}</code>\n` +
      `🆔 Telegram ID: <code>${player.id}</code>\n\n` +
      `Все данные удалены из всех таблиц.`,
      Markup.inlineKeyboard([
        [Markup.button.callback('⬅️ В техпанель', 'tech_admin_panel')],
      ])
    );
  } else {
    await ctx.reply(`❌ Ошибка удаления: ${result.message}`);
  }
  await safeAnswer(ctx);
}

// =====================================================
// РОУТЕР CALLBACK'ОВ
// =====================================================
async function handlePlayerManagementCallback(ctx) {
  const data = ctx.callbackQuery?.data;
  if (!data) return false;
  if (!data.startsWith('pm_')) return false;

  // Noop
  if (data === 'pm_noop') {
    await safeAnswer(ctx);
    return true;
  }

  // Отмена
  if (data === 'pm_cancel') {
    const adminId = String(ctx.from.id);
    const session = getSession(adminId);
    if (session) {
      session.state = PM_STATE.IDLE;
      session.editField = null;
      session.editCategory = null;
      session.banData = null;
      session.muteData = null;
      setSession(adminId, session);
    }
    await safeEditOrReply(
      ctx,
      '❌ Операция отменена.',
      Markup.inlineKeyboard([[Markup.button.callback('⬅️ В техпанель', 'tech_admin_panel')]])
    );
    await safeAnswer(ctx);
    return true;
  }

  // Отмена редактирования
  if (data === 'pm_cancel_edit') {
    const adminId = String(ctx.from.id);
    const session = getSession(adminId);
    if (session) {
      session.state = PM_STATE.IDLE;
      session.editField = null;
      session.editCategory = null;
      setSession(adminId, session);
    }
    await showEditCategories(ctx);
    return true;
  }

  // Главное меню
  if (data === 'pm_main') {
    const adminId = String(ctx.from.id);
    const session = getSession(adminId);
    if (!session?.targetUserId) {
      await startPlayerSearch(ctx);
    } else {
      await showMainMenu(ctx, session.targetUserId);
    }
    return true;
  }

  // Просмотр
  if (data === 'pm_view') {
    await showViewCategories(ctx);
    return true;
  }
  if (data.startsWith('pm_view_cat_')) {
    const catKey = data.replace('pm_view_cat_', '');
    await showViewCategory(ctx, catKey);
    return true;
  }

  // Редактирование
  if (data === 'pm_edit') {
    await showEditCategories(ctx);
    return true;
  }
  if (data.startsWith('pm_edit_cat_')) {
    const catKey = data.replace('pm_edit_cat_', '');
    await showEditCategory(ctx, catKey);
    return true;
  }
  if (data.startsWith('pm_editfield_')) {
    const parts = data.replace('pm_editfield_', '').split('_');
    const catKey = parts[0];
    const fieldKey = parts.slice(1).join('_');
    await startFieldEdit(ctx, catKey, fieldKey);
    return true;
  }
  if (data.startsWith('pm_toggle_')) {
    const parts = data.replace('pm_toggle_', '').split('_');
    const catKey = parts[0];
    const fieldKey = parts.slice(1).join('_');
    await toggleBooleanField(ctx, catKey, fieldKey);
    return true;
  }

  // Обнуление раздела
  if (data.startsWith('pm_resetcat_confirm_')) {
    const catKey = data.replace('pm_resetcat_confirm_', '');
    await doResetCategory(ctx, catKey);
    return true;
  }
  if (data.startsWith('pm_resetcat_')) {
    const catKey = data.replace('pm_resetcat_', '');
    await confirmResetCategory(ctx, catKey);
    return true;
  }

  // Скины
  if (data === 'pm_skins') {
    await showSkinsView(ctx, 0);
    return true;
  }
  if (data === 'pm_skin_prev') {
    await skinsNavigate(ctx, -1);
    return true;
  }
  if (data === 'pm_skin_next') {
    await skinsNavigate(ctx, 1);
    return true;
  }
  if (data === 'pm_skin_setactive') {
    await setSkinActive(ctx);
    return true;
  }
  if (data === 'pm_skin_remove') {
    await removeCurrentSkin(ctx);
    return true;
  }
  if (data.startsWith('pm_skin_remove_confirm_')) {
    const skinId = parseInt(data.replace('pm_skin_remove_confirm_', ''), 10);
    await confirmRemoveSkin(ctx, skinId);
    return true;
  }
  if (data === 'pm_skin_add_menu') {
    await showSkinAddMenu(ctx, 0);
    return true;
  }
  if (data === 'pm_skin_add_prev') {
    await skinAddNavigate(ctx, -1);
    return true;
  }
  if (data === 'pm_skin_add_next') {
    await skinAddNavigate(ctx, 1);
    return true;
  }
  if (data.startsWith('pm_skin_add_')) {
    const skinId = parseInt(data.replace('pm_skin_add_', ''), 10);
    await addSkinToPlayer(ctx, skinId);
    return true;
  }

  // Статусы
  if (data === 'pm_statuses') {
    await showStatusesManage(ctx);
    return true;
  }
  if (data === 'pm_status_add_menu') {
    await showStatusAddMenu(ctx);
    return true;
  }
  if (data.startsWith('pm_status_add_')) {
    const statusId = parseInt(data.replace('pm_status_add_', ''), 10);
    await addStatusToPlayer(ctx, statusId);
    return true;
  }
  if (data.startsWith('pm_status_remove_')) {
    const statusId = parseInt(data.replace('pm_status_remove_', ''), 10);
    await removeStatusFromPlayer(ctx, statusId);
    return true;
  }

  // Префиксы
  if (data === 'pm_prefixes') {
    await showPrefixesManage(ctx);
    return true;
  }
  if (data === 'pm_prefix_add_menu') {
    await showPrefixAddMenu(ctx);
    return true;
  }
  if (data.startsWith('pm_prefix_add_')) {
    const prefixId = parseInt(data.replace('pm_prefix_add_', ''), 10);
    await addPrefixToPlayer(ctx, prefixId);
    return true;
  }
  if (data.startsWith('pm_prefix_remove_')) {
    const prefixId = parseInt(data.replace('pm_prefix_remove_', ''), 10);
    await removePrefixFromPlayer(ctx, prefixId);
    return true;
  }

  // Модерация
  if (data === 'pm_mod') {
    await showModeration(ctx);
    return true;
  }
  if (data === 'pm_ban') {
    await startBan(ctx);
    return true;
  }
  if (data === 'pm_unban') {
    await doUnban(ctx);
    return true;
  }
  if (data === 'pm_mute') {
    await startMute(ctx);
    return true;
  }
  if (data === 'pm_unmute_menu') {
    await showUnmuteMenu(ctx);
    return true;
  }
  if (data.startsWith('pm_unmute_')) {
    const chatId = data.replace('pm_unmute_', '');
    await doUnmute(ctx, chatId);
    return true;
  }

  // Обнуление аккаунта
  if (data === 'pm_reset') {
    await showResetConfirm(ctx);
    return true;
  }
  if (data === 'pm_reset_confirm') {
    await doReset(ctx);
    return true;
  }

  // Удаление аккаунта
  if (data === 'pm_delete') {
    await showDeleteConfirm(ctx);
    return true;
  }
  if (data === 'pm_delete_confirm') {
    await doDelete(ctx);
    return true;
  }

  return false;
}

module.exports = {
  startPlayerSearch,
  handlePlayerManagementMessage,
  handlePlayerManagementCallback,
};