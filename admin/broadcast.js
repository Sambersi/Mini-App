// admin/reports.js
const { getUserById, getUserByNumericId } = require('../db');

// Создание репорта
async function createReport(ctx, db, reportText) {
    try {
        const userId = ctx.from.id.toString();
        const username = ctx.from.username || ctx.from.first_name || 'Неизвестный';
        
        // Проверяем, заблокированы ли репорты у пользователя
        const user = await getUserById(userId);
        if (user && user.report_blocked === 1) {
            return ctx.reply('❌ Вам заблокирована возможность отправлять репорты.');
        }

        const stmt = db.prepare('INSERT INTO reports (user_id, username, report_text) VALUES (?, ?, ?)');
        const result = stmt.run(userId, username, reportText);
        const reportId = result.lastInsertRowid;

        // Получаем numeric_id из базы данных для пробива
        const numericId = user ? user.numeric_id : 'Не найден';

        await ctx.reply(`✅ Ваш репорт №${reportId} успешно отправлен. Ожидайте ответа.`);
    } catch (error) {
        console.error('Ошибка при создании репорта:', error);
        await ctx.reply('❌ Произошла ошибка при создании репорта.');
    }
}

// Ответ на репорт
async function answerReport(ctx, db, parts) {
    try {
        const reportId = parseInt(parts[1], 10);
        const responseText = parts.slice(2).join(' ');

        if (!reportId || !responseText) {
            return ctx.reply('❌ Использование: ответить [номер_репорта] [текст_ответа]');
        }

        const stmt = db.prepare('SELECT * FROM reports WHERE id = ?');
        const report = stmt.get(reportId);

        if (!report) {
            return ctx.reply('❌ Репорт не найден.');
        }

        const adminId = ctx.from.id.toString();
        const adminUsername = ctx.from.username || ctx.from.first_name || 'Неизвестный';

        const updateStmt = db.prepare('UPDATE reports SET status = ?, admin_response = ?, admin_id = ?, admin_username = ? WHERE id = ?');
        updateStmt.run('answered', responseText, adminId, adminUsername, reportId);

        await ctx.reply(`✅ Ответ на репорт №${reportId} успешно отправлен.`);

        const userMessage = `
📩 <b>Ответ на ваш репорт №${reportId}:</b>
${responseText}

👤 <b>Администратор:</b> ${adminUsername}
`.trim();

        await ctx.telegram.sendMessage(report.user_id, userMessage, { parse_mode: 'HTML' }).catch(e => console.error('Не удалось отправить ответ пользователю:', e));
    } catch (error) {
        console.error('Ошибка при ответе на репорт:', error);
        await ctx.reply('❌ Произошла ошибка при ответе на репорт.');
    }
}

// Получение списка репортов (с выводом Numeric ID)
async function getReports(ctx, db) {
    try {
        const stmt = db.prepare('SELECT * FROM reports ORDER BY created_at DESC LIMIT 20');
        const reports = stmt.all();

        if (!reports || reports.length === 0) {
            return ctx.reply('📭 Список репортов пуст.');
        }

        let response = '📋 <b>Последние репорты:</b>\n\n';
        for (const report of reports) {
            const user = await getUserById(report.user_id);
            const numericId = user ? user.numeric_id : 'Не найден';
            
            const status = report.status === 'answered' ? '✅' : '❓';
            response += `${status} <b>№${report.id}</b> | ID: <code>${report.user_id}</code> | NumID: <code>${numericId}</code>\n`;
            response += `👤 ${report.username}\n`;
            response += `📝 ${report.report_text}\n`;
            if (report.status === 'answered') {
                response += `💬 <i>Ответ: ${report.admin_response}</i>\n`;
            }
            response += `-------------------\n`;
        }

        await ctx.reply(response, { parse_mode: 'HTML' });
    } catch (error) {
        console.error('Ошибка при получении списка репортов:', error);
        await ctx.reply('❌ Произошла ошибка при получении списка репортов.');
    }
}

// Удаление репорта по ID
async function deleteReportById(ctx, db, reportId) {
    try {
        const stmt = db.prepare('DELETE FROM reports WHERE id = ?');
        const result = stmt.run(reportId);

        if (result.changes > 0) {
            await ctx.reply(`✅ Репорт №${reportId} успешно удален.`);
        } else {
            await ctx.reply(`❌ Репорт №${reportId} не найден.`);
        }
    } catch (error) {
        console.error('Ошибка при удалении репорта:', error);
        await ctx.reply('❌ Произошла ошибка при удалении репорта.');
    }
}

// Очистка всех репортов
async function clearAllReports(ctx, db) {
    try {
        const stmt = db.prepare('DELETE FROM reports');
        const result = stmt.run();
        await ctx.reply(`✅ Список репортов успешно очищен. Удалено записей: ${result.changes}.`);
    } catch (error) {
        console.error('Ошибка при очистке репортов:', error);
        await ctx.reply('❌ Произошла ошибка при очистке репортов.');
    }
}

// Блокировка репортов для конкретного игрока
async function blockUserReports(ctx, db, numericId) {
    try {
        const user = await getUserByNumericId(numericId);
        if (!user) {
            return ctx.reply('❌ Пользователь не найден.');
        }
        
        const stmt = db.prepare('UPDATE users SET report_blocked = 1 WHERE id = ?');
        stmt.run(user.id);
        await ctx.reply(`✅ Возможность отправлять репорты заблокирована для пользователя ${user.username} (NumID: ${numericId}).`);
    } catch (error) {
        console.error('Ошибка при блокировке репортов:', error);
        await ctx.reply('❌ Произошла ошибка при блокировке репортов.');
    }
}

// Разблокировка репортов для конкретного игрока
async function unblockUserReports(ctx, db, numericId) {
    try {
        const user = await getUserByNumericId(numericId);
        if (!user) {
            return ctx.reply('❌ Пользователь не найден.');
        }
        
        const stmt = db.prepare('UPDATE users SET report_blocked = 0 WHERE id = ?');
        stmt.run(user.id);
        await ctx.reply(`✅ Возможность отправлять репорты разблокирована для пользователя ${user.username} (NumID: ${numericId}).`);
    } catch (error) {
        console.error('Ошибка при разблокировке репортов:', error);
        await ctx.reply('❌ Произошла ошибка при разблокировке репортов.');
    }
}

module.exports = {
    createReport,
    answerReport,
    getReports,
    deleteReportById,
    clearAllReports,
    blockUserReports,
    unblockUserReports
};