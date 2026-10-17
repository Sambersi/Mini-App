// registration.js
require('dotenv').config();
const { Markup } = require('telegraf');

// Импорты для работы с базой данных
const {
  getUserById,
  createUserOrUpdate,
  updateUserBalance,
  updateUserData,
  giveFortuneTicket,
  giveCandy,
  getUserStatusesSync,
} = require('../db');
const {
  getRegistrationSession,
  saveRegistrationSession,
  destroyRegistrationSession,
} = require('../sessions/registrationSession');
const { createCanvas } = require('canvas');

// Централизованные критические переменные
const CONFIG = require('../config');

// === КОНСТАНТЫ ЗАЩИТЫ РЕГИСТРАЦИИ ===
const REGISTRATION_TIMEOUT_MS = 24 * 60 * 60 * 1000; // сессия живёт 24 часа
const CAPTCHA_MAX_ATTEMPTS = 5;                      // макс. неверных ответов капчи подряд
const CAPTCHA_LOCK_MS = 5 * 60 * 1000;               // блокировка капчи на 5 минут после лимита

// In-memory мьютекс: защита от параллельных запусков обработчика (гонки)
const activeRegistrations = new Set();

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

// === СЛУЖЕБНЫЕ ФУНКЦИИ СЕССИЙ ===

// Проверяет, истёк ли срок жизни сессии регистрации
function isSessionExpired(session) {
  if (!session || !session.startedAt) return false; // старых сессий без метки не трогаем
  return Date.now() - session.startedAt > REGISTRATION_TIMEOUT_MS;
}

// Гарантирует наличие метки времени в сессии (миграция старых сессий на лету)
function refreshSessionTimestamp(session) {
  if (!session.startedAt) session.startedAt = Date.now();
  return session;
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

// === НОВАЯ ФУНКЦИЯ: ПОВТОР ТЕКУЩЕГО ШАГА РЕГИСТРАЦИИ ===
// Вызывается при ЛЮБОМ сообщении незарегистрированного пользователя,
// а также при команде "рег" во время активной регистрации.
async function resumeRegistration(ctx, session) {
  const userId = ctx.from.id.toString();
  try {
    // Активной сессии нет — подсказываем начать
    if (!session || !session.registrationInProgress) {
      const user = getUserById(userId);
      if (user && user.is_registered) return; // зарегистрирован — делать нечего
      await ctx.replyWithHTML(
        '📝 Регистрация не начата или уже завершена.\n👉 Напишите <b>/start</b>, чтобы начать.'
      );
      return;
    }

    // Сессия протухла (>24ч) — сбрасываем
    if (isSessionExpired(session)) {
      destroyRegistrationSession(userId);
      await ctx.replyWithHTML(
        '⏳ Сессия регистрации истекла (прошло более 24 часов).\n👉 Напишите <b>/start</b>, чтобы начать заново.'
      );
      return;
    }

    session = refreshSessionTimestamp(session);

    // Капча заблокирована после множества неверных попыток
    if (session.captchaLockedUntil && Date.now() < session.captchaLockedUntil) {
      const minLeft = Math.ceil((session.captchaLockedUntil - Date.now()) / 60000);
      await ctx.replyWithHTML(
        `🔒 Капча временно заблокирована из-за большого количества неверных ответов.\n` +
        `⏳ Попробуйте снова через ~${minLeft} мин. Или напишите <b>/start</b> для сброса.`
      );
      return;
    }

    // ШАГ 1: ожидаем капчу — показываем её заново
    if (session.captchaPending) {
      const correctAnswer = await generateCaptcha(ctx, session);
      session.correctCaptchaAnswer = correctAnswer;
      saveRegistrationSession(userId, session);
      await ctx.replyWithHTML('📚 Для завершения регистрации необходимо пройти капчу выше!');
      return;
    }

    // ШАГ 2: капча пройдена, но политика не принята — показываем политику заново
    if (!session.policyAccepted) {
      await showPrivacyPolicy(ctx);
      return;
    }

    // ШАГ 3: все шаги пройдены, но завершение не сработало — пробуем завершить
    await completeRegistration(ctx);
  } catch (error) {
    console.error('[RESUME] Ошибка при повторе шага регистрации:', error);
    await ctx.reply('⚠️ Произошла ошибка. Напишите /start, чтобы начать заново.', { parse_mode: 'HTML' });
  }
}

// Обработчик принятия политики конфиденциальности
async function handlePrivacyPolicyAcceptance(ctx) {
  try {
    const userId = ctx.from.id.toString();
    let session = getRegistrationSession(userId);

    // ЗАЩИТА: сессия отсутствует, политика уже принята или регистрация не идёт
    if (!session || session.policyAccepted || !session.registrationInProgress) {
      console.log(`[POLICY] Пользователь ${userId}: политика уже принята или сессия отсутствует. Пропускаем.`);
      await ctx.answerCbQuery('Регистрация уже завершена или находится в процессе.');
      return;
    }

    // ЗАЩИТА: истёк срок сессии
    if (isSessionExpired(session)) {
      destroyRegistrationSession(userId);
      await ctx.answerCbQuery('Сессия истекла. Напишите /start заново.');
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

    // Сохраняем обновленную сессию (registrationInProgress гасит completeRegistration)
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

// Завершение регистрации + начисление реферальных бонусов
async function completeRegistration(ctx) {
  try {
    const { id: userId, first_name, username } = ctx.from;
    const session = getRegistrationSession(userId) || {};

    let user = await getUserById(userId.toString());
    if (!user) {
      console.error(`[REGISTRATION] Пользователь ${userId} не найден в базе данных.`);
      return ctx.reply('<b>Произошла ошибка.</b> Попробуйте позже.', { parse_mode: 'HTML' });
    }

    if (user.is_registered) {
      console.log(`[REGISTRATION] Пользователь ${userId} уже зарегистрирован. Пропускаем.`);
      destroyRegistrationSession(userId);
      return ctx.reply('Вы уже завершили регистрацию.');
    }

    await updateUserData(userId.toString(), { is_registered: true });

    let registrationMessage = '';
    if (ctx.chat.type === 'private') {
      registrationMessage = `☑️ <b>Регистрация прошла успешно!</b>\n❔ Ознакомьтесь с функционалом бота, используя команду "/help"!`;
    } else {
      const userLink = createUserLink(userId, user.username);
      registrationMessage = `☑️ <b>${userLink}, регистрация прошла успешно!</b>\n❔ Ознакомьтесь с функционалом бота, используя команду "/help"!`;
    }

    await ctx.reply(registrationMessage, { parse_mode: 'HTML' });
    console.log(`[REGISTRATION] Регистрация пользователя ${userId} завершена успешно.`);

    // ============ ОБРАБОТКА РЕФЕРАЛЬНОГО БОНУСА (с билетами фортуны) ============
    const referralCode = session.referralCode;
    if (referralCode && referralCode !== userId.toString()) {
      try {
        const referrer = await getUserById(referralCode);
        if (!referrer) {
          console.warn(`[REGISTRATION] Реферальный код ${referralCode} недействителен.`);
        } else {
          const newUserBonus = CONFIG.REFERRAL_BONUS_NEW_USER_PF;
          const newUserTickets = CONFIG.REFERRAL_BONUS_NEW_USER_TICKETS;
          let referrerBonus = CONFIG.REFERRAL_BONUS_REFERRER_PF;
          let referrerTickets = CONFIG.REFERRAL_BONUS_REFERRER_TICKETS;
          const candyAmount = CONFIG.REGISTRATION_CANDY_AMOUNT;

          // ПРОВЕРКА НА ПАРТНЕРА (синхронная через db.js)
          const referrerStatuses = getUserStatusesSync(referralCode);
          const isReferrerPartner = referrerStatuses.some(
            (s) => s.toLowerCase() === 'партнёр' || s.toLowerCase() === 'partner'
          );
          if (isReferrerPartner) {
            referrerBonus = CONFIG.REFERRAL_BONUS_REFERRER_PF * 2; // Повышенный бонус
            referrerTickets = CONFIG.REFERRAL_BONUS_REFERRER_TICKETS * 2;
          }

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

          giveCandy(referralCode, candyAmount);

          const referrerLink = createUserLink(userId, username || first_name);
          const ticketsTextReferrer = referrerTickets > 0 ? `\n🎟 +${referrerTickets} билет(ов) на фортуну!` : '';
          const partnerNote = isReferrerPartner ? ' (Партнёрский бонус x2)' : '';
          const message =
            `☑️ Вы получили +${referrerBonus} PF за привлечение нового пользователя!${partnerNote}\n` +
            `👥 Реферал: ${referrerLink}${ticketsTextReferrer}\n` +
            `🍬 +${candyAmount} конфет!`;
          await ctx.telegram.sendMessage(referrer.id, message, { parse_mode: 'HTML' });
          console.log(`[REGISTRATION] Реферальный бонус, билеты и конфеты начислены пользователю ${userId} и рефереру ${referrer.id}.`);

          const referralButton = Markup.inlineKeyboard([
            Markup.button.callback('🔗 Реферальная ссылка', 'referral_link'),
          ]);

          const ticketsTextNew = newUserTickets > 0 ? `\n🎟 +${newUserTickets} билет(ов) на фортуну!` : '';
          const newUserMessage =
            `🎁 <b>Бонус за регистрацию по реф. ссылке:</b>\n` +
            `💰 +${newUserBonus} PF${ticketsTextNew}\n` +
            `🔗 Теперь и вы можете приглашать друзей и получать бонусы!`;
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

// Обработчик команды /start (и "рег")
async function registerHandler(ctx) {
  const userId = ctx.from.id.toString();

  // === МУТЕКС: защита от гонок при быстрых повторах команды ===
  if (activeRegistrations.has(userId)) {
    console.log(`[REG] Пользователь ${userId} уже обрабатывается — повторный вызов игнорируется.`);
    if (ctx.callbackQuery) {
      try { await ctx.answerCbQuery('⏳ Регистрация уже обрабатывается...'); } catch (e) {}
    }
    return;
  }

  try {
    activeRegistrations.add(userId);

    const { id, first_name } = ctx.from;
    const sessionId = id.toString();
    let session = getRegistrationSession(sessionId);

    const isStartCommand =
      !!ctx.startPayload || (ctx.message?.text || '').trim().startsWith('/start');

    // Протухшая сессия — сбрасываем молча
    if (session && session.registrationInProgress && isSessionExpired(session)) {
      console.log(`[REG] Сессия пользователя ${userId} истекла — сброс.`);
      destroyRegistrationSession(sessionId);
      session = {};
    }

    // Активная сессия и это НЕ /start — просто повторяем текущий шаг
    if (session && session.registrationInProgress && !isStartCommand) {
      await resumeRegistration(ctx, session);
      return;
    }

    // /start во время активной регистрации — сбрасываем и начинаем заново
    if (session && session.registrationInProgress && isStartCommand) {
      console.log(`[REG] /start во время активной регистрации — сброс сессии ${userId}.`);
      destroyRegistrationSession(sessionId);
      session = {};
    }

    // Пользователь уже зарегистрирован в БД
    const user = await getUserById(sessionId);
    if (user && user.is_registered) {
      destroyRegistrationSession(sessionId);
      console.log(`Пользователь ${id} уже зарегистрирован.`);
      return ctx.reply('❕Вы уже зарегистрированы. Напишите "/help", чтобы узнать доступные команды.');
    }

    // Реферальный код: из startPayload или из текста сообщения
    let referralCode = ctx.startPayload || null;
    if (!referralCode) {
      const parts = (ctx.message?.text || '').split(/\s+/);
      referralCode = parts.length > 1 ? parts[1] : null;
    }
    // Защиты: самореферал и промо-ссылки (их обрабатывает bot.js отдельно)
    if (referralCode === sessionId) referralCode = null;
    if (referralCode && referralCode.startsWith('promo_')) referralCode = null;

    // Создаём новую плоскую сессию
    session = {
      referralCode: referralCode,
      registrationInProgress: true,
      captchaPending: false,
      policyAccepted: false,
      correctCaptchaAnswer: null,
      captchaAttempts: 0,
      captchaLockedUntil: 0,
      startedAt: Date.now(),
    };
    saveRegistrationSession(sessionId, session);

    const welcomeMsg = `👋 WELKOM to F BOT!`;
    await ctx.reply(welcomeMsg, { parse_mode: 'HTML' });

    // Прогресс-бар добавления в БД
    let loadingMessage = await ctx.reply('<b>📂 Добавляем вас в базу данных бота...</b>', { parse_mode: 'HTML' });
    const progressBarSteps = Array.from({ length: 16 }, (_, i) => '█'.repeat(i + 1) + '░'.repeat(16 - i - 1));

    for (let i = 0; i < progressBarSteps.length; i++) {
      await new Promise((res) => setTimeout(res, 20));
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
    try {
      await ctx.telegram.deleteMessage(ctx.chat.id, loadingMessage.message_id);
    } catch (e) {}

    const newUser = {
      id: id.toString(),
      first_name: processUsername(first_name),
      referrer_id: referralCode || null,
      referral_join_date: Math.floor(Date.now() / 1000),
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
    try {
      await ctx.reply('Произошла ошибка. Попробуйте позже.', { parse_mode: 'HTML' });
    } catch (e) {}
  } finally {
    // ОБЯЗАТЕЛЬНО снимаем мьютекс
    activeRegistrations.delete(userId);
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

  const buttons = answers.map((answer) => {
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

    // Успех: сбрасываем счётчик попыток и блокировку
    session.captchaAttempts = 0;
    session.captchaLockedUntil = 0;

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

// Обработчик неправильного ответа на капчу (с лимитом попыток)
async function handleCaptchaWrong(ctx) {
  try {
    const userId = ctx.from.id.toString();
    let session = getRegistrationSession(userId);

    // Проверяем, находится ли пользователь в состоянии ожидания капчи
    if (!session?.captchaPending) {
      return ctx.answerCbQuery('Это меню уже неактивно.');
    }

    // Считаем неверные попытки
    session.captchaAttempts = (session.captchaAttempts || 0) + 1;

    // Превышен лимит — блокируем капчу на 5 минут
    if (session.captchaAttempts >= CAPTCHA_MAX_ATTEMPTS) {
      session.captchaLockedUntil = Date.now() + CAPTCHA_LOCK_MS;
      session.captchaAttempts = 0;
      saveRegistrationSession(userId, session);
      await ctx.answerCbQuery('❌ Слишком много неверных ответов. Капча заблокирована на 5 минут.', { show_alert: true });
      return;
    }

    // Генерируем новую капчу
    const correctAnswer = await generateCaptcha(ctx, session);

    // Сохраняем правильный ответ в сессии
    session.correctCaptchaAnswer = correctAnswer;
    saveRegistrationSession(userId, session);

    // Уведомляем пользователя об ошибке
    await ctx.answerCbQuery(`Неверный выбор. Попробуйте еще раз. (Попытка ${session.captchaAttempts}/${CAPTCHA_MAX_ATTEMPTS})`);
  } catch (error) {
    console.error('Ошибка при обработке неправильного ответа на капчу:', error);
    await ctx.answerCbQuery('Произошла ошибка при проверке капчи.');
  }
}

module.exports = {
  registerHandler,
  handleCaptchaCorrect,
  handleCaptchaWrong,
  handlePrivacyPolicyAcceptance,
  resumeRegistration, // ← НОВОЕ: используется в bot.js для возобновления любым сообщением
};