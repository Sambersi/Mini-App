const { Telegraf } = require('telegraf');
const { sendDonationNotification } = require('../handlers/donationNotifications'); // Импортируем новую функцию

// Массив доступных донатов с указанием эквивалента в PF
const donationOptions = [
    { label: '⭐️ 1 Star (10 DF)', amount: 1 },
    { label: '⭐️ 10 Stars (100 DF)', amount: 10 },
    { label: '⭐️ 25 Stars (250 DF)', amount: 25 },
    { label: '⭐️ 50 Stars (500 DF)', amount: 50 },
    { label: '⭐️ 100 Stars (1000 DF)', amount: 100 },
    { label: '⭐️ 500 Stars (5000 DF)', amount: 500 },
];

// Отправка опций донатов
async function sendDonationOptions(ctx, bot) {
    try {
        const userId = ctx.from.id;
        const chatType = ctx.chat.type;

        // Если команда вызвана в публичном чате, отправляем приглашение в личные сообщения
        if (chatType !== 'private') {
            const botUsername = ctx.botInfo.username; // Получаем username бота
            const botLink = `https://t.me/ ${botUsername}`; // Формируем ссылку на бота

            await ctx.reply(
                `Для выбора доната перейдите в личные сообщения с ботом: [нажмите здесь](${botLink})`,
                { parse_mode: 'Markdown' }
            );

            // В личные сообщения отправляем меню донатов
            const keyboard = {
                inline_keyboard: donationOptions.map(option => [
                    { text: option.label, callback_data: `donate_${option.amount}` },
                ]),
            };

            console.log(`Отправка меню донатов в личные сообщения пользователю: ${userId}`);
            await ctx.telegram.sendMessage(userId, '🍩 Выберите сумму для доната:', { reply_markup: keyboard });
            return;
        }

        // Если команда вызвана в личном чате, отправляем меню донатов
        const keyboard = {
            inline_keyboard: donationOptions.map(option => [
                { text: option.label, callback_data: `donate_${option.amount}` },
            ]),
        };

        console.log(`Отправка меню донатов пользователю: ${userId}`);
        await ctx.reply('🍩 Выберите сумму для доната:', { reply_markup: keyboard });
    } catch (error) {
        console.error(`Ошибка при отправке опций донатов для пользователя ${ctx.from.id}:`, error);
        await ctx.reply('Произошла ошибка. Попробуйте позже.');
    }
}



// Обработка выбранного доната
async function handleDonation(ctx, userId, amount, bot) {
    try {
        console.log(`Начало обработки доната для пользователя ${userId}, сумма: ${amount}`);

        // Проверяем тип чата
        if (ctx.chat.type !== 'private') {
            return ctx.reply("❕ Для покупки доната перейдите в личный чат бота!");
        }

        const paymentSuccessful = await createInvoice(ctx, userId, amount);

        if (paymentSuccessful) {
            console.log(`Инвойс успешно создан для пользователя ${userId}, сумма: ${amount}`);
            await ctx.reply('🚀 Ожидание оплаты...');
        } else {
            console.error(`Ошибка при создании инвойса для пользователя ${userId}, сумма: ${amount}`);
            await ctx.reply('❌ Платеж не был завершен. Попробуйте снова.');
        }
    } catch (error) {
        console.error(`Ошибка при обработке доната для пользователя ${userId}, сумма: ${amount}:`, error);
        await ctx.reply('Произошла ошибка. Попробуйте позже.');
    }
}

// Функция для создания инвойса (не трогаем)
async function createInvoice(ctx, userId, amount) {
    try {
        console.log(`Создание инвойса для пользователя ${userId}, сумма: ${amount}`);
        const invoiceMessage = await ctx.telegram.sendInvoice(userId, {
            title: 'Донат F BOT',
            description: `На сумму в ${amount} звезду(ы)`,
            payload: `${amount}_stars`, // Пэйлоад для идентификации платежа
            provider_token: "", // Оставляем пустым для Telegram Stars
            currency: 'XTR', // Код валюты Telegram Stars
            prices: [{ label: 'XTR', amount }], // Список цен (обязательно 1 элемент)
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: `✅ Оплатить ${amount} XTR`, pay: true }, // Кнопка оплаты
                        { text: '🔙 Отменить операцию', callback_data: 'donate_cancel' }
                    ]
                ]
            }
        });

        console.log(`Инвойс успешно создан для пользователя ${userId}, сумма: ${amount}`);
        return true; // Возвращаем true, если инвойс успешно создан
    } catch (error) {
        console.error(`Ошибка при создании инвойса для пользователя ${userId}, сумма: ${amount}:`, error);
        return false;
    }
}

module.exports = {
    sendDonationOptions,
    handleDonation,
};