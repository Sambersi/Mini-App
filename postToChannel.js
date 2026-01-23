// postToChannel.js
const { Markup } = require('telegraf');
const { isAdmin } = require('./admin/addBalance'); // Из папки admin


// Функция для отправки поста в канал
async function sendPostToChannel(ctx, db) {
    try {
        // Проверяем права администратора
        if (!(await isAdmin(ctx))) {
            return ctx.reply('❌ У вас нет прав для выполнения этой команды.');
        }

        // Получаем ID канала из .env
        const channelId = process.env.CHANNEL_ID_P;

        // Формируем текст поста
        const postContent = '🔥 <b>Навигация по F BOT</b>\n\n' +
                            '📱 Этот пост предназначен для навигации по F BOT';

        // Формируем кнопки
        const buttons = [
            { text: 'Бот в Telegram', url: 'https://t.me/F_roobot ' },
            { text: 'Беседа Double Plus', url: 'https://t.me/+uhycwX5AUA40NjAy ' },
            { text: 'Беседа DICE', url: 'https://t.me/+HUUFT2Uzc9Y1Yjky ' },
            { text: 'GIFT канал', url: 'https://t.me/fbotgiftofficial ' },
            { text: 'Буст канала', url: 'https://t.me/boost/FBot42 ' },
            { text: 'По всем вопросам', url: 'https://t.me/fbotcompitishen ' },
            { text: '🍩 Донат', url: 'https://t.me/FBot42/119 ' },
        ];

        // Создаем inline клавиатуру
        const inlineKeyboard = createPostButtons(buttons);

        // Отправляем пост в канал
        await ctx.telegram.sendMessage(channelId, postContent, {
            parse_mode: 'HTML',
            ...inlineKeyboard
        });

        // Отправляем подтверждение пользователю
        ctx.reply('✅ Пост успешно отправлен в канал!');
    } catch (error) {
        console.error('Ошибка при отправке поста:', error);
        ctx.reply('❌ Произошла ошибка при отправке поста.');
    }
}

// Функция для создания inline клавиатуры
function createPostButtons(buttons) {
    if (!buttons || buttons.length === 0) return {};

    const keyboard = [];
    buttons.forEach((button, index) => {
        // Размещаем кнопки по две в ряд
        if (index % 2 === 0) {
            keyboard.push([Markup.button.url(button.text, button.url)]);
        } else {
            keyboard[keyboard.length - 1].push(Markup.button.url(button.text, button.url));
        }
    });

    return Markup.inlineKeyboard(keyboard);
}

module.exports = {
    sendPostToChannel,
};