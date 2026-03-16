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

const activationsQuickKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback('5', 'promo_quick_act_5'), Markup.button.callback('10', 'promo_quick_act_10'), Markup.button.callback('15', 'promo_quick_act_15')],
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

// Добавлена кнопка смены шаблона
const editMenuKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback('Изменить название', 'promo_edit_name')],
  [Markup.button.callback('Изменить кол-во активаций', 'promo_edit_activations')],
  [Markup.button.callback('Изменить тип приза', 'promo_edit_prize_type')],
  [Markup.button.callback('Изменить сумму приза', 'promo_edit_prize_amount')],
  [Markup.button.callback('Изменить мин. статус', 'promo_edit_status')],
  [Markup.button.callback('🖼 Сменить шаблон изображения', 'promo_toggle_image_template')], // НОВАЯ КНОПКА
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
    data: { name: '', activations: 0, prize_type: '', prize_amount: 0, min_status_id: 0 },
    active: true,
    waitingForEdit: false,
    editField: null,
    forceImageTemplate: null // null = авто, 'fat' = жирный, 'default' = обычный
  });

  await ctx.reply('🚀 <b>Создание нового промокода</b>\n\nШаг 1/5: Введите <b>название</b> промокода:', {
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
      await ctx.reply(`✅ Название <b>${escapeHtml(text)}</b> принято.\n\nШаг 2/5: Введите <b>количество активаций</b> или выберите вариант ниже:`, {
        parse_mode: 'HTML',
        reply_markup: activationsQuickKeyboard.reply_markup
      });
    }
    else if (session.step === 1) {
      const val = parseInt(text, 10);
      if (isNaN(val) || val <= 0) {
        return ctx.reply('❌ Некорректное число. Введите количество активаций (> 0) или выберите кнопку:', { reply_markup: activationsQuickKeyboard.reply_markup });
      }
      session.data.activations = val;
      session.step = 2;
      await ctx.reply(`✅ Активаций: <b>${formatNumber(val)}</b>.\n\nШаг 3/5: Выберите <b>тип приза</b>:`, {
        parse_mode: 'HTML',
        reply_markup: prizeTypeKeyboard.reply_markup
      });
    }
    else if (session.step === 3) {
      const val = parseFloat(text.replace(',', '.'));
      if (isNaN(val) || val <= 0) {
        return ctx.reply('❌ Некорректная сумма. Введите число или выберите вариант ниже:', { reply_markup: prizeAmountQuickKeyboard.reply_markup });
      }
      session.data.prize_amount = val;
      session.step = 4;
      await ctx.reply(`✅ Сумма приза: <b>${formatNumber(val)}</b> ${prizeTypeMapping[session.data.prize_type]}.\n\nШаг 4/5: Выберите <b>минимальный статус</b> для активации:`, {
        parse_mode: 'HTML',
        reply_markup: statusKeyboard.reply_markup
      });
    }
    else if (session.step === 5 && session.editField) {
      if (session.editField === 'name') {
        session.data.name = text;
      } else if (session.editField === 'activations') {
        const val = parseInt(text, 10);
        if (isNaN(val) || val <= 0) return ctx.reply('❌ Ошибка ввода. Попробуйте снова:', { reply_markup: cancelEditKeyboard.reply_markup });
        session.data.activations = val;
      } else if (session.editField === 'prize_amount') {
        const val = parseFloat(text.replace(',', '.'));
        if (isNaN(val) || val <= 0) return ctx.reply('❌ Ошибка ввода. Попробуйте снова:', { reply_markup: cancelEditKeyboard.reply_markup });
        session.data.prize_amount = val;
      }
      
      session.editField = null;
      session.step = 5;
      await showSummary(ctx, session);
    }

    return true;
  } catch (error) {
    console.error('Ошибка в потоке создания промокода:', error);
    await ctx.reply('❌ Произошла ошибка. Попробуйте заново /создать');
    promoSessions.delete(userId);
    return false;
  }
}

async function showSummary(ctx, session) {
  const d = session.data;
  
  // Определяем, какой шаблон будет использован
  let templateInfo = '🤖 Авто (по правилам)';
  if (session.forceImageTemplate === 'fat') templateInfo = '🟢 Принудительно: Жирный (Fat)';
  if (session.forceImageTemplate === 'default') templateInfo = '🔵 Принудительно: Обычный (Default)';

  const summaryText = `
🎉 <b>Проверьте данные промокода:</b>

🏷 <b>Название:</b> <code>${escapeHtml(d.name)}</code>
🔢 <b>Активаций:</b> ${formatNumber(d.activations)}
🎁 <b>Приз:</b> ${formatNumber(d.prize_amount)} ${prizeTypeMapping[d.prize_type]}
🔒 <b>Мин. статус:</b> ${getStatusNameById(d.min_status_id)}
🖼 <b>Шаблон:</b> ${templateInfo}

Нажмите «Подтвердить», чтобы создать, или «Редактировать», чтобы изменить поле.
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

  if (!session && !data.startsWith('promo_prize_') && !data.startsWith('promo_status_') && !data.startsWith('promo_quick_')) {
     if(data !== 'promo_cancel_create') return ctx.answerCbQuery('❌ Сессия истекла.', { show_alert: true });
  }

  if (data === 'promo_cancel_create') {
    promoSessions.delete(userId);
    await ctx.editMessageText('❌ Создание отменено.').catch(() => {});
    await ctx.reply('Можете начать заново: /создать');
    return ctx.answerCbQuery();
  }

  if (data.startsWith('promo_quick_act_')) {
    if (!session || session.step !== 1) return ctx.answerCbQuery('❌ Сейчас не этот этап.', { show_alert: true });
    const val = parseInt(data.replace('promo_quick_act_', ''), 10);
    session.data.activations = val;
    session.step = 2;
    
    await ctx.editMessageText(`✅ Активаций: <b>${formatNumber(val)}</b>.\n\nШаг 3/5: Выберите <b>тип приза</b>:`, {
      parse_mode: 'HTML',
      reply_markup: prizeTypeKeyboard.reply_markup
    });
    return ctx.answerCbQuery();
  }

  if (data.startsWith('promo_quick_sum_')) {
    if (!session || session.step !== 3) return ctx.answerCbQuery('❌ Сейчас не этот этап.', { show_alert: true });
    const val = parseInt(data.replace('promo_quick_sum_', ''), 10);
    session.data.prize_amount = val;
    session.step = 4;

    await ctx.editMessageText(`✅ Сумма приза: <b>${formatNumber(val)}</b> ${prizeTypeMapping[session.data.prize_type]}.\n\nШаг 4/5: Выберите <b>минимальный статус</b>:`, {
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
    session.step = 3;
    
    await ctx.editMessageText(`✅ Тип приза: <b>${prizeTypeMapping[session.data.prize_type]}</b>.\n\nШаг 4/5: Введите <b>количество приза</b> или выберите вариант:`, {
      parse_mode: 'HTML',
      reply_markup: prizeAmountQuickKeyboard.reply_markup
    });
    return ctx.answerCbQuery();
  }

  if (data.startsWith('promo_status_')) {
    if (!session) return ctx.answerCbQuery('❌ Сессия истекла.', { show_alert: true });
    const statusId = parseInt(data.replace('promo_status_', ''), 10);
    session.data.min_status_id = statusId;
    session.step = 5;
    
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
    await ctx.editMessageText('✏️ <b>Редактирование данных</b>\n\nВыберите поле:', {
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

  // --- НОВАЯ ЛОГИКА: ПЕРЕКЛЮЧЕНИЕ ШАБЛОНА ---
  if (data === 'promo_toggle_image_template') {
    if (!session) return ctx.answerCbQuery('❌ Сессия истекла.', { show_alert: true });
    
    // Переключаем значение
    if (session.forceImageTemplate === null) {
      // Сначала определяем, какой бы был авто-выбор, чтобы предложить противоположный
      const isAutoFat = (session.data.prize_type === 'container_type_3' || (session.data.prize_type === 'balance' && session.data.prize_amount >= 100000));
      session.forceImageTemplate = isAutoFat ? 'default' : 'fat';
    } else if (session.forceImageTemplate === 'fat') {
      session.forceImageTemplate = 'default';
    } else {
      session.forceImageTemplate = null; // Возврат к авто
    }

    let msg = '';
    if (session.forceImageTemplate === null) msg = '🤖 Шаблон сброшен на <b>Автоматический</b>.';
    else if (session.forceImageTemplate === 'fat') msg = '🟢 Установлен <b>Жирный (Fat)</b> шаблон.';
    else msg = '🔵 Установлен <b>Обычный (Default)</b> шаблон.';

    await ctx.answerCbQuery(msg);
    await showSummary(ctx, session); // Обновляем сводку с новой информацией
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
        promptText = `✍️ Введите новое <b>название</b> (текущее: <code>${escapeHtml(session.data.name)}</code>):`;
    } else if (field === 'activations') {
        promptText = `✍️ Введите новое <b>кол-во активаций</b> (текущее: ${formatNumber(session.data.activations)}) или выберите:`;
        keyboard = activationsQuickKeyboard.reply_markup;
    } else if (field === 'prize_amount') {
        promptText = `✍️ Введите новую <b>сумму приза</b> (текущая: ${formatNumber(session.data.prize_amount)}) или выберите:`;
        keyboard = prizeAmountQuickKeyboard.reply_markup;
    }
    
    if (field === 'prize_type' || field === 'status') {
        session.step = (field === 'prize_type') ? 2 : 4;
        session.editField = field;
        
        if (field === 'prize_type') {
            await ctx.editMessageText('✏️ Выберите новый <b>тип приза</b>:', {
                parse_mode: 'HTML',
                reply_markup: prizeTypeKeyboard.reply_markup
            });
        } else {
            await ctx.editMessageText('✏️ Выберите новый <b>мин. статус</b>:', {
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
      await ctx.reply(`⚠️ <b>Внимание!</b>\n\nПромокод с названием <code>${escapeHtml(d.name)}</code> уже существует в базе данных.\n\nПожалуйста, измените название.`, {
        parse_mode: 'HTML',
        reply_markup: editMenuKeyboard.reply_markup
      });
      return;
    }

    const result = await createPromo(d.name, d.activations, d.prize_type, d.prize_amount, adminId, d.min_status_id);
    
    if (!result.success) {
      promoSessions.delete(ctx.from.id.toString());
      return ctx.reply(`❌ Ошибка: ${result.message || 'Промокод с таким именем уже существует.'}`);
    }

    let photoPath = null;
    try {
      // Передаем четвертый аргумент (подсказку шаблона), если она установлена
      photoPath = await generatePromoImage(d.name, d.activations, d.prize_amount, d.prize_type, session.forceImageTemplate);
    } catch (imgErr) {
      console.error('Ошибка генерации изображения:', imgErr);
    }

    let templateNote = '';
    if (session.forceImageTemplate) {
      templateNote = `\n🖼 Шаблон: ${session.forceImageTemplate === 'fat' ? 'Жирный' : 'Обычный'} (вручную)`;
    }

    const successMsg = `✅ <b>Промокод успешно создан!</b>\n\n🏷 Название: <code>${escapeHtml(d.name)}</code>\n🔢 Активаций: ${formatNumber(d.activations)}\n🎁 Приз: ${formatNumber(d.prize_amount)} ${prizeTypeMapping[d.prize_type]}\n🔒 Статус: ${getStatusNameById(d.min_status_id)}${templateNote}`;

    if (photoPath) {
      await ctx.replyWithPhoto({ source: photoPath }, { caption: successMsg, parse_mode: 'HTML' });
    } else {
      await ctx.reply(successMsg, { parse_mode: 'HTML' });
    }

    if (LOG_GIVE_CHAT_ID && ["6891998751", "1751938104", "1901352625"].includes(adminId)) {
      const logMsg = `
🔔 <b>Создан новый промокод</b>
• Админ: <a href="tg://user?id=${adminId}">${escapeHtml(ctx.from.username || 'Unknown')}</a>
• Название: <code>${escapeHtml(d.name)}</code>
• Активаций: ${formatNumber(d.activations)}
• Приз: ${formatNumber(d.prize_amount)} ${prizeTypeMapping[d.prize_type]}
• Статус: ${getStatusNameById(d.min_status_id)}
      `.trim();
      ctx.telegram.sendMessage(LOG_GIVE_CHAT_ID, logMsg, { parse_mode: 'HTML' }).catch(console.error);
    }

    promoSessions.delete(ctx.from.id.toString());

  } catch (error) {
    console.error('Ошибка финализации промокода:', error);
    await ctx.reply('❌ Произошла ошибка при сохранении.');
  }
}

// --- СТАРЫЕ ФУНКЦИИ ---
// (Остались без изменений: deletePromoHandler, listPromosHandler, usePromoHandler)
async function deletePromoHandler(ctx) {
  if (!(await isAdmin(ctx))) return;
  const parts = ctx.message.text.trim().split(/\s+/);
  if (parts.length !== 3 || parts[1] !== 'промо') return ctx.reply('Использование: удалить промо <id>');
  const id = parseInt(parts[2], 10);
  if (isNaN(id)) return ctx.reply('Некорректный ID.');
  
  const promo = await getPromoById(id);
  if (!promo) return ctx.reply('Промокод не найден.');

  const res = await deletePromoById(id);
  await ctx.reply(res.success ? `✅ Промокод "${escapeHtml(promo.name)}" удален.` : '❌ Ошибка удаления.');
}

async function listPromosHandler(ctx) {
  if (!(await isAdmin(ctx))) return;
  const promos = await getAllPromos();
  if (!promos.length) return ctx.reply('Список пуст.');

  let msg = '';
  for (const p of promos) {
    const entry = `• <b>ID</b>: ${p.id} | <code>${escapeHtml(p.name)}</code>\n  Осталось: ${formatNumber(p.activations_left)} | Приз: ${formatNumber(p.prize_amount)} ${prizeTypeMapping[p.prize_type]}\n  Статус: ${getStatusNameById(p.min_status_id)}\n\n`;
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

  const promo = await getPromoByName(parts[1]);
  if (!promo) return ctx.reply('❕ Промокод не найден.');
  if (promo.activations_left <= 0) return ctx.reply('❕ Активации исчерпаны.');

  const userId = ctx.from.id.toString();
  if (await hasUserActivatedPromo(promo.id, userId)) return ctx.reply('❕ Вы уже активировали этот код.');

  if (promo.min_status_id > 0) {
    const statuses = await getUserStatuses(userId);
    const reqStatus = getStatusNameById(promo.min_status_id);
    if (!statuses.includes(reqStatus)) return ctx.reply(`❕ Недостаточный статус. Требуется: ${reqStatus}.`);
  }

  const res = await activatePromo(promo.id, userId);
  if (!res.success) return ctx.reply('❕ Ошибка активации.');

  await recordPromoActivation(promo.id, userId);
  
  const updated = await getPromoById(promo.id);
  if (updated && updated.activations_left <= 0) {
    await deletePromoById(updated.id);
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
    const logMsg = `🔔 <b>Активация промокода</b>\n• Игрок: ${link}\n• Код: <code>${escapeHtml(promo.name)}</code>\n• Приз: ${formatNumber(res.prizeAmount)} ${prizeTypeMapping[promo.prize_type]}`;
    ctx.telegram.sendMessage(LOG_CHAT_PROMO_ID, logMsg, { parse_mode: 'HTML' }).catch(console.error);
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