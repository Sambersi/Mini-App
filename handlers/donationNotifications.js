const { logError } = require('../utils/errorHandler');
const { getUserById } = require('../db');

// Функция для отправки уведомления о донате в специальный чат
async function sendDonationNotification(ctx, userId, amount) {
    try {
        const user = await getUserById(userId);
        if (!user) {
            console.warn(`[WARN] Пользователь с ID=${userId} не найден в базе данных.`);
            return;
        }

        const username = user.username || `User${user.numeric_id}`;
        const userLink = `<a href="tg://user?id=${userId}">${username}</a>`;
        const donationMessage = `
⭐️ <b>Новый донат:</b>
👤 <b>Пользователь:</b> ${userLink}
💎 <b>Сумма:</b> ${amount} звезд
`.trim();

        // Отправляем сообщение в чат администраторов
        await ctx.telegram.sendMessage(process.env.DONATION_LOGS_CHAT_ID, donationMessage, { parse_mode: 'HTML' });
    } catch (error) {
        logError(error);
        console.error(`Ошибка при отправке уведомления о донате для пользователя с ID=${userId}:`, error);
    }
}

module.exports = {
    sendDonationNotification,
};