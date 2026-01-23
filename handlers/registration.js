// registration.js
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
  } = require('../db');
  
const subscriptionMiddleware = require('../middleware/subscription'); // Импортируем middleware для проверки подписки
const { getRegistrationSession, saveRegistrationSession, destroyRegistrationSession } = require('../sessions/registrationSession');
const { createCanvas } = require('canvas');

// Функция для генерации изображения с числом
async function generateCaptchaImage(number) {
    const canvas = createCanvas(150, 70); // Увеличиваем размер холста для лучшего отображения
    const ctx = canvas.getContext('2d');
    // Генерация случайного цвета
    function getRandomColor() {
        const r = Math.floor(Math.random() * 256);
        const g = Math.floor(Math.random() * 256);
        const b = Math.floor(Math.random() * 256);
        return `rgb(${r}, ${g}, ${b})`;
    }
    // Рисуем градиентный фон
    const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    gradient.addColorStop(0, getRandomColor());
    gradient.addColorStop(1, getRandomColor());
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    // Рисуем случайные линии
    for (let i = 0; i < 5; i++) {
        ctx.strokeStyle = getRandomColor();
        ctx.lineWidth = Math.random() * 3 + 1;
        ctx.beginPath();
        ctx.moveTo(Math.random() * canvas.width, Math.random() * canvas.height);
        ctx.lineTo(Math.random() * canvas.width, Math.random() * canvas.height);
        ctx.stroke();
    }
    // Рисуем случайные круги
    for (let i = 0; i < 5; i++) {
        ctx.fillStyle = getRandomColor();
        const radius = Math.random() * 10 + 5;
        const x = Math.random() * canvas.width;
        const y = Math.random() * canvas.height;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
    }
    // Рисуем случайные прямоугольники
    for (let i = 0; i < 3; i++) {
        ctx.fillStyle = getRandomColor();
        const width = Math.random() * 30 + 10;
        const height = Math.random() * 20 + 10;
        const x = Math.random() * canvas.width;
        const y = Math.random() * canvas.height;
        ctx.fillRect(x, y, width, height);
    }
    // Пишем число
    ctx.font = '36px Arial';
    ctx.fillStyle = getRandomColor();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(number.toString(), canvas.width / 2, canvas.height / 2);
    // Добавляем шумовые пиксели
    for (let i = 0; i < 100; i++) {
        const x = Math.random() * canvas.width;
        const y = Math.random() * canvas.height;
        ctx.fillStyle = getRandomColor();
        ctx.fillRect(x, y, 1, 1);
    }
    // Преобразуем изображение в base64
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

// Middleware для проверки капчи
async function captchaMiddleware(ctx, next) {
    try {
        const userId = ctx.from.id.toString();
        let session = getRegistrationSession(userId);
        // Проверяем, находится ли пользователь в состоянии ожидания капчи
        if (session?.captchaPending) {
            // Если пользователь отправил правильный ответ на капчу
            if (ctx.message && ctx.message.text.toLowerCase() === 'капча') {
                delete session.captchaPending;
                saveRegistrationSession(userId, session);
                return await showPrivacyPolicy(ctx);
            }
            return ctx.reply('<b>📚 Для завершения регистрации необходимо пройти капчу!</b>', { parse_mode: 'HTML' });
        }
        // Если пользователь еще не принял политику конфиденциальности
        if (!session?.policyAccepted) {
            return ctx.reply('<b>❕ Для использования бота, необходимо принять Политику Конфиденциальности.</b>', { parse_mode: 'HTML' });
        }
        // Если все условия выполнены, переходим к следующему middleware
        return next();
    } catch (error) {
        console.error('[CAPTCHA] Ошибка при проверке капчи:', error);
        return ctx.reply('<b>Произошла ошибка при проверке капчи. Попробуйте позже.</b>', { parse_mode: 'HTML' });
    }
}

// Показать сообщение с политикой конфиденциальности
async function showPrivacyPolicy(ctx) {
    try {
        // Получаем ссылку на политику из переменных окружения
        const privacyPolicyUrl = process.env.PRIVACY_POLICY_URL;

        // Проверяем, что ссылка существует
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
        // Если сессия отсутствует, создаем новую
        if (!session) {
            session = {};
        }
        // Устанавливаем, что пользователь принял политику
        session.policyAccepted = true; // Установка флага policyAccepted
        // Удаляем все временные состояния
        delete session.captchaPending;
        delete session.registrationInProgress;
        // Сохраняем обновленную сессию
        saveRegistrationSession(userId, session); // Сохраняем сессию
        console.log(`[POLICY] Пользователь ${userId} принял политику конфиденциальности.`);
        // Завершаем регистрацию
        await completeRegistration(ctx);
    } catch (error) {
        console.error('[PRIVACY_POLICY] Ошибка при обработке принятия политики конфиденциальности:', error);
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
  
      // Проверяем, завершил ли пользователь регистрацию ранее
      if (user.is_registered) {
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
  
      // Обработка реферального бонуса
      const referralCode = session.referralCode;
      if (referralCode) {
        try {
          const referrer = await getUserById(referralCode);
          if (!referrer) {
            console.warn(`[REGISTRATION] Реферальный код ${referralCode} недействителен.`);
            return; // Пропускаем начисление бонуса
          }
  
          // Получаем сумму бонуса для реферала
          const newUserBonus = 10000; // Бонус новому пользователю
          const referrerBonus = referrer.referral_bonus_amount || 30000; // Бонус рефереру
  
          // Начисляем бонусы
          await updateUserBalance(userId.toString(), newUserBonus); // Бонус новому пользователю
          await updateUserBalance(referralCode, referrerBonus); // Бонус рефереру
  
          // === ДОБАВЛЕНО: Выдача конфет рефереру ===
          const { giveCandy } = require('../db'); // Импортируем функцию из db.js
          const candyAmount = 25; // Количество конфет
          giveCandy(referralCode, candyAmount); // Выдаем конфеты рефереру
          // === КОНЕЦ ДОБАВЛЕНИЯ ===
  
          // Отправляем сообщение рефереру
          const referrerLink = createUserLink(userId, username || first_name);
          const message = `
  ☑️ Вы получили +${referrerBonus} PF за привлечение нового пользователя!
  👥 Реферал: ${referrerLink}
  🍬 + ${candyAmount} конфет!
  `;
          await ctx.telegram.sendMessage(referrer.id, message, { parse_mode: 'HTML' });
          console.log(`[REGISTRATION] Реферальный бонус и конфеты начислены пользователю ${userId} и рефереру ${referrer.id}.`);
  
          // Создаем кнопку для реферальной ссылки
          const referralButton = Markup.inlineKeyboard([
            Markup.button.callback('🔗 Реферальная ссылка', 'referral_link'),
          ]);
          const newUserMessage = `
  🎁 <b>Бонус за регистрацию по реф. ссылке:</b> +${newUserBonus} PF
  🔗 Теперь и вы можете приглашать друзей и получать бонусы!
  `;
          await ctx.replyWithHTML(newUserMessage, referralButton);
  
          // Обновляем реферера в базе данных
          await updateUserData(userId.toString(), { referrer_id: referralCode });
        } catch (error) {
          console.error('[REGISTRATION] Ошибка при обработке реферального бонуса:', error);
        }
      }
  
      // Корректная очистка состояний регистрации
      destroyRegistrationSession(userId);
      console.log(`[REGISTRATION] Все шаги регистрации завершены.`);
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
        if (session?.registration?.registrationInProgress) {
            return ctx.reply('❗ Вы уже в процессе регистрации.');
        }
        // Проверяем, зарегистрирован ли пользователь
        const user = await getUserById(id.toString());
        if (user) {
            console.log(`Пользователь ${id} уже зарегистрирован.`);
            return ctx.reply('❕Вы уже зарегистированы, либо в процессе регистрации. Напишите " /help " , чтобы узнать доступные команды.');
        }
        // Обработка реферального кода
        const parts = ctx.message.text.split(/\s+/);
        const referralCode = parts.length > 1 ? parts[1] : null;
        // Сохраняем реферальный код в сессию
        if (!session.registration) session.registration = {};
        session.registration.referralCode = referralCode;
        saveRegistrationSession(sessionId, session.registration);
        // Начинаем процесс регистрации
        session.registration.registrationInProgress = true;
        saveRegistrationSession(sessionId, session.registration);
        const welcomeMsg = `👋 WELKOM to F BOT!`;
        await ctx.reply(welcomeMsg, { parse_mode: 'HTML' });
        // Моделируем добавление пользователя в базу данных
        let loadingMessage = await ctx.reply('<b>📂 Добавляем вас в базу данных бота...</b>', { parse_mode: 'HTML' });
        const progressBarSteps = Array.from({ length: 16 }, (_, i) => '█'.repeat(i + 1) + '░'.repeat(16 - i - 1));
        for (let i = 0; i < progressBarSteps.length; i++) {
            await new Promise(res => setTimeout(res, 20)); // Ускоряем прогрузку
            const progressBar = progressBarSteps[i];
            const messageText = `<b>📂 Добавляем вас в базу данных бота...</b>
${progressBar}`;
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
            referral_join_date: Math.floor(Date.now() / 1000) // Текущее время в Unix-формате
        };
        await createUserOrUpdate(newUser);
        console.log(`Пользователь ${id} создан в базе данных.`);
        // Начинаем проверку капчи
        session.registration.captchaPending = true;
        saveRegistrationSession(sessionId, session.registration);
        const correctAnswer = await generateCaptcha(ctx, session);
        session.registration.correctCaptchaAnswer = correctAnswer;
        saveRegistrationSession(sessionId, session.registration);
    } catch (error) {
        console.error('Ошибка при регистрации:', error);
        await ctx.reply('Произошла ошибка. Попробуйте позже.', { parse_mode: 'HTML' });
    }
}

// Обновленная функция generateCaptcha
async function generateCaptcha(ctx, session) {
    const numbers = Array.from({ length: 90 }, (_, i) => 10 + i); // Генерируем массив двухзначных чисел (10-99)
    const selectedNumbers = []; // Массив для выбранных чисел
    // Выбираем 6 уникальных чисел из массива
    while (selectedNumbers.length < 6) {
        const randomIndex = Math.floor(Math.random() * numbers.length);
        const randomNumber = numbers[randomIndex];
        if (!selectedNumbers.includes(randomNumber)) {
            selectedNumbers.push(randomNumber);
            numbers.splice(randomIndex, 1); // Удаляем выбранное число из массива
        }
    }
    const correctNumberIndex = Math.floor(Math.random() * selectedNumbers.length); // Индекс правильного числа
    const correctAnswer = `captcha_${selectedNumbers[correctNumberIndex]}`; // Правильный ответ
    // Создаем массив всех возможных ответов
    const answers = [...selectedNumbers.map((number, index) => `wrong_${number}`)];
    answers[correctNumberIndex] = correctAnswer; // Заменяем правильный ответ
    answers.sort(() => Math.random() - 0.5); // Перемешиваем ответы
    // Создаем массив кнопок с текстом (числами)
    const buttons = answers.map(answer => {
        const number = parseInt(answer.split('_')[1], 10); // Извлекаем число из answer
        return Markup.button.callback(number.toString(), answer); // Указываем текст и callback_data
    });
    // Формируем клавиатуру
    const keyboard = Markup.inlineKeyboard([
        buttons.slice(0, 3), // Первый ряд кнопок
        buttons.slice(3, 6)  // Второй ряд кнопок
    ]);
    // Генерируем изображение с правильным числом
    const imageBuffer = await generateCaptchaImage(selectedNumbers[correctNumberIndex]);
    // Отправляем сообщение с изображением и инлайн-клавиатурой
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
    // Редактируем существующее сообщение
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
        // Если сессия отсутствует, создаем новую
        if (!session) {
            session = {};
        }
        // Удаляем состояние капчи
        delete session.captchaPending;
        // Сохраняем обновленную сессию
        saveRegistrationSession(userId, session);
        console.log(`[CAPTCHA] Пользователь ${userId} успешно прошел капчу.`);
        // Удаляем сообщение с кнопками
        await ctx.deleteMessage(ctx.callbackQuery.message.message_id);
        // Показываем политику конфиденциальности
        await showPrivacyPolicy(ctx);
        // Уведомляем пользователя об успешном прохождении капчи
        ctx.answerCbQuery('Капча пройдена успешно!');
    } catch (error) {
        console.error('Ошибка при обработке правильного ответа на капчу:', error);
        ctx.answerCbQuery('Произошла ошибка при проверке капчи.');
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
        ctx.answerCbQuery('Неверный выбор. Попробуйте еще раз.');
    } catch (error) {
        console.error('Ошибка при обработке неправильного ответа на капчу:', error);
        ctx.answerCbQuery('Произошла ошибка при проверке капчи.');
    }
}

module.exports = { 
    registerHandler, 
    handleCaptchaCorrect, 
    handleCaptchaWrong, 
    captchaMiddleware, 
    handlePrivacyPolicyAcceptance 
};