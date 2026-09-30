// handlers/sequentialInput.js  тестим последовательный ввод
const { Markup } = require('telegraf');

// Простое хранилище в памяти
const sessions = new Map();

// --- КЛАВИАТУРЫ ---

// 1. Клавиатура отмены
const cancelKeyboard = Markup.inlineKeyboard([
  Markup.button.callback('🔴 Отменить', 'sequential_cancel')
]);

// 2. Финальная клавиатура
const finalKeyboard = Markup.inlineKeyboard([
  [
    Markup.button.callback('✅ Подтвердить', 'sequential_confirm'),
    Markup.button.callback('✏️ Редактировать', 'sequential_edit_menu')
  ]
]);

// 3. Клавиатура выбора поля для редактирования
const editMenuKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback('Изменить Имя', 'seq_edit_name')],
  [Markup.button.callback('Изменить Email', 'seq_edit_email')],
  [Markup.button.callback('Изменить Возраст', 'seq_edit_age')],
  [Markup.button.callback('⬅️ Назад к проверке', 'seq_back_to_check')]
]);

// 4. Клавиатура отмены редактирования
const cancelEditKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback('❌ Отмена редактирования', 'seq_back_to_check')]
]);

// --- ОСНОВНАЯ ЛОГИКА ---

async function handleSessionMessage(ctx) {
  const userId = ctx.from.id.toString();
  const session = sessions.get(userId);

  if (!session || !session.active || session.waitingForEdit) return false;

  const text = ctx.message?.text?.trim();
  if (!text) return false;

  try {
    if (session.step === 0) {
      session.data.name = text;
      session.step = 1;
      // РАБОТАЕТ: Клавиатура вторым аргументом
      await ctx.reply('✅ Имя принято. Введите Email:', cancelKeyboard);
    } 
    else if (session.step === 1) {
      session.data.email = text;
      session.step = 2;
      // РАБОТАЕТ: Клавиатура вторым аргументом
      await ctx.reply('✅ Email принят. Введите возраст:', cancelKeyboard);
    } 
    else if (session.step === 2) {
      session.data.age = text;
      session.step = 3;
      await showSummary(ctx, session);
    }
    else if (session.step === 3 && session.editField) {
      session.data[session.editField] = text;
      session.editField = null;
      await showSummary(ctx, session);
    }

    return true;
  } catch (error) {
    console.error('Ошибка в sequentialInput:', error);
    return false;
  }
}

// Функция отображения сводки данных
async function showSummary(ctx, session) {
  const summaryText = `
🎉 <b>Проверьте данные:</b>

👤 Имя: ${session.data.name}
📧 Email: ${session.data.email}
🔢 Возраст: ${session.data.age}

Нажмите «Подтвердить», чтобы сохранить, или «Редактировать», чтобы изменить поле.
  `.trim();

  // ИСПРАВЛЕНО: Явно добавляем reply_markup внутрь объекта опций
  await ctx.reply(summaryText, { 
    parse_mode: 'HTML',
    reply_markup: finalKeyboard.reply_markup 
  });
}

// Команда старта
async function startSequentialInput(ctx) {
  const userId = ctx.from.id.toString();
  
  sessions.set(userId, {
    step: 0,
    data: {},
    active: true,
    waitingForEdit: false,
    editField: null
  });

  // РАБОТАЕТ: Клавиатура вторым аргументом
  await ctx.reply('🚀 Введите ваше имя:', cancelKeyboard);
}

// Обработчик кнопки отмены
async function handleCancel(ctx) {
  const userId = ctx.from.id.toString();
  sessions.delete(userId);
  
  try {
    await ctx.editMessageText('❌ Ввод отменён.');
  } catch (e) {}
  
  await ctx.reply('Можете начать заново: /sequential');
  if (ctx.callbackQuery) await ctx.answerCbQuery();
}

// Обработчик подтверждения (Финал)
async function handleConfirm(ctx) {
  const userId = ctx.from.id.toString();
  const session = sessions.get(userId);

  if (!session) {
    return ctx.answerCbQuery('❌ Сессия не найдена. Начните заново.', { show_alert: true });
  }

  const successText = `
✅ <b>Данные сохранены!</b>

👤 Имя: ${session.data.name}
📧 Email: ${session.data.email}
🔢 Возраст: ${session.data.age}
  `.trim();

  sessions.delete(userId);
  
  try {
    await ctx.editMessageText(successText, { parse_mode: 'HTML' });
  } catch (e) {
    await ctx.reply(successText, { parse_mode: 'HTML' });
  }
  
  await ctx.answerCbQuery();
}

// Обработчик открытия меню редактирования
async function handleEditMenu(ctx) {
  const userId = ctx.from.id.toString();
  const session = sessions.get(userId);

  if (!session) {
    return ctx.answerCbQuery('❌ Сессия истекла.', { show_alert: true });
  }

  session.waitingForEdit = true;

  const editText = `
✏️ <b>Редактирование данных</b>

Выберите поле, которое нужно изменить:
  `.trim();

  try {
    // ИСПРАВЛЕНО: Явно добавляем reply_markup внутрь объекта опций для editMessageText
    await ctx.editMessageText(editText, { 
      parse_mode: 'HTML',
      reply_markup: editMenuKeyboard.reply_markup 
    });
  } catch (e) {
    await ctx.reply(editText, { 
      parse_mode: 'HTML',
      reply_markup: editMenuKeyboard.reply_markup 
    });
  }
  
  await ctx.answerCbQuery();
}

// Обработчик выбора поля для редактирования
async function handleEditField(ctx, field, fieldNameRu) {
  const userId = ctx.from.id.toString();
  const session = sessions.get(userId);

  if (!session) {
    return ctx.answerCbQuery('❌ Сессия истекла.', { show_alert: true });
  }

  session.waitingForEdit = false;
  session.editField = field;
  session.step = 3;

  // ИСПРАВЛЕНО: Явно добавляем reply_markup внутрь объекта опций
  await ctx.reply(`✍️ Введите новое значение для поля <b>${fieldNameRu}</b>:`, {
    parse_mode: 'HTML',
    reply_markup: cancelEditKeyboard.reply_markup
  });
  
  await ctx.answerCbQuery();
}

// Возврат к проверке из меню редактирования
async function handleBackToCheck(ctx) {
  const userId = ctx.from.id.toString();
  const session = sessions.get(userId);

  if (!session) {
    return ctx.answerCbQuery('❌ Сессия истекла.', { show_alert: true });
  }

  session.waitingForEdit = false;
  session.editField = null;

  await showSummary(ctx, session);
  
  await ctx.answerCbQuery();
}

// Middleware
function sequentialMiddleware() {
  return async (ctx, next) => {
    if (ctx.callbackQuery) {
      const data = ctx.callbackQuery.data;
      const userId = ctx.from.id.toString();
      const session = sessions.get(userId);

      if (data === 'sequential_confirm') return handleConfirm(ctx);
      if (data === 'sequential_edit_menu') return handleEditMenu(ctx);
      if (data === 'seq_back_to_check') return handleBackToCheck(ctx);
      if (data === 'seq_edit_name') return handleEditField(ctx, 'name', 'Имя');
      if (data === 'seq_edit_email') return handleEditField(ctx, 'email', 'Email');
      if (data === 'seq_edit_age') return handleEditField(ctx, 'age', 'Возраст');
      
      return next();
    }

    if (!ctx.message || !ctx.message.text) return next();
    
    const handled = await handleSessionMessage(ctx);
    if (handled) return;
    
    return next();
  };
}

module.exports = {
  startSequentialInput,
  handleCancel,
  sequentialMiddleware
};