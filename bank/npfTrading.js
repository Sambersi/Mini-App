// bank/npfTrading.js

const { Markup } = require('telegraf');
// Импортируем функции из db.js (ваша база данных)
const {
  getUserById,
  hasCard,
  updateUserBalance,
  transaction,
  getUserNpfShares,
  updateUserNpfShares,
} = require('../db');

// Импортируем текущий курс из основного модуля акций (предполагаем, что он будет экспортироваться)
// Это нужно будет настроить позже, когда обновим npfShares.js
// const { getCurrentCourse } = require('./npfShares'); // Заглушка, см. ниже

// Обработчик команды "/купить_акции <количество>"
async function handleBuyShares(ctx, currentCourse) { // Передаем курс как аргумент
  try {
    const text = ctx.message.text.trim();
    const parts = text.split(/\s+/);

    if (parts.length !== 3) {
      return ctx.reply('Использование: купить_акции [количество]');
    }

    const sharesAmount = parseInt(parts[2], 10);

    if (isNaN(sharesAmount) || sharesAmount <= 0) {
      return ctx.reply('❌ Укажите положительное число акций.');
    }

    const userId = ctx.from.id.toString();
    const user = await getUserById(userId);

    if (!user) {
      return ctx.reply('❌ Не удалось найти ваш профиль.');
    }

    // Проверяем наличие карты
    if (!hasCard(userId)) {
      return ctx.reply('✖️ У вас нет зарегистрированной карты. Зарегистрируйте карту перед покупкой акций.');
    }

    // Рассчитываем стоимость покупки
    const totalPrice = sharesAmount * currentCourse;

    // Проверяем баланс
    if (user.balance < totalPrice) {
      return ctx.reply(`❌ На вашем основном балансе недостаточно средств. Требуется: ${totalPrice.toLocaleString('ru-RU')} PF. У вас: ${user.balance.toLocaleString('ru-RU')} PF.`);
    }

    // Выполняем транзакцию
    await transaction(async () => {
      // Списываем средства с основного баланса
      const deductionResult = await updateUserBalance(userId, -totalPrice);
      if (!deductionResult.success) {
        throw new Error(deductionResult.message || 'Ошибка при списании средств.');
      }

      // Увеличиваем количество акций
      const updateResult = updateUserNpfShares(userId, sharesAmount);
      if (!updateResult.success) {
        throw new Error(updateResult.message);
      }
    });

    // Отправляем подтверждение
    const totalValue = sharesAmount * currentCourse;
    await ctx.replyWithHTML(`
☑️ Вы успешно купили <b>${sharesAmount}</b> акций NPF.
💰 Стоимость покупки: <b>${totalValue.toLocaleString('ru-RU')} PF</b>.
📈 Ваше новое количество акций: <b>${getUserNpfShares(userId)}</b>. <!-- Используем функцию из db.js -->
`);

  } catch (error) {
    console.error('Ошибка при покупке акций:', error);
    await ctx.reply('Произошла ошибка при покупке акций. Попробуйте позже.');
  }
}

// Обработчик команды "/продать_акции <количество>"
async function handleSellShares(ctx, currentCourse) { // Передаем курс как аргумент
  try {
    const text = ctx.message.text.trim();
    const parts = text.split(/\s+/);

    if (parts.length !== 3) {
      return ctx.reply('Использование: продать_акции [количество]');
    }

    const sharesAmount = parseInt(parts[2], 10);

    if (isNaN(sharesAmount) || sharesAmount <= 0) {
      return ctx.reply('❌ Укажите положительное число акций.');
    }

    const userId = ctx.from.id.toString();
    const user = await getUserById(userId);

    if (!user) {
      return ctx.reply('❌ Не удалось найти ваш профиль.');
    }

    // Проверяем наличие акций через db.js
    const userShares = getUserNpfShares(userId);
    if (userShares < sharesAmount) {
      return ctx.reply(`❌ У вас недостаточно акций для продажи. У вас: ${userShares}, требуется: ${sharesAmount}.`);
    }

    // Рассчитываем сумму к выплате
    const totalPayout = sharesAmount * currentCourse;

    // Выполняем транзакцию
    await transaction(async () => {
      // Уменьшаем количество акций
      const updateResult = updateUserNpfShares(userId, -sharesAmount);
      if (!updateResult.success) {
        throw new Error(updateResult.message);
      }

      // Начисляем средства на основной баланс
      const additionResult = await updateUserBalance(userId, totalPayout);
      if (!additionResult.success) {
        throw new Error(additionResult.message || 'Ошибка при начислении средств.');
      }
    });

    // Отправляем подтверждение
    await ctx.replyWithHTML(`
☑️ Вы успешно продали <b>${sharesAmount}</b> акций NPF.
💰 Получено: <b>${totalPayout.toLocaleString('ru-RU')} PF</b>.
📉 Ваше новое количество акций: <b>${getUserNpfShares(userId)}</b>. <!-- Используем функцию из db.js -->
`);

  } catch (error) {
    console.error('Ошибка при продаже акций:', error);
    await ctx.reply('Произошла ошибка при продаже акций. Попробуйте позже.');
  }
}

module.exports = {
  handleBuyShares,
  handleSellShares,
};