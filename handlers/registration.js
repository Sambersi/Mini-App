require('dotenv').config();
const { Markup } = require('telegraf');

// Получаем ID канала и его username из переменных окружения
const CHANNEL_ID = process.env.CHANNEL_ID;
const CHANNEL_USERNAME = process.env.CHANNEL_USERNAME;

// Импорты для работы с базой данных
const {
  getUserById,
  createUserOrUpdate,
  updateUserBalance,
  updateUserData,
  giveFortuneTicket,
} = require('../db');
const subscriptionMiddleware = require('../middleware/subscription');
const { getRegistrationSession, saveRegistrationSession, destroyRegistrationSession } = require('../sessions/registrationSession');
const { createCanvas } = require('canvas');

// Централизованные критические переменные
const CONFIG = require('../config');

// Функция для генерации изображения с числом
async function generateCaptchaImage(number) {
  const canvas = createCanvas(150, 70);
  const ctx = canvas.getContext('2d');

  function getRandomColor() {
    const r = Math.floor(Math.random() * 256);
    const g = Math.floor(Math.random() * 256);
    const b = Math.floor(Math.random() * 256);
    return `rgb(${r}, ${g}, ${b})`;
  }

  const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  gradient.addColorStop(0, getRandomColor());
  gradient.addColorStop(1, getRandomColor());
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (let i = 0; i < 5; i++) {
    ctx.strokeStyle = getRandomColor();
    ctx.lineWidth = Math.random() * 3 + 1;
    ctx.beginPath();
    ctx.moveTo(Math.random() * canvas.width, Math.random() * canvas.height);
    ctx.lineTo(Math.random() * canvas.width, Math.random() * canvas.height);
    ctx.stroke();
  }

  for (let i = 0; i < 5; i++) {
    ctx.fillStyle = getRandomColor();
    const radius = Math.random() * 10 + 5;
    const x = Math.random() * canvas.width;
    const y = Math.random() * canvas.height;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  for (let i = 0; i < 3; i++) {
    ctx.fillStyle = getRandomColor();
    const width = Math.random() * 30 + 10;
    const height = Math.random() * 20 + 10;
    const x = Math.random() * canvas.width;
    const y = Math.random() * canvas.height;
    ctx.fillRect(x, y, width, height);
  }

  ctx.font = '36px Arial';
  ctx.fillStyle = getRandomColor();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(number.toString(), canvas.width / 2, canvas.height / 2);

  for (let i = 0; i < 100; i++) {
    const x = Math.random() * canvas.width;
    const y = Math.random() * canvas.height;
    ctx.fillStyle = getRandomColor();
    ctx.fillRect(x, y, 1, 1);
  }

  return canvas.toBuffer();
}

// Функция для создания гиперссылки на пользователя
function createUserLink(userId, username) {
  const displayName = username || 'Press Эфыч';
  return `<a href="tg://user?id=${userId}">${displayName}</a>`;
}

// Функция для обработки имени пользователя
function processUsername(name) {
  if (!name) {
    return 'Press Эфыч';
  }
  return name.slice(0, 16).trim() || 'Press Эфыч';
}

// Показать сообщение с политикой конфиденциальности
async function showPrivacyPolicy(ctx) {
  try {
    const privacyPolicyUrl = process.env.PRIVACY_POLICY_URL;

    if (!privacyPolicyUrl) {
      console.error('[PRIVACY_POLICY] Ссылка на Политику Конфиденциальности не настроена в .env');
      await ctx.reply('<b>Произошла ошибка.</b> Попробуйте позже.', { parse_mode: 'HTML' });
      return;
    }

    const policyMessage = `
⚠️ <b>Пожалуйста, ознакомьтесь с нашей Политикой Конфиденциальности и Условиями Пользования Ботом:</b>

Чтобы продолжить регистрацию, вы должны принять условия Политики Конфиденциальности.

🔗 <a href="${privacyPolicyUrl}">Политика Конфиденциальности</a>
`.trim();

    const policyButtons = Markup.inlineKeyboard([
      Markup.button.url('📖 Политика Конфиденциальности', privacyPolicyUrl),
      Markup.button.callback('✅ Принять', 'accept_policy')
    ]);

    await ctx.replyWithHTML(policyMessage, policyButtons);
  } catch (error) {
    console.error('[PRIVACY_POLICY] Ошибка при отправке сообщения о политике конфиденциальности:', error);
    await ctx.reply('<b>Произошла ошибка.</b> Попробуйте позже.', { parse_mode: 'HTML' });
  }
}

// Обработчик принятия политики конфиденциальности
async function handlePrivacyPolicyAcceptance(ctx) {
  try {
    const userId = ctx.from.id.toString();
    let session = getRegistrationSession(userId);

    // ЗАЩИТА: если сессия отсутствует или политика уже принята, не обрабатываем повторно
    if (!session || session.policyAccepted) {
      console.log(`[POLICY] Пользователь ${userId}: политика уже принята или сессия отсутствует. Пропускаем.`);
      await ctx.answerCbQuery('Регистрация уже завершена или находится в процессе.');
      return;
    }

    // ЗАЩИТА: проверяем, что пользователь ещё не зарегистрирован в БД
    const existingUser = await getUserById(userId);
    if (existingUser && existingUser.is_registered) {
      console.log(`[POLICY] Пользователь ${userId} уже зарегистрирован в БД. Пропускаем.`);
      destroyRegistrationSession(userId);
      await ctx.answerCbQuery('Вы уже зарегистрированы.');
      return;
    }

    // Устанавливаем, что пользователь принял политику
    session.policyAccepted = true;
    delete session.captchaPending;
    delete session.registrationInProgress;

    // Сохраняем обновленную сессию
    saveRegistrationSession(userId, session);

    console.log(`[POLICY] Пользователь ${userId} принял политику конфиденциальности.`);

    // Завершаем регистрацию
    await completeRegistration(ctx);

    // Подтверждаем нажатие кнопки
    await ctx.answerCbQuery('Регистрация завершена!');
  } catch (error) {
    console.error('[PRIVACY_POLICY] Ошибка при обработке принятия политики конфиденциальности:', error);
    await ctx.answerCbQuery('Произошла ошибка. Попробуйте позже.');
    await ctx.reply('<b>Произошла ошибка.</b> Попробуйте позже.', { parse_mode: 'HTML' });
  }
}

async function completeRegistration(ctx) {
  try {
    const { id: userId, first_name, username } = ctx.from;
    const session = getRegistrationSession(userId) || {};

    // Проверяем, существует ли пользователь в базе данных
    let user = await getUserById(userId.toString());
    if (!user) {
      console.error(`[REGISTRATION] Пользователь ${userId} не найден в базе данных.`);
      return ctx.reply('<b>Произошла ошибка.</b> Попробуйте позже.', { parse_mode: 'HTML' });
    }

    // ЗАЩИТА: проверяем, завершил ли пользователь регистрацию ранее
    if (user.is_registered) {
      console.log(`[REGISTRATION] Пользователь ${userId} уже зарегистрирован. Пропускаем.`);
      destroyRegistrationSession(userId);
      return ctx.reply('Вы уже завершили регистрацию.');
    }

    // Обновляем статус пользователя на "зарегистрирован"
    await updateUserData(userId.toString(), { is_registered: true });

    // Сообщение о успешной регистрации
    let registrationMessage = '';
    if (ctx.chat.type === 'private') {
      registrationMessage = `
☑️ <b>Регистрация прошла успешно!</b>

❔ Ознакомьтесь с функционалом бота, используя команду "/help"!
`.trim();
    } else {
      const userLink = createUserLink(userId, user.username);
      registrationMessage = `
☑️ <b>${userLink}, регистрация прошла успешно!</b>

❔ Ознакомьтесь с функционалом бота, используя команду "/help"!
`.trim();
    }

    await ctx.reply(registrationMessage, { parse_mode: 'HTML' });
    console.log(`[REGISTRATION] Регистрация пользователя ${userId} завершена успешно.`);

    // ============ ОБРАБОТКА РЕФЕРАЛЬНОГО БОНУСА (с билетами фортуны) ============
    const referralCode = session.referralCode;
    if (referralCode) {
      try {
        const referrer = await getUserById(referralCode);
        if (!referrer) {
          console.warn(`[REGISTRATION] Реферальный код ${referralCode} недействителен.`);
        } else {
          // Значения из конфига
          const newUserBonus = CONFIG.REFERRAL_BONUS_NEW_USER_PF;
          const newUserTickets = CONFIG.REFERRAL_BONUS_NEW_USER_TICKETS;
          const referrerBonus = CONFIG.REFERRAL_BONUS_REFERRER_PF;
          const referrerTickets = CONFIG.REFERRAL_BONUS_REFERRER_TICKETS;
          const candyAmount = CONFIG.REGISTRATION_CANDY_AMOUNT;

          // Начисление бонусов НОВОМУ пользователю (рефералу)
          await updateUserBalance(userId.toString(), newUserBonus);
          if (newUserTickets > 0) {
            giveFortuneTicket(userId.toString(), newUserTickets);
          }

          // Начисление бонусов РЕФЕРОВОДУ (пригласившему)
          await updateUserBalance(referralCode, referrerBonus);
          if (referrerTickets > 0) {
            giveFortuneTicket(referralCode, referrerTickets);
          }

          // Конфеты рефероводу
          const { giveCandy } = require('../db');
          giveCandy(referralCode, candyAmount);

          const referrerLink = createUserLink(userId, username || first_name);

          // Сообщение рефероводу
          const ticketsTextReferrer = referrerTickets > 0
            ? `\n🎟 +${referrerTickets} билет(ов) на фортуну!`
            : '';
          const message = `
☑️ Вы получили +${referrerBonus} PF за привлечение нового пользователя!

👥 Реферал: ${referrerLink}${ticketsTextReferrer}
🍬 +${candyAmount} конфет!
`;
          await ctx.telegram.sendMessage(referrer.id, message, { parse_mode: 'HTML' });
          console.log(`[REGISTRATION] Реферальный бонус, билеты и конфеты начислены пользователю ${userId} и рефереру ${referrer.id}.`);

          const referralButton = Markup.inlineKeyboard([
            Markup.button.callback('🔗 Реферальная ссылка', 'referral_link'),
          ]);

          // Сообщение новому пользователю
          const ticketsTextNew = newUserTickets > 0
            ? `\n🎟 +${newUserTickets} билет(ов) на фортуну!`
            : '';
          const newUserMessage = `
🎁 <b>Бонус за регистрацию по реф. ссылке:</b>
💰 +${newUserBonus} PF${ticketsTextNew}

🔗 Теперь и вы можете приглашать друзей и получать бонусы!
`;
          await ctx.replyWithHTML(newUserMessage, referralButton);

          await updateUserData(userId.toString(), { referrer_id: referralCode });
        }
      } catch (error) {
        console.error('[REGISTRATION] Ошибка при обработке реферального бонуса:', error);
      }
    }
    // ============ КОНЕЦ ОБРАБОТКИ РЕФЕРАЛЬНОГО БОНУСА ============

    // Корректная очистка состояний регистрации ПОСЛЕ всех операций
    destroyRegistrationSession(userId);
    console.log(`[REGISTRATION] Все шаги регистрации завершены. Сессия пользователя ${userId} удалена.`);
  } catch (error) {
    console.error('[REGISTRATION] Ошибка при завершении регистрации:', error);
    await ctx.reply('<b>Произошла ошибка.</b> Попробуйте позже.', { parse_mode: 'HTML' });
  }
}

async function registerHandler(ctx) {
  try {
    const { id, first_name, username } = ctx.from;
    const sessionId = id.toString();
    let session = getRegistrationSession(sessionId);

    // Проверяем, находится ли пользователь уже в процессе регистрации
    if (session?.registrationInProgress) {
      return ctx.reply('❗ Вы уже в процессе регистрации.');
    }

    // Проверяем, зарегистрирован ли пользователь
    const user = await getUserById(id.toString());
    if (user) {
      if (user.is_registered) {
        console.log(`Пользователь ${id} уже зарегистрирован.`);
        return ctx.reply('❕Вы уже зарегистрированы. Напишите "/help", чтобы узнать доступные команды.');
      }
      // Пользователь существует, но не завершил регистрацию — продолжаем
    }

    // Обработка реферального кода
    const parts = ctx.message.text.split(/\s+/);
    const referralCode = parts.length > 1 ? parts[1] : null;

    // ИСПРАВЛЕНО: создаём плоскую структуру сессии вместо вложенной
    session = {
      referralCode: referralCode,
      registrationInProgress: true,
      captchaPending: false,
      policyAccepted: false,
      correctCaptchaAnswer: null,
    };
    saveRegistrationSession(sessionId, session);

    const welcomeMsg = `👋 WELKOM to F BOT!`;
    await ctx.reply(welcomeMsg, { parse_mode: 'HTML' });

    // Моделируем добавление пользователя в базу данных
    let loadingMessage = await ctx.reply('<b>📂 Добавляем вас в базу данных бота...</b>', { parse_mode: 'HTML' });
    const progressBarSteps = Array.from({ length: 16 }, (_, i) => '█'.repeat(i + 1) + '░'.repeat(16 - i - 1));

    for (let i = 0; i < progressBarSteps.length; i++) {
      await new Promise(res => setTimeout(res, 20));
      const progressBar = progressBarSteps[i];
      const messageText = `<b>📂 Добавляем вас в базу данных бота...</b> ${progressBar}`;

      if (!loadingMessage || loadingMessage.text !== messageText) {
        try {
          const updatedMessage = await ctx.telegram.editMessageText(
            ctx.chat.id,
            loadingMessage.message_id,
            null,
            messageText,
            { parse_mode: 'HTML' }
          );
          loadingMessage.text = messageText;
          if (updatedMessage) {
            loadingMessage = updatedMessage;
          }
        } catch (error) {
          if (error.response?.description === 'Bad Request: message is not modified') {
            console.warn('Пропускаем редактирование: текст сообщения не изменился.');
          } else {
            console.error('Ошибка при редактировании сообщения:', error);
          }
        }
      }
    }

    console.log(`Пользователь ${id} успешно добавлен в базу данных.`);
    await ctx.telegram.deleteMessage(ctx.chat.id, loadingMessage.message_id);

    const newUser = {
      id: id.toString(),
      first_name: processUsername(first_name),
      referrer_id: referralCode || null,
      referral_join_date: Math.floor(Date.now() / 1000)
    };
    await createUserOrUpdate(newUser);
    console.log(`Пользователь ${id} создан в базе данных.`);

    // Начинаем проверку капчи
    session.captchaPending = true;
    saveRegistrationSession(sessionId, session);

    const correctAnswer = await generateCaptcha(ctx, session);
    session.correctCaptchaAnswer = correctAnswer;
    saveRegistrationSession(sessionId, session);
  } catch (error) {
    console.error('Ошибка при регистрации:', error);
    await ctx.reply('Произошла ошибка. Попробуйте позже.', { parse_mode: 'HTML' });
  }
}

// Обновленная функция generateCaptcha
async function generateCaptcha(ctx, session) {
  const numbers = Array.from({ length: 90 }, (_, i) => 10 + i);
  const selectedNumbers = [];

  while (selectedNumbers.length < 6) {
    const randomIndex = Math.floor(Math.random() * numbers.length);
    const randomNumber = numbers[randomIndex];
    if (!selectedNumbers.includes(randomNumber)) {
      selectedNumbers.push(randomNumber);
      numbers.splice(randomIndex, 1);
    }
  }

  const correctNumberIndex = Math.floor(Math.random() * selectedNumbers.length);
  const correctAnswer = `captcha_${selectedNumbers[correctNumberIndex]}`;

  const answers = [...selectedNumbers.map((number) => `wrong_${number}`)];
  answers[correctNumberIndex] = correctAnswer;
  answers.sort(() => Math.random() - 0.5);

  const buttons = answers.map(answer => {
    const number = parseInt(answer.split('_')[1], 10);
    return Markup.button.callback(number.toString(), answer);
  });

  const keyboard = Markup.inlineKeyboard([
    buttons.slice(0, 3),
    buttons.slice(3, 6)
  ]);

  const imageBuffer = await generateCaptchaImage(selectedNumbers[correctNumberIndex]);

  if (!ctx.callbackQuery || !ctx.callbackQuery.message) {
    await ctx.replyWithPhoto(
      { source: imageBuffer },
      {
        caption: '🎨 Выберите число, указанное на картинке:',
        ...keyboard
      }
    );
    return correctAnswer;
  }

  const messageId = ctx.callbackQuery.message.message_id;
  const chatId = ctx.callbackQuery.message.chat.id;

  try {
    await ctx.telegram.editMessageMedia(
      chatId,
      messageId,
      null,
      {
        type: 'photo',
        media: { source: imageBuffer },
        caption: '🎨 Выберите число, указанное на картинке:'
      },
      { ...keyboard }
    );
  } catch (error) {
    if (error.response?.description === 'Bad Request: message is not modified') {
      console.warn('Пропускаем редактирование: текст сообщения не изменился.');
    } else {
      console.error('Ошибка при редактировании сообщения с капчей:', error);
    }
  }

  return correctAnswer;
}

// Обработчик правильного ответа на капчу
async function handleCaptchaCorrect(ctx) {
  try {
    const userId = ctx.from.id.toString();
    let session = getRegistrationSession(userId);

    // ЗАЩИТА: проверяем, что капча действительно ожидается
    if (!session || !session.captchaPending) {
      console.log(`[CAPTCHA] Пользователь ${userId}: капча не ожидается или сессия отсутствует. Пропускаем.`);
      await ctx.answerCbQuery('Это меню уже неактивно.');
      return;
    }

    // ЗАЩИТА: проверяем, что пользователь ещё не зарегистрирован
    const existingUser = await getUserById(userId);
    if (existingUser && existingUser.is_registered) {
      console.log(`[CAPTCHA] Пользователь ${userId} уже зарегистрирован. Пропускаем.`);
      destroyRegistrationSession(userId);
      await ctx.answerCbQuery('Вы уже зарегистрированы.');
      return;
    }

    // Удаляем состояние капчи
    delete session.captchaPending;

    // Сохраняем обновленную сессию
    saveRegistrationSession(userId, session);

    console.log(`[CAPTCHA] Пользователь ${userId} успешно прошел капчу.`);

    // Удаляем сообщение с кнопками
    try {
      await ctx.deleteMessage(ctx.callbackQuery.message.message_id);
    } catch (deleteError) {
      console.warn(`[CAPTCHA] Не удалось удалить сообщение с капчей для пользователя ${userId}:`, deleteError.message);
    }

    // Показываем политику конфиденциальности
    await showPrivacyPolicy(ctx);

    // Уведомляем пользователя об успешном прохождении капчи
    await ctx.answerCbQuery('Капча пройдена успешно!');
  } catch (error) {
    console.error('Ошибка при обработке правильного ответа на капчу:', error);
    await ctx.answerCbQuery('Произошла ошибка при проверке капчи.');
  }
}

// Обработчик неправильного ответа на капчу
async function handleCaptchaWrong(ctx) {
  try {
    const userId = ctx.from.id.toString();
    let session = getRegistrationSession(userId);

    // Проверяем, находится ли пользователь в состоянии ожидания капчи
    if (!session?.captchaPending) {
      return ctx.answerCbQuery('Это меню уже неактивно.');
    }

    // Генерируем новую капчу
    const correctAnswer = await generateCaptcha(ctx, session);

    // Сохраняем правильный ответ в сессии
    session.correctCaptchaAnswer = correctAnswer;
    saveRegistrationSession(userId, session);

    // Уведомляем пользователя об ошибке
    await ctx.answerCbQuery('Неверный выбор. Попробуйте еще раз.');
  } catch (error) {
    console.error('Ошибка при обработке неправильного ответа на капчу:', error);
    await ctx.answerCbQuery('Произошла ошибка при проверке капчи.');
  }
}

module.exports = {
  registerHandler,
  handleCaptchaCorrect,
  handleCaptchaWrong,
  handlePrivacyPolicyAcceptance
};