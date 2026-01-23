const { getUserById, createUserOrUpdate } = require('../db');

// Функция для создания гиперссылки на пользователя
function createUserLink(userId, username) {
  const displayName = username || 'Неизвестный'; // Используем имя или "Неизвестный"
  return `<a href="tg://user?id=${userId}">${displayName}</a>`;
}

// Обработка команды "баланс"
async function balanceHandler(ctx) {
  try {
    // Получаем ID пользователя
    const userId = ctx.from.id.toString();
    const username = ctx.from.username || 'Неизвестный';

    // Проверяем тип чата
    const isPrivateChat = ctx.chat.type === 'private';

    // Проверяем, существует ли пользователь в базе данных
    let user = await getUserById(userId);
    if (!user) {
      // Если пользователь не зарегистрирован, создаём его
      await createUserOrUpdate({
        id: userId,
        username: username,
        balance: 0, // Устанавливаем начальный баланс
      });
      // Получаем созданного пользователя
      user = await getUserById(userId);
      console.log(`Новый пользователь зарегистрирован: ID=${userId}, username=${username}`);
    }

    // Проверяем, что баланс и баланс карты существуют и являются числами
    const pfBalance = typeof user.balance === 'number' ? user.balance : 0;
    const cardBalance = typeof user.card_balance === 'number' ? user.card_balance : 0;

    // Формируем сообщение в зависимости от типа чата
    if (isPrivateChat) {
      // В личном чате без гиперссылки и без строки "Ваш профиль"
      ctx.reply(
        `💰 Баланс PF: <b>${pfBalance.toLocaleString('ru-RU')} PF</b>\n` +
        `💳 На карте: <b>${cardBalance.toLocaleString('ru-RU')} PF</b>`,
        { parse_mode: 'HTML' }
      );
    } else {
      // В групповом чате с гиперссылкой
      const userLink = createUserLink(userId, user.username);
      ctx.reply(
        `${userLink}:\n` +
        `💰 Баланс PF: <b>${pfBalance.toLocaleString('ru-RU')} PF</b>\n` +
        `💳 На карте: <b>${cardBalance.toLocaleString('ru-RU')} PF</b>`,
        { parse_mode: 'HTML' }
      );
    }
  } catch (error) {
    console.error('Ошибка при обработке команды "баланс":', error);
    ctx.reply('Произошла ошибка. Пожалуйста, попробуйте позже.');
  }
}

module.exports = { balanceHandler };