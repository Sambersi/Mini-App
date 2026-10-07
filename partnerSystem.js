const { Markup } = require('telegraf');
const { 
  getUserStatuses, 
  getUserById,
  getPromoByName,
  getUserMaxPriority,
  getPartnerRequestsStats,
  createPartnerRequest,
  createPartnerCurrencyRequest,
  updatePartnerRequestAdminMessageId,
  updatePartnerRequestStatus,
  getPartnerRequestsByPartner,
  getPartnerRequestByPartnerAndName,
  getPartnerRequestById,
  createPartnerPromo
} = require('./db');

let generatePromoImage = null;
try {
  generatePromoImage = require('./generatePromoImage').generatePromoImage;
} catch (e) {
  console.warn('[PARTNER] generatePromoImage не найдена.');
}

const PARTNER_ADMIN_CHAT_ID = '-5564485597';
const ALLOWED_ADMIN_PRIORITIES = [10, 9, 8]; // Тех админ, Главный админ, Руководитель партнёрки

const partnerSessions = new Map();
const adminEditSessions = new Map();

const PRIZE_TYPES = [
    { id: 'balance', name: 'PF' },
    { id: 'df_balance', name: 'DF' },
    { id: 'container_type_3', name: 'GOLD-контейнер' },
    { id: 'tickets', name: 'Билетики' }
];

const STEP_NAME = 0;
const STEP_PRIZE_TYPE = 1;
const STEP_PRIZE_AMOUNT = 2;
const STEP_AUDIENCE = 3;
const STEP_TEMPLATE = 4;
const STEP_SUMMARY = 5;

// Быстрый запрос валюты
const CURRENCY_STEP_TYPE = 0;
const CURRENCY_STEP_AMOUNT = 1;
const CURRENCY_STEP_SUMMARY = 2;

function escapeHtml(text) {
    if (typeof text !== 'string') return text;
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function createUserLink(userId, username) {
    const displayName = username ? escapeHtml(username) : 'Неизвестный';
    return `<a href="tg://user?id=${userId}">${displayName}</a>`;
}

async function safeEditOrReply(ctx, text, options, photoPath = null) {
    try {
        if (ctx.callbackQuery) {
            await ctx.deleteMessage().catch(() => {});
        }
        if (photoPath) {
            await ctx.replyWithPhoto({ source: photoPath }, {
                caption: text,
                ...options
            });
        } else {
            await ctx.reply(text, options);
        }
    } catch (e) {
        await ctx.reply(text, options);
    }
}

async function generatePartnerPromoImage(data) {
    if (!generatePromoImage) return null;
    try {
        return await generatePromoImage(data.name, -1, data.prize_amount, data.prize_type, data.template || 'normal', false);
    } catch (e) {
        console.error('[PARTNER] Ошибка генерации картинки:', e);
        return null;
    }
}

// ========== КЛАВИАТУРЫ ==========
const partnerPrizeTypeKeyboard = Markup.inlineKeyboard([
    [Markup.button.callback('📦 GOLD-контейнер', 'partner_prize_container_type_3')],
    [Markup.button.callback('💰 PF', 'partner_prize_balance'), Markup.button.callback('💎 DF', 'partner_prize_df_balance')],
    [Markup.button.callback('🎫 Билетики', 'partner_prize_tickets')],
    [Markup.button.callback('❌ Отмена', 'partner_cancel_req')]
]);

function getPartnerPrizeAmountKeyboard(prizeType) {
    let rows = [];
    switch (prizeType) {
        case 'balance': rows = [['10000', '50000', '100000'], ['250000', '500000']]; break;
        case 'df_balance': rows = [['10', '50', '100'], ['500', '1000']]; break;
        case 'container_type_3': rows = [['1', '3', '5'], ['10']]; break;
        case 'tickets': rows = [['1', '3', '5'], ['10']]; break;
    }
    const keyboardRows = rows.map(row =>
        row.map(val => Markup.button.callback(val, `partner_quick_sum_${val}`))
    );
    keyboardRows.push([Markup.button.callback('❌ Отмена', 'partner_cancel_req')]);
    return Markup.inlineKeyboard(keyboardRows);
}

const partnerAudienceKeyboard = Markup.inlineKeyboard([
    [Markup.button.callback('🌍 Для всех игроков', 'partner_aud_all')],
    [Markup.button.callback('👥 Только для моих рефералов', 'partner_aud_refs')],
    [Markup.button.callback('❌ Отмена', 'partner_cancel_req')]
]);

const partnerTemplateKeyboard = Markup.inlineKeyboard([
    [Markup.button.callback('🥶 Жирный', 'partner_template_fat')],
    [Markup.button.callback('🍬 Обычный', 'partner_template_normal')],
    [Markup.button.callback('❌ Отмена', 'partner_cancel_req')]
]);

const partnerEditMenuKeyboard = Markup.inlineKeyboard([
    [Markup.button.callback('Изменить название', 'partner_edit_name')],
    [Markup.button.callback('Изменить тип приза', 'partner_edit_prize_type')],
    [Markup.button.callback('Изменить сумму', 'partner_edit_prize_amount')],
    [Markup.button.callback('Изменить аудиторию', 'partner_edit_audience')],
    [Markup.button.callback('Изменить шаблон', 'partner_edit_template')],
    [Markup.button.callback('⬅️ Назад к проверке', 'partner_back_to_summary')]
]);

// Клавиатуры для быстрого запроса валюты
const currencyTypeKeyboard = Markup.inlineKeyboard([
    [Markup.button.callback('💰 PF', 'currency_type_balance')],
    [Markup.button.callback('💎 DF', 'currency_type_df_balance')],
    [Markup.button.callback('❌ Отмена', 'partner_cancel_req')]
]);

function getCurrencyAmountKeyboard(currencyType) {
    let rows = [];
    if (currencyType === 'balance') {
        rows = [['10000', '50000', '100000'], ['250000', '500000', '1000000']];
    } else {
        rows = [['10', '50', '100'], ['500', '1000', '5000']];
    }
    const keyboardRows = rows.map(row =>
        row.map(val => Markup.button.callback(val, `currency_quick_${val}`))
    );
    keyboardRows.push([Markup.button.callback('❌ Отмена', 'partner_cancel_req')]);
    return Markup.inlineKeyboard(keyboardRows);
}

// ========== ПРОВЕРКИ И МЕНЮ ==========
async function isPartner(userId) {
    const statuses = await getUserStatuses(userId);
    return statuses.some(s => s.toLowerCase() === 'партнёр' || s.toLowerCase() === 'partner');
}

async function hasPartnerAdminRights(userId) {
    const maxPriority = getUserMaxPriority(userId);
    return ALLOWED_ADMIN_PRIORITIES.includes(maxPriority);
}

async function showPartnerMenu(ctx) {
    const userId = ctx.from.id.toString();
    if (!(await isPartner(userId))) {
        return ctx.reply('❌ У вас нет статуса "Партнёр". Доступ запрещен.');
    }
    const user = getUserById(userId);
    const text = `🤝 <b>Панель Партнёра</b>\n\n👤 ${user?.username || 'Неизвестный'}\n🆔 Numeric ID: <code>${user?.numeric_id || '—'}</code>\n\nВыберите действие:`;
    const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('📝 Запрос на промокод', 'partner_create_req')],
        [Markup.button.callback('💰 Запросить валюту', 'partner_currency_req')],
        [Markup.button.callback('📜 Мои запросы', 'partner_my_reqs')]
    ]);
    await safeEditOrReply(ctx, text, { parse_mode: 'HTML', ...keyboard });
}

async function showMyRequests(ctx, userId) {
    try {
        const requests = getPartnerRequestsByPartner(userId);
        
        if (!requests || requests.length === 0) {
            return safeEditOrReply(ctx, '📭 <b>Мои запросы</b>\n\nУ вас пока нет отправленных запросов.', {
                parse_mode: 'HTML',
                ...Markup.inlineKeyboard([[Markup.button.callback('⬅️ Назад', 'partner_back_to_menu')]])
            });
        }
        
        let text = '📜 <b>Ваши последние запросы (до 10):</b>\n\n';
        
        // Сортируем: сначала активные (pending), потом завершенные
        const pending = requests.filter(r => r.status === 'pending');
        const completed = requests.filter(r => r.status !== 'pending');
        
        const formatRequest = (req, index) => {
            const prizeName = PRIZE_TYPES.find(p => p.id === req.prize_type)?.name || req.prize_type;
            const isCurrency = req.request_type === 'currency';
            const typeLabel = isCurrency ? '💰 Валюта' : '🎁 Промо';
            
            let statusIcon = '⏳';
            let statusText = 'На рассмотрении';
            if (req.status === 'approved') { statusIcon = '✅'; statusText = 'Одобрено'; }
            if (req.status === 'rejected') { statusIcon = '❌'; statusText = 'Отклонено'; }
            
            const amount = req.prize_amount?.toLocaleString('ru-RU') || '—';
            const date = new Date(req.created_at * 1000).toLocaleDateString('ru-RU');
            
            return `${statusIcon} <b>${typeLabel}</b> | <code>${req.name}</code>\n` +
                   `   🎁 ${amount} ${prizeName} | 📅 ${date}\n` +
                   `   📊 ${statusText}\n`;
        };
        
        // Сначала pending
        if (pending.length > 0) {
            text += '🟡 <b>На рассмотрении:</b>\n';
            for (let i = 0; i < pending.length; i++) {
                text += formatRequest(pending[i], i + 1) + '\n';
            }
        }
        
        // Потом completed
        if (completed.length > 0) {
            text += '\n⚪ <b>Завершенные:</b>\n';
            for (let i = 0; i < completed.length; i++) {
                text += formatRequest(completed[i], pending.length + i + 1) + '\n';
            }
        }
        
        // Разбиваем на части если длинное
        const parts = [];
        let current = '';
        const lines = text.split('\n');
        
        for (const line of lines) {
            if ((current + line + '\n').length > 3800) {
                parts.push(current);
                current = '';
            }
            current += line + '\n';
        }
        if (current) parts.push(current);
        
        for (let i = 0; i < parts.length; i++) {
            const kb = i === parts.length - 1 
                ? Markup.inlineKeyboard([[Markup.button.callback('⬅️ Назад', 'partner_back_to_menu')]])
                : {};
            await safeEditOrReply(ctx, parts[i], { parse_mode: 'HTML', ...kb });
        }
    } catch (e) {
        console.error('[PARTNER] Ошибка показа запросов:', e);
        await ctx.reply('❌ Ошибка при загрузке списка запросов.');
    }
}

// ========== ПРОЦЕСС СОЗДАНИЯ ЗАПРОСА НА ПРОМО ==========
async function startPartnerRequest(ctx) {
    const userId = ctx.from.id.toString();
    partnerSessions.set(userId, {
        type: 'promo',
        step: STEP_NAME,
        data: { partner_id: userId },
        active: true,
        editField: null
    });
    await safeEditOrReply(ctx, '🚀 <b>Создание запроса на промокод</b>\n\nШаг 1/5: Введите <b>название</b> промокода:', { 
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([[Markup.button.callback('❌ Отмена', 'partner_cancel_req')]])
    });
}

async function showPartnerSummary(ctx, session) {
    const d = session.data;
    const prizeName = PRIZE_TYPES.find(p => p.id === d.prize_type)?.name || d.prize_type;
    const audText = d.audience_type === 'all' ? '🌍 Для всех игроков' : '👥 Только для моих рефералов';
    const templateText = d.template === 'fat' ? '🥶 Жирный' : '🍬 Обычный';
    
    const summaryText = `🎉 <b>Проверьте данные запроса:</b>\n\n` +
        `🏷 <b>Название:</b> <code>${d.name}</code>\n` +
        `🎁 <b>Приз:</b> ${d.prize_amount?.toLocaleString('ru-RU')} ${prizeName}\n` +
        `🎯 <b>Аудитория:</b> ${audText}\n` +
        `🎨 <b>Шаблон:</b> ${templateText}\n\n` +
        `Нажмите «Отправить» или «Редактировать».`;
    
    const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('✅ Отправить админам', 'partner_submit_req')],
        [Markup.button.callback('✏️ Редактировать', 'partner_edit_menu')],
        [Markup.button.callback('❌ Отмена', 'partner_cancel_req')]
    ]);
    
    const photoPath = await generatePartnerPromoImage(d);
    await safeEditOrReply(ctx, summaryText, { parse_mode: 'HTML', ...keyboard }, photoPath);
}

// ========== БЫСТРЫЙ ЗАПРОС ВАЛЮТЫ ==========
async function startCurrencyRequest(ctx) {
    const userId = ctx.from.id.toString();
    partnerSessions.set(userId, {
        type: 'currency',
        step: CURRENCY_STEP_TYPE,
        data: { partner_id: userId, request_type: 'currency' },
        active: true
    });
    await safeEditOrReply(ctx, '💰 <b>Быстрый запрос валюты</b>\n\nШаг 1/2: Выберите <b>тип валюты</b>:', {
        parse_mode: 'HTML',
        ...currencyTypeKeyboard
    });
}

async function showCurrencySummary(ctx, session) {
    const d = session.data;
    const currencyName = d.prize_type === 'balance' ? 'PF' : 'DF';
    
    const summaryText = `💰 <b>Запрос на валюту</b>\n\n` +
        `🏷 <b>Название:</b> <code>${d.name}</code>\n` +
        `💵 <b>Валюта:</b> ${currencyName}\n` +
        `💎 <b>Сумма:</b> ${d.prize_amount?.toLocaleString('ru-RU')} ${currencyName}\n\n` +
        `Нажмите «Отправить» для передачи администраторам.`;
    
    const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('✅ Отправить админам', 'partner_submit_currency')],
        [Markup.button.callback('❌ Отмена', 'partner_cancel_req')]
    ]);
    
    await safeEditOrReply(ctx, summaryText, { parse_mode: 'HTML', ...keyboard });
}

// ========== ОБРАБОТКА ТЕКСТА ==========
async function handlePartnerMessage(ctx) {
    const userId = ctx.from.id.toString();
    const text = ctx.message.text.trim();

    if (adminEditSessions.has(userId)) {
        await handleAdminEditInput(ctx, userId, text);
        return true;
    }

    const session = partnerSessions.get(userId);
    if (!session || !session.active) return false;

    try {
        if (session.type === 'promo') {
            if (session.step === STEP_NAME) {
                const existing = await getPromoByName(text);
                if (existing) {
                    await ctx.reply('❌ Промокод с таким названием уже существует.');
                    return true;
                }
                session.data.name = text;
                if (session.editField === 'name') {
                    session.editField = null;
                    await showPartnerSummary(ctx, session);
                } else {
                    session.step = STEP_PRIZE_TYPE;
                    await ctx.reply(`✅ Название <b>${text}</b> принято.\n\nШаг 2/5: Выберите <b>тип приза</b>:`, {
                        parse_mode: 'HTML', ...partnerPrizeTypeKeyboard
                    });
                }
            } 
            else if (session.step === STEP_PRIZE_AMOUNT) {
                const val = parseInt(text.replace(/\s/g, ''), 10);
                if (isNaN(val) || val <= 0) {
                    await ctx.reply('❌ Некорректная сумма.', { ...getPartnerPrizeAmountKeyboard(session.data.prize_type) });
                    return true;
                }
                session.data.prize_amount = val;
                if (session.editField === 'prize_amount') {
                    session.editField = null;
                    await showPartnerSummary(ctx, session);
                } else {
                    session.step = STEP_AUDIENCE;
                    await ctx.reply(`✅ Сумма: <b>${val.toLocaleString('ru-RU')}</b>.\n\nШаг 4/5: Аудитория:`, {
                        parse_mode: 'HTML', ...partnerAudienceKeyboard
                    });
                }
            }
        } 
        else if (session.type === 'currency') {
            if (session.step === CURRENCY_STEP_AMOUNT) {
                const val = parseInt(text.replace(/\s/g, ''), 10);
                if (isNaN(val) || val <= 0) {
                    await ctx.reply('❌ Некорректная сумма.', { ...getCurrencyAmountKeyboard(session.data.prize_type) });
                    return true;
                }
                session.data.prize_amount = val;
                session.data.name = `CURRENCY_${Date.now()}`;
                session.step = CURRENCY_STEP_SUMMARY;
                await showCurrencySummary(ctx, session);
            }
        }
    } catch (e) {
        console.error('[PARTNER] Ошибка в сессии:', e);
        partnerSessions.delete(userId);
        await ctx.reply('Произошла ошибка. Сессия сброшена.');
    }
    return true;
}

// ========== ОБРАБОТКА КНОПОК ==========
async function handlePartnerCallback(ctx) {
    const userId = ctx.from.id.toString();
    const data = ctx.callbackQuery.data;
    await ctx.answerCbQuery();

    if (data === 'partner_create_req') { await startPartnerRequest(ctx); return; }
    if (data === 'partner_currency_req') { await startCurrencyRequest(ctx); return; }
    if (data === 'partner_my_reqs') { await showMyRequests(ctx, userId); return; }
    if (data === 'partner_back_to_menu') { await showPartnerMenu(ctx); return; }

    const session = partnerSessions.get(userId);
    if (!session) return;

    if (data === 'partner_cancel_req') {
        partnerSessions.delete(userId);
        await ctx.editMessageText('❌ Запрос отменен.');
        return;
    }

    // Обработка для промо-запроса
    if (session.type === 'promo') {
        if (data === 'partner_edit_menu') {
            await safeEditOrReply(ctx, '✏️ <b>Редактирование</b>\n\nВыберите поле:', { parse_mode: 'HTML', ...partnerEditMenuKeyboard });
            return;
        }
        if (data === 'partner_back_to_summary') {
            await showPartnerSummary(ctx, session);
            return;
        }
        if (data.startsWith('partner_edit_')) {
            const field = data.replace('partner_edit_', '');
            session.editField = field;
            if (field === 'name') {
                session.step = STEP_NAME;
                await safeEditOrReply(ctx, `✍️ Новое <b>название</b>:`, { parse_mode: 'HTML' });
            } else if (field === 'prize_type') {
                session.step = STEP_PRIZE_TYPE;
                await safeEditOrReply(ctx, '✏️ Новый <b>тип приза</b>:', { parse_mode: 'HTML', ...partnerPrizeTypeKeyboard });
            } else if (field === 'prize_amount') {
                session.step = STEP_PRIZE_AMOUNT;
                await safeEditOrReply(ctx, `✍️ Новая <b>сумма</b>:`, { parse_mode: 'HTML', ...getPartnerPrizeAmountKeyboard(session.data.prize_type) });
            } else if (field === 'audience') {
                session.step = STEP_AUDIENCE;
                await safeEditOrReply(ctx, '✏️ Новая <b>аудитория</b>:', { parse_mode: 'HTML', ...partnerAudienceKeyboard });
            } else if (field === 'template') {
                session.step = STEP_TEMPLATE;
                await safeEditOrReply(ctx, '🎨 Новый <b>шаблон</b>:', { parse_mode: 'HTML', ...partnerTemplateKeyboard });
            }
            return;
        }

        if (data.startsWith('partner_prize_')) {
            const prizeType = data.replace('partner_prize_', '');
            session.data.prize_type = prizeType;
            if (session.editField === 'prize_type') {
                session.editField = null;
                await showPartnerSummary(ctx, session);
            } else {
                session.step = STEP_PRIZE_AMOUNT;
                const prizeName = PRIZE_TYPES.find(p => p.id === prizeType)?.name || prizeType;
                await safeEditOrReply(ctx, `✅ Тип: <b>${prizeName}</b>.\n\nШаг 3/5: Сумма:`, {
                    parse_mode: 'HTML', ...getPartnerPrizeAmountKeyboard(prizeType)
                });
            }
            return;
        }

        if (data.startsWith('partner_quick_sum_')) {
            const val = parseInt(data.replace('partner_quick_sum_', ''), 10);
            session.data.prize_amount = val;
            if (session.editField === 'prize_amount') {
                session.editField = null;
                await showPartnerSummary(ctx, session);
            } else {
                session.step = STEP_AUDIENCE;
                await safeEditOrReply(ctx, `✅ Сумма: <b>${val.toLocaleString('ru-RU')}</b>.\n\nШаг 4/5: Аудитория:`, {
                    parse_mode: 'HTML', ...partnerAudienceKeyboard
                });
            }
            return;
        }

        if (data === 'partner_aud_all' || data === 'partner_aud_refs') {
            session.data.audience_type = data === 'partner_aud_all' ? 'all' : 'referrals';
            if (session.editField === 'audience') {
                session.editField = null;
                await showPartnerSummary(ctx, session);
            } else {
                session.step = STEP_TEMPLATE;
                await safeEditOrReply(ctx, '🎨 Шаг 5/5: Шаблон:', {
                    parse_mode: 'HTML', ...partnerTemplateKeyboard
                });
            }
            return;
        }

        if (data === 'partner_template_fat' || data === 'partner_template_normal') {
            session.data.template = data === 'partner_template_fat' ? 'fat' : 'normal';
            if (session.editField === 'template') {
                session.editField = null;
                await showPartnerSummary(ctx, session);
            } else {
                session.step = STEP_SUMMARY;
                await showPartnerSummary(ctx, session);
            }
            return;
        }

        if (data === 'partner_submit_req') {
            await submitRequestToAdmins(ctx, session.data);
            partnerSessions.delete(userId);
            return;
        }
    }
    
    // Обработка для валютного запроса
    else if (session.type === 'currency') {
        if (data.startsWith('currency_type_')) {
            const currencyType = data.replace('currency_type_', '');
            session.data.prize_type = currencyType;
            session.step = CURRENCY_STEP_AMOUNT;
            const currencyName = currencyType === 'balance' ? 'PF' : 'DF';
            await safeEditOrReply(ctx, `✅ Валюта: <b>${currencyName}</b>.\n\nШаг 2/2: Введите <b>сумму</b>:`, {
                parse_mode: 'HTML', ...getCurrencyAmountKeyboard(currencyType)
            });
            return;
        }

        if (data.startsWith('currency_quick_')) {
            const val = parseInt(data.replace('currency_quick_', ''), 10);
            session.data.prize_amount = val;
            session.data.name = `CURRENCY_${Date.now()}`;
            session.step = CURRENCY_STEP_SUMMARY;
            await showCurrencySummary(ctx, session);
            return;
        }

        if (data === 'partner_submit_currency') {
            await submitCurrencyRequestToAdmins(ctx, session.data);
            partnerSessions.delete(userId);
            return;
        }
    }
}

// ========== ОТПРАВКА АДМИНАМ (ПРОМО) ==========
async function submitRequestToAdmins(ctx, data) {
    try {
        const user = getUserById(data.partner_id);
        const prizeName = PRIZE_TYPES.find(p => p.id === data.prize_type)?.name || data.prize_type;
        const audText = data.audience_type === 'all' ? '🌍 Для всех' : '👥 Только рефералы';
        const templateText = data.template === 'fat' ? '🥶 Жирный' : '🍬 Обычный';
        const userLink = createUserLink(data.partner_id, ctx.from.username || ctx.from.first_name);

        const stats = getPartnerRequestsStats(data.partner_id, 24);

        const msgText = `📩 <b>Новый запрос на ПРОМОКОД</b>\n\n` +
            `👤 Партнер: ${userLink}\n` +
            `🆔 Numeric ID: <code>${user?.numeric_id || '—'}</code>\n` +
            `🏷 Название: <code>${data.name}</code>\n` +
            `🎁 Приз: ${data.prize_amount?.toLocaleString('ru-RU')} ${prizeName}\n` +
            `🎯 Аудитория: ${audText}\n` +
            `🎨 Шаблон: ${templateText}\n\n` +
            `📊 <b>Статистика за 24ч:</b>\n` +
            `• Всего запросов: ${stats.total}\n` +
            `• Одобрено: ${stats.approved}\n` +
            `• На рассмотрении: ${stats.pending}`;
            
        const kb = Markup.inlineKeyboard([
            [Markup.button.callback('✅ Принять', `admin_req_accept_${data.partner_id}_${data.name}`)],
            [Markup.button.callback('❌ Отклонить', `admin_req_reject_${data.partner_id}_${data.name}`)],
            [Markup.button.callback('✏️ Редактировать', `admin_req_edit_${data.partner_id}_${data.name}`)]
        ]);

        const requestId = createPartnerRequest(data.partner_id, data.name, data.prize_type, data.prize_amount, data.audience_type, data.template);
        const photoPath = await generatePartnerPromoImage(data);

        let sentMsg;
        if (photoPath) {
            sentMsg = await ctx.telegram.sendPhoto(PARTNER_ADMIN_CHAT_ID, { source: photoPath }, {
                caption: msgText,
                parse_mode: 'HTML',
                ...kb
            });
        } else {
            sentMsg = await ctx.telegram.sendMessage(PARTNER_ADMIN_CHAT_ID, msgText, { parse_mode: 'HTML', ...kb });
        }
        
        updatePartnerRequestAdminMessageId(requestId, sentMsg.message_id);
        await safeEditOrReply(ctx, '✅ Запрос отправлен администраторам!', { parse_mode: 'HTML' });
    } catch (e) {
        console.error('[PARTNER] Ошибка отправки:', e);
        await safeEditOrReply(ctx, '❌ Ошибка при отправке.', { parse_mode: 'HTML' });
    }
}

// ========== ОТПРАВКА АДМИНАМ (ВАЛЮТА) ==========
async function submitCurrencyRequestToAdmins(ctx, data) {
    try {
        const user = getUserById(data.partner_id);
        const currencyName = data.prize_type === 'balance' ? 'PF' : 'DF';
        const userLink = createUserLink(data.partner_id, ctx.from.username || ctx.from.first_name);

        const stats = getPartnerRequestsStats(data.partner_id, 24);

        const msgText = `💰 <b>Запрос на ВАЛЮТУ</b>\n\n` +
            `👤 Партнер: ${userLink}\n` +
            `🆔 Numeric ID: <code>${user?.numeric_id || '—'}</code>\n` +
            `💵 Валюта: <b>${currencyName}</b>\n` +
            `💎 Сумма: <b>${data.prize_amount?.toLocaleString('ru-RU')} ${currencyName}</b>\n\n` +
            `📊 <b>Статистика за 24ч:</b>\n` +
            `• Всего запросов: ${stats.total}\n` +
            `• Одобрено: ${stats.approved}\n` +
            `• На рассмотрении: ${stats.pending}`;
            
        const kb = Markup.inlineKeyboard([
            [Markup.button.callback('✅ Одобрить', `admin_curr_accept_${data.partner_id}_${data.name}`)],
            [Markup.button.callback('❌ Отклонить', `admin_curr_reject_${data.partner_id}_${data.name}`)]
        ]);

        const requestId = createPartnerCurrencyRequest(data.partner_id, data.name, data.prize_type, data.prize_amount);

        const sentMsg = await ctx.telegram.sendMessage(PARTNER_ADMIN_CHAT_ID, msgText, { parse_mode: 'HTML', ...kb });
        updatePartnerRequestAdminMessageId(requestId, sentMsg.message_id);
        
        await safeEditOrReply(ctx, '✅ Запрос на валюту отправлен!', { parse_mode: 'HTML' });
    } catch (e) {
        console.error('[PARTNER] Ошибка отправки валюты:', e);
        await safeEditOrReply(ctx, '❌ Ошибка при отправке.', { parse_mode: 'HTML' });
    }
}

// ========== АДМИНСКАЯ ЧАСТЬ ==========
async function handleAdminRequestCallback(ctx) {
    const userId = ctx.from.id.toString();
    const data = ctx.callbackQuery.data;
    
    if (!(await hasPartnerAdminRights(userId))) {
        await ctx.answerCbQuery('❌ Недостаточно прав.', { show_alert: true });
        return;
    }
    await ctx.answerCbQuery();

    const parts = data.split('_');
    const isCurrency = parts[1] === 'curr';
    const action = isCurrency ? parts[2] : parts[2];
    const partnerId = isCurrency ? parts[3] : parts[3];
    const promoName = isCurrency ? parts[4] : parts[4];

    const request = getPartnerRequestByPartnerAndName(partnerId, promoName, 'pending');

    if (!request) {
        await ctx.editMessageText(ctx.callbackQuery.message.text + '\n\n⚠️ <b>Запрос уже обработан.</b>', { parse_mode: 'HTML' });
        return;
    }

    if (action === 'accept') {
        if (isCurrency) {
            await approveCurrencyRequest(ctx, request, ctx.from.id);
        } else {
            await approveRequest(ctx, request, ctx.from.id);
        }
    } else if (action === 'reject') {
        await rejectRequest(ctx, request, ctx.from.id);
    } else if (action === 'edit' && !isCurrency) {
        adminEditSessions.set(userId, { requestId: request.id, step: 'AWAITING_EDIT_DATA' });
        await ctx.reply('✏️ <b>Редактирование</b>\n\nФормат: <code>Название | Тип | Сумма | Аудитория | Шаблон</code>', { parse_mode: 'HTML' });
    }
}

async function approveRequest(ctx, request, adminId, customData = null) {
    const data = customData || request;
    try {
        const result = createPartnerPromo(
            data.name, -1, data.prize_type, data.prize_amount,
            'partner_system', 0, null, data.partner_id, data.audience_type, data.template
        );

        if (!result.success) throw new Error(result.message);

        updatePartnerRequestStatus(request.id, 'approved');
        
        const prizeName = PRIZE_TYPES.find(p => p.id === data.prize_type)?.name || data.prize_type;
        const audText = data.audience_type === 'all' ? 'Для всех' : 'Только рефералы';
        const adminLink = createUserLink(adminId, ctx.from.username || 'Админ');
        
        const finalText = `${ctx.callbackQuery.message.text || ctx.callbackQuery.message.caption}\n\n✅ <b>ОДОБРЕНО</b> ${adminLink}`;
        await ctx.editMessageCaption(finalText, { parse_mode: 'HTML' }).catch(() => 
            ctx.editMessageText(finalText, { parse_mode: 'HTML' })
        );

        await ctx.telegram.sendMessage(data.partner_id, 
            `🎉 <b>Запрос одобрен!</b>\n\nПромокод <code>${data.name}</code> (${data.prize_amount?.toLocaleString('ru-RU')} ${prizeName}, ${audText}) создан.`, 
            { parse_mode: 'HTML' }
        );
    } catch (e) {
        console.error('[PARTNER] Ошибка одобрения:', e);
        await ctx.reply('❌ Ошибка создания промокода.');
    }
}

async function approveCurrencyRequest(ctx, request, adminId) {
    try {
        const { updateUserBalance, updateUserDFBalance } = require('./db');
        const amount = request.prize_amount;
        
        if (request.prize_type === 'balance') {
            updateUserBalance(request.partner_id, amount);
        } else {
            updateUserDFBalance(request.partner_id, amount);
        }

        updatePartnerRequestStatus(request.id, 'approved');
        
        const currencyName = request.prize_type === 'balance' ? 'PF' : 'DF';
        const adminLink = createUserLink(adminId, ctx.from.username || 'Админ');
        
        const finalText = `${ctx.callbackQuery.message.text}\n\n✅ <b>ОДОБРЕНО</b> ${adminLink}\n💰 Начислено: ${amount?.toLocaleString('ru-RU')} ${currencyName}`;
        await ctx.editMessageText(finalText, { parse_mode: 'HTML' });

        await ctx.telegram.sendMessage(request.partner_id, 
            `🎉 <b>Запрос на валюту одобрен!</b>\n\n💰 Начислено: ${amount?.toLocaleString('ru-RU')} ${currencyName}`, 
            { parse_mode: 'HTML' }
        );
    } catch (e) {
        console.error('[PARTNER] Ошибка одобрения валюты:', e);
        await ctx.reply('❌ Ошибка начисления валюты.');
    }
}

async function rejectRequest(ctx, request, adminId) {
    updatePartnerRequestStatus(request.id, 'rejected');
    const adminLink = createUserLink(adminId, ctx.from.username || 'Админ');
    const finalText = `${ctx.callbackQuery.message.text || ctx.callbackQuery.message.caption}\n\n❌ <b>ОТКЛОНЕНО</b> ${adminLink}`;
    
    await ctx.editMessageCaption(finalText, { parse_mode: 'HTML' }).catch(() => 
        ctx.editMessageText(finalText, { parse_mode: 'HTML' })
    );

    await ctx.telegram.sendMessage(request.partner_id, 
        `❌ <b>Запрос отклонен.</b>\n\nЗапрос <code>${request.name}</code> отклонен администратором.`, 
        { parse_mode: 'HTML' }
    );
}

async function handleAdminEditInput(ctx, adminId, text) {
    const session = adminEditSessions.get(adminId);
    if (!session) return;

    try {
        const parts = text.split('|').map(p => p.trim());
        if (parts.length !== 5) {
            await ctx.reply('❌ Формат: <code>Название | Тип | Сумма | Аудитория | Шаблон</code>', { parse_mode: 'HTML' });
            return;
        }

        const [name, prizeType, amountStr, audience, template] = parts;
        const amount = parseInt(amountStr, 10);

        if (!PRIZE_TYPES.find(p => p.id === prizeType)) return ctx.reply('❌ Неверный тип.');
        if (isNaN(amount) || amount <= 0) return ctx.reply('❌ Неверная сумма.');
        if (!['all', 'referrals'].includes(audience)) return ctx.reply('❌ Неверная аудитория.');
        if (!['fat', 'normal'].includes(template)) return ctx.reply('❌ Неверный шаблон.');

        const request = getPartnerRequestById(session.requestId);
        const newData = { ...request, name, prize_type: prizeType, prize_amount: amount, audience_type: audience, template };

        await approveRequest(ctx, request, adminId, newData);
        adminEditSessions.delete(adminId);
    } catch (e) {
        console.error('[PARTNER] Ошибка парсинга:', e);
        await ctx.reply('❌ Ошибка обработки.');
    }
}

module.exports = {
    isPartner,
    showPartnerMenu,
    handlePartnerMessage,
    handlePartnerCallback,
    handleAdminRequestCallback
};