const { Markup } = require('telegraf');
const { 
  getUserStatuses, 
  getUserById,
  getPromoByName,
  getPartnerRequestsStats,
  createPartnerRequest,
  createPartnerCurrencyRequest,
  updatePartnerRequestAdminMessageId,
  updatePartnerRequestStatus,
  getPartnerRequestsByPartner,
  getPartnerRequestByPartnerAndName,
  getPartnerRequestById,
  createPartnerPromo,
  getUserStatusIds,
  getPendingPartnerRequests,
  getFinishedPartnerRequests,
} = require('./db');

let generatePromoImage = null;
try {
  generatePromoImage = require('./generatePromoImage').generatePromoImage;
} catch (e) {
  console.warn('[PARTNER] generatePromoImage не найдена.');
}

const PARTNER_ADMIN_CHAT_ID = '-1004397248092';
const ALLOWED_ADMIN_STATUS_IDS = [2, 9, 8]; // 2=Тех администратор, 9=Главный админ, 8=Руководитель партнёрки

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

const CURRENCY_STEP_TYPE = 0;
const CURRENCY_STEP_AMOUNT = 1;
const CURRENCY_STEP_SUMMARY = 2;

// ========== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ==========
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

function chunkText(text, limit = 3800) {
    const parts = [];
    let current = '';
    for (const line of text.split('\n')) {
        if ((current + line + '\n').length > limit && current) {
            parts.push(current);
            current = '';
        }
        current += line + '\n';
    }
    if (current.trim()) parts.push(current);
    return parts;
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

// ========== КЛАВИАТУРЫ ПАРТНЁРА ==========
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

// Кнопки валюты: префикс partner_, чтобы попадать под роут /^partner_.*/ в bot.js
const currencyTypeKeyboard = Markup.inlineKeyboard([
    [Markup.button.callback('💰 PF', 'partner_curtype_balance')],
    [Markup.button.callback('💎 DF', 'partner_curtype_df_balance')],
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
        row.map(val => Markup.button.callback(val, `partner_curquick_${val}`))
    );
    keyboardRows.push([Markup.button.callback('❌ Отмена', 'partner_cancel_req')]);
    return Markup.inlineKeyboard(keyboardRows);
}

// ========== ПРОВЕРКИ ==========
async function isPartner(userId) {
    const statuses = await getUserStatuses(userId);
    return statuses.some(s => s.toLowerCase() === 'партнёр' || s.toLowerCase() === 'partner');
}

async function hasPartnerAdminRights(userId) {
    try {
        const ids = getUserStatusIds(userId);
        const hasRights = ids.some(id => ALLOWED_ADMIN_STATUS_IDS.includes(id));
        console.log(`[PARTNER AUTH] User: ${userId} | StatusIDs: ${JSON.stringify(ids)} | AllowedIDs: ${JSON.stringify(ALLOWED_ADMIN_STATUS_IDS)} | Result: ${hasRights}`);
        return hasRights;
    } catch (e) {
        console.error('[PARTNER AUTH] Error checking rights:', e);
        return false;
    }
}

// ========== ТЕКСТ КАРТОЧКИ ЗАПРОСА ==========
function composeRequestCardText(d, withStats = true) {
    const user = getUserById(d.partner_id);
    const userLink = createUserLink(d.partner_id, user?.username || 'Неизвестный');
    const idLabel = d.id ? ` #${d.id}` : '';
    const isCurrency = d.request_type === 'currency';
    let t;
    if (isCurrency) {
        const currencyName = d.prize_type === 'balance' ? 'PF' : 'DF';
        t = `💰 <b>Запрос на ВАЛЮТУ</b>${idLabel}\n\n` +
            `👤 Партнер: ${userLink}\n` +
            `🆔 Numeric ID: <code>${user?.numeric_id || '—'}</code>\n` +
            `💵 Валюта: <b>${currencyName}</b>\n` +
            `💎 Сумма: <b>${(d.prize_amount || 0).toLocaleString('ru-RU')} ${currencyName}</b>\n`;
    } else {
        const prizeName = PRIZE_TYPES.find(p => p.id === d.prize_type)?.name || d.prize_type;
        const audText = d.audience_type === 'all' ? '🌍 Для всех' : '👥 Только рефералы';
        const templateText = d.template === 'fat' ? '🥶 Жирный' : '🍬 Обычный';
        t = `📩 <b>Запрос на ПРОМОКОД</b>${idLabel}\n\n` +
            `👤 Партнер: ${userLink}\n` +
            `🆔 Numeric ID: <code>${user?.numeric_id || '—'}</code>\n` +
            `🏷 Название: <code>${d.name}</code>\n` +
            `🎁 Приз: ${(d.prize_amount || 0).toLocaleString('ru-RU')} ${prizeName}\n` +
            `🎯 Аудитория: ${audText}\n` +
            `🎨 Шаблон: ${templateText}\n`;
    }
    if (withStats) {
        const s = getPartnerRequestsStats(d.partner_id, 24);
        const currentPF = (user?.balance || 0).toLocaleString('ru-RU');
        const currentDF = (user?.df_balance || 0).toLocaleString('ru-RU');
        
        t += `\n💼 <b>Текущие балансы партнёра:</b>\n` +
             `   💰 PF: <b>${currentPF}</b>\n` +
             `   💎 DF: <b>${currentDF}</b>\n\n`;
             
        t += `📊 <b>Статистика за 24ч:</b>\n` +
             `   • Всего запросов: ${s.total}\n` +
             `   • Одобрено: ${s.approved}\n` +
             `   • На рассмотрении: ${s.pending}\n` +
             `   • Выдано PF: <b>${s.sum_pf.toLocaleString('ru-RU')}</b>\n` +
             `   • Выдано DF: <b>${s.sum_df.toLocaleString('ru-RU')}</b>`;
    }
    return t;
}

function getRequestCardKeyboard(request) {
    const id = request.id;
    return Markup.inlineKeyboard([
        [Markup.button.callback('✅ Принять', `adminid_accept_${id}`)],
        [Markup.button.callback('❌ Отклонить', `adminid_reject_${id}`)],
        [Markup.button.callback('✏️ Редактировать', `adminid_edit_${id}`)]
    ]);
}

// ========== МЕНЮ ПАРТНЁРА ==========
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
        const pending = requests.filter(r => r.status === 'pending');
        const completed = requests.filter(r => r.status !== 'pending');
        
        const formatRequest = (req) => {
            const prizeName = PRIZE_TYPES.find(p => p.id === req.prize_type)?.name || req.prize_type;
            const isCurrency = req.request_type === 'currency';
            const typeLabel = isCurrency ? '💰 Валюта' : '🎁 Промо';
            
            let statusIcon = '⏳';
            let statusText = 'На рассмотрении';
            if (req.status === 'approved') { statusIcon = '✅'; statusText = 'Одобрено'; }
            if (req.status === 'rejected') { statusIcon = '❌'; statusText = 'Отклонено'; }
            
            const amount = (req.prize_amount || 0).toLocaleString('ru-RU');
            const date = new Date((req.created_at || 0) * 1000).toLocaleDateString('ru-RU');
            
            return `${statusIcon} <b>${typeLabel}</b> | <code>${req.name}</code>\n` +
                   `   🎁 ${amount} ${prizeName} | 📅 ${date}\n` +
                   `   📊 ${statusText}\n`;
        };
        
        if (pending.length > 0) {
            text += '🟡 <b>На рассмотрении:</b>\n';
            for (let i = 0; i < pending.length; i++) {
                text += formatRequest(pending[i]) + '\n';
            }
        }
        
        if (completed.length > 0) {
            text += '\n⚪ <b>Завершенные:</b>\n';
            for (let i = 0; i < completed.length; i++) {
                text += formatRequest(completed[i]) + '\n';
            }
        }
        
        const parts = chunkText(text);
        for (let i = 0; i < parts.length; i++) {
            const kb = i === parts.length - 1 
                ? Markup.inlineKeyboard([[Markup.button.callback('⬅️ Назад', 'partner_back_to_menu')]])
                : {};
            if (i === 0) {
                await safeEditOrReply(ctx, parts[i], { parse_mode: 'HTML', ...kb });
            } else {
                await ctx.reply(parts[i], { parse_mode: 'HTML', ...kb });
            }
        }
    } catch (e) {
        console.error('[PARTNER] Ошибка показа запросов:', e);
        await ctx.reply('❌ Ошибка при загрузке списка запросов.');
    }
}

// ========== СОЗДАНИЕ ЗАПРОСА НА ПРОМО ==========
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
        `🎁 <b>Приз:</b> ${(d.prize_amount || 0).toLocaleString('ru-RU')} ${prizeName}\n` +
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
        `💵 <b>Валюта:</b> ${currencyName}\n` +
        `💎 <b>Сумма:</b> ${(d.prize_amount || 0).toLocaleString('ru-RU')} ${currencyName}\n\n` +
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

    const adminSession = adminEditSessions.get(userId);
    if (adminSession && adminSession.editField) {
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
                    await ctx.reply(`✅ Название <b>${escapeHtml(text)}</b> принято.\n\nШаг 2/5: Выберите <b>тип приза</b>:`, {
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

// ========== ОБРАБОТКА КНОПОК ПАРТНЁРА ==========
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
    
    else if (session.type === 'currency') {
        if (data.startsWith('partner_curtype_')) {
            const currencyType = data.replace('partner_curtype_', '');
            if (!['balance', 'df_balance'].includes(currencyType)) return;
            session.data.prize_type = currencyType;
            session.step = CURRENCY_STEP_AMOUNT;
            const currencyName = currencyType === 'balance' ? 'PF' : 'DF';
            await safeEditOrReply(ctx, `✅ Валюта: <b>${currencyName}</b>.\n\nШаг 2/2: Введите <b>сумму</b> (или выберите кнопкой):`, {
                parse_mode: 'HTML', ...getCurrencyAmountKeyboard(currencyType)
            });
            return;
        }

        if (data.startsWith('partner_curquick_')) {
            const val = parseInt(data.replace('partner_curquick_', ''), 10);
            session.data.prize_type = session.data.prize_type || 'balance';
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
        const requestId = createPartnerRequest(data.partner_id, data.name, data.prize_type, data.prize_amount, data.audience_type, data.template);
        const cardData = { ...data, id: requestId };
        const msgText = composeRequestCardText(cardData, true);
        const kb = getRequestCardKeyboard({ id: requestId });
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
        await safeEditOrReply(ctx, `✅ Запрос отправлен администраторам! Номер запроса: <b>#${requestId}</b>`, { parse_mode: 'HTML' });
    } catch (e) {
        console.error('[PARTNER] Ошибка отправки:', e);
        await safeEditOrReply(ctx, '❌ Ошибка при отправке.', { parse_mode: 'HTML' });
    }
}

// ========== ОТПРАВКА АДМИНАМ (ВАЛЮТА) ==========
async function submitCurrencyRequestToAdmins(ctx, data) {
    try {
        const requestId = createPartnerCurrencyRequest(data.partner_id, data.name, data.prize_type, data.prize_amount);
        const cardData = { ...data, id: requestId, request_type: 'currency' };
        const msgText = composeRequestCardText(cardData, true);
        const kb = getRequestCardKeyboard({ id: requestId });

        const sentMsg = await ctx.telegram.sendMessage(PARTNER_ADMIN_CHAT_ID, msgText, { parse_mode: 'HTML', ...kb });
        updatePartnerRequestAdminMessageId(requestId, sentMsg.message_id);
        
        await safeEditOrReply(ctx, `✅ Запрос на валюту отправлен! Номер запроса: <b>#${requestId}</b>`, { parse_mode: 'HTML' });
    } catch (e) {
        console.error('[PARTNER] Ошибка отправки валюты:', e);
        await safeEditOrReply(ctx, '❌ Ошибка при отправке.', { parse_mode: 'HTML' });
    }
}

// ========== АДМИН: МЕНЮ ЗАПРОСОВ ==========
async function showAdminRequestsMenu(ctx) {
    const userId = ctx.from.id.toString();
    if (!(await hasPartnerAdminRights(userId))) {
        return ctx.reply('❌ Недостаточно прав. Команда доступна: Тех администратор, Главный админ, Руководитель партнёрки.');
    }
    const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('🟡 Активные запросы', 'adminreqs_active')],
        [Markup.button.callback('⚪ Старые запросы (последние 20)', 'adminreqs_old')]
    ]);
    await safeEditOrReply(ctx, '📋 <b>Запросы партнёров</b>\n\nВыберите раздел:', { parse_mode: 'HTML', ...keyboard });
}

async function showActiveRequests(ctx) {
    try {
        const requests = getPendingPartnerRequests();
        if (!requests || requests.length === 0) {
            return safeEditOrReply(ctx, '🟡 <b>Активные запросы</b>\n\nНет активных запросов.', { 
                parse_mode: 'HTML',
                ...Markup.inlineKeyboard([[Markup.button.callback('⬅️ Назад к меню', 'adminreqs_menu')]])
            });
        }
        let text = `🟡 <b>Активные запросы (${requests.length}):</b>\n\n`;
        for (const r of requests) {
            const isCurrency = r.request_type === 'currency';
            const prizeName = PRIZE_TYPES.find(p => p.id === r.prize_type)?.name || r.prize_type;
            const user = getUserById(r.partner_id);
            text += `#${r.id} | ${isCurrency ? '💰 Валюта' : '🎁 Промо'} | <code>${r.name}</code>\n` +
                    `   👤 ${user?.username || r.partner_id} | 🎁 ${(r.prize_amount || 0).toLocaleString('ru-RU')} ${prizeName}\n` +
                    `   📅 ${new Date((r.created_at || 0) * 1000).toLocaleDateString('ru-RU')}\n` +
                    `   ➡️ Откройте карточку: <code>запрос ${r.id}</code>\n\n`;
        }
        const parts = chunkText(text);
        for (let i = 0; i < parts.length; i++) {
            const kb = i === parts.length - 1 
                ? Markup.inlineKeyboard([[Markup.button.callback('⬅️ Назад к меню', 'adminreqs_menu')]])
                : {};
            if (i === 0) await safeEditOrReply(ctx, parts[i], { parse_mode: 'HTML', ...kb });
            else await ctx.reply(parts[i], { parse_mode: 'HTML', ...kb });
        }
    } catch (e) {
        console.error('[PARTNER] Ошибка списка активных:', e);
        await ctx.reply('❌ Ошибка загрузки активных запросов.');
    }
}

async function showOldRequests(ctx) {
    try {
        const requests = getFinishedPartnerRequests(20);
        if (!requests || requests.length === 0) {
            return safeEditOrReply(ctx, '⚪ <b>Старые запросы</b>\n\nЗавершенных запросов пока нет.', { 
                parse_mode: 'HTML',
                ...Markup.inlineKeyboard([[Markup.button.callback('⬅️ Назад к меню', 'adminreqs_menu')]])
            });
        }
        let text = `⚪ <b>Старые запросы (последние 20):</b>\n\n`;
        for (const r of requests) {
            const isCurrency = r.request_type === 'currency';
            const prizeName = PRIZE_TYPES.find(p => p.id === r.prize_type)?.name || r.prize_type;
            const icon = r.status === 'approved' ? '✅' : '❌';
            const typeLabel = isCurrency ? '💰 Валюта' : '🎁 Промо';
            const namePart = isCurrency ? '' : ` | <code>${r.name}</code>`;
            text += `${icon} #${r.id} | ${typeLabel}${namePart} | ${(r.prize_amount || 0).toLocaleString('ru-RU')} ${prizeName} | 📅 ${new Date((r.created_at || 0) * 1000).toLocaleDateString('ru-RU')}\n`;
        }
        const parts = chunkText(text);
        for (let i = 0; i < parts.length; i++) {
            const kb = i === parts.length - 1 
                ? Markup.inlineKeyboard([[Markup.button.callback('⬅️ Назад к меню', 'adminreqs_menu')]])
                : {};
            if (i === 0) await safeEditOrReply(ctx, parts[i], { parse_mode: 'HTML', ...kb });
            else await ctx.reply(parts[i], { parse_mode: 'HTML', ...kb });
        }
    } catch (e) {
        console.error('[PARTNER] Ошибка списка старых:', e);
        await ctx.reply('❌ Ошибка загрузки старых запросов.');
    }
}

// ========== АДМИН: КАРТОЧКА ПО ID ==========
async function openAdminRequestById(ctx, idStr) {
    const userId = ctx.from.id.toString();
    if (!(await hasPartnerAdminRights(userId))) {
        return ctx.reply('❌ Недостаточно прав.');
    }
    const id = parseInt(idStr, 10);
    if (isNaN(id)) {
        return ctx.reply('❌ Укажите ID запроса числом. Пример: <code>запрос 12</code>', { parse_mode: 'HTML' });
    }
    const request = getPartnerRequestById(id);
    if (!request) {
        return ctx.reply(`❌ Запрос #${id} не найден.`);
    }
    const text = composeRequestCardText(request, true);
    if (request.status !== 'pending') {
        const statusText = request.status === 'approved' ? '✅ Одобрено' : '❌ Отклонено';
        return ctx.reply(text + `\n\n📊 Статус: <b>${statusText}</b>`, { parse_mode: 'HTML' });
    }
    const kb = getRequestCardKeyboard(request);
    if (request.request_type !== 'currency') {
        const photoPath = await generatePartnerPromoImage(request);
        if (photoPath) {
            try {
                await ctx.replyWithPhoto({ source: photoPath }, { caption: text, parse_mode: 'HTML', ...kb });
                return;
            } catch (e) { /* упадёт в текстовый вариант */ }
        }
    }
    await ctx.reply(text, { parse_mode: 'HTML', ...kb });
}

// ========== АДМИН: ОБРАБОТЧИК ВСЕХ АДМИН-КНОПОК ==========
async function handleAdminRequestCallback(ctx) {
    const userId = ctx.from.id.toString();
    const data = ctx.callbackQuery.data;
    console.log(`[PARTNER ADMIN] Нажата кнопка: ${data} пользователем: ${userId}`);

    const hasRights = await hasPartnerAdminRights(userId);
    if (!hasRights) {
        console.warn(`[PARTNER ADMIN] ОТКАЗ в доступе пользователю ${userId}. Кнопка: ${data}`);
        await ctx.answerCbQuery('❌ Недостаточно прав.', { show_alert: true });
        return;
    }
    await ctx.answerCbQuery();

    try {
        if (data === 'adminreqs_active') { await showActiveRequests(ctx); return; }
        if (data === 'adminreqs_old') { await showOldRequests(ctx); return; }
        if (data === 'adminreqs_menu') { await showAdminRequestsMenu(ctx); return; }

        if (data.startsWith('adminedit_')) { await handleAdminEditCallback(ctx, userId, data); return; }

        let request = null;
        let action = null;

        const mId = data.match(/^adminid_(accept|reject|edit)_(\d+)$/);
        if (mId) {
            action = mId[1];
            request = getPartnerRequestById(parseInt(mId[2], 10));
        } else {
            // Старый формат кнопок (сообщения, уже висящие в чате)
            const mOld = data.match(/^admin_(req|curr)_(accept|reject|edit)_([^_]+)_(.+)$/);
            if (mOld) {
                action = mOld[2];
                request = getPartnerRequestByPartnerAndName(mOld[3], mOld[4], 'pending');
            }
        }

        if (!request) {
            await safeEditOrReply(ctx, '⚠️ <b>Запрос уже обработан или не найден.</b>', { parse_mode: 'HTML' });
            return;
        }
        if (request.status !== 'pending') {
            await safeEditOrReply(ctx, '⚠️ <b>Запрос уже обработан.</b>', { parse_mode: 'HTML' });
            return;
        }

        if (action === 'accept') {
            if (request.request_type === 'currency') await approveCurrencyRequest(ctx, request, ctx.from.id);
            else await approveRequest(ctx, request, ctx.from.id);
        } else if (action === 'reject') {
            await rejectRequest(ctx, request, ctx.from.id);
        } else if (action === 'edit') {
            await startAdminEdit(ctx, userId, request);
        }
    } catch (e) {
        console.error('[PARTNER ADMIN] Critical Error in callback:', e);
        await ctx.reply('❌ Критическая ошибка обработки.');
    }
}

// ========== АДМИН: ПОШАГОВОЕ РЕДАКТИРОВАНИЕ ==========
async function startAdminEdit(ctx, userId, request) {
    if (ctx.callbackQuery) await ctx.deleteMessage().catch(() => {});
    adminEditSessions.set(userId, {
        requestId: request.id,
        editField: null,
        menuMessageId: null,
        data: {
            name: request.name,
            prize_type: request.prize_type,
            prize_amount: request.prize_amount,
            audience_type: request.audience_type,
            template: request.template
        }
    });
    await showAdminEditMenu(ctx, userId, adminEditSessions.get(userId));
}

async function showAdminEditMenu(ctx, userId, session) {
    const base = getPartnerRequestById(session.requestId) || {};
    const d = { ...base, ...session.data };
    const isCurrency = d.request_type === 'currency';
    let text;
    let kb;
    if (isCurrency) {
        const currencyName = d.prize_type === 'balance' ? 'PF' : 'DF';
        text = `✏️ <b>Редактирование запроса #${d.id}</b>\n\n💵 Валюта: <b>${currencyName}</b>\n💎 Сумма: <b>${(d.prize_amount || 0).toLocaleString('ru-RU')}</b>\n\nВыберите поле или сохраните:`;
        kb = Markup.inlineKeyboard([
            [Markup.button.callback('✏️ Сумма', 'adminedit_amount'), Markup.button.callback('✏️ Валюта', 'adminedit_curtype')],
            [Markup.button.callback('✅ Сохранить и одобрить', 'adminedit_save')],
            [Markup.button.callback('❌ Отмена', 'adminedit_cancel')]
        ]);
    } else {
        const prizeName = PRIZE_TYPES.find(p => p.id === d.prize_type)?.name || d.prize_type;
        const audText = d.audience_type === 'all' ? '🌍 Для всех' : '👥 Только рефералы';
        const tplText = d.template === 'fat' ? '🥶 Жирный' : '🍬 Обычный';
        text = `✏️ <b>Редактирование запроса #${d.id}</b>\n\n🏷 Название: <code>${d.name}</code>\n🎁 Приз: ${(d.prize_amount || 0).toLocaleString('ru-RU')} ${prizeName}\n🎯 Аудитория: ${audText}\n🎨 Шаблон: ${tplText}\n\nВыберите поле или сохраните:`;
        kb = Markup.inlineKeyboard([
            [Markup.button.callback('✏️ Название', 'adminedit_name'), Markup.button.callback('✏️ Тип приза', 'adminedit_ptype')],
            [Markup.button.callback('✏️ Сумма', 'adminedit_amount'), Markup.button.callback('✏️ Аудитория', 'adminedit_aud')],
            [Markup.button.callback('✏️ Шаблон', 'adminedit_tpl')],
            [Markup.button.callback('✅ Сохранить и одобрить', 'adminedit_save')],
            [Markup.button.callback('❌ Отмена', 'adminedit_cancel')]
        ]);
    }
    try {
        if (session.menuMessageId) {
            await ctx.telegram.editMessageText(ctx.chat.id, session.menuMessageId, undefined, text, { parse_mode: 'HTML', ...kb });
        } else {
            const msg = await ctx.reply(text, { parse_mode: 'HTML', ...kb });
            session.menuMessageId = msg.message_id;
        }
    } catch (e) {
        const msg = await ctx.reply(text, { parse_mode: 'HTML', ...kb });
        session.menuMessageId = msg.message_id;
    }
}

async function handleAdminEditCallback(ctx, userId, data) {
    const session = adminEditSessions.get(userId);
    if (!session) {
        await safeEditOrReply(ctx, '❌ Сессия редактирования не найдена. Начните заново с кнопки «Редактировать».', { parse_mode: 'HTML' });
        return;
    }

    if (data === 'adminedit_cancel') {
        adminEditSessions.delete(userId);
        await safeEditOrReply(ctx, '❌ Редактирование отменено.', { parse_mode: 'HTML' });
        return;
    }

    if (data === 'adminedit_save') {
        const request = getPartnerRequestById(session.requestId);
        if (!request || request.status !== 'pending') {
            adminEditSessions.delete(userId);
            await safeEditOrReply(ctx, '⚠️ Запрос уже обработан.', { parse_mode: 'HTML' });
            return;
        }
        const edited = { ...request, ...session.data };
        adminEditSessions.delete(userId);
        if (request.request_type === 'currency') await approveCurrencyRequest(ctx, request, ctx.from.id, edited);
        else await approveRequest(ctx, request, ctx.from.id, edited);
        return;
    }

    if (data === 'adminedit_name') {
        session.editField = 'name';
        await ctx.reply('✍️ Отправьте новое <b>название</b> промокода:', { parse_mode: 'HTML' });
        return;
    }
    if (data === 'adminedit_amount') {
        session.editField = 'amount';
        await ctx.reply('✍️ Отправьте новую <b>сумму</b> (число):', { parse_mode: 'HTML' });
        return;
    }
    if (data === 'adminedit_ptype') {
        const kb = Markup.inlineKeyboard([
            [Markup.button.callback('📦 GOLD-контейнер', 'adminedit_pt_container_type_3')],
            [Markup.button.callback('💰 PF', 'adminedit_pt_balance'), Markup.button.callback('💎 DF', 'adminedit_pt_df_balance')],
            [Markup.button.callback('🎫 Билетики', 'adminedit_pt_tickets')],
            [Markup.button.callback('⬅️ Назад', 'adminedit_back')]
        ]);
        await safeEditOrReply(ctx, '✏️ Выберите новый <b>тип приза</b>:', { parse_mode: 'HTML', ...kb });
        return;
    }
    if (data === 'adminedit_aud') {
        const kb = Markup.inlineKeyboard([
            [Markup.button.callback('🌍 Для всех игроков', 'adminedit_aud_all')],
            [Markup.button.callback('👥 Только рефералы партнёра', 'adminedit_aud_refs')],
            [Markup.button.callback('⬅️ Назад', 'adminedit_back')]
        ]);
        await safeEditOrReply(ctx, '✏️ Выберите новую <b>аудиторию</b>:', { parse_mode: 'HTML', ...kb });
        return;
    }
    if (data === 'adminedit_tpl') {
        const kb = Markup.inlineKeyboard([
            [Markup.button.callback('🥶 Жирный', 'adminedit_tpl_fat')],
            [Markup.button.callback('🍬 Обычный', 'adminedit_tpl_normal')],
            [Markup.button.callback('⬅️ Назад', 'adminedit_back')]
        ]);
        await safeEditOrReply(ctx, '✏️ Выберите новый <b>шаблон</b>:', { parse_mode: 'HTML', ...kb });
        return;
    }
    if (data === 'adminedit_curtype') {
        const kb = Markup.inlineKeyboard([
            [Markup.button.callback('💰 PF', 'adminedit_cur_balance')],
            [Markup.button.callback('💎 DF', 'adminedit_cur_df_balance')],
            [Markup.button.callback('⬅️ Назад', 'adminedit_back')]
        ]);
        await safeEditOrReply(ctx, '✏️ Выберите новую <b>валюту</b>:', { parse_mode: 'HTML', ...kb });
        return;
    }
    if (data === 'adminedit_back') { await showAdminEditMenu(ctx, userId, session); return; }

    if (data.startsWith('adminedit_pt_')) { session.data.prize_type = data.replace('adminedit_pt_', ''); await showAdminEditMenu(ctx, userId, session); return; }
    if (data === 'adminedit_aud_all') { session.data.audience_type = 'all'; await showAdminEditMenu(ctx, userId, session); return; }
    if (data === 'adminedit_aud_refs') { session.data.audience_type = 'referrals'; await showAdminEditMenu(ctx, userId, session); return; }
    if (data === 'adminedit_tpl_fat') { session.data.template = 'fat'; await showAdminEditMenu(ctx, userId, session); return; }
    if (data === 'adminedit_tpl_normal') { session.data.template = 'normal'; await showAdminEditMenu(ctx, userId, session); return; }
    if (data === 'adminedit_cur_balance') { session.data.prize_type = 'balance'; await showAdminEditMenu(ctx, userId, session); return; }
    if (data === 'adminedit_cur_df_balance') { session.data.prize_type = 'df_balance'; await showAdminEditMenu(ctx, userId, session); return; }
}

async function handleAdminEditInput(ctx, adminId, text) {
    const session = adminEditSessions.get(adminId);
    if (!session || !session.editField) return;
    try {
        if (session.editField === 'name') {
            const existing = await getPromoByName(text);
            if (existing) {
                await ctx.reply('❌ Промокод с таким названием уже существует. Отправьте другое:');
                return;
            }
            session.data.name = text;
            session.editField = null;
            await showAdminEditMenu(ctx, adminId, session);
        } else if (session.editField === 'amount') {
            const val = parseInt(text.replace(/\s/g, ''), 10);
            if (isNaN(val) || val <= 0) {
                await ctx.reply('❌ Некорректная сумма. Отправьте число больше 0:');
                return;
            }
            session.data.prize_amount = val;
            session.editField = null;
            await showAdminEditMenu(ctx, adminId, session);
        }
    } catch (e) {
        console.error('[PARTNER] Ошибка админ-ввода:', e);
        await ctx.reply('❌ Ошибка обработки ввода.');
    }
}

// ========== ОДОБРЕНИЕ / ОТКЛОНЕНИЕ ==========
async function updateAdminMessageFinal(ctx, request, suffix) {
    if (!request.admin_message_id) return;
    const text = composeRequestCardText(request, false) + '\n\n' + suffix;
    const opts = { parse_mode: 'HTML', reply_markup: { inline_keyboard: [] } };
    try {
        await ctx.telegram.editMessageCaption(PARTNER_ADMIN_CHAT_ID, request.admin_message_id, undefined, text, opts);
    } catch (e1) {
        try {
            await ctx.telegram.editMessageText(PARTNER_ADMIN_CHAT_ID, request.admin_message_id, undefined, text, opts);
        } catch (e2) {
            console.warn('[PARTNER] Не удалось обновить сообщение запроса в админ-чате:', e2.message);
        }
    }
}

async function approveRequest(ctx, request, adminId, customData = null) {
    const data = customData || request;
    try {
        const result = createPartnerPromo(
            data.name, -1, data.prize_type, data.prize_amount,
            'partner_system', 0, null, request.partner_id, data.audience_type || 'all', data.template || 'normal'
        );
        if (!result.success) throw new Error(result.message || 'Ошибка создания промо');

        updatePartnerRequestStatus(request.id, 'approved');

        const adminLink = createUserLink(adminId, ctx.from.username || 'Админ');
        await updateAdminMessageFinal(ctx, request, `✅ <b>ОДОБРЕНО</b> администратором ${adminLink}`);
        await safeEditOrReply(ctx, `✅ Запрос #${request.id} одобрен. Промокод <code>${data.name}</code> создан.`, { parse_mode: 'HTML' });

        const prizeName = PRIZE_TYPES.find(p => p.id === data.prize_type)?.name || data.prize_type;
        const audText = (data.audience_type || 'all') === 'all' ? 'Для всех' : 'Только рефералы';
        await ctx.telegram.sendMessage(request.partner_id,
            `🎉 <b>Запрос одобрен!</b>\n\nПромокод <code>${data.name}</code> (${(data.prize_amount || 0).toLocaleString('ru-RU')} ${prizeName}, ${audText}) создан.`,
            { parse_mode: 'HTML' });
    } catch (e) {
        console.error('[PARTNER] Ошибка одобрения:', e);
        await ctx.reply('❌ Ошибка создания промокода: ' + (e.message || ''));
    }
}

async function approveCurrencyRequest(ctx, request, adminId, customData = null) {
    const data = customData || request;
    try {
        const { updateUserBalance, updateUserDFBalance } = require('./db');
        const amount = data.prize_amount || 0;
        if (data.prize_type === 'balance') {
            updateUserBalance(request.partner_id, amount);
        } else {
            updateUserDFBalance(request.partner_id, amount);
        }

        updatePartnerRequestStatus(request.id, 'approved');

        const currencyName = data.prize_type === 'balance' ? 'PF' : 'DF';
        const adminLink = createUserLink(adminId, ctx.from.username || 'Админ');
        await updateAdminMessageFinal(ctx, request, `✅ <b>ОДОБРЕНО</b> администратором ${adminLink}\n💰 Начислено: ${amount.toLocaleString('ru-RU')} ${currencyName}`);
        await safeEditOrReply(ctx, `✅ Запрос #${request.id} одобрен. Начислено: ${amount.toLocaleString('ru-RU')} ${currencyName}.`, { parse_mode: 'HTML' });

        await ctx.telegram.sendMessage(request.partner_id,
            `🎉 <b>Запрос на валюту одобрен!</b>\n\n💰 Начислено: ${amount.toLocaleString('ru-RU')} ${currencyName}`,
            { parse_mode: 'HTML' });
    } catch (e) {
        console.error('[PARTNER] Ошибка одобрения валюты:', e);
        await ctx.reply('❌ Ошибка начисления валюты.');
    }
}

async function rejectRequest(ctx, request, adminId) {
    updatePartnerRequestStatus(request.id, 'rejected');
    const adminLink = createUserLink(adminId, ctx.from.username || 'Админ');
    await updateAdminMessageFinal(ctx, request, `❌ <b>ОТКЛОНЕНО</b> администратором ${adminLink}`);
    await safeEditOrReply(ctx, `❌ Запрос #${request.id} отклонен.`, { parse_mode: 'HTML' });

    await ctx.telegram.sendMessage(request.partner_id,
        `❌ <b>Запрос отклонен.</b>\n\nЗапрос <code>${request.name}</code> отклонен администратором.`,
        { parse_mode: 'HTML' });
}

module.exports = {
    isPartner,
    showPartnerMenu,
    handlePartnerMessage,
    handlePartnerCallback,
    handleAdminRequestCallback,
    showAdminRequestsMenu,
    openAdminRequestById
};