// /Events/Halloween/adminCandy.js
const { giveCandy, takeCandy, getUserByNumericId } = require('../../db');
const { isAdmin } = require('../../admin/addBalance');

// Функция для выдачи конфет
async function giveCandyHandler(ctx) {
  try {
    // Проверка прав администратора
    if (!(await isAdmin(ctx))) {
      return ctx.reply('❌ У вас нет прав для использования этой команды.');
    }

    const args = ctx.message.text.split(/\s+/);
    if (args.length !== 3) {
      return ctx.reply(
        '❌ Неверный формат команды.\nИспользование: выдать_конфеты [NUMERIC_ID] [количество]'
      );
    }

    const numericId = parseInt(args[1], 10);
    const amount = parseInt(args[2], 10);

    if (isNaN(numericId) || isNaN(amount) || amount <= 0) {
      return ctx.reply('❌ NUMERIC_ID и количество должны быть положительными числами.');
    }

    const user = await getUserByNumericId(numericId);
    if (!user) {
      return ctx.reply(`❌ Игрок с NUMERIC_ID ${numericId} не найден.`);
    }

    const result = giveCandy(user.id, amount);
    if (!result.success) {
      return ctx.reply(`❌ ${result.message}`);
    }

    const userLink = `<a href="tg://user?id=${user.id}">${user.username || 'Неизвестный'}</a>`;
    await ctx.replyWithHTML(
      `🍬 Конфеты выданы!\n• Игроку: ${userLink}\n• В количестве: <b>${amount}</b>`
    );
  } catch (error) {
    console.error('[giveCandyHandler] Ошибка:', error);
    await ctx.reply('❌ Произошла ошибка при выдаче конфет.');
  }
}

// Функция для забора конфет
async function takeCandyHandler(ctx) {
  try {
    // Проверка прав администратора
    if (!(await isAdmin(ctx))) {
      return ctx.reply('❌ У вас нет прав для использования этой команды.');
    }

    const args = ctx.message.text.split(/\s+/);
    if (args.length !== 3) {
      return ctx.reply(
        '❌ Неверный формат команды.\nИспользование: забрать_конфеты [NUMERIC_ID] [количество]'
      );
    }

    const numericId = parseInt(args[1], 10);
    const amount = parseInt(args[2], 10);

    if (isNaN(numericId) || isNaN(amount) || amount <= 0) {
      return ctx.reply('❌ NUMERIC_ID и количество должны быть положительными числами.');
    }

    const user = await getUserByNumericId(numericId);
    if (!user) {
      return ctx.reply(`❌ Игрок с NUMERIC_ID ${numericId} не найден.`);
    }

    const result = takeCandy(user.id, amount);
    if (!result.success) {
      return ctx.reply(`❌ ${result.message}`);
    }

    const userLink = `<a href="tg://user?id=${user.id}">${user.username || 'Неизвестный'}</a>`;
    await ctx.replyWithHTML(
      `🍬 Конфеты списаны!\n• У игрокф: ${userLink}\n• В количестве: <b>${amount}</b>`
    );
  } catch (error) {
    console.error('[takeCandyHandler] Ошибка:', error);
    await ctx.reply('❌ Произошла ошибка при списании конфет.');
  }
}

module.exports = {
  giveCandyHandler,
  takeCandyHandler,
};