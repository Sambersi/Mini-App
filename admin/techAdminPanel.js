// admin/techAdminPanel.js
"use strict";

const { Markup } = require('telegraf');
const { startPlayerSearch, handlePlayerManagementCallback } = require('./playerManagement');

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
// КЛАВИАТУРА ГЛАВНОЙ ПАНЕЛИ
// =====================================================
function getTechAdminKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('👤 Управление игроком', 'tech_player_mgmt')],
    [Markup.button.callback('📢 Рассылка', 'tech_broadcast')],
    [Markup.button.callback('📊 Нагрузка сервера', 'tech_server_load')],
    [Markup.button.callback('⬅️ Назад', 'back_to_admin_panel')],
  ]);
}

// =====================================================
// ПОКАЗ ПАНЕЛИ
// =====================================================
async function showTechAdminPanel(ctx) {
  if (!isTechSuperAdmin(ctx.from.id)) {
    if (ctx.callbackQuery) return ctx.answerCbQuery('❌ Нет доступа.', true);
    return ctx.reply('❌ Нет доступа.');
  }

  const ids = getTechSuperAdminIds();
  const text =
    '🛠 <b>Тех админ панель</b>\n\n' +
    `🔑 Доступ: ${ids.join(', ')}\n\n` +
    'Выберите раздел:';

  const keyboard = getTechAdminKeyboard();
  try {
    await ctx.editMessageText(text, { parse_mode: 'HTML', ...keyboard });
  } catch (e) {
    await ctx.reply(text, { parse_mode: 'HTML', ...keyboard });
  }
  if (ctx.callbackQuery) await ctx.answerCbQuery();
  return true;
}

// =====================================================
// НАГРУЗКА СЕРВЕРА
// =====================================================
async function showServerLoad(ctx) {
  if (!isTechSuperAdmin(ctx.from.id)) {
    if (ctx.callbackQuery) return ctx.answerCbQuery('❌ Нет доступа.', true);
    return ctx.reply('❌ Нет доступа.');
  }

  let text;
  try {
    const { calculateLoadDetails, getHealthStatus } = require('../botMonitoring');
    const load = calculateLoadDetails();
    const health = getHealthStatus();

    const emoji = health.level === 'ok' ? '🟢' : health.level === 'warning' ? '🟡' : '🔴';

    text =
      `💻 <b>Нагрузка сервера</b>\n\n` +
      `${emoji} Состояние: ${health.reason || 'N/A'}\n\n` +
      `⚡ CPU: <b>${(load.cpu ?? 0).toFixed(1)}%</b>\n` +
      `🧠 Heap: <b>${(load.heap ?? 0).toFixed(1)}%</b> (${load.rssMB ?? '?'} MB RSS)\n` +
      `🔄 Event loop lag: <b>${load.eventLoopLagMs ?? '?'} ms</b> (пик ${load.maxEventLoopLagMs ?? '?'} ms)\n` +
      `📨 RPS: <b>${load.rps ?? 0}</b> / RPM: <b>${load.rpm ?? 0}</b> (пик ${load.peakRPS ?? 0})`;
  } catch (error) {
    console.error('[TechAdmin] Ошибка при получении нагрузки:', error);
    text =
      `💻 <b>Нагрузка сервера</b>\n\n` +
      `⚠️ Не удалось получить данные.\n` +
      `Ошибка: <code>${error.message}</code>\n\n` +
      `Убедитесь, что модуль <code>botMonitoring.js</code> экспортирует функции:\n` +
      `• calculateLoadDetails()\n` +
      `• getHealthStatus()`;
  }

  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('🔄 Обновить', 'tech_server_load')],
    [Markup.button.callback('⬅️ Назад', 'tech_admin_panel')],
  ]);

  try {
    await ctx.editMessageText(text, { parse_mode: 'HTML', ...keyboard });
  } catch (e) {
    try {
      await ctx.reply(text, { parse_mode: 'HTML', ...keyboard });
    } catch (e2) { /* ignore */ }
  }
  if (ctx.callbackQuery) await ctx.answerCbQuery();
  return true;
}

// =====================================================
// РАССЫЛКА (заглушка)
// =====================================================
async function showBroadcast(ctx) {
  if (!isTechSuperAdmin(ctx.from.id)) {
    if (ctx.callbackQuery) return ctx.answerCbQuery('❌ Нет доступа.', true);
    return ctx.reply('❌ Нет доступа.');
  }

  const text =
    '📢 <b>Рассылка</b>\n\n' +
    '⏳ Раздел в разработке.\n' +
    'Здесь будет функционал массовой рассылки сообщений игрокам.';

  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('⬅️ Назад', 'tech_admin_panel')],
  ]);

  try {
    await ctx.editMessageText(text, { parse_mode: 'HTML', ...keyboard });
  } catch (e) {
    await ctx.reply(text, { parse_mode: 'HTML', ...keyboard });
  }
  if (ctx.callbackQuery) await ctx.answerCbQuery();
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
  if (!data) return ctx.answerCbQuery();

  // Делегируем в playerManagement
  if (data.startsWith('pm_')) {
    return handlePlayerManagementCallback(ctx);
  }

  if (data === 'tech_admin_panel') {
    return showTechAdminPanel(ctx);
  }
  if (data === 'tech_player_mgmt') {
    return startPlayerSearch(ctx);
  }
  if (data === 'tech_broadcast') {
    return showBroadcast(ctx);
  }
  if (data === 'tech_server_load') {
    return showServerLoad(ctx);
  }

  return ctx.answerCbQuery();
}

// =====================================================
// ПРИЁМ ТЕКСТА ДЛЯ ТЕХАДМИНКИ
// =====================================================
async function handleTechAdminMessage(ctx) {
  if (!isTechSuperAdmin(ctx.from.id)) return false;

  // Делегируем в playerManagement
  const { handlePlayerManagementMessage } = require('./playerManagement');
  const handled = await handlePlayerManagementMessage(ctx);
  if (handled) return true;

  return false;
}

module.exports = {
  isTechSuperAdmin,
  showTechAdminPanel,
  handleTechAdminCallback,
  handleTechAdminMessage,
};