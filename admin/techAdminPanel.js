// admin/techAdminPanel.js
const { Markup } = require('telegraf');
const CONFIG = require('../config');
const { calculateLoadDetails, getHealthStatus } = require('../botMonitoring');

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
// СЕССИИ РЕДАКТИРОВАНИЯ НАСТРОЕК
// =====================================================
const techSessions = new Map();

// =====================================================
// ПОЛЯ ИЗ config.js, КОТОРЫЕ МОЖНО МЕНЯТЬ ЧЕРЕЗ ПАНЕЛЬ
// =====================================================
const TECH_CONFIG_FIELDS = {
  REFERRAL_BONUS_NEW_USER_PF: {
    label: 'Бонус новому игроку (PF)',
  },
  REFERRAL_BONUS_NEW_USER_TICKETS: {
    label: 'Билетики новому игроку',
  },
  REFERRAL_BONUS_REFERRER_PF: {
    label: 'Бонус рефереру (PF)',
  },
  REFERRAL_BONUS_REFERRER_TICKETS: {
    label: 'Билетики рефереру',
  },
  REFERRAL_DONATION_PERCENT_DF: {
    label: 'Процент DF с донатов реферала',
  },
  REGISTRATION_CANDY_AMOUNT: {
    label: 'Конфеты при регистрации реферала',
  },
  REFERRER_BANK_LIMIT: {
    label: 'Лимит банка реферера (PF)',
  },
};

// =====================================================
// КЛАВИАТУРЫ
// =====================================================
function getTechAdminKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('💰 Реф бонусы', 'tech_ref_menu')],
    [Markup.button.callback('📢 Пост в канал', 'tech_post_menu')],
    [Markup.button.callback('📊 Нагрузка сервера', 'tech_server_load')],
    [Markup.button.callback('⬅️ Назад', 'back_to_admin_panel')],
  ]);
}

function getRefBonusKeyboard() {
  const rows = Object.entries(TECH_CONFIG_FIELDS).map(([fieldKey, field]) => [
    Markup.button.callback(
      `${field.label}: ${CONFIG[fieldKey]}`,
      `tech_ref_edit_${fieldKey}`
    ),
  ]);

  rows.push([Markup.button.callback('⬅️ Назад', 'tech_admin_panel')]);

  return Markup.inlineKeyboard(rows);
}

// =====================================================
// ПОКАЗ ПАНЕЛИ
// =====================================================
async function showTechAdminPanel(ctx) {
  if (!isTechSuperAdmin(ctx.from.id)) {
    if (ctx.callbackQuery) {
      return ctx.answerCbQuery('❌ Нет доступа.', true);
    }
    return ctx.reply('❌ Нет доступа.');
  }

  const text =
    '🛠 <b>Тех админ панель</b>\n\n' +
    'Выберите раздел:';

  const keyboard = getTechAdminKeyboard();

  try {
    await ctx.editMessageText(text, {
      parse_mode: 'HTML',
      ...keyboard,
    });
  } catch (error) {
    await ctx.reply(text, {
      parse_mode: 'HTML',
      ...keyboard,
    });
  }

  if (ctx.callbackQuery) {
    await ctx.answerCbQuery();
  }

  return true;
}

// =====================================================
// МЕНЮ РЕФ БОНУСОВ
// =====================================================
async function showRefBonusMenu(ctx) {
  if (!isTechSuperAdmin(ctx.from.id)) {
    if (ctx.callbackQuery) {
      return ctx.answerCbQuery('❌ Нет доступа.', true);
    }
    return ctx.reply('❌ Нет доступа.');
  }

  const text =
    '💰 <b>Настройка реф бонусов</b>\n\n' +
    'Нажмите на пункт, чтобы изменить значение.\n\n' +
    '⚠️ <b>ВНИМАНИЕ:</b> Изменения действуют только в памяти запущенного бота.\n' +
    'При перезапуске все значения сбросятся на дефолтные из <code>config.js</code>.\n' +
    'Для постоянного сохранения нужно добавить хранилище настроек (БД или файл).';

  const keyboard = getRefBonusKeyboard();

  try {
    await ctx.editMessageText(text, {
      parse_mode: 'HTML',
      ...keyboard,
    });
  } catch (error) {
    await ctx.reply(text, {
      parse_mode: 'HTML',
      ...keyboard,
    });
  }

  if (ctx.callbackQuery) {
    await ctx.answerCbQuery();
  }

  return true;
}

// =====================================================
// МЕНЮ НАГРУЗКИ СЕРВЕРА (ПЕРЕНЕСЕНО СЮДА)
// =====================================================
async function showServerLoad(ctx) {
  if (!isTechSuperAdmin(ctx.from.id)) {
    if (ctx.callbackQuery) {
      return ctx.answerCbQuery('❌ Нет доступа.', true);
    }
    return ctx.reply('❌ Нет доступа.');
  }

  try {
    const load = calculateLoadDetails();
    const health = getHealthStatus();
    const emoji = health.level === 'ok' ? '🟢' : health.level === 'warning' ? '🟡' : '🔴';

    const text = `
💻 <b>Нагрузка сервера</b>

${emoji} Состояние: ${health.reason}
⚡ CPU: ${load.cpu.toFixed(1)}%
🧠 Heap: ${load.heap.toFixed(1)}% (${load.rssMB} MB RSS)
🔄 Event loop lag: ${load.eventLoopLagMs} ms (пик ${load.maxEventLoopLagMs} ms)
📨 RPS: ${load.rps} / RPM: ${load.rpm} (пик ${load.peakRPS})
`.trim();

    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('🔄 Обновить', 'tech_server_load')],
      [Markup.button.callback('⬅️ Назад', 'tech_admin_panel')],
    ]);

    try {
      await ctx.editMessageText(text, {
        parse_mode: 'HTML',
        ...keyboard,
      });
    } catch (error) {
      await ctx.reply(text, {
        parse_mode: 'HTML',
        ...keyboard,
      });
    }
  } catch (error) {
    console.error('[TechAdmin] Ошибка при получении нагрузки:', error);
    await ctx.reply('❌ Ошибка при получении данных о нагрузке.');
  }

  if (ctx.callbackQuery) {
    await ctx.answerCbQuery();
  }

  return true;
}

// =====================================================
// СТАРТ РЕДАКТИРОВАНИЯ ПОЛЯ
// =====================================================
async function startEditTechConfigField(ctx, fieldKey) {
  if (!isTechSuperAdmin(ctx.from.id)) {
    return ctx.answerCbQuery('❌ Нет доступа.', true);
  }

  const field = TECH_CONFIG_FIELDS[fieldKey];

  if (!field || !(fieldKey in CONFIG)) {
    return ctx.answerCbQuery('❌ Поле не найдено.', true);
  }

  const userId = String(ctx.from.id);

  techSessions.set(userId, {
    fieldKey,
    step: 'value',
  });

  await ctx.editMessageText(
    `✏️ Поле: <b>${field.label}</b>\n\n` +
      `Текущее значение: <code>${CONFIG[fieldKey]}</code>\n\n` +
      'Отправьте новое значение числом.\n' +
      'Для отмены отправьте: <code>отмена</code>\n\n' +
      '⚠️ Напоминание: изменение не сохранится после перезапуска.',
    {
      parse_mode: 'HTML',
    }
  );

  return ctx.answerCbQuery();
}

// =====================================================
// ПРИЁМ ТЕКСТА ДЛЯ РЕДАКТИРОВАНИЯ НАСТРОЕК
// =====================================================
async function handleTechAdminMessage(ctx) {
  const userId = String(ctx.from.id);
  const session = techSessions.get(userId);

  if (!session || session.step !== 'value') {
    return false;
  }

  if (!isTechSuperAdmin(ctx.from.id)) {
    techSessions.delete(userId);
    return false;
  }

  const text = ctx.message?.text?.trim();

  if (!text) {
    return false;
  }

  if (text.toLowerCase() === 'отмена') {
    techSessions.delete(userId);
    await ctx.reply('❌ Редактирование отменено.', getRefBonusKeyboard());
    return true;
  }

  const value = Number(text);

  if (!Number.isFinite(value) || value < 0) {
    await ctx.reply('❌ Введите неотрицательное число.');
    return true;
  }

  const fieldKey = session.fieldKey;
  const field = TECH_CONFIG_FIELDS[fieldKey];

  CONFIG[fieldKey] = Math.floor(value);

  techSessions.delete(userId);

  await ctx.reply(
    `✅ Значение обновлено (в памяти).\n\n` +
      `${field.label}: <b>${CONFIG[fieldKey]}</b>\n\n` +
      '⚠️ Изменение действует до перезапуска бота.',
    {
      parse_mode: 'HTML',
      ...getRefBonusKeyboard(),
    }
  );

  return true;
}

// =====================================================
// ОБРАБОТЧИК КНОПОК ТЕХАДМИНКИ
// =====================================================
async function handleTechAdminCallback(ctx) {
  if (!isTechSuperAdmin(ctx.from.id)) {
    return ctx.answerCbQuery('❌ Нет доступа.', true);
  }

  const data = ctx.callbackQuery?.data;

  if (!data) {
    return ctx.answerCbQuery();
  }

  if (data === 'tech_admin_panel') {
    return showTechAdminPanel(ctx);
  }

  if (data === 'tech_ref_menu') {
    return showRefBonusMenu(ctx);
  }

  if (data === 'tech_server_load') {
    return showServerLoad(ctx);
  }

  if (data.startsWith('tech_ref_edit_')) {
    const fieldKey = data.replace('tech_ref_edit_', '');
    return startEditTechConfigField(ctx, fieldKey);
  }

  return ctx.answerCbQuery();
}

module.exports = {
  isTechSuperAdmin,
  showTechAdminPanel,
  handleTechAdminCallback,
  handleTechAdminMessage,
};