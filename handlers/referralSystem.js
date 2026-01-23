//referralSystem.js
const {
  getUserById,
  createUserOrUpdate,
  updateUserBalance,
  getReferralsByReferrerId,
  getUserByNumericId,
  isHyperlinkDisabled,
  updateReferralBonusAmount,
  getAllUsers,
  getTopSeasonalReferrers, getCardDetails, getSelectedSkinFileName
} = require('../db');
const { Markup } = require('telegraf');
const { isAdmin } = require('../admin/addBalance'); // Из папки admin
const { handlePartnershipCommand } = require('../handlers/rules');
const path = require('path');
const topPfImagePath = path.join(__dirname, '..', 'images', 'top_refs.png');
const fs = require('fs');
const { createCanvas, loadImage } = require('canvas');


// Функция для создания ссылки на пользователя с учетом анонимности
function createUserLink(userId, username, disableHyperlink) {
  // Экранируем только те символы, которые действительно требуют экранирования в HTML
  const escapedUsername = username
    ? username.replace(/([<>&"'])/g, (match) => {
        const escapeMap = {
          '<': '<',
          '>': '>',
          '&': '&amp;',
          '"': '&quot;',
          "'": '&#39;',
        };
        return escapeMap[match];
      })
    : 'Неизвестный';

  if (disableHyperlink) {
    return escapedUsername; // Выводим только ник без гиперссылки
  }

  return `<a href="tg://user?id=${userId}">${escapedUsername}</a>`; // Гиперссылка
}

// Функция для генерации реферальной ссылки
function generateReferralLink(userId) {
  if (!process.env.BOT_USERNAME) {
      console.error('BOT_USERNAME не определен в .env');
      return null;
  }
  return `https://t.me/${process.env.BOT_USERNAME}?start=${userId}`;
}

// Функция для обработки команды "реф"
async function referralLinkHandler(ctx) {
  try {
    const userId = ctx.from.id.toString();
    const user = await getUserById(userId);

    if (!user) {
      return ctx.reply('Для получения реферальной ссылки необходимо зарегистироваться.');
    }

    // Генерируем реферальную ссылку
    const referralLink = generateReferralLink(user.id);
    if (!referralLink) {
      return ctx.reply('Произошла ошибка при генерации реферальной ссылки.');
    }

    // Создаем клавиатуру с кнопками (в 3 ряда)
    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback('Мои рефералы', 'my_referrals'),
        Markup.button.callback('Реф инфо', 'ref_info')
      ],
      [
        Markup.button.callback('🤝 Сотрудничество', 'partnership_info') // Третья кнопка
      ]
      // ,
      // [
      //   Markup.button.callback('🏆 ЗАРАБОТАТЬ РУБЛИ', 'contest_info') // Новая кнопка "КОНКУРС"
      // ]
    ]);

    // Отправляем сообщение с моноширинным шрифтом для ссылки и кнопками
    await ctx.replyWithHTML(
      `🌟 Ваша реферальная ссылка:\n\n👉 <code>${referralLink}</code>\n\n`
      + `💲 За каждого приведенного друга вы получите по 30.000 PF + 10% с каждого доната вашего реферала!`,
      keyboard
    );
  } catch (error) {
    console.error('Ошибка при обработке реферальной ссылки:', error);
    await ctx.reply('Произошла ошибка. Попробуйте позже.');
  }
}
// Обработчик кнопки "КОНКУРС"
async function handleContestInfo(ctx) {
  try {
    // Создаем клавиатуру с кнопками (назад в меню и сезонный топ)
    const keyboard = {
      inline_keyboard: [
        [
          { text: '📈 Топ Реферальной акции', callback_data: 'top_seasonal_referrals' } // Кнопка на сезонный топ
        ],
        [
          { text: '⬅️ Назад', callback_data: 'back_to_ref_menu' } // Кнопка назад в реф меню
        ]
      ]
    };

    // Текст условия акции
    const contestMessage = `
📝 <b>Условия акции:</b>
• Приглашай новых пользователей в нашего бота, через свою реферальную ссылку!
• Покоряй топ акции и зарабатывай реальные деньги!
• Игроки, занявшие ПРИЗОВЫЕ места в топе, по окончанию акции, получат соответствующие награды к своим позициям, которые написаны ниже

🎁 <b>Призы:</b>
• ТОП 1: 1.25О₽
• ТОП 2: 75О₽ 
• ТОП 3: 5ОО₽ 
• ТОП 4 - 1О: TG подарок "мишка"

⏰ <b>Акция действует до 15 июля 2025 года.</b>

ℹ️ <b>Доп.информация:</b>
• Узнать свое и место других игроков в акции - "топ — топ рефералов — топ акции"!
• Накрутка запрещается и карается дисквалификацией с акции!

`;

    // Путь к изображению
    const imagePath = './images/ref_concu.jpg';

    // Отправляем сообщение с изображением, текстом и кнопками
    await ctx.replyWithPhoto(
      { source: imagePath }, // Указываем источник изображения
      {
        caption: contestMessage.trim(), // Добавляем текст с разметкой
        parse_mode: 'HTML', // Указываем режим разметки
        reply_markup: keyboard // Добавляем клавиатуру
      }
    );
  } catch (error) {
    console.error('Ошибка при обработке информации о конкурсе:', error);
    await ctx.reply('Произошла ошибка. Попробуйте позже.');
  }
}
// async function referralLinkHandler(ctx) {
//     try {
//         // Отправляем сообщение о том, что функция временно недоступна
//         return ctx.replyWithHTML(
//             `🚧 <b>Реферальная система временно недоступна</b>\n\n`
//             +`Данная функция находится в разработке и будет доступна после завершения ОБТ.\n\n`
//             +`Следите за обновлениями в официальном канале!`
//         );
//     } catch (error) {
//         console.error('Ошибка при обработке запроса реферальной ссылки:', error);
//         ctx.reply('Произошла ошибка. Попробуйте позже.');
//     }
// }

// Обработчик кнопки "Мои рефералы"
async function handleMyReferrals(ctx) {
  try {
      const userId = ctx.from.id.toString();
      const user = await getUserById(userId);

      if (!user) {
          return ctx.reply('❕ Вы не зарегистированы. Используйте команду "/start" для регистрации.');
      }

      // Получаем список рефералов пользователя
      const referrals = await getReferralsByReferrerId(user.id);

      if (referrals.length === 0) {
          // Генерируем реферальную ссылку
          const referralLink = generateReferralLink(user.id);
          if (!referralLink) {
              return ctx.reply('Произошла ошибка при генерации реферальной ссылки.');
          }

          // Отправляем сообщение с моноширинной реферальной ссылкой
          return ctx.replyWithHTML(
              '😞 У вас пока нет рефералов.\n\n' +
              'Поделитесь своей реферальной ссылкой и получите бонусы за каждого приведенного друга!\n\n' +
              `🔗 Ваша реферальная ссылка:\n<code>${referralLink}</code>`
          );
      }

      // Формируем список рефералов в читаемом виде с использованием гиперссылок и даты регистрации
      let referralList = '';
      for (const [index, referral] of referrals.entries()) {
          const username = referral.username || `Пользователь${referral.numeric_id}`;
          const userLink = `<a href="tg://user?id=${referral.id}">${username}</a>`;
          const registrationDate = new Date(referral.registration_date * 1000); // Преобразуем Unix-время в объект Date
          const formattedDate = registrationDate.toLocaleString(); // Форматируем дату и время
          referralList += `${index + 1}. ${userLink} (Дата регистрации: ${formattedDate})\n`;
      }

      // Разделяем сообщение на части, если оно слишком длинное
      const maxMessageLength = 4096; // Максимальная длина сообщения в Telegram
      const messages = [];
      let currentMessage = '';

      for (const line of referralList.split('\n')) {
          if ((currentMessage + line).length > maxMessageLength) {
              messages.push(currentMessage.trim());
              currentMessage = ''; // Сбрасываем текущее сообщение
          }
          currentMessage += line + '\n';
      }

      // Добавляем оставшуюся часть сообщения
      if (currentMessage.trim().length > 0) {
          messages.push(currentMessage.trim());
      }

      // Отправляем каждое сообщение отдельно
      for (const message of messages) {
          await ctx.replyWithHTML(
              `🌟 <b>Ваши рефералы:</b>\n\n${message}\n\n` +
              `💲 За каждого реферала вы получаете бонус в размере 30.000 PF!`
          );
      }
  } catch (error) {
      console.error('Ошибка при получении списка рефералов:', error);
      ctx.reply('Произошла ошибка. Попробуйте позже.');
  }
}

// async function handleMyReferrals(ctx) {
//     try {
//         // Отправляем сообщение о том, что функция временно недоступна
//         return ctx.replyWithHTML(
//             `🚧 <b>Реферальная система временно недоступна</b>\n\n`
//             +`Данная функция будет доступна после завершения ОБТ.\n\n`
//             +`Следите за обновлениями в официальном канале!`
//         );
//     } catch (error) {
//         console.error('Ошибка при обработке запроса рефералов:', error);
//         ctx.reply('Произошла ошибка. Попробуйте позже.');
//     }
// }

// Обработчик кнопки "Реф инфо"
async function handleRefInfo(ctx) {
  try {
      ctx.replyWithHTML(
          `ℹ️ <b>Информация о реферальной системе:</b>\n\n` +
          `• Для участия в реферальной программе используйте свою уникальную ссылку.\n` +
          `• За каждого приведенного пользователя вы получите <b>30.000 PF</b>.\n` +
          `• Приведенный пользователь также получит <b>10.000 PF</b> за регистрацию.\n\n` +
          `🌟 Чтобы получить вашу реферальную ссылку, используйте команду /реф.`
      );
  } catch (error) {
      console.error('Ошибка при обработке информации о реферальной системе:', error);
      ctx.reply('Произошла ошибка. Попробуйте позже.');
  }
}

// Функция для обработки реферальной регистрации
async function handleReferralRegistration(ctx, referralCode) {
  try {
    const { id: userId, first_name, username } = ctx.from;

    // Проверяем, существует ли пользователь в базе данных
    let user = await getUserById(userId.toString());
    if (user && user.is_registered) {
      return ctx.reply('Вы уже зарегистрированы.');
    }

    // Проверяем, существует ли реферер по предоставленному коду
    const referrer = await getUserById(referralCode);
    if (!referrer) {
      // Если реферальный код не найден, регистрируем как обычного пользователя без реферера
      await createUserOrUpdate({
        id: userId.toString(),
        first_name: processUsername(first_name),
        is_registered: false, // Устанавливаем флаг "не зарегистрирован"
      });
      return ctx.reply('Вы успешно начали процесс регистрации. Пройдите капчу для завершения.');
    }

    // Регистрируем пользователя БЕЗ указания реферера в базе данных
    await createUserOrUpdate({
      id: userId.toString(),
      first_name: processUsername(first_name),
      is_registered: false, // Устанавливаем флаг "не зарегистрирован"
    });

    // Сохраняем реферальный код в сессии регистрации
    const session = getRegistrationSession(userId) || {};
    session.referralCode = referralCode; // Сохраняем реферальный код в сессии
    saveRegistrationSession(userId, session);

    ctx.reply(
      'Вы успешно начали процесс регистрации через реферальную ссылку. ' +
      'Пройдите капчу для завершения регистрации.'
    );
  } catch (error) {
    console.error('Ошибка при реферальной регистрации:', error);
    ctx.reply('Произошла ошибка. Попробуйте позже.');
  }
}

// Функция для изменения бонуса рефералу
async function changeReferralBonus(ctx, parts) {
  try {
      // Проверка прав администратора
      if (!(await isAdmin(ctx))) {
          return ctx.reply('У вас нет прав для использования этой команды.');
      }

      // Проверяем количество аргументов
      if (parts.length !== 3) {
          return ctx.reply('Использование: сменить_реф [numeric_id] [новая сумма бонуса]');
      }

      const numericId = parseInt(parts[1], 10);
      const newBonusAmount = parseInt(parts[2], 10);

      if (isNaN(numericId) || isNaN(newBonusAmount)) {
          return ctx.reply('Некорректные аргументы. Использование: сменить_реф [numeric_id] [новая сумма бонуса]');
      }

      // Получаем пользователя по numeric_id
      const user = await getUserByNumericId(numericId);
      if (!user) {
          return ctx.reply('Пользователь с указанным numeric_id не найден.');
      }

      // Обновляем сумму бонуса рефералу с использованием новой функции
      const result = await updateReferralBonusAmount(numericId, newBonusAmount);
      if (result.success) {
          ctx.reply(`Сумма бонуса для пользователя ${createUserLink(user.id, user.username)} успешно изменена на ${newBonusAmount} PF.`);

          // Отправляем уведомление пользователю
          const userMessage = `
👥 Ваша реферальная награда за приведенного пользователя, была изменена администрацией бота!
💰 Новая сумма бонуса: ${newBonusAmount} PF
`.trim();
          await ctx.telegram.sendMessage(user.id, userMessage, { parse_mode: 'HTML' }).catch((error) => {
              console.error(`Не удалось отправить сообщение пользователю ${user.id}:`, error);
          });
      } else {
          ctx.reply('Не удалось обновить сумму бонуса.');
      }
  } catch (error) {
      console.error('Ошибка при изменении бонуса рефералу:', error);
      ctx.reply('Произошла ошибка. Попробуйте позже.');
  }
}


// Функция для массового изменения бонуса рефералу у всех пользователей
async function setReferralBonusForAllUsers(ctx) {
  try {
    // Проверка прав администратора
    if (!(await isAdmin(ctx))) {
      return ctx.reply('У вас нет прав для использования этой команды.');
    }

    // Задаем новое значение бонуса рефералу
    const newBonusAmount = 30000;

    // Получаем всех пользователей
    const allUsers = getAllUsers();

    // Обновляем бонус рефералу для каждого пользователя
    for (const user of allUsers) {
      const result = await updateReferralBonusAmount(user.numeric_id, newBonusAmount);
      if (!result.success) {
        console.error(`Не удалось обновить бонус рефералу для пользователя с numeric_id=${user.numeric_id}`);
      }
    }

    // Отправляем подтверждение
    ctx.reply(`✅ Сумма бонуса рефералу успешно изменена на ${newBonusAmount} PF для всех пользователей.`);
  } catch (error) {
    // Обработка ошибок
    console.error('Ошибка при массовом изменении бонуса рефералу:', error);
    ctx.reply('Произошла ошибка. Попробуйте позже.');
  }
}

// Функция для обработки имени пользователя
function processUsername(name) {
  if (!name) {
      return 'Press Эфыч';
  }
  return name.slice(0, 16).trim() || 'Press Эфыч';
}

// Функция для правильного склонения слова "реферал"
function getPlural(count) {
  const lastDigit = count % 10;
  const lastTwoDigits = count % 100;

  if (lastTwoDigits >= 11 && lastTwoDigits <= 14) {
      return 'ов';
  }

  if (lastDigit === 1) {
      return '';
  }

  if (lastDigit >= 2 && lastDigit <= 4) {
      return 'а';
  }

  return 'ов';
}

async function getTopReferrals(adminId = null) {
  try {
    // Получаем всех пользователей
    const allUsers = await getAllUsers();

    // Формируем массив с количеством рефералов для каждого пользователя
    const referralCounts = await Promise.all(
      allUsers.map(async (user) => {
        // Исключаем администратора, если указан adminId
        if (adminId && user.id === adminId) return null;

        // Исключаем пользователей без numeric_id
        if (!user.numeric_id) return null;

        // Получаем количество рефералов пользователя
        const referrals = await getReferralsByReferrerId(user.id);
        console.log(`[DEBUG] Рефералы для пользователя ${user.id}:`, referrals);

        // Фильтруем рефералов: учитываем только тех, кто завершил регистрацию
        const registeredReferrals = referrals.filter((referral) => {
          // Если колонка is_registered отсутствует или равна NULL, считаем пользователя зарегистрированным
          return referral.is_registered !== false; // true или NULL
        });
        console.log(`[DEBUG] Зарегистрированные рефералы для пользователя ${user.id}:`, registeredReferrals);

        return {
          userId: user.id,
          username: user.username || `Пользователь${user.id}`,
          referralCount: registeredReferrals.length,
        };
      })
    );

    // Фильтруем null (исключенные администраторы и пользователи без numeric_id) и сортируем по количеству рефералов
    const sortedReferrals = referralCounts
      .filter((item) => item !== null) // Убираем null
      .sort((a, b) => b.referralCount - a.referralCount); // Сортируем по убыванию

    console.log('Общий топ рефералов:', sortedReferrals);

    // Возвращаем массив (даже если он пуст)
    return sortedReferrals;
  } catch (error) {
    console.error('❌ Ошибка при получении топа рефералов:', error);
    throw error;
  }
}

// Функция для преобразования числа в эмодзи
function numberToEmoji(number) {
  const emojiDigits = [
    '0️⃣', '1️⃣', '2️⃣', '3️⃣', '4️⃣',
    '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣'
  ];

  if (number <= 10) {
    return number === 10 ? '🔟' : `${number}️⃣`;
  }

  // Преобразуем число в строку и заменяем каждую цифру на соответствующий эмодзи
  return number.toString().split('').map(digit => emojiDigits[parseInt(digit)]).join('');
}

async function generateTopReferralsImage(topReferrals) {
  try {
      console.log('Начинаем генерацию изображения топа рефералов...');

      // Загружаем фоновое изображение
      const topRefsImagePath = path.join(__dirname, '..', 'images', 'top_refs.jpg'); // Путь к шаблону для топа рефералов
      if (!fs.existsSync(topRefsImagePath)) {
          console.error(`❌ Фоновое изображение "${topRefsImagePath}" не найдено.`);
          throw new Error('Фоновое изображение не найдено.');
      }
      const background = await loadImage(topRefsImagePath);

      // Создаём канвас
      const canvas = createCanvas(background.width, background.height);
      const ctx = canvas.getContext('2d');

      // Рисуем фоновое изображение
      ctx.drawImage(background, 0, 0, canvas.width, canvas.height);

      // Список скинов, которые не требуют обрезки
      const noCropSkins = [
          'map_chan_red.jpg',
          'map_chan_spider.jpg',
          'map_chan_cat.jpg',
          'ОХРАННИК_КВАДРАТ.jpg',
          'ОХРАННИК_ТРЕУГОЛЬНИК.jpg',
          'ОХРАННИК_КРУГ.jpg',
          'frontmen.jpg',
          'juicy_tjan.png',
          
      ];

      // Настройки позиций для каждого места в топе
      const settings = [
          {
              position: { x: 665, y: 440 }, // Позиция скина для топ-1 (увеличенный масштаб)
              skinSize: { width: 589, height: 343 }, // Увеличенный размер скина для топ-1
              usernamePosition: { x: 700, y: 482 }, // Позиция обычного ника для топ-1 (для обрезаемых скинов)
              bigUsernamePosition: { x: 700, y: 877 }, // Позиция большого ника для топ-1 (для обрезаемых скинов)
              cardNumberPosition: { x: 700, y: 742 }, // Позиция номера карты для топ-1
              noCropUsernamePosition: { x: 700, y: 482 }, // Позиция обычного ника для топ-1 (для не обрезаемых скинов)
              noCropBigUsernamePosition: { x: 700, y: 877 }, // Позиция большого ника для топ-1 (для не обрезаемых скинов)
              noCropCardNumberPosition: { x: 700, y: 742 }, // Позиция номера карты для топ-1 (для не обрезаемых скинов)
              usernameFontSize: 22, // Размер шрифта обычного никнейма
              bigUsernameFontSize: 32, // Размер шрифта большого никнейма
              cardNumberFontSize: 22, // Размер шрифта номера карты
          },
          {
              position: { x: 61, y: 129 }, // Позиция скина для топ-2
              skinSize: { width: 459, height: 267 }, // Размер скина для топ-2
              usernamePosition: { x: 100, y: 163 }, // Позиция обычного ника для топ-2 (для обрезаемых скинов)
              bigUsernamePosition: { x: 80, y: 470 }, // Позиция большого ника для топ-2 (для обрезаемых скинов)
              cardNumberPosition: { x: 90, y: 370 }, // Позиция номера карты для топ-2
              noCropUsernamePosition: { x: 160, y: 202 }, // Позиция обычного ника для топ-2 (для не обрезаемых скинов)
              noCropBigUsernamePosition: { x: 90, y: 470 }, // Позиция большого ника для топ-2 (для не обрезаемых скинов)
              noCropCardNumberPosition: { x: 160, y: 330 }, // Позиция номера карты для топ-2 (для не обрезаемых скинов)
              usernameFontSize: 14, // Размер шрифта обычного никнейма
              bigUsernameFontSize: 26, // Размер шрифта большого никнейма
              cardNumberFontSize: 14, // Размер шрифта номера карты
          },
          {
              position: { x: 1401, y: 129 }, // Позиция скина для топ-3
              skinSize: { width: 459, height: 267 }, // Размер скина для топ-3
              usernamePosition: { x: 1430, y: 163 }, // Позиция обычного ника для топ-3 (для обрезаемых скинов)
              bigUsernamePosition: { x: 1430, y: 470 }, // Позиция большого ника для топ-3 (для обрезаемых скинов)
              cardNumberPosition: { x: 1430, y: 370 }, // Позиция номера карты для топ-3
              noCropUsernamePosition: { x: 1500, y: 163 }, // Позиция обычного ника для топ-3 (для не обрезаемых скинов)
              noCropBigUsernamePosition: { x: 1430, y: 470 }, // Позиция большого ника для топ-3 (для не обрезаемых скинов)
              noCropCardNumberPosition: { x: 1500, y: 330 }, // Позиция номера карты для топ-3 (для не обрезаемых скинов)
              usernameFontSize: 14, // Размер шрифта обычного никнейма
              bigUsernameFontSize: 26, // Размер шрифта большого никнейма
              cardNumberFontSize: 14, // Размер шрифта номера карты
          },
      ];

      // Проходим по каждому игроку и накладываем его скин
      for (let i = 0; i < Math.min(3, topReferrals.length); i++) {
          const referral = topReferrals[i];
          const userId = referral?.userId;

          // Проверяем, что userId существует
          if (!userId) {
              console.warn(`⚠️ Пропущен участник с индексом ${i}: userId отсутствует.`);
              continue;
          }

          // Преобразуем userId в строку с проверкой
          const userIdString = userId.toString();

          // Получаем имя скина
          const skinFileName = await getSelectedSkinFileName(userIdString);
          if (!skinFileName) {
              console.warn(`⚠️ Скин не найден для пользователя с ID: ${userIdString}`);
              continue;
          }

          // Загружаем изображение скина
          const skinPath = path.join(__dirname, '..', 'images', skinFileName);
          if (!fs.existsSync(skinPath)) {
              console.warn(`⚠️ Файл скина не найден: ${skinPath}`);
              continue;
          }
          const originalSkin = await loadImage(skinPath);

          // Определяем текущие настройки
          const setting = settings[i];

          // Создаём временный canvas для обработки скина
          const tempCanvas = createCanvas(setting.skinSize.width, setting.skinSize.height);
          const tempCtx = tempCanvas.getContext('2d');

          // Проверяем, нужно ли обрезать скин
          if (!noCropSkins.includes(skinFileName)) {
              // Обрезаем края скина
              const crop = { top: 191, bottom: 191, left: 361, right: 361 };
              const croppedWidth = originalSkin.width - crop.left - crop.right;
              const croppedHeight = originalSkin.height - crop.top - crop.bottom;

              // Масштабируем обрезанное изображение до целевого размера
              tempCtx.drawImage(
                  originalSkin,
                  crop.left, crop.top, croppedWidth, croppedHeight,
                  0, 0, setting.skinSize.width, setting.skinSize.height
              );
          } else {
              // Если скин не требует обрезки, просто рисуем оригинальное изображение
              tempCtx.drawImage(originalSkin, 0, 0, setting.skinSize.width, setting.skinSize.height);
          }

          // Создаём второй временный canvas для скругления углов
          const roundedCanvas = createCanvas(setting.skinSize.width, setting.skinSize.height);
          const roundedCtx = roundedCanvas.getContext('2d');

          // Применяем скругление углов
          roundImageCorners(roundedCtx, setting.skinSize.width, setting.skinSize.height, 20);

          // Рисуем обработанное изображение на canvas со скругленными углами
          roundedCtx.drawImage(tempCanvas, 0, 0);

          // Рисуем обработанный скин на основном canvas
          ctx.drawImage(
              roundedCanvas,
              setting.position.x,
              setting.position.y,
              setting.skinSize.width,
              setting.skinSize.height
          );

          // Получаем информацию о пользователе
          const username = referral.username || `User${userId}`;
          const cardNumber = referral.cardNumber || 'Номер карты не указан';

          console.log(`Данные пользователя ${userId}: username="${username}", cardNumber=${cardNumber}.`);

          // Определяем позиции текста в зависимости от типа скина
          const isNoCropSkin = noCropSkins.includes(skinFileName);
          const usernamePosition = isNoCropSkin ? setting.noCropUsernamePosition : setting.usernamePosition;
          const bigUsernamePosition = isNoCropSkin ? setting.noCropBigUsernamePosition : setting.bigUsernamePosition;
          const cardNumberPosition = isNoCropSkin ? setting.noCropCardNumberPosition : setting.cardNumberPosition;

          // Устанавливаем стиль текста для обычного никнейма
          ctx.font = `${setting.usernameFontSize}px Arial`;
          ctx.fillStyle = '#000000'; // Цвет текста (белый)
          ctx.fillText(username, usernamePosition.x, usernamePosition.y);
          console.log(`Обычный никнейм нарисован: "${username}" (позиция: ${usernamePosition.x}, ${usernamePosition.y}).`);

          // Устанавливаем стиль текста для большого никнейма
          ctx.font = `${setting.bigUsernameFontSize}px Arial`;
          ctx.fillStyle = '#FFFFFF'; // Цвет текста (белый)
          ctx.fillText(username, bigUsernamePosition.x, bigUsernamePosition.y);
          console.log(`Большой никнейм нарисован: "${username}" (позиция: ${bigUsernamePosition.x}, ${bigUsernamePosition.y}).`);

          // Устанавливаем стиль текста для номера карты
          ctx.font = `${setting.cardNumberFontSize}px Arial`;
          ctx.fillStyle = '#000000'; // Цвет текста ()
          ctx.fillText(cardNumber, cardNumberPosition.x, cardNumberPosition.y);
          console.log(`Номер карты нарисован: "${cardNumber}" (позиция: ${cardNumberPosition.x}, ${cardNumberPosition.y}).`);
      }

      // Добавляем наложение дополнительных изображений
      const additionalImages = ['top_1.png', 'top_2.png', 'top_3.png']; // Список дополнительных изображений
      const additionalImageSettings = [
          { position: { x: 470, y: 350 }, size: { width: 294, height: 349 } }, // Позиция и размер для top_1.png
          { position: { x: -30, y: 80 }, size: { width: 141, height: 181 } }, // Позиция и размер для top_2.png
          { position: { x: 1790, y: 75 }, size: { width: 159, height: 199 } }, // Позиция и размер для top_3.png
      ];

      for (let i = 0; i < Math.min(3, additionalImages.length); i++) {
          const imagePath = path.join(__dirname, '..', 'images', additionalImages[i]);
          if (!fs.existsSync(imagePath)) {
              console.warn(`⚠️ Дополнительное изображение не найдено: ${imagePath}`);
              continue;
          }
          const additionalImage = await loadImage(imagePath);
          const { position, size } = additionalImageSettings[i];
          ctx.drawImage(additionalImage, position.x, position.y, size.width, size.height);
      }

      // Сохраняем изображение во временную папку
      const outputPath = path.join(__dirname, '..', 'temp', `top_referrals_${Date.now()}.png`);
      const out = fs.createWriteStream(outputPath);
      const stream = canvas.createPNGStream();
      stream.pipe(out);

      return new Promise((resolve, reject) => {
          out.on('finish', () => {
              console.log(`Изображение успешно сохранено: ${outputPath}`);
              resolve(outputPath);
          });
          out.on('error', (error) => {
              console.error('Ошибка при сохранении изображения:', error);
              reject(error);
          });
      });
  } catch (error) {
      console.error('Ошибка при генерации изображения топа рефералов:', error);
      throw error;
  }
}

// Функция для скругления углов изображения (более вытянутые и острые углы)
function roundImageCorners(ctx, width, height, radius) {
  ctx.beginPath();

  // Верхний левый угол
  ctx.moveTo(radius, 0);
  ctx.lineTo(width - radius, 0);

  // Верхний правый угол
  ctx.quadraticCurveTo(width, 0, width, radius);
  ctx.lineTo(width, height - radius);

  // Нижний правый угол
  ctx.quadraticCurveTo(width, height, width - radius, height);
  ctx.lineTo(radius, height);

  // Нижний левый угол
  ctx.quadraticCurveTo(0, height, 0, height - radius);
  ctx.lineTo(0, radius);

  // Верхний левый угол
  ctx.quadraticCurveTo(0, 0, radius, 0);

  ctx.closePath();
  ctx.clip();
}

async function topReferralsHandler(ctx) {
  try {
      // Проверяем, что ctx.from существует
      if (!ctx.from || !ctx.from.id) {
          console.error('❌ Ошибка: ctx.from или ctx.from.id не определены.');
          return ctx.reply('❌ Ошибка: невозможно определить отправителя.');
      }

      const callingUserId = ctx.from.id.toString(); // ID пользователя, вызвавшего команду
      let userPosition = null; // Переменная для хранения позиции пользователя
      let userReferrals = null; // Переменная для хранения количества рефералов пользователя

      // Получаем всех рефералов без ограничений
      const allReferrals = await getTopReferrals(null); // Получаем всех рефералов без исключения администратора

      // Проверяем, что список рефералов не пуст
      if (!allReferrals || allReferrals.length === 0) {
          console.error('❌ Список рефералов пуст.');
          return ctx.reply('Список рефералов пуст.');
      }

      // Находим позицию вызывающего пользователя в полном списке
      const userIndex = allReferrals.findIndex((r) => r.userId?.toString() === callingUserId);
      if (userIndex !== -1) {
          userPosition = userIndex + 1;
          userReferrals = allReferrals[userIndex].referralCount || 0;
          console.log(`Найдена позиция пользователя: ${userPosition}, количество рефералов: ${userReferrals}`);
      } else {
          console.warn(`⚠️ Пользователь (${callingUserId}) не найден в списке рефералов.`);
      }

      // Получаем данные вызывающего пользователя
      const callingUser = await getUserById(callingUserId);
      if (!callingUser) {
          console.error(`❌ Ошибка: пользователь с ID ${callingUserId} не найден в базе данных.`);
          return ctx.reply('Произошла ошибка. Попробуйте позже.');
      }

      // Проверяем состояние гиперссылки для вызывающего пользователя
      const disableHyperlinkCallingUser = isHyperlinkDisabled(callingUserId);
      const callingUserLink = createUserLink(
          callingUserId,
          callingUser?.username || 'Неизвестный',
          disableHyperlinkCallingUser
      );

      // Начинаем формировать сообщение с обращением к пользователю
      let message = `🏆 ${callingUserLink}, топ рефералов:\n\n`;

      // Добавляем список топ-рефералов (только первые 10)
      allReferrals.slice(0, 10).forEach((referral, index) => {
          if (!referral || typeof referral !== 'object') {
              console.warn(`⚠️ Пропущен некорректный элемент в списке рефералов (индекс: ${index}).`);
              return;
          }

          const position = index === 9 ? '🔟' : `${index + 1}️⃣`; // 🔟 для 10-го места
          const username = referral.username || `User${referral.userId}`;
          const disableHyperlink = isHyperlinkDisabled(referral.userId); // Проверяем состояние гиперссылки для текущего игрока
          const userLink = createUserLink(referral.userId, username, disableHyperlink); // Гиперссылка на пользователя
          const pluralSuffix = getPlural(referral.referralCount || 0); // Склонение слова "реферал"

          message += `${position} ${userLink} — ${referral.referralCount || 0} реферал${pluralSuffix}\n`;
      });

      // Если пользователь не входит в топ-10, добавляем его место в конце
      if (userPosition > 10) {
          const pluralSuffix = getPlural(userReferrals || 0); // Склонение слова "реферал"
          const disableHyperlink = isHyperlinkDisabled(callingUserId); // Проверяем состояние гиперссылки для вызывающего пользователя
          const userLink = createUserLink(
              callingUserId,
              callingUser?.username || 'Неизвестный',
              disableHyperlink
          );
          const positionEmoji = numberToEmoji(userPosition); // Преобразуем позицию в эмодзи

          message += `\n—————————————\n${positionEmoji} ${userLink} — ${userReferrals || 0} реферал${pluralSuffix}`;
      } else if (userPosition === null) {
          // Если пользователь вообще не имеет рефералов
          message += `\n—————————————\nВы еще не пригласили ни одного реферала.`;
      }

      // === ЕДИНАЯ КЛАВИАТУРА ДЛЯ ВСЕХ ТОПОВ ===
      const keyboard = {
        inline_keyboard: [
          [{ text: '⭐️ Топ донатеров', callback_data: 'top_donators' }],
          [{ text: '👥 Топ рефералов', callback_data: 'top_referrals' }],
          [{ text: '🍬 Топ по конфетам', callback_data: 'candy_top' }],
        ],
      };

      // Генерируем изображение топа рефералов
      const topImagePath = await generateTopReferralsImage(allReferrals.slice(0, 3)); // Первые 3 реферала

      // Отправляем изображение с текстом и кнопками
      await ctx.replyWithPhoto(
          { source: topImagePath },
          {
              caption: message, // Текст теперь является подписью к изображению
              parse_mode: 'HTML',
              reply_markup: keyboard,
          }
      );

      // Удаляем временный файл изображения
      fs.unlinkSync(topImagePath);
  } catch (error) {
      console.error('Ошибка при обработке команды "топ рефералов":', error);
      await ctx.reply('Произошла ошибка. Попробуйте позже.');
  }
}

async function topSeasonalReferralsHandler(ctx) {
  try {
    if (!ctx.from || !ctx.from.id) {
      console.error('❌ Ошибка: ctx.from или ctx.from.id не определены.');
      return ctx.reply('❌ Ошибка: невозможно определить отправителя.');
    }

    const callingUserId = ctx.from.id.toString();
    let message = '🏆 Топ реферальной акции:\n';

    // Получаем всех рефереров с сезонными рефералами
    const seasonalReferrers = await getTopSeasonalReferrers();

    if (!seasonalReferrers || seasonalReferrers.length === 0) {
      return ctx.reply('Список участников пуст.');
    }

    let userPosition = null;
    let userReferrals = null;

    for (let i = 0; i < seasonalReferrers.length && i < 10; i++) {
      const referrer = seasonalReferrers[i];
      const position = i === 9 ? '🔟' : `${i + 1}️⃣`;
      const username = referrer.username || 'Неизвестный';
      const disableHyperlink = isHyperlinkDisabled(referrer.telegram_id);
      const userLink = createUserLink(referrer.telegram_id, username, disableHyperlink);
      message += `${position} ${userLink} — ${referrer.referrals_count} реферал${getPlural(referrer.referrals_count)}\n`;

      if (referrer.telegram_id === callingUserId) {
        userPosition = i + 1;
        userReferrals = referrer.referrals_count;
      }
    }

    // Добавляем информацию о пользователе, если он не в топ-10
    if (userPosition === null) {
      const allReferrers = await getTopSeasonalReferrers();
      const userIndex = allReferrers.findIndex(r => r.telegram_id === callingUserId);

      if (userIndex !== -1) {
        userPosition = userIndex + 1;
        userReferrals = allReferrers[userIndex].referrals_count;

        if (userPosition > 10) {
          const positionEmoji = numberToEmoji(userPosition);
          const callingUser = await getUserById(callingUserId);
          const disableHyperlink = isHyperlinkDisabled(callingUserId);
          const userLink = createUserLink(
            callingUserId,
            callingUser?.username || 'Неизвестный',
            disableHyperlink
          );
          const pluralSuffix = getPlural(userReferrals);
          message += `
————————————————
${positionEmoji} ${userLink} — ${userReferrals} реферал${pluralSuffix}`;
        }
      } else {
        message += `
————————————————
Вы еще не пригласили ни одного реферала.`;
      }
    }

    // Создаем inline-клавиатуру с кнопкой "Открыть конкурс"
    const keyboard = Markup.inlineKeyboard([
      Markup.button.callback('🎁 Условия конкурса', 'open_contest') // Кнопка для открытия конкурса
    ]);


            await ctx.reply(message, { parse_mode: 'HTML', ...keyboard });
  } catch (error) {
    console.error('❌ Ошибка при обработке команды "топ рефералов июль":', error);
    await ctx.reply('❌ Произошла ошибка при получении топа рефералов.');
  }
}

// Обработчик кнопки "Назад" в реф меню
async function handleBackToRefMenu(ctx) {
  try {
    // Вызываем основную функцию реферальной системы
    await referralLinkHandler(ctx);
  } catch (error) {
    console.error('Ошибка при возврате в реф меню:', error);
    await ctx.reply('Произошла ошибка. Попробуйте позже.');
  }
}

module.exports = {
  referralLinkHandler,
  referralsListHandler: handleMyReferrals,
  handleReferralRegistration,
  getTopReferrals,
  topReferralsHandler,
  handleRefInfo,
  generateReferralLink,
  handleMyReferrals,
  changeReferralBonus,
  setReferralBonusForAllUsers,
  getPlural,
  topSeasonalReferralsHandler,
  handleContestInfo,
  handleBackToRefMenu
};