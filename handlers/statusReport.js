const { isAdmin } = require('../admin/addBalance');
const {
  getUsersByStatus,
} = require('../db');

// Полный список статусов
const allStatuses = [
    { name: 'Администратор', priority: 100 },
    { name: 'Тех администратор', priority: 95 },
    { name: 'Модератор', priority: 90 },
    { name: 'DIAMOND', priority: 85 },
    { name: 'PLATINUM', priority: 80 },
    { name: 'GOLD', priority: 75 },
    { name: 'Beto-tester', priority: 70 },
];

async function statusReportHandler(ctx) {
    try {
        if (!(await isAdmin(ctx))) {
            return ctx.reply('❌ У вас нет прав для использования этой команды.');
        }

        let message = '📊 <b>Отчет о донатных статусах:</b>\n\n';

        // Используем полный список статусов
        for (const status of allStatuses) {
            const users = await getUsersByStatus(status.name);
            message += `👑 ${status.name}: ${users.length}\n`;
        }

        // Создаем клавиатуру с кнопками для всех статусов
        const keyboard = {
            inline_keyboard: allStatuses.map(status => [
                { text: `👑 ${status.name}`, callback_data: `status_list_${status.name}` },
            ]),
        };

        await ctx.replyWithHTML(message, { reply_markup: keyboard });
    } catch (error) {
        console.error('Ошибка при формировании отчета о статусах:', error);
        await ctx.reply('❌ Произошла ошибка при формировании отчета.');
    }
}

// Обработчик кнопок для получения списков пользователей по статусам
async function handleStatusList(ctx) {
    try {
        // Проверка прав администратора
        if (!(await isAdmin(ctx))) {
            return;
        }

        // Извлекаем название статуса из callback_data
        const statusName = ctx.callbackQuery.data.split('_')[2];
        if (!statusName) {
            return ctx.answerCbQuery('❌ Некорректный запрос.');
        }

        // Получаем список пользователей с указанным статусом
        const users = await getUsersByStatus(statusName);
        if (!users || users.length === 0) {
            return ctx.reply(`❌ Список пользователей со статусом "${statusName}" пуст.`);
        }

        // Формируем текстовый документ с нумерацией
        let documentText = `Список пользователей со статусом "${statusName}":\n\n`;
        users.forEach((user, index) => {
            documentText += `${index + 1}. Telegram ID: ${user.telegram_id}\n`;
            documentText += `   ID: ${user.numeric_id}\n`;
            documentText += `   Ник из БД: ${user.username}\n`;
            documentText += '-----------------------------------\n';
        });

        // Отправляем документ
        const fileName = `${statusName}_users.txt`;
        await ctx.replyWithDocument(
            { source: Buffer.from(documentText), filename: fileName },
            { caption: `📋 Список пользователей со статусом "${statusName}"` }
        );
    } catch (error) {
        console.error('Ошибка при обработке списка статусов:', error);
        await ctx.reply('❌ Произошла ошибка при формировании списка.');
    }
}

module.exports = {
    statusReportHandler,
    handleStatusList,
};