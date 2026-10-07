const { Markup } = require('telegraf');
const { v4: uuidv4 } = require('uuid'); // Если используется, иначе можно Date.now()
const db = require('./db'); // Подключаем вашу БД
const { getUserStatuses, getStatusNameById, createUserLink } = require('./db'); // Функции из вашего db.js

const PARTNER_ADMIN_CHAT_ID = '-5564485597';
const ALLOWED_ADMIN_PRIORITIES = [10, 9, 8]; // Тех админ, Главный админ, Руководитель партнёрки

// Хранилища сессий
const partnerSessions = new Map();
const adminEditSessions = new Map();

const PRIZE_TYPES = [
    { id: 'balance', name: 'PF' },
    { id: 'df_balance', name: 'DF' },
    { id: 'container_type_3', name: 'GOLD-контейнер' },
    { id: 'tickets', name: 'Билетики' }
];

// Проверка, является ли пользователь партнером
async function isPartner(userId) {
    const statuses = await getUserStatuses(userId);
    return statuses.some(s => s.toLowerCase() === 'партнёр' || s.toLowerCase() === 'partner');
}

// Проверка прав администратора для одобрения
async function hasPartnerAdminRights(userId) {
    try {
        const stmt = db.prepare('SELECT priority FROM statuses WHERE id IN (SELECT status_id FROM user_statuses WHERE user_id = ?)');
        const rows = stmt.all(userId.toString());
        return rows.some(row => ALLOWED_ADMIN_PRIORITIES.includes(row.priority));
    } catch (e) {
        console.error('[PARTNER] Ошибка проверки прав админа:', e);
        return false;
    }
}

// Главное меню партнера
async function showPartnerMenu(ctx) {
    const userId = ctx.from.id.toString();
    if (!(await isPartner(userId))) {
        return ctx.reply('❌ У вас нет статуса "Партнёр". Доступ запрещен.');
    }

    const text = `🤝 <b>Панель Партнёра</b>\n\n` +
        `Здесь вы можете создать запрос на генерацию эксклюзивного промокода для ваших рефералов или всех игроков.\n\n` +
        `Выберите действие:`;

    const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('📝 Создать запрос на промо', 'partner_create_req')],
        [Markup.button.callback('📜 Мои запросы', 'partner_my_reqs')],
        [Markup.button.callback('⬅️ Назад в главное меню', 'back_to_main')]
    ]);

    await ctx.reply(text, { parse_mode: 'HTML', ...keyboard });
}

// Начало создания запроса
async function startPartnerRequest(ctx) {
    const userId = ctx.from.id.toString();
    partnerSessions.set(userId, {
        step: 'AWAITING_NAME',
        data: { partner_id: userId }
    });
    await ctx.reply('🏷 <b>Шаг 1/4</b>\nВведите название для промокода (латиница/цифры, без пробелов):', { parse_mode: 'HTML' });
}

// Обработчик текстовых сообщений для сессий партнера и админов
async function handlePartnerMessage(ctx) {
    const userId = ctx.from.id.toString();
    const text = ctx.message.text.trim();

    // Обработка сессии админа (редактирование)
    if (adminEditSessions.has(userId)) {
        await handleAdminEditInput(ctx, userId, text);
        return true;
    }

    // Обработка сессии партнера
    const session = partnerSessions.get(userId);
    if (!session) return false;

    try {
        if (session.step === 'AWAITING_NAME') {
            if (!/^[a-zA-Z0-9_]+$/.test(text)) {
                await ctx.reply('❌ Название должно содержать только латинские буквы, цифры и подчеркивания. Попробуйте снова.');
                return true;
            }
            session.data.name = text;
            session.step = 'AWAITING_PRIZE_TYPE';
            const kb = Markup.inlineKeyboard(PRIZE_TYPES.map(p => [Markup.button.callback(p.name, `partner_prize_${p.id}`)]));
            await ctx.reply('🎁 <b>Шаг 2/4</b>\nВыберите тип приза:', { parse_mode: 'HTML', ...kb });
        } 
        else if (session.step === 'AWAITING_AMOUNT') {
            const amount = parseInt(text, 10);
            if (isNaN(amount) || amount <= 0) {
                await ctx.reply('❌ Введите корректное число больше 0.');
                return true;
            }
            session.data.prize_amount = amount;
            session.step = 'AWAITING_AUDIENCE';
            const kb = Markup.inlineKeyboard([
                [Markup.button.callback('🌍 Для всех игроков', 'partner_aud_all')],
                [Markup.button.callback('👥 Только для моих рефералов', 'partner_aud_refs')]
            ]);
            await ctx.reply('🎯 <b>Шаг 4/4</b>\nКто сможет активировать этот промокод?', { parse_mode: 'HTML', ...kb });
        }
    } catch (e) {
        console.error('[PARTNER] Ошибка в сессии:', e);
        partnerSessions.delete(userId);
        await ctx.reply('Произошла ошибка. Сессия сброшена.');
    }
    return true;
}

// Обработка inline-кнопок партнера
async function handlePartnerCallback(ctx) {
    const userId = ctx.from.id.toString();
    const data = ctx.callbackQuery.data;
    await ctx.answerCbQuery();

    if (data === 'partner_create_req') {
        await startPartnerRequest(ctx);
        return;
    }

    const session = partnerSessions.get(userId);
    if (!session) return;

    if (data.startsWith('partner_prize_')) {
        const prizeType = data.replace('partner_prize_', '');
        session.data.prize_type = prizeType;
        session.step = 'AWAITING_AMOUNT';
        const prizeName = PRIZE_TYPES.find(p => p.id === prizeType)?.name || prizeType;
        await ctx.reply(`💰 <b>Шаг 3/4</b>\nВы выбрали: ${prizeName}.\nВведите количество (число):`, { parse_mode: 'HTML' });
    } 
    else if (data === 'partner_aud_all' || data === 'partner_aud_refs') {
        session.data.audience_type = data === 'partner_aud_all' ? 'all' : 'referrals';
        session.step = 'CONFIRM';
        
        const audText = session.data.audience_type === 'all' ? '🌍 Для всех игроков' : '👥 Только для моих рефералов';
        const prizeName = PRIZE_TYPES.find(p => p.id === session.data.prize_type)?.name || session.data.prize_type;
        
        const summary = `✅ <b>Проверьте данные запроса:</b>\n\n` +
            `🏷 Название: <code>${session.data.name}</code>\n` +
            `🎁 Приз: ${session.data.prize_amount} ${prizeName}\n` +
            `🎯 Аудитория: ${audText}\n\n` +
            `Отправить запрос администраторам?`;
            
        const kb = Markup.inlineKeyboard([
            [Markup.button.callback('✅ Отправить', 'partner_submit_req')],
            [Markup.button.callback('❌ Отмена', 'partner_cancel_req')]
        ]);
        await ctx.editMessageText(summary, { parse_mode: 'HTML', ...kb });
    }
    else if (data === 'partner_submit_req') {
        await submitRequestToAdmins(ctx, session.data);
        partnerSessions.delete(userId);
    }
    else if (data === 'partner_cancel_req') {
        partnerSessions.delete(userId);
        await ctx.editMessageText('❌ Создание запроса отменено.');
    }
}

// Отправка запроса в закрытый чат
async function submitRequestToAdmins(ctx, data) {
    try {
        const prizeName = PRIZE_TYPES.find(p => p.id === data.prize_type)?.name || data.prize_type;
        const audText = data.audience_type === 'all' ? '🌍 Для всех игроков' : '👥 Только для рефералов партнера';
        const userLink = await createUserLink(data.partner_id, ctx.from.username || ctx.from.first_name);

        const msgText = `📩 <b>Новый запрос на промокод от Партнёра</b>\n\n` +
            `👤 Партнер: ${userLink}\n` +
            `🏷 Название: <code>${data.name}</code>\n` +
            `🎁 Приз: ${data.prize_amount} ${prizeName}\n` +
            `🎯 Аудитория: ${audText}\n\n` +
            `ID Партнера: <code>${data.partner_id}</code>`;

        const kb = Markup.inlineKeyboard([
            [Markup.button.callback('✅ Принять', `admin_req_accept_${data.partner_id}_${data.name}`)],
            [Markup.button.callback('❌ Отклонить', `admin_req_reject_${data.partner_id}_${data.name}`)],
            [Markup.button.callback('✏️ Редактировать и принять', `admin_req_edit_${data.partner_id}_${data.name}`)]
        ]);

        // Сохраняем в БД
        const stmt = db.prepare('INSERT INTO partner_requests (partner_id, name, prize_type, prize_amount, audience_type) VALUES (?, ?, ?, ?, ?)');
        const info = stmt.run(data.partner_id, data.name, data.prize_type, data.prize_amount, data.audience_type);
        const requestId = info.lastInsertRowid;

        const sentMsg = await ctx.telegram.sendMessage(PARTNER_ADMIN_CHAT_ID, msgText, { parse_mode: 'HTML', ...kb });
        
        // Обновляем ID сообщения в БД для дальнейших манипуляций
        db.prepare('UPDATE partner_requests SET admin_message_id = ? WHERE id = ?').run(sentMsg.message_id, requestId);

        await ctx.editMessageText('✅ Ваш запрос успешно отправлен администраторам! Ожидайте решения.');
    } catch (e) {
        console.error('[PARTNER] Ошибка отправки в админ чат:', e);
        await ctx.editMessageText('❌ Ошибка при отправке запроса. Свяжитесь с тех. поддержкой.');
    }
}

// Обработка кнопок администраторов в закрытом чате
async function handleAdminRequestCallback(ctx) {
    const userId = ctx.from.id.toString();
    const data = ctx.callbackQuery.data;
    
    if (!(await hasPartnerAdminRights(userId))) {
        await ctx.answerCbQuery('❌ У вас нет прав для этого действия.', { show_alert: true });
        return;
    }
    await ctx.answerCbQuery();

    const parts = data.split('_');
    const action = parts[2]; // accept, reject, edit
    const partnerId = parts[3];
    const promoName = parts[4];

    const reqStmt = db.prepare('SELECT * FROM partner_requests WHERE partner_id = ? AND name = ? AND status = ?');
    const request = reqStmt.get(partnerId, promoName, 'pending');

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
        await ctx.reply('✏️ <b>Редактирование запроса</b>\n\nОтправьте новые данные одним сообщением в формате:\n<code>Название | ТипПриза | Сумма | Аудитория</code>\n\nПример:\n<code>MY_PROMO | balance | 5000 | referrals</code>\n\nТипы: balance, df_balance, container_type_3, tickets\nАудитория: all, referrals', { parse_mode: 'HTML' });
    }
}

// Одобрение запроса
async function approveRequest(ctx, request, adminId, customData = null) {
    const data = customData || request;
    try {
        // Создаем промокод в основной таблице promos
        // Уникальный код, бесконечные активации (или можно задать лимит), привязка к партнеру
        const insertStmt = db.prepare(`
            INSERT INTO promos (name, prize_type, prize_amount, activations_left, min_status_id, creator_id, audience_type)
            VALUES (?, ?, ?, -1, 0, ?, ?)
        `);
        insertStmt.run(data.name, data.prize_type, data.prize_amount, data.partner_id, data.audience_type);

        // Обновляем статус запроса
        db.prepare('UPDATE partner_requests SET status = ? WHERE id = ?').run('approved', request.id);

        const prizeName = PRIZE_TYPES.find(p => p.id === data.prize_type)?.name || data.prize_type;
        const audText = data.audience_type === 'all' ? 'Для всех' : 'Только для рефералов';
        
        const adminLink = await createUserLink(adminId, ctx.from.username || 'Админ');
        const finalText = `${ctx.callbackQuery.message.text}\n\n✅ <b>ОДОБРЕНО</b> администратором ${adminLink}`;
        await ctx.editMessageText(finalText, { parse_mode: 'HTML' });

        // Уведомляем партнера
        await ctx.telegram.sendMessage(data.partner_id, `🎉 <b>Ваш запрос на промокод одобрен!</b>\n\nПромокод <code>${data.name}</code> (${data.prize_amount} ${prizeName}, ${audText}) успешно создан и доступен для активации.`, { parse_mode: 'HTML' });

    } catch (e) {
        console.error('[PARTNER] Ошибка одобрения:', e);
        await ctx.reply('❌ Ошибка при создании промокода в БД. Возможно, название уже занято.');
    }
}

// Отклонение запроса
async function rejectRequest(ctx, request, adminId) {
    db.prepare('UPDATE partner_requests SET status = ? WHERE id = ?').run('rejected', request.id);
    const adminLink = await createUserLink(adminId, ctx.from.username || 'Админ');
    const finalText = `${ctx.callbackQuery.message.text}\n\n❌ <b>ОТКЛОНЕНО</b> администратором ${adminLink}`;
    await ctx.editMessageText(finalText, { parse_mode: 'HTML' });

    await ctx.telegram.sendMessage(request.partner_id, `❌ <b>Ваш запрос на промокод отклонен.</b>\n\nЗапрос на создание <code>${request.name}</code> был отклонен администратором.`, { parse_mode: 'HTML' });
}

// Обработка ввода админа при редактировании
async function handleAdminEditInput(ctx, adminId, text) {
    const session = adminEditSessions.get(adminId);
    if (!session || session.step !== 'AWAITING_EDIT_DATA') return;

    try {
        const parts = text.split('|').map(p => p.trim());
        if (parts.length !== 4) {
            await ctx.reply('❌ Неверный формат. Используйте: <code>Название | Тип | Сумма | Аудитория</code>', { parse_mode: 'HTML' });
            return;
        }

        const [name, prizeType, amountStr, audience] = parts;
        const amount = parseInt(amountStr, 10);

        if (!PRIZE_TYPES.find(p => p.id === prizeType)) {
            await ctx.reply('❌ Неверный тип приза.');
            return;
        }
        if (isNaN(amount) || amount <= 0) {
            await ctx.reply('❌ Неверная сумма.');
            return;
        }
        if (!['all', 'referrals'].includes(audience)) {
            await ctx.reply('❌ Неверная аудитория (должно быть all или referrals).');
            return;
        }

        const reqStmt = db.prepare('SELECT * FROM partner_requests WHERE id = ?');
        const request = reqStmt.get(session.requestId);

        const newData = {
            ...request,
            name: name,
            prize_type: prizeType,
            prize_amount: amount,
            audience_type: audience
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