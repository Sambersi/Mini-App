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
  cleanupExpiredPromos 
} = require('../db');
const { generatePromoImage } = require('./generatePromoImage');
const { createUserLink } = require('../bank/bankTransfers');

// --- КОНФИГУРАЦИЯ И СПРАВОЧНИКИ ---

const prizeTypeMapping = {
  'container_type_3': 'GOLD-контейнер',
  'balance': 'PF',
  'df_balance': 'DF',
  'npf_shares': 'NPF-акция',
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

// Хранилище сессий
const promoSessions = new Map();

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
    .replace(/'/g, '&#39;');
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

const prizeTypeKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback('📦 GOLD-контейнер', 'promo_prize_container_type_3')],
  [Markup.button.callback('💰 PF', 'promo_prize_balance'), Markup.button.callback('💎 DF', 'promo_prize_df_balance')],
  [Markup.button.callback('📈 NPF-акция', 'promo_prize_npf_shares')],
  [Markup.button.callback('🔙 Отмена', 'promo_cancel_create')]
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

const limitTypeKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback('🔢 По количеству', 'promo_limit_type_count'), Markup.button.callback('⏳ По времени', 'promo_limit_type_time')],
  [Markup.button.callback('🔙 Отмена', 'promo_cancel_create')]
]);

const activationsQuickKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback('5', 'promo_quick_act_5'), Markup.button.callback('10', 'promo_quick_act_10'), Markup.button.callback('15', 'promo_quick_act_15')],
  [Markup.button.callback('❌ Отмена', 'promo_cancel_create')]
]);

const timeQuickKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback('10 мин', 'promo_quick_time_10'), Markup.button.callback('25 мин', 'promo_quick_time_25'), Markup.button.callback('45 мин', 'promo_quick_time_45')],
  [Markup.button.callback('❌ Отмена', 'promo_cancel_create')]
]);

const prizeAmountQuickKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback('10k', 'promo_quick_sum_10000'), Markup.button.callback('25k', 'promo_quick_sum_25000'), Markup.button.callback('100k', 'promo_quick_sum_100000')],
  [Markup.button.callback('❌ Отмена', 'promo_cancel_create')]
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
  [Markup.button.callback('🖼 Сменить шаблон изображения', 'promo_toggle_image_template')],
  [Markup.button.callback('⬅️ Назад к проверке', 'promo_back_to_check')]
]);

const cancelEditKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback('❌ Отмена редактирования', 'promo_back_to_check')]
]);

// --- ОСНОВНАЯ ЛОГИКА ПОШАГОВОГО ВВОДА ---

async function startPromoCreationSession(ctx) {
  if (!(await isAdmin(ctx))) {
    return ctx.reply('❌ У вас нет прав для создания промокодов.');
  }

  const userId = ctx.from.id.toString();
  
  promoSessions.set(userId, {
    step: 0, 
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

  await ctx.reply('🚀 <b>Создание нового промокода</b>\n\nШаг 1/6: Введите <b>название</b> промокода:', {
    parse_mode: 'HTML',
    reply_markup: cancelKeyboard.reply_markup
  });
}

async function handlePromoCreationMessage(ctx) {
  const userId = ctx.from.id.toString();
  const session = promoSessions.get(userId);

  if (!session || !session.active || session.waitingForEdit) return false;

  const text = ctx.message?.text?.trim();
  if (!text) return false;

  try {
    if (session.step === 0) {
      session.data.name = text;
      session.step = 1;
      await ctx.reply(`✅ Название <b>${escapeHtml(text)}</b> принято.\n\nШаг 2/6: Выберите тип ограничения:`, {
        parse_mode: 'HTML',
        reply_markup: limitTypeKeyboard.reply_markup
      });
    }
    else if (session.step === 2 && session.data.isTimeBased) {
      const val = parseInt(text, 10);
      if (isNaN(val) || val <= 0) {
        return ctx.reply('❌ Некорректное число. Введите время в минутах (> 0):', { reply_markup: timeQuickKeyboard.reply_markup });
      }
      session.data.durationMinutes = val;
      session.step = 3;
      await ctx.reply(`✅ Время действия: <b>${formatDuration(val)}</b>.\n\nШаг 4/6: Выберите <b>тип приза</b>:`, {
        parse_mode: 'HTML',
        reply_markup: prizeTypeKeyboard.reply_markup
      });
    }
    else if (session.step === 3 && !session.data.isTimeBased) {
      const val = parseInt(text, 10);
      if (isNaN(val) || val <= 0) {
        return ctx.reply('❌ Некорректное число. Введите количество активаций (> 0):', { reply_markup: activationsQuickKeyboard.reply_markup });
      }
      session.data.activations = val;
      session.step = 4;
       await ctx.reply(`✅ Активаций: <b>${formatNumber(val)}</b>.\n\nШаг 4/6: Выберите <b>тип приза</b>:`, {
        parse_mode: 'HTML',
        reply_markup: prizeTypeKeyboard.reply_markup
      });
    }
    else if (session.step === 4) {
      const val = parseFloat(text.replace(',', '.'));
      if (isNaN(val) || val <= 0) {
        return ctx.reply('❌ Некорректная сумма. Введите число или выберите вариант ниже:', { reply_markup: prizeAmountQuickKeyboard.reply_markup });
      }
      session.data.prize_amount = val;
      session.step = 5;
      await ctx.reply(`✅ Сумма приза: <b>${formatNumber(val)}</b> ${prizeTypeMapping[session.data.prize_type]}.\n\nШаг 5/6: Выберите <b>минимальный статус</b>:`, {
        parse_mode: 'HTML',
        reply_markup: statusKeyboard.reply_markup
      });
    }
    else if (session.step === 6 && session.editField) {
      if (session.editField === 'name') {
        session.data.name = text;
      } else if (session.editField === 'activations' && !session.data.isTimeBased) {
        const val = parseInt(text, 10);
        if (isNaN(val) || val <= 0) return ctx.reply('❌ Ошибка ввода.', { reply_markup: cancelEditKeyboard.reply_markup });
        session.data.activations = val;
      } else if (session.editField === 'durationMinutes' && session.data.isTimeBased) {
        const val = parseInt(text, 10);
        if (isNaN(val) || val <= 0) return ctx.reply('❌ Ошибка ввода.', { reply_markup: cancelEditKeyboard.reply_markup });
        session.data.durationMinutes = val;
      } else if (session.editField === 'prize_amount') {
        const val = parseFloat(text.replace(',', '.'));
        if (isNaN(val) || val <= 0) return ctx.reply('❌ Ошибка ввода.', { reply_markup: cancelEditKeyboard.reply_markup });
        session.data.prize_amount = val;
      }
      
      session.editField = null;
      session.step = 6;
      await showSummary(ctx, session);
    }

    return true;
  } catch (error) {
    console.error('[PROMO CREATE ERROR]', error);
    await ctx.reply('❌ Произошла ошибка. Попробуйте заново /создать');
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

  await ctx.reply(summaryText, { 
    parse_mode: 'HTML',
    reply_markup: finalConfirmKeyboard.reply_markup 
  });
}

// --- ОБРАБОТЧИКИ CALLBACK (КНОПКИ) ---

async function handleCallback(ctx) {
  const userId = ctx.from.id.toString();
  const data = ctx.callbackQuery.data;
  const session = promoSessions.get(userId);

  if (!session && !data.startsWith('promo_prize_') && !data.startsWith('promo_status_') && !data.startsWith('promo_quick_') && !data.startsWith('promo_limit_')) {
     if(data !== 'promo_cancel_create') return ctx.answerCbQuery('❌ Сессия истекла.', { show_alert: true });
  }

  if (data === 'promo_cancel_create') {
    promoSessions.delete(userId);
    await ctx.editMessageText('❌ Создание отменено.').catch(() => {});
    await ctx.reply('Можете начать заново: /создать');
    return ctx.answerCbQuery();
  }

  if (data === 'promo_limit_type_time') {
    if (!session || session.step !== 1) return ctx.answerCbQuery('❌ Неверный этап.', { show_alert: true });
    session.data.isTimeBased = true;
    session.step = 2;
    await ctx.editMessageText(`✅ Выбрано ограничение по <b>времени</b>.\n\nШаг 3/6: Введите время в минутах:`, {
      parse_mode: 'HTML',
      reply_markup: timeQuickKeyboard.reply_markup
    });
    return ctx.answerCbQuery();
  }

  if (data === 'promo_limit_type_count') {
    if (!session || session.step !== 1) return ctx.answerCbQuery('❌ Неверный этап.', { show_alert: true });
    session.data.isTimeBased = false;
    session.step = 3;
    await ctx.editMessageText(`✅ Выбрано ограничение по <b>количеству</b>.\n\nШаг 3/6: Введите количество активаций:`, {
      parse_mode: 'HTML',
      reply_markup: activationsQuickKeyboard.reply_markup
    });
    return ctx.answerCbQuery();
  }

  if (data.startsWith('promo_quick_time_')) {
    if (!session || session.step !== 2 || !session.data.isTimeBased) return ctx.answerCbQuery('❌ Неверный этап.', { show_alert: true });
    const val = parseInt(data.replace('promo_quick_time_', ''), 10);
    session.data.durationMinutes = val;
    session.step = 4;
    
    await ctx.editMessageText(`✅ Время: <b>${formatDuration(val)}</b>.\n\nШаг 4/6: Выберите <b>тип приза</b>:`, {
      parse_mode: 'HTML',
      reply_markup: prizeTypeKeyboard.reply_markup
    });
    return ctx.answerCbQuery();
  }

  if (data.startsWith('promo_quick_act_')) {
    if (!session || session.step !== 3 || session.data.isTimeBased) return ctx.answerCbQuery('❌ Неверный этап.', { show_alert: true });
    const val = parseInt(data.replace('promo_quick_act_', ''), 10);
    session.data.activations = val;
    session.step = 4;
    
    await ctx.editMessageText(`✅ Активаций: <b>${formatNumber(val)}</b>.\n\nШаг 4/6: Выберите <b>тип приза</b>:`, {
      parse_mode: 'HTML',
      reply_markup: prizeTypeKeyboard.reply_markup
    });
    return ctx.answerCbQuery();
  }

  if (data.startsWith('promo_quick_sum_')) {
    if (!session || session.step !== 4) return ctx.answerCbQuery('❌ Неверный этап.', { show_alert: true });
    const val = parseInt(data.replace('promo_quick_sum_', ''), 10);
    session.data.prize_amount = val;
    session.step = 5;

    await ctx.editMessageText(`✅ Сумма: <b>${formatNumber(val)}</b> ${prizeTypeMapping[session.data.prize_type]}.\n\nШаг 5/6: Выберите <b>мин. статус</b>:`, {
      parse_mode: 'HTML',
      reply_markup: statusKeyboard.reply_markup
    });
    return ctx.answerCbQuery();
  }

  if (data.startsWith('promo_prize_')) {
    if (!session) return ctx.answerCbQuery('❌ Сессия истекла.', { show_alert: true });
    const typeKey = data.replace('promo_prize_', '');
    const map = {
        'container_type_3': 'container_type_3',
        'balance': 'balance',
        'df_balance': 'df_balance',
        'npf_shares': 'npf_shares'
    };
    session.data.prize_type = map[typeKey];
    session.step = 4; 
    
    await ctx.editMessageText(`✅ Тип приза: <b>${prizeTypeMapping[session.data.prize_type]}</b>.\n\nШаг 4/6: Введите <b>сумму приза</b>:`, {
      parse_mode: 'HTML',
      reply_markup: prizeAmountQuickKeyboard.reply_markup
    });
    return ctx.answerCbQuery();
  }

  if (data.startsWith('promo_status_')) {
    if (!session) return ctx.answerCbQuery('❌ Сессия истекла.', { show_alert: true });
    const statusId = parseInt(data.replace('promo_status_', ''), 10);
    session.data.min_status_id = statusId;
    session.step = 6;
    
    await showSummary(ctx, session);
    await ctx.deleteMessage().catch(() => {}); 
    return ctx.answerCbQuery();
  }

  if (data === 'promo_confirm_final') {
    if (!session) return ctx.answerCbQuery('❌ Сессия истекла.', { show_alert: true });
    await finalizePromoCreation(ctx, session);
    return;
  }

  if (data === 'promo_edit_menu') {
    if (!session) return ctx.answerCbQuery('❌ Сессия истекла.', { show_alert: true });
    session.waitingForEdit = true;
    await ctx.editMessageText('✏️ <b>Редактирование</b>\n\nВыберите поле:', {
      parse_mode: 'HTML',
      reply_markup: editMenuKeyboard.reply_markup
    });
    return ctx.answerCbQuery();
  }

  if (data === 'promo_back_to_check') {
    if (!session) return ctx.answerCbQuery('❌ Сессия истекла.', { show_alert: true });
    session.waitingForEdit = false;
    session.editField = null;
    await showSummary(ctx, session);
    return ctx.answerCbQuery();
  }

  if (data === 'promo_toggle_image_template') {
    if (!session) return ctx.answerCbQuery('❌ Сессия истекла.', { show_alert: true });
    
    if (session.forceImageTemplate === null) {
       session.forceImageTemplate = session.data.isTimeBased ? 'default_time' : 'default';
    } else if (session.forceImageTemplate === 'default' || session.forceImageTemplate === 'default_time') {
       session.forceImageTemplate = session.data.isTimeBased ? 'fat_time' : 'fat';
    } else {
       session.forceImageTemplate = null;
    }

    let msg = session.forceImageTemplate ? `Шаблон: ${session.forceImageTemplate}` : 'Шаблон: Авто';
    await ctx.answerCbQuery(msg);
    await showSummary(ctx, session);
    return;
  }

  if (data.startsWith('promo_edit_')) {
    if (!session) return ctx.answerCbQuery('❌ Сессия истекла.', { show_alert: true });
    
    const field = data.replace('promo_edit_', '');
    session.waitingForEdit = false;
    session.editField = field;
    
    let promptText = '';
    let keyboard = cancelEditKeyboard.reply_markup;

    if (field === 'name') {
        promptText = `✍️ Новое <b>название</b> (текущее: <code>${escapeHtml(session.data.name)}</code>):`;
    } else if (field === 'limit_type') {
        session.step = 1;
        session.editField = null;
        await ctx.editMessageText('✏️ Выберите новый <b>тип ограничения</b>:', {
            parse_mode: 'HTML',
            reply_markup: limitTypeKeyboard.reply_markup
        });
        return ctx.answerCbQuery();
    } else if (field === 'activations') {
        if (session.data.isTimeBased) return ctx.answerCbQuery('❌ Сначала измените тип лимита!', {show_alert: true});
        promptText = `✍️ Новое <b>кол-во</b> (текущее: ${formatNumber(session.data.activations)}):`;
        keyboard = activationsQuickKeyboard.reply_markup;
    } else if (field === 'durationMinutes') {
        if (!session.data.isTimeBased) return ctx.answerCbQuery('❌ Сначала измените тип лимита!', {show_alert: true});
        promptText = `✍️ Новое <b>время</b> (текущее: ${formatDuration(session.data.durationMinutes)}):`;
        keyboard = timeQuickKeyboard.reply_markup;
    } else if (field === 'prize_amount') {
        promptText = `✍️ Новая <b>сумма</b> (текущая: ${formatNumber(session.data.prize_amount)}):`;
        keyboard = prizeAmountQuickKeyboard.reply_markup;
    }
    
    if (field === 'prize_type' || field === 'status') {
        session.step = (field === 'prize_type') ? 4 : 5;
        session.editField = field;
        
        if (field === 'prize_type') {
            await ctx.editMessageText('✏️ Новый <b>тип приза</b>:', {
                parse_mode: 'HTML',
                reply_markup: prizeTypeKeyboard.reply_markup
            });
        } else {
            await ctx.editMessageText('✏️ Новый <b>мин. статус</b>:', {
                parse_mode: 'HTML',
                reply_markup: statusKeyboard.reply_markup
            });
        }
        return ctx.answerCbQuery();
    }

    await ctx.reply(promptText, {
      parse_mode: 'HTML',
      reply_markup: keyboard
    });
    return ctx.answerCbQuery();
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

    // ВАЖНО: Убедитесь, что функция createPromo в db.js обновлена и принимает 7-й аргумент expiresAt
    const result = await createPromo(d.name, activationsLeft, d.prize_type, d.prize_amount, adminId, d.min_status_id, expiresAt);
    
    if (!result.success) {
      promoSessions.delete(ctx.from.id.toString());
      return ctx.reply(`❌ Ошибка: ${result.message}`);
    }

    let photoPath = null;
    try {
      let templateHint = session.forceImageTemplate;
      if (!templateHint) {
         templateHint = d.isTimeBased ? 'auto_time' : 'auto';
      }
      photoPath = await generatePromoImage(d.name, d.isTimeBased ? d.durationMinutes : d.activations, d.prize_amount, d.prize_type, templateHint, d.isTimeBased, expiresAt);
    } catch (imgErr) {
      console.error('[PROMO IMG ERROR]', imgErr);
    }

    let limitStr = d.isTimeBased 
      ? `⏳ Время: ${formatDuration(d.durationMinutes)} (до ${new Date(expiresAt * 1000).toLocaleTimeString()})`
      : `🔢 Активаций: ${formatNumber(d.activations)}`;

    const successMsg = `✅ <b>Промокод создан!</b>\n\n🏷 Название: <code>${escapeHtml(d.name)}</code>\n${limitStr}\n🎁 Приз: ${formatNumber(d.prize_amount)} ${prizeTypeMapping[d.prize_type]}\n🔒 Статус: ${getStatusNameById(d.min_status_id)}`;

    if (photoPath) {
      await ctx.replyWithPhoto({ source: photoPath }, { caption: successMsg, parse_mode: 'HTML' });
    } else {
      await ctx.reply(successMsg, { parse_mode: 'HTML' });
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
      
    const entry = `• <b>ID</b>: ${p.id} | <code>${escapeHtml(p.name)}</code>\n  ${limitInfo} | 🎁 ${formatNumber(p.prize_amount)} ${prizeTypeMapping[p.prize_type]}\n\n`;
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
      return ctx.reply('❕ Промокод не найден.');
    }
    console.log(`[PROMO DEBUG] Промокод найден. ID: ${promo.id}, Activations: ${promo.activations_left}, Expires: ${promo.expires_at}`);

    // Проверка времени истечения
    if (promo.expires_at) {
      if (now > promo.expires_at) {
        console.log(`[PROMO DEBUG] Промокод истек! Сейчас: ${now}, Истекает: ${promo.expires_at}. Удаляем.`);
        await deletePromoById(promo.id);
        return ctx.reply('❕ Срок действия этого промокода истек.');
      } else {
        console.log(`[PROMO DEBUG] Время в порядке. Осталось секунд: ${promo.expires_at - now}`);
      }
    }

    // Проверка количества активаций
    if (promo.activations_left <= 0 && promo.activations_left !== -1) {
      console.log(`[PROMO DEBUG] Активации исчерпаны (${promo.activations_left}).`);
      return ctx.reply('❕ Активации исчерпаны.');
    }

    // Проверка повторной активации
    if (await hasUserActivatedPromo(promo.id, userId)) {
      console.log(`[PROMO DEBUG] Пользователь ${userId} уже активировал этот промокод.`);
      return ctx.reply('❕ Вы уже активировали этот код.');
    }

    // Проверка статуса
    if (promo.min_status_id > 0) {
      const statuses = await getUserStatuses(userId);
      const reqStatus = getStatusNameById(promo.min_status_id);
      if (!statuses.includes(reqStatus)) {
        console.log(`[PROMO DEBUG] Недостаточный статус у пользователя ${userId}. Требуется: ${reqStatus}`);
        return ctx.reply(`❕ Недостаточный статус. Требуется: ${reqStatus}.`);
      }
    }

    // Активация в БД
    console.log(`[PROMO DEBUG] Вызов activatePromo...`);
    const res = await activatePromo(promo.id, userId);
    if (!res.success) {
      console.error(`[PROMO DEBUG] Ошибка activatePromo: ${res.message}`);
      return ctx.reply(`❕ Ошибка активации: ${res.message || 'Неизвестная ошибка БД'}`);
    }
    console.log(`[PROMO DEBUG] Активация успешна. Приз: ${res.prizeAmount} ${promo.prize_type}`);

    await recordPromoActivation(promo.id, userId);
    
    // Уменьшение счетчика (если не временный)
    if (promo.activations_left !== -1) {
        const updated = await getPromoById(promo.id);
        if (updated && updated.activations_left <= 0) {
          console.log(`[PROMO DEBUG] Активации кончились, удаляем промокод.`);
          await deletePromoById(updated.id);
        }
    }

    // Бонус конфеты
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

    // ЛОГИРОВАНИЕ В ЧАТ (ИСПРАВЛЕНО)
    if (LOG_CHAT_PROMO_ID) {
      try {
        const logMsg = `🔔 <b>Активация промокода</b>\n• Игрок: ${link}\n• Код: <code>${escapeHtml(promo.name)}</code>\n• Приз: ${formatNumber(res.prizeAmount)} ${prizeTypeMapping[promo.prize_type]}`;
        await ctx.telegram.sendMessage(LOG_CHAT_PROMO_ID, logMsg, { parse_mode: 'HTML' });
        console.log(`[PROMO LOG] Лог отправлен в чат ${LOG_CHAT_PROMO_ID}`);
      } catch (logError) {
        console.error(`[PROMO LOG ERROR] Не удалось отправить лог в чат ${LOG_CHAT_PROMO_ID}:`, logError.message);
        // Не прерываем работу пользователя из-за ошибки логирования
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
};