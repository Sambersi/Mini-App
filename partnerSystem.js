const { Markup } = require('telegraf');
const { 
  getUserStatuses, 
  getPromoByName,
  getUserMaxPriority,
  createPartnerRequest,
  updatePartnerRequestAdminMessageId,
  updatePartnerRequestStatus,
  getPartnerRequestsByPartner,
  getPartnerRequestByPartnerAndName,
  getPartnerRequestById,
  createPartnerPromo
} = require('./db');

// Пытаемся импортировать генератор картинок, как это сделано в promoHandler.js
let generatePromoImage = null;
try {
  generatePromoImage = require('./generatePromoImage').generatePromoImage;
} catch (e) {
  console.warn('[PARTNER] generatePromoImage не найдена, предпросмотр будет без картинок.');
}

const PARTNER_ADMIN_CHAT_ID = '-5564485597';
const ALLOWED_ADMIN_PRIORITIES = [10, 9, 8];

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

function escapeHtml(text) {
    if (typeof text !== 'string') return text;
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function createUserLink(userId, username) {
    const displayName = username ? escapeHtml(username) : 'Неизвестный';
    return `<a href="tg://user?id=${userId}">${displayName}</a>`;
}

async function safeEditOrReply(ctx, text, options) {
    try {
        if (ctx.callbackQuery) {
            await ctx.editMessageText(text, options);
        } else {
            await ctx.reply(text, options);
        }
    } catch (e) {
        if (e.description && (e.description.includes('message is not modified') || e.description.includes('there is no text'))) {
            if (ctx.callbackQuery) {
                await ctx.deleteMessage().catch(() => {});
                await ctx.reply(text, options);
            }
        } else {
            await ctx.reply(text, options);
        }
    }
}

async function generatePartnerPromoImage(data) {
    if (!generatePromoImage) return null;
    try {
        // Параметры: name, activations, prize_amount, prize_type, templateHint, isTimeBased, expiresAt
        return await generatePromoImage(data.name, -1, data.prize_amount, data.prize_type, data.template, false, null);
    } catch (e) {
        console.error('[PARTNER] Ошибка генерации картинки:', e);
        return null;
    }
}

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
    const text = `🤝 <b>Панель Партнёра</b>\n\nЗдесь вы можете создать запрос на генерацию эксклюзивного промокода.\n\nВыберите действие:`;
    const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('📝 Создать запрос на промо', 'partner_create_req')],
        [Markup.button.callback('📜 Мои запросы', 'partner_my_reqs')]
    ]);
    await safeEditOrReply(ctx, text, { parse_mode: 'HTML', ...keyboard });
}

async function showMyRequests(ctx, userId) {
    try {
        const requests = getPartnerRequestsByPartner(userId);
        
        if (!requests || requests.length === 0) {
            return safeEditOrReply(ctx, '📭 <b>Мои запросы</b>\n\nУ вас пока нет отправленных запросов на создание промокодов.', {
                parse_mode: 'HTML',
                ...Markup.inlineKeyboard([[Markup.button.callback('⬅️ Назад', 'partner_back_to_menu')]])
            });
        }
        
        let text = '📜 <b>Ваши последние запросы:</b>\n\n';
        for (const req of requests) {
            const prizeName = PRIZE_TYPES.find(p => p.id === req.prize_type)?.name || req.prize_type;
            let statusEmoji = '⏳';
            let statusText = 'На рассмотрении';
            if (req.status === 'approved') { statusEmoji = '✅'; statusText = 'Одобрено'; }
            if (req.status === 'rejected') { statusEmoji = '❌'; statusText = 'Отклонено'; }
            
            text += `${statusEmoji} <code>${req.name}</code>\n`;
            text += `   🎁 ${req.prize_amount.toLocaleString('ru-RU')} ${prizeName}\n`;
            text += `   📊 Статус: <b>${statusText}</b>\n\n`;
        }
        
        await safeEditOrReply(ctx, text, { 
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([[Markup.button.callback('⬅️ Назад', 'partner_back_to_menu')]])
        });
    } catch (e) {
        console.error('[PARTNER] Ошибка показа запросов:', e);
        await ctx.reply('❌ Ошибка при загрузке списка запросов.');
    }
}

async function startPartnerRequest(ctx) {
    const userId = ctx.from.id.toString();
    partnerSessions.set(userId, {
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
    
    const summaryText = `🎉 <b>Проверьте данные запроса:</b>\n\n🏷 <b>Название:</b> <code>${d.name}</code>\n🎁 <b>Приз:</b> ${d.prize_amount.toLocaleString('ru-RU')} ${prizeName}\n🎯 <b>Аудитория:</b> ${audText}\n🎨 <b>Шаблон:</b> ${templateText}\n\nНажмите «Отправить», чтобы передать запрос администраторам, или «Редактировать».`;
    
    const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('✅ Отправить админам', 'partner_submit_req')],
        [Markup.button.callback('✏️ Редактировать', 'partner_edit_menu')],
        [Markup.button.callback('❌ Отмена', 'partner_cancel_req')]
    ]);
    
    const photoPath = await generatePartnerPromoImage(d);
    
    if (photoPath) {
        try {
            if (ctx.callbackQuery) {
                await ctx.deleteMessage().catch(() => {});
            }
            await ctx.replyWithPhoto({ source: photoPath }, {
                caption: summaryText,
                parse_mode: 'HTML',
                ...keyboard
            });
        } catch (e) {
            await safeEditOrReply(ctx, summaryText, { parse_mode: 'HTML', ...keyboard });
        }
    } else {
        await safeEditOrReply(ctx, summaryText, { parse_mode: 'HTML', ...keyboard });
    }
}

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
        if (session.step === STEP_NAME) {
            const existing = await getPromoByName(text);
            if (existing) {
                await ctx.reply('❌ Промокод с таким названием уже существует. Попробуйте другое название.');
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
                await ctx.reply('❌ Некорректная сумма. Введите число больше 0:', { ...getPartnerPrizeAmountKeyboard(session.data.prize_type) });
                return true;
            }
            session.data.prize_amount = val;
            if (session.editField === 'prize_amount') {
                session.editField = null;
                await showPartnerSummary(ctx, session);
            } else {
                session.step = STEP_AUDIENCE;
                await ctx.reply(`✅ Сумма приза: <b>${val.toLocaleString('ru-RU')}</b>.\n\nШаг 4/5: Кто сможет активировать этот промокод?`, {
                    parse_mode: 'HTML', ...partnerAudienceKeyboard
                });
            }
        }
    } catch (e) {
        console.error('[PARTNER] Ошибка в сессии:', e);
        partnerSessions.delete(userId);
        await ctx.reply('Произошла ошибка. Сессия сброшена.');
    }
    return true;
}

async function handlePartnerCallback(ctx) {
    const userId = ctx.from.id.toString();
    const data = ctx.callbackQuery.data;
    await ctx.answerCbQuery();

    if (data === 'partner_create_req') { await startPartnerRequest(ctx); return; }
    if (data === 'partner_my_reqs') { await showMyRequests(ctx, userId); return; }
    if (data === 'partner_back_to_menu') { await showPartnerMenu(ctx); return; }

    const session = partnerSessions.get(userId);
    if (!session) return;

    if (data === 'partner_cancel_req') {
        partnerSessions.delete(userId);
        await ctx.editMessageText('❌ Создание запроса отменено.');
        return;
    }

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
            await safeEditOrReply(ctx, `✍️ Новое <b>название</b> (текущее: <code>${session.data.name}</code>):`, { parse_mode: 'HTML' });
        } else if (field === 'prize_type') {
            session.step = STEP_PRIZE_TYPE;
            await safeEditOrReply(ctx, '✏️ Новый <b>тип приза</b>:', { parse_mode: 'HTML', ...partnerPrizeTypeKeyboard });
        } else if (field === 'prize_amount') {
            session.step = STEP_PRIZE_AMOUNT;
            await safeEditOrReply(ctx, `✍️ Новая <b>сумма</b> (текущая: ${session.data.prize_amount}):`, { parse_mode: 'HTML', ...getPartnerPrizeAmountKeyboard(session.data.prize_type) });
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
            await safeEditOrReply(ctx, `✅ Тип приза: <b>${prizeName}</b>.\n\nШаг 3/5: Введите <b>сумму приза</b> (или выберите кнопкой):`, {
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
            await safeEditOrReply(ctx, `✅ Сумма приза: <b>${val.toLocaleString('ru-RU')}</b>.\n\nШаг 4/5: Кто сможет активировать этот промокод?`, {
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
            await safeEditOrReply(ctx, '🎨 Шаг 5/5: Выберите <b>шаблон промокода</b>:', {
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

async function submitRequestToAdmins(ctx, data) {
    try {
        const prizeName = PRIZE_TYPES.find(p => p.id === data.prize_type)?.name || data.prize_type;
        const audText = data.audience_type === 'all' ? '🌍 Для всех игроков' : '👥 Только для рефералов партнера';
        const templateText = data.template === 'fat' ? '🥶 Жирный' : '🍬 Обычный';
        const userLink = createUserLink(data.partner_id, ctx.from.username || ctx.from.first_name);

        const msgText = `📩 <b>Новый запрос на промокод от Партнёра</b>\n\n` +
            `👤 Партнер: ${userLink}\n` +
            `🏷 Название: <code>${data.name}</code>\n` +
            `🎁 Приз: ${data.prize_amount.toLocaleString('ru-RU')} ${prizeName}\n` +
            `🎯 Аудитория: ${audText}\n` +
            `🎨 Шаблон: ${templateText}\n\n` +
            `ID Партнера: <code>${data.partner_id}</code>`;
            
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

        await safeEditOrReply(ctx, '✅ Ваш запрос успешно отправлен администраторам! Ожидайте решения.', { parse_mode: 'HTML' });
    } catch (e) {
        console.error('[PARTNER] Ошибка отправки в админ чат:', e);
        await safeEditOrReply(ctx, '❌ Ошибка при отправке запроса. Свяжитесь с тех. поддержкой.', { parse_mode: 'HTML' });
    }
}

async function handleAdminRequestCallback(ctx) {
    const userId = ctx.from.id.toString();
    const data = ctx.callbackQuery.data;
    
    if (!(await hasPartnerAdminRights(userId))) {
        await ctx.answerCbQuery('❌ У вас нет прав для этого действия.', { show_alert: true });
        return;
    }
    await ctx.answerCbQuery();

    const parts = data.split('_');
    const action = parts[2]; 
    const partnerId = parts[3];
    const promoName = parts[4];

    const request = getPartnerRequestByPartnerAndName(partnerId, promoName, 'pending');

    if (!request) {
        await ctx.editMessageText(ctx.callbackQuery.message.text + '\n\n⚠️ <b>Запрос уже обработан или не найден.</b>', { parse_mode: 'HTML' });
        return;
    }

    if (action === 'accept') {
        await approveRequest(ctx, request, ctx.from.id);
    } else if (action === 'reject') {
        await rejectRequest(ctx, request, ctx.from.id);
    } else if (action === 'edit') {
        adminEditSessions.set(userId, { requestId: request.id, step: 'AWAITING_EDIT_DATA', originalMsg: ctx.callbackQuery.message });
        await ctx.reply('✏️ <b>Редактирование запроса</b>\n\nОтправьте новые данные одним сообщением в формате:\n<code>Название | ТипПриза | Сумма | Аудитория | Шаблон</code>\n\nПример:\n<code>MY_PROMO | balance | 5000 | referrals | fat</code>\n\nТипы: balance, df_balance, container_type_3, tickets\nАудитория: all, referrals\nШаблон: fat, normal', { parse_mode: 'HTML' });
    }
}

async function approveRequest(ctx, request, adminId, customData = null) {
    const data = customData || request;
    try {
        const result = createPartnerPromo(
            data.name, 
            -1, 
            data.prize_type, 
            data.prize_amount, 
            'partner_system', 
            0, 
            null, 
            data.partner_id, 
            data.audience_type, 
            data.template
        );

        if (!result.success) {
            throw new Error(result.message);
        }

        updatePartnerRequestStatus(request.id, 'approved');
        
        const prizeName = PRIZE_TYPES.find(p => p.id === data.prize_type)?.name || data.prize_type;
        const audText = data.audience_type === 'all' ? 'Для всех' : 'Только для рефералов';
        const adminLink = createUserLink(adminId, ctx.from.username || 'Админ');
        
        const finalText = `${ctx.callbackQuery.message.text}\n\n✅ <b>ОДОБРЕНО</b> администратором ${adminLink}`;
        await ctx.editMessageText(finalText, { parse_mode: 'HTML' });

        await ctx.telegram.sendMessage(data.partner_id, `🎉 <b>Ваш запрос на промокод одобрен!</b>\n\nПромокод <code>${data.name}</code> (${data.prize_amount.toLocaleString('ru-RU')} ${prizeName}, ${audText}) успешно создан и доступен для активации.`, { parse_mode: 'HTML' });
    } catch (e) {
        console.error('[PARTNER] Ошибка одобрения:', e);
        await ctx.reply('❌ Ошибка при создании промокода в БД. Возможно, название уже занято.');
    }
}

async function rejectRequest(ctx, request, adminId) {
    updatePartnerRequestStatus(request.id, 'rejected');
    const adminLink = createUserLink(adminId, ctx.from.username || 'Админ');
    const finalText = `${ctx.callbackQuery.message.text}\n\n❌ <b>ОТКЛОНЕНО</b> администратором ${adminLink}`;
    await ctx.editMessageText(finalText, { parse_mode: 'HTML' });

    await ctx.telegram.sendMessage(request.partner_id, `❌ <b>Ваш запрос на промокод отклонен.</b>\n\nЗапрос на создание <code>${request.name}</code> был отклонен администратором.`, { parse_mode: 'HTML' });
}

async function handleAdminEditInput(ctx, adminId, text) {
    const session = adminEditSessions.get(adminId);
    if (!session || session.step !== 'AWAITING_EDIT_DATA') return;

    try {
        const parts = text.split('|').map(p => p.trim());
        if (parts.length !== 5) {
            await ctx.reply('❌ Неверный формат. Используйте: <code>Название | Тип | Сумма | Аудитория | Шаблон</code>', { parse_mode: 'HTML' });
            return;
        }

        const [name, prizeType, amountStr, audience, template] = parts;
        const amount = parseInt(amountStr, 10);

        if (!PRIZE_TYPES.find(p => p.id === prizeType)) return ctx.reply('❌ Неверный тип приза.');
        if (isNaN(amount) || amount <= 0) return ctx.reply('❌ Неверная сумма.');
        if (!['all', 'referrals'].includes(audience)) return ctx.reply('❌ Неверная аудитория (должно быть all или referrals).');
        if (!['fat', 'normal'].includes(template)) return ctx.reply('❌ Неверный шаблон (должно быть fat или normal).');

        const request = getPartnerRequestById(session.requestId);

        const newData = {
            ...request,
            name: name,
            prize_type: prizeType,
            prize_amount: amount,
            audience_type: audience,
            template: template
        };

        await approveRequest(ctx, request, adminId, newData);
        adminEditSessions.delete(adminId);

    } catch (e) {
        console.error('[PARTNER] Ошибка парсинга редактирования:', e);
        await ctx.reply('❌ Ошибка обработки данных.');
    }
}

module.exports = {
    isPartner,
    showPartnerMenu,
    handlePartnerMessage,
    handlePartnerCallback,
    handleAdminRequestCallback
};