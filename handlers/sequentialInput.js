// handlers/sequentialInput.js
const { Markup } = require('telegraf');

// Простое хранилище в памяти
const sessions = new Map();

// Клавиатура отмены (одна функция для всех)
const cancelKeyboard = Markup.inlineKeyboard([
  Markup.button.callback('🔴 Отменить', 'sequential_cancel')
]);

// Обработчик текстовых сообщений внутри сессии
async function handleSessionMessage(ctx) {
  const userId = ctx.from.id.toString();
  const session = sessions.get(userId);

  // Если нет активной сессии — пропускаем
  if (!session || !session.active) return false;

  const text = ctx.message?.text?.trim();
  if (!text) return false;

  // Логика по шагам
  if (session.step === 0) {
    session.data.name = text;
    session.step = 1;
    await ctx.reply('✅ Имя принято. Введите Email:', cancelKeyboard);
  } 
  else if (session.step === 1) {
    session.data.email = text;
    session.step = 2;
    await ctx.reply('✅ Email принят. Введите возраст:', cancelKeyboard);
  } 
  else if (session.step === 2) {
    session.data.age = text;
    
    // Финиш
    await ctx.reply(`
🎉 Готово!
👤 Имя: ${session.data.name}
📧 Email: ${session.data.email}
🔢 Возраст: ${session.data.age}
    `);
    
    sessions.delete(userId); // Удаляем сессию
  }

  return true;
}

// Команда старта
async function startSequentialInput(ctx) {
  const userId = ctx.from.id.toString();
  
  // Создаем сессию
  sessions.set(userId, {
    step: 0,
    data: {},
    active: true
  });

  await ctx.reply('🚀 Введите ваше имя:', cancelKeyboard);
}

// Кнопка отмены
async function handleCancel(ctx) {
  const userId = ctx.from.id.toString();
  sessions.delete(userId);
  
  // Пытаемся отредактировать сообщение с кнопкой, если не выйдет — шлем новое
  try {
    await ctx.editMessageText('❌ Отменено.');
  } catch (e) {}
  
  await ctx.reply('Можете начать заново: /sequential');
  if (ctx.callbackQuery) await ctx.answerCbQuery();
}

// Middleware (вставлять в bot.js ДО остальных обработчиков текста)
function sequentialMiddleware() {
  return async (ctx, next) => {
    if (!ctx.message || !ctx.message.text) return next();
    
    const handled = await handleSessionMessage(ctx);
    if (handled) return; // Стоп, если сессия обработала
    
    return next(); // Иначе идем дальше
  };
}

module.exports = {
  startSequentialInput,
  handleCancel,
  sequentialMiddleware
};