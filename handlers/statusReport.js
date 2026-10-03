// statusReport.js
const { isAdmin } = require('../admin/addBalance');
const { getUsersByStatus } = require('../db');

// Полный список статусов в порядке приоритета (от высшего к низшему)
const allStatuses = [
  { name: 'Тех администратор', priority: 10 },
  { name: 'Главный админ', priority: 9 },
  { name: 'Администратор', priority: 8 },
  { name: 'Руководитель партнёрки', priority: 7 },
  { name: 'Модератор', priority: 6 },
  { name: 'DIAMOND', priority: 5 },
  { name: 'PLATINUM', priority: 4 },
  { name: 'GOLD', priority: 3 },
  { name: 'Партнёр', priority: 2 },
  { name: 'Beto-tester', priority: 1 },
];

async function statusReportHandler(ctx) {
  try {
    if (!(await isAdmin(ctx))) {
      return ctx.reply('❌ У вас нет прав для использования этой команды.');
    }

    let message = '📊 <b>Отчет о статусах:</b>\n\n';

    for (const status of allStatuses) {
      const users = await getUsersByStatus(status.name);
      message += `👑 ${status.name}: ${users.length}\n`;
    }

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

async function handleStatusList(ctx) {
  try {
    if (!(await isAdmin(ctx))) return;

    const statusName = ctx.callbackQuery.data.split('_').slice(2).join('_');
    if (!statusName) {
      return ctx.answerCbQuery('❌ Некорректный запрос.');
    }

    const users = await getUsersByStatus(statusName);
    if (!users || users.length === 0) {
      return ctx.reply(`❌ Список пользователей со статусом "${statusName}" пуст.`);
    }

    let documentText = `Список пользователей со статусом "${statusName}":\n\n`;
    users.forEach((user, index) => {
      documentText += `${index + 1}. Telegram ID: ${user.telegram_id}\n`;
      documentText += `   ID: ${user.numeric_id}\n`;
      documentText += `   Ник из БД: ${user.username}\n`;
      documentText += '-----------------------------------\n';
    });

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