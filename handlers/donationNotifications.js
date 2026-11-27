const { getUserById } = require('../db');

// Функция для отправки уведомления о донате в специальный чат
async function sendDonationNotification(ctx, userId, amount) {
    try {
        const user = await getUserById(userId);
        if (!user) {
            console.warn('[DONATION NOTIFICATION] Profile unavailable');
            return;
        }

        const username = String(user.username || `User${user.numeric_id}`).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
        const userLink = `<a href="tg://user?id=${userId}">${username}</a>`;
        const donationMessage = `
⭐️ <b>Новый донат:</b>
👤 <b>Пользователь:</b> ${userLink}
💎 <b>Сумма:</b> ${amount} звезд
`.trim();

        // Отправляем сообщение в чат администраторов
        await ctx.telegram.sendMessage(process.env.DONATION_LOGS_CHAT_ID, donationMessage, { parse_mode: 'HTML' });
    } catch (error) {
        const code=/^[A-Z0-9_]{1,64}$/.test(error.code||'')?error.code:'NOTIFICATION_FAILED';
        console.error('[DONATION NOTIFICATION] '+code);
    }
}

module.exports = {
    sendDonationNotification,
};
