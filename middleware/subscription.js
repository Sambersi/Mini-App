//subscription.js

require('dotenv').config();

// Получаем ID канала и его username из переменных окружения
const CHANNEL_ID = process.env.CHANNEL_ID;
const CHANNEL_USERNAME = process.env.CHANNEL_USERNAME;

// Middleware для проверки подписки на канал
async function subscriptionMiddleware(ctx, next) {
  try {
    // Игнорируем обновления из каналов или других источников (например, callback-запросы)
    if (!ctx.from || ctx.chat?.type !== 'private') {
      console.log('Пропускаем проверку подписки для неличных чатов.');
      return next();
    }

    // Исключение для команды /start (включая реферальный код)
    if (ctx.message && ctx.message.text.startsWith('/start')) {
      console.log('Пропускаем проверку подписки для команды "/start".');
      return next();
    }

    // Если проверка подписки отключена (не указаны CHANNEL_ID или CHANNEL_USERNAME)
    if (!CHANNEL_ID || !CHANNEL_USERNAME) {
      console.warn('Проверка подписки пропущена из-за отсутствия конфигурации.');
      return next();
    }

    // Проверяем статус пользователя в канале
    let chatMember;
    try {
      chatMember = await ctx.telegram.getChatMember(CHANNEL_ID, ctx.from.id);
    } catch (error) {
      console.error('Ошибка при получении статуса пользователя в канале:', error);

      // Если бот не добавлен в канал или возникла другая ошибка
      return ctx.reply(
        `Произошла ошибка при проверке подписки. Возможно, бот не добавлен в канал https://t.me/${CHANNEL_USERNAME}. Пожалуйста, сообщите администратору.`
      );
    }

    const status = chatMember.status;

    if (!['member', 'creator', 'administrator'].includes(status)) {
      // Если пользователь не подписан, отправляем ссылку на канал
      return ctx.reply(
        `🕹 Для игры в нашего бота, необходимо подписаться на наш канал: @${CHANNEL_USERNAME}\n\n` +
        `☑️ После подписки, вновь можете пользоваться ботом.`
      );
    }

    // Если пользователь подписан, продолжаем выполнение
    return next();
  } catch (error) {
    console.error('Ошибка при проверке подписки:', error);

    // Отправляем сообщение об ошибке в личном чате
    if (ctx.chat && ctx.chat.type === 'private') {
      return ctx.reply(
        `Произошла ошибка при проверке подписки. Возможно, бот не добавлен в канал https://t.me/${CHANNEL_USERNAME}. Пожалуйста, сообщите администратору.`
      );
    }
  }
}

module.exports = subscriptionMiddleware;